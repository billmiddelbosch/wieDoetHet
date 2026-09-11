#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { WieDoetHetApiStack } from '../lib/wiedoethet-api-stack';

const app = new cdk.App();

new WieDoetHetApiStack(app, 'WieDoetHetApiStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? '344050431068',
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-west-2',
  },
  description:
    'wieDoetHet — adopted (not newly created) production infrastructure: wdh-main/wdh-dev DynamoDB tables, ' +
    'the 5 documented Lambda functions (auth/groups/tasks/claims/admin) with their development/production ' +
    'aliases, and the wieDoetHet API Gateway REST API. See infra/DESIGN.md and infra/IMPORT_CHECKLIST.md ' +
    'before running cdk import or cdk deploy against the live account.',
});
