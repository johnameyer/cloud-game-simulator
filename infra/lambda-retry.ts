import { Duration } from 'aws-cdk-lib';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';

/**
 * CDK's default LambdaInvoke retry list omits throttling. This account's
 * Lambda concurrency limit is a hard 10 (not AWS's usual 1000 default),
 * shared across every function in the stack, so any Lambda-invoking task
 * can get a 429 under load - including a lingering invocation from a
 * previous (e.g. just-aborted) execution still holding a slot. Apply to
 * every tasks.LambdaInvoke in both state machines, not just the
 * highest-volume one - a single un-retried throttle on generate-matchups or
 * aggregate-run fails the whole run just as surely as one on run-game.
 */
export function addThrottleRetry(task: tasks.LambdaInvoke): void {
    task.addRetry({
        errors: [ 'Lambda.TooManyRequestsException' ],
        interval: Duration.seconds(3),
        maxAttempts: 8,
        backoffRate: 2,
    });
}
