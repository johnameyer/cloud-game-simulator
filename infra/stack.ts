import * as path from 'path';
import { fileURLToPath } from 'url';
import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as nodejsLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import { buildMatchupStateMachine } from './state-machine.js';
import { buildRunStateMachine } from './run-state-machine.js';

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
                    // Raw per-game logs/traces are cheap to regenerate; expire them
                    // after 90 days to bound storage cost as run volume grows.
                    expiration: Duration.days(90),
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

        this.runGameFunction = new nodejsLambda.NodejsFunction(this, 'RunGameFunction', {
            entry: path.join(__dirname, '../src/handlers/run-game.ts'),
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_22_X,
            // One game (ISMCTS default: 100 iterations/move) comfortably fits well
            // under this; keep it tight so a hung game fails fast instead of
            // burning a full Step Functions execution's time budget later.
            timeout: Duration.seconds(90),
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
            },
            bundling: BUNDLING,
        });
        this.resultsBucket.grantReadWrite(this.aggregateMatchupFunction);
        this.matchupsTable.grantWriteData(this.aggregateMatchupFunction);

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
            },
            bundling: BUNDLING,
        });
        this.resultsBucket.grantPut(this.generateMatchupsFunction);

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
