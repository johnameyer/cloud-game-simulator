import * as path from 'path';
import { fileURLToPath } from 'url';
import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejsLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import {
    ArtifactRetentionTag,
    RETENTION_TAG_KEY,
    DISTRIBUTED_MAP_RESULTS_PREFIX,
    OUTER_DISTRIBUTED_MAP_RESULTS_PREFIX,
} from '../src/artifact-retention.js';
import { buildMatchupStateMachine } from './state-machine.js';
import { buildRunStateMachine } from './run-state-machine.js';
import { computeEngineVersion } from './engine-version.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BUNDLING = {
    format: nodejsLambda.OutputFormat.CJS,
};

/**
 * lambda-simulator stack:
 *   run-game Lambda + results bucket, invoked directly.
 *   + aggregate-matchup Lambda, Matchups table, and a plain
 *     Map-state Step Functions state machine fanning one matchup's games
 *     out to run-game.
 *   the plain Map is a Distributed Map + ResultWriter.
 *   + generate-matchups, an outer Distributed Map over
 *     matchups (each item starting a synchronous child execution of the
 *     matchup state machine), aggregate-run, and a Runs table.
 */
export class LambdaSimulatorStack extends Stack {
    public readonly resultsBucket: s3.Bucket;

    public readonly matchupsTable: dynamodb.Table;

    public readonly runsTable: dynamodb.Table;

    public readonly matchupCacheTable: dynamodb.Table;

    public readonly runGameFunction: nodejsLambda.NodejsFunction;

    public readonly aggregateMatchupFunction: nodejsLambda.NodejsFunction;

    public readonly generateMatchupsFunction: nodejsLambda.NodejsFunction;

    public readonly aggregateRunFunction: nodejsLambda.NodejsFunction;

    public readonly matchupStateMachine: sfn.StateMachine;

    public readonly runStateMachine: sfn.StateMachine;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        this.resultsBucket = new s3.Bucket(this, 'ResultsBucket', {
            removalPolicy: RemovalPolicy.RETAIN,
            lifecycleRules: [
                {
                    // Raw per-game logs/traces (run-game.ts, tagged via
                    // ArtifactRetentionTag.RAW_GAME_ARTIFACT) are cheap to
                    // regenerate; expire them soonest to bound storage cost as
                    // run volume grows.
                    id: 'expire-raw-game-artifacts',
                    tagFilters: { [RETENTION_TAG_KEY]: ArtifactRetentionTag.RAW_GAME_ARTIFACT },
                    expiration: Duration.days(90),
                },
                {
                    // Matchup/run/matchups-list summaries (tagged via
                    // ArtifactRetentionTag.SUMMARY) are the queryable,
                    // report-facing artifacts - keep them noticeably longer
                    // than the raw per-game data they're derived from.
                    id: 'expire-summaries',
                    tagFilters: { [RETENTION_TAG_KEY]: ArtifactRetentionTag.SUMMARY },
                    expiration: Duration.days(365),
                },
                {
                    // Distributed Map ResultWriter output (state-machine.ts,
                    // run-state-machine.ts) is purely a debugging aid for
                    // diagnosing fan-out failures - expire it fastest.
                    id: 'expire-distributed-map-diagnostics',
                    prefix: `${DISTRIBUTED_MAP_RESULTS_PREFIX}/`,
                    expiration: Duration.days(14),
                },
                {
                    id: 'expire-outer-distributed-map-diagnostics',
                    prefix: `${OUTER_DISTRIBUTED_MAP_RESULTS_PREFIX}/`,
                    expiration: Duration.days(14),
                },
            ],
        });

