#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { LambdaSimulatorStack } from '../infra/stack.js';

const app = new App();

new LambdaSimulatorStack(app, 'PocketTcgLambdaSimulator', {
    env: {
        region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
        account: process.env.CDK_DEFAULT_ACCOUNT,
    },
});
