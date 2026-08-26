import { Duration } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { OUTER_DISTRIBUTED_MAP_RESULTS_PREFIX } from '../src/artifact-retention.js';

/**
 * generate-matchups resolves the run's matchup
 * input into matchups.json in S3, an outer Distributed Map reads it and
 * starts one synchronous child execution of the matchup state machine per
 * matchup, and aggregate-run reduces every matchup's summary (queried from
 * the Matchups table) into a run-level summary.
 * Input shape: GenerateMatchupsEvent - see types.ts.
 */
export function buildRunStateMachine(
    scope: Construct,
    id: string,
    generateMatchupsFunction: lambda.IFunction,
    matchupStateMachine: sfn.IStateMachine,
    aggregateRunFunction: lambda.IFunction,
    resultsBucket: s3.IBucket,
): sfn.StateMachine {
    const generateMatchups = new tasks.LambdaInvoke(scope, 'GenerateMatchups', {
        lambdaFunction: generateMatchupsFunction,
        payloadResponseOnly: true,
    });

    const runMatchup = new tasks.StepFunctionsStartExecution(scope, 'RunMatchup', {
        stateMachine: matchupStateMachine,
        integrationPattern: sfn.IntegrationPattern.RUN_JOB,
        input: sfn.TaskInput.fromObject({
            'runId.$': '$.runId',
            'matchupId.$': '$.matchupId',
            'deck0Id.$': '$.deck0Id',
            'deck1Id.$': '$.deck1Id',
            'strategy.$': '$.strategy',
            'ismctsOptions.$': '$.ismctsOptions',
            'gameNumbers.$': '$.gameNumbers',
        }),
    });

    const runMatchupsForRun = new sfn.DistributedMap(scope, 'RunMatchupsForRun', {
        // Deliberately low: each item starts a whole matchup child workflow
        // (its own inner Distributed Map fanning out to run-game), so this
        // multiplies actual Lambda concurrency - keep it small
        // until the account's concurrency headroom is known.
        maxConcurrency: 3,
        itemReader: new sfn.S3JsonItemReader({
            bucket: resultsBucket,
            key: sfn.JsonPath.stringAt('$.matchupsKey'),
        }),
        // $$.Execution.Input is only resolvable in the Map's own itemSelector,
        // not inside a nested task's own input/Parameters (see the Map
        // gotcha in the README) - so runId is merged in here, and
        // RunMatchup's task input reads plain $.field paths from this shape.
        itemSelector: {
            'runId.$': '$$.Execution.Input.runId',
            'matchupId.$': '$$.Map.Item.Value.matchupId',
            'deck0Id.$': '$$.Map.Item.Value.deck0Id',
            'deck1Id.$': '$$.Map.Item.Value.deck1Id',
            'strategy.$': '$$.Map.Item.Value.strategy',
            'ismctsOptions.$': '$$.Map.Item.Value.ismctsOptions',
            'gameNumbers.$': '$$.Map.Item.Value.gameNumbers',
        },
        resultWriter: new sfn.ResultWriter({
            bucket: resultsBucket,
            prefix: OUTER_DISTRIBUTED_MAP_RESULTS_PREFIX,
        }),
        resultPath: sfn.JsonPath.DISCARD,
    });
    runMatchupsForRun.itemProcessor(runMatchup);

    const aggregateRun = new tasks.LambdaInvoke(scope, 'AggregateRun', {
        lambdaFunction: aggregateRunFunction,
        payload: sfn.TaskInput.fromObject({
            'runId.$': '$$.Execution.Input.runId',
        }),
        payloadResponseOnly: true,
    });

    const definition = generateMatchups.next(runMatchupsForRun).next(aggregateRun);

    const logGroup = new logs.LogGroup(scope, `${id}LogGroup`, {
        retention: logs.RetentionDays.TWO_WEEKS,
    });

    return new sfn.StateMachine(scope, id, {
        definitionBody: sfn.DefinitionBody.fromChainable(definition),
        timeout: Duration.hours(2),
        logs: {
            destination: logGroup,
            level: sfn.LogLevel.ALL,
            includeExecutionData: true,
        },
    });
}
