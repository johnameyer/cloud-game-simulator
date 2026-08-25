import * as path from 'path';
import { fileURLToPath } from 'url';
import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as nodejsLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * lambda-simulator stack: a single run-game Lambda plus its results bucket,
 * invoked directly with no orchestration yet. A Step Functions state
 * machine is planned on top of this stack.
 */
export class LambdaSimulatorStack extends Stack {
    public readonly resultsBucket: s3.Bucket;

    public readonly runGameFunction: nodejsLambda.NodejsFunction;

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
            bundling: {
                format: nodejsLambda.OutputFormat.CJS,
            },
        });

        this.resultsBucket.grantPut(this.runGameFunction);
    }
}
