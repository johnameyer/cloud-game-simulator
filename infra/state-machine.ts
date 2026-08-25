import { Duration } from 'aws-cdk-lib';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

/**
 * One matchup, a plain (non-Distributed) Map
 * state fanning out its games to run-game, followed by aggregate-matchup.
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
): sfn.StateMachine {
    const runGame = new tasks.LambdaInvoke(scope, 'RunGame', {
        lambdaFunction: runGameFunction,
        payloadResponseOnly: true,
    });

    const runGamesForMatchup = new sfn.Map(scope, 'RunGamesForMatchup', {
        itemsPath: '$.gameNumbers',
        maxConcurrency: 10,
        resultPath: '$.gameResults',
        itemSelector: {
            'runId.$': '$$.Execution.Input.runId',
            'matchupId.$': '$$.Execution.Input.matchupId',
            'deck0Id.$': '$$.Execution.Input.deck0Id',
            'deck1Id.$': '$$.Execution.Input.deck1Id',
            'strategy.$': '$$.Execution.Input.strategy',
            'gameNumber.$': '$$.Map.Item.Value',
        },
    }).itemProcessor(runGame);

    const aggregateMatchup = new tasks.LambdaInvoke(scope, 'AggregateMatchup', {
        lambdaFunction: aggregateMatchupFunction,
        payloadResponseOnly: true,
    });

    const definition = runGamesForMatchup.next(aggregateMatchup);

    return new sfn.StateMachine(scope, id, {
        definitionBody: sfn.DefinitionBody.fromChainable(definition),
        timeout: Duration.minutes(30),
    });
}