        this.matchupsTable = new dynamodb.Table(this, 'MatchupsTable', {
            partitionKey: { name: 'runId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'matchupId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.RETAIN,
        });

        this.runsTable = new dynamodb.Table(this, 'RunsTable', {
            partitionKey: { name: 'runId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.RETAIN,
        });

        // Cache of matchup results keyed by matchupCacheId (see
        // src/cache-key.ts) - self-invalidating: the id folds in the
        // simulation engine's version and each deck's actual content hash,
        // so a code change or an edited deck list produces a new id rather
        // than serving stale cached results under the old one.
        this.matchupCacheTable = new dynamodb.Table(this, 'MatchupCacheTable', {
            partitionKey: { name: 'matchupCacheId', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.RETAIN,
        });

        // Computed once at synth time from the engine repos' git state (see
        // infra/engine-version.ts) and baked into the Lambdas that read/write
        // the cache, so every deploy that changes engine code gets a new
        // value automatically.
        const engineVersion = computeEngineVersion();

        this.runGameFunction = new nodejsLambda.NodejsFunction(this, 'RunGameFunction', {
            entry: path.join(__dirname, '../src/handlers/run-game.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_22_X,
            // A default-strategy game comfortably fits well under this; a
            // high-iteration ISMCTS game (e.g. 1000 iterations/move) is far
            // more expensive per move, hence the generous ceiling - still
            // tight enough that a genuinely hung game fails well before the
            // matchup state machine's own 30-minute timeout.
            timeout: Duration.minutes(10),
            memorySize: 512,
            environment: {
                RESULTS_BUCKET: this.resultsBucket.bucketName,
            },
            bundling: BUNDLING,
        });
        this.resultsBucket.grantPut(this.runGameFunction);

        this.aggregateMatchupFunction = new nodejsLambda.NodejsFunction(this, 'AggregateMatchupFunction', {
            entry: path.join(__dirname, '../src/handlers/aggregate-matchup.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_22_X,
            // Just S3/DynamoDB writes and arithmetic over an already-fetched
            // game-results array; no game engine work happens here.
            timeout: Duration.seconds(30),
            memorySize: 256,
            environment: {
                RESULTS_BUCKET: this.resultsBucket.bucketName,
                MATCHUPS_TABLE: this.matchupsTable.tableName,
                MATCHUP_CACHE_TABLE: this.matchupCacheTable.tableName,
                ENGINE_VERSION: engineVersion,
            },
            bundling: BUNDLING,
        });
        this.resultsBucket.grantReadWrite(this.aggregateMatchupFunction);
        this.matchupsTable.grantWriteData(this.aggregateMatchupFunction);
        this.matchupCacheTable.grantWriteData(this.aggregateMatchupFunction);

        this.matchupStateMachine = buildMatchupStateMachine(
            this,
            'MatchupStateMachine',
            this.runGameFunction,
            this.aggregateMatchupFunction,
            this.resultsBucket,
        );
        this.resultsBucket.grantReadWrite(this.matchupStateMachine);

        this.generateMatchupsFunction = new nodejsLambda.NodejsFunction(this, 'GenerateMatchupsFunction', {
            entry: path.join(__dirname, '../src/handlers/generate-matchups.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_22_X,
            timeout: Duration.seconds(30),
            memorySize: 256,
            environment: {
                RESULTS_BUCKET: this.resultsBucket.bucketName,
                MATCHUPS_TABLE: this.matchupsTable.tableName,
                MATCHUP_CACHE_TABLE: this.matchupCacheTable.tableName,
                ENGINE_VERSION: engineVersion,
            },
            bundling: BUNDLING,
        });
        this.resultsBucket.grantPut(this.generateMatchupsFunction);
        this.matchupsTable.grantWriteData(this.generateMatchupsFunction);
        this.matchupCacheTable.grantReadData(this.generateMatchupsFunction);

        this.aggregateRunFunction = new nodejsLambda.NodejsFunction(this, 'AggregateRunFunction', {
            entry: path.join(__dirname, '../src/handlers/aggregate-run.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_22_X,
            timeout: Duration.seconds(30),
            memorySize: 256,
            environment: {
                RESULTS_BUCKET: this.resultsBucket.bucketName,
                MATCHUPS_TABLE: this.matchupsTable.tableName,
                RUNS_TABLE: this.runsTable.tableName,
            },
            bundling: BUNDLING,
        });
        this.resultsBucket.grantPut(this.aggregateRunFunction);
        this.matchupsTable.grantReadData(this.aggregateRunFunction);
        this.runsTable.grantWriteData(this.aggregateRunFunction);

        this.runStateMachine = buildRunStateMachine(
            this,
            'RunStateMachine',
            this.generateMatchupsFunction,
            this.matchupStateMachine,
            this.aggregateRunFunction,
            this.resultsBucket,
        );
        this.resultsBucket.grantRead(this.runStateMachine);
    }
}
