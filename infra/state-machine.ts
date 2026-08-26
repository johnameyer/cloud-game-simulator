import { Duration } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { DISTRIBUTED_MAP_RESULTS_PREFIX } from '../src/artifact-retention.js';
import { addThrottleRetry } from './lambda-retry.js';

/**
 * One matchup, with the inner Map as a Distributed Map. This validates the ResultWriter
 * plumbing that matters for scale: instead of each game's result staying
 * inline in the state (bounded by Step Functions' 256KB payload limit),
 * Distributed Map writes every child result to S3 and hands aggregate-matchup
 * a manifest to read instead - see aggregate-matchup.ts's manifest parsing.
 * Input shape:
 *   { runId, matchupId, deck0Id, deck1Id, strategy, gameNumbers: number[] }
 * An outer Distributed Map over multiple matchups and a generate-matchups
 * step sit in front of this one (see run-state-machine.ts).
 */
export function buildMatchupStateMachine(
    scope: Construct,
    id: string,
    runGameFunction: lambda.IFunction,
    aggregateMatchupFunction: lambda.IFunction,
    resultsBucket: s3.IBucket,
): sfn.StateMachine {
    const runGame = new tasks.LambdaInvoke(scope, 'RunGame', {
        lambdaFunction: runGameFunction,
        payloadResponseOnly: true,
    });
    addThrottleRetry(runGame);

    const runGamesForMatchup = new sfn.DistributedMap(scope, 'RunGamesForMatchup', {
        itemsPath: '$.gameNumbers',
        maxConcurrency: 10,
        resultPath: '$.mapRunOutput',
        // Note: ismctsOptions must always be present in the execution input
        // (an empty object {} when not using ismcts) - $$.Execution.Input.*
        // referenced here errors at runtime if the field is simply absent
        // (see the README's Map-state gotchas).
        itemSelector: {
            'runId.$': '$$.Execution.Input.runId',
            'matchupId.$': '$$.Execution.Input.matchupId',
            'deck0Id.$': '$$.Execution.Input.deck0Id',
            'deck1Id.$': '$$.Execution.Input.deck1Id',
            'strategy.$': '$$.Execution.Input.strategy',
            'ismctsOptions.$': '$$.Execution.Input.ismctsOptions',
            'gameNumber.$': '$$.Map.Item.Value',
        },
        resultWriter: new sfn.ResultWriter({
            bucket: resultsBucket,
            prefix: DISTRIBUTED_MAP_RESULTS_PREFIX,
        }),
    });
    runGamesForMatchup.itemProcessor(runGame);

    const aggregateMatchup = new tasks.LambdaInvoke(scope, 'AggregateMatchup', {
        lambdaFunction: aggregateMatchupFunction,
        payloadResponseOnly: true,
    });
    addThrottleRetry(aggregateMatchup);

    const definition = runGamesForMatchup.next(aggregateMatchup);

    return new sfn.StateMachine(scope, id, {
        definitionBody: sfn.DefinitionBody.fromChainable(definition),
        timeout: Duration.minutes(30),
    });
}
