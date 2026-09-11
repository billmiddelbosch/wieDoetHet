import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

const ACCOUNT = '344050431068';

/**
 * AWS Lambda's nodejs24.x runtime, constructed explicitly rather than via a
 * named `lambda.Runtime.NODEJS_24_X` constant. Node 24 is new enough that
 * whether your installed aws-cdk-lib version has added that named constant
 * yet is uncertain — this construction is correct regardless of version.
 * Swap to the named constant once you've confirmed it exists in your
 * installed aws-cdk-lib.
 */
const NODEJS_24_X = new lambda.Runtime('nodejs24.x', lambda.RuntimeFamily.NODEJS);

interface FunctionSpec {
  /** Physical Lambda function name — must match the live function name exactly for `cdk import` to adopt it. */
  functionName: string;
  description: string;
  /** Subdirectory of lambda/dist/ containing this function's pre-bundled esbuild output (index.js). */
  codeDir: string;
  timeoutSeconds: number;
  memoryMb: number;
  /**
   * ARN of the existing execution role. This stack REFERENCES these roles
   * (iam.Role.fromRoleArn, mutable: false) rather than owning/managing
   * them — see DESIGN.md "IAM roles stay externally managed for this
   * round". Reproducing the shared WdhDynamoDBTableAccess inline policy
   * as CDK-managed IAM is a deliberately separate, later piece of work.
   */
  roleArn: string;
  environment: Record<string, string>;
  /**
   * The published Lambda version number the "production" alias is
   * currently pinned to (NOT auto-tracking $LATEST/currentVersion, unlike
   * the "development" alias). Confirm before deploy with:
   *   aws lambda list-aliases --function-name <name> \
   *     --query "Aliases[?Name=='production'].FunctionVersion" --output text
   */
  productionVersion: string;
}

/**
 * Adopts wieDoetHet's existing, hand-deployed AWS resources into
 * CloudFormation via `cdk import`. This stack describes what is ALREADY
 * live — it must not be deployed with `cdk deploy` to a fresh account, and
 * no resource here should be created for the first time by CloudFormation.
 * See infra/DESIGN.md for the full architecture rationale and
 * infra/IMPORT_CHECKLIST.md for the exact adoption steps.
 *
 * Explicitly OUT of scope for this stack (by user decision, see
 * decisions/2026-09-11-cdk-import-scope.md):
 *   - wiedoethet-whatsapp and wiedoethet-reminders Lambda functions (no
 *     source code recovered yet). Their API Gateway routes remain wired
 *     in the imported REST API body, unchanged — this stack simply does
 *     not declare or manage those two functions.
 *   - Wiring wdh-dev up for real (giving the 5 functions a per-alias
 *     TABLE_NAME). Both aliases continue pointing at wdh-main today; that
 *     is reproduced faithfully below, not fixed.
 */
export class WieDoetHetApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('Project', 'wiedoethet');
    cdk.Tags.of(this).add('ManagedBy', 'cdk');
    cdk.Tags.of(this).add('Feature', 'infra-cdk-import');

    // -----------------------------------------------------------------
    // DynamoDB
    //
    // wdh-main is the live, shared table every function actually reads
    // and writes today (both aliases). wdh-dev is provisioned but
    // functionally unused — see decisions/2026-09-11-cdk-import-scope.md.
    // Both are imported faithfully, as-is. Schema below is copied
    // verbatim from `aws dynamodb describe-table` on both tables
    // (confirmed identical). RemovalPolicy.RETAIN is deliberate and
    // non-negotiable: this stack must never be able to delete either
    // table via `cdk destroy` or a replacement update.
    // -----------------------------------------------------------------
    const mainTable = this.buildTable('WdhMainTable', 'wdh-main');
    const devTable = this.buildTable('WdhDevTable', 'wdh-dev');

    // -----------------------------------------------------------------
    // Lambda functions
    //
    // Code is loaded from lambda/dist/<name>/ — the pre-bundled esbuild
    // output this repo's `npm run bundle:*` scripts already produce.
    // Deliberately NOT NodejsFunction: NodejsFunction runs its own
    // internal esbuild invocation with its own defaults, which could
    // silently diverge from the target=node24/format=cjs/external
    // settings already tuned into lambda/package.json. Using the same
    // pre-bundled output CDK will deploy avoids introducing a second,
    // different bundling path for code that is already live and working.
    // See decisions/2026-09-11-cdk-import-architecture.md.
    // -----------------------------------------------------------------
    const jwtSecret = this.resolveJwtSecret();

    const functionSpecs: FunctionSpec[] = [
      {
        functionName: 'wiedoethet-auth',
        description: 'wieDoetHet — auth Lambda (register/login/me/profile)',
        codeDir: 'wiedoethet-auth',
        timeoutSeconds: 3,
        memoryMb: 128,
        roleArn: `arn:aws:iam::${ACCOUNT}:role/service-role/wiedoethet-auth-role-rg65et0e`,
        environment: { JWT_SECRET: jwtSecret },
        productionVersion: '2',
      },
      {
        functionName: 'wiedoethet-groups',
        description: 'wieDoetHet — groups Lambda (create/list/get/update/delete/share)',
        codeDir: 'wiedoethet-groups',
        timeoutSeconds: 3,
        memoryMb: 128,
        roleArn: `arn:aws:iam::${ACCOUNT}:role/service-role/wiedoethet-groups-role-fv1azmgq`,
        environment: { JWT_SECRET: jwtSecret },
        productionVersion: '3',
      },
      {
        functionName: 'wiedoethet-tasks',
        description: 'wieDoetHet — tasks Lambda (create/list/update/delete/reorder)',
        codeDir: 'wiedoethet-tasks',
        timeoutSeconds: 3,
        memoryMb: 128,
        roleArn: `arn:aws:iam::${ACCOUNT}:role/service-role/wiedoethet-tasks-role-amaa0ejw`,
        environment: { JWT_SECRET: jwtSecret },
        productionVersion: '2',
      },
      {
        functionName: 'wiedoethet-claims',
        description: 'wieDoetHet — claims Lambda (claim/unclaim/list)',
        codeDir: 'wiedoethet-claims',
        timeoutSeconds: 3,
        memoryMb: 128,
        roleArn: `arn:aws:iam::${ACCOUNT}:role/service-role/wiedoethet-claims-role-1t4oyrbv`,
        environment: { JWT_SECRET: jwtSecret },
        productionVersion: '2',
      },
      {
        functionName: 'wiedoethet-admin',
        description: 'wieDoetHet — admin Lambda (read-only stats/users/groups)',
        codeDir: 'wiedoethet-admin',
        timeoutSeconds: 10,
        memoryMb: 128,
        roleArn: `arn:aws:iam::${ACCOUNT}:role/wiedoethet-admin-role`,
        // Literal 'wdh-main' is deliberate — it matches this function's
        // CURRENT live TABLE_NAME env var exactly. The other four
        // functions have no TABLE_NAME env var at all and fall back to
        // 'wdh-main' in code (lambda/shared/db.js). Both patterns are
        // reproduced as-is, not corrected, in this pass — see
        // decisions/2026-09-11-cdk-import-scope.md.
        environment: { JWT_SECRET: jwtSecret, TABLE_NAME: 'wdh-main' },
        productionVersion: '1',
      },
    ];

    const aliases: Record<string, { development: lambda.Alias; production: lambda.Alias }> = {};

    for (const spec of functionSpecs) {
      const cid = this.toConstructId(spec.functionName);

      const fn = new lambda.Function(this, cid, {
        functionName: spec.functionName,
        description: spec.description,
        runtime: NODEJS_24_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(path.resolve(__dirname, `../../lambda/dist/${spec.codeDir}`)),
        timeout: cdk.Duration.seconds(spec.timeoutSeconds),
        memorySize: spec.memoryMb,
        role: iam.Role.fromRoleArn(this, `${cid}Role`, spec.roleArn, {
          mutable: false, // referenced, not owned — see FunctionSpec.roleArn doc comment
        }),
        environment: spec.environment,
      });

      // "development" always tracks $LATEST — matches live behavior on all
      // five functions today.
      const development = new lambda.Alias(this, `${cid}DevAlias`, {
        aliasName: 'development',
        version: fn.latestVersion,
      });

      // "production" is pinned to a specific published version, promoted
      // manually and independently of $LATEST — this is the asymmetry
      // that let the GSI3 fix ship to $LATEST/development without ever
      // reaching production. Deliberately NOT fn.currentVersion (which
      // would auto-track code+config changes) and NOT fn.addAlias()
      // (which defaults both aliases to currentVersion). See
      // decisions/2026-09-11-cdk-import-architecture.md.
      const production = new lambda.Alias(this, `${cid}ProdAlias`, {
        aliasName: 'production',
        version: lambda.Version.fromVersionArn(this, `${cid}ProdVersion`, `${fn.functionArn}:${spec.productionVersion}`),
      });

      aliases[spec.functionName] = { development, production };
    }

    // -----------------------------------------------------------------
    // API Gateway
    //
    // Imported complete and as-is via an exported OpenAPI (Body) document
    // captured from the live "production" stage
    // (infra/openapi/wiedoethet-api.oas30.json — confirmed structurally
    // identical to the "development" stage export at capture time). This
    // avoids hand-transcribing ~25 resources / ~50 methods, including the
    // wiedoethet-whatsapp and wiedoethet-reminders routes, which stay
    // wired in the Body exactly as they are live today even though
    // neither of those two functions is declared in this stack.
    //
    // IMPORTANT — read infra/DESIGN.md "API Gateway import strategy" and
    // infra/IMPORT_CHECKLIST.md before running `cdk import` against these
    // resources. AWS::ApiGateway::RestApi/Stage/Deployment import support
    // must be verified empirically first; this construct is written to be
    // correct if supported, but is not guaranteed importable without that
    // check.
    // -----------------------------------------------------------------
    const api = new apigateway.SpecRestApi(this, 'WieDoetHetApi', {
      restApiName: 'wieDoetHet API',
      apiDefinition: apigateway.ApiDefinition.fromAsset(path.resolve(__dirname, '../openapi/wiedoethet-api.oas30.json')),
      // AWS::ApiGateway::RestApi import requires endpoint config via Parameters, not EndpointConfiguration
      // (see https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-apigateway-restapi.html)
      parameters: { endpointConfigurationTypes: 'REGIONAL' },
      deploy: false, // Deployment/Stage built explicitly below to preserve exact stage variables
      cloudWatchRole: false, // this AWS account already has other API Gateway APIs (itguru, aintern, tours, myguide) — never let this stack touch the account-level API Gateway CloudWatch role
    });

    const productionDeployment = new apigateway.Deployment(this, 'ProductionDeployment', { api });
    new apigateway.Stage(this, 'ProductionStage', {
      deployment: productionDeployment,
      stageName: 'production',
      variables: { lambdaAlias: 'production', tableName: 'wdh-main' },
    });

    const developmentDeployment = new apigateway.Deployment(this, 'DevelopmentDeployment', { api });
    new apigateway.Stage(this, 'DevelopmentStage', {
      deployment: developmentDeployment,
      stageName: 'development',
      variables: { lambdaAlias: 'development', tableName: 'wdh-dev' },
    });

    // Grant API Gateway permission to invoke each alias. The equivalent
    // permissions already exist live under different (hand-created)
    // StatementIds — Lambda resource policies are not part of this
    // stack's `cdk import` batch (see DESIGN.md), so expect these to
    // land as ADDITIVE statements on the first `cdk deploy` after import,
    // not replacements. Harmless, but worth expecting rather than being
    // surprised by.
    for (const spec of functionSpecs) {
      const cid = this.toConstructId(spec.functionName);
      const { development, production } = aliases[spec.functionName];

      development.addPermission(`${cid}DevInvoke`, {
        principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
        sourceArn: api.arnForExecuteApi('*', '/*', 'development'),
      });
      production.addPermission(`${cid}ProdInvoke`, {
        principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
        sourceArn: api.arnForExecuteApi('*', '/*', 'production'),
      });
    }

    // -----------------------------------------------------------------
    // Outputs
    // -----------------------------------------------------------------
    new cdk.CfnOutput(this, 'RestApiId', { value: api.restApiId });
    new cdk.CfnOutput(this, 'MainTableName', { value: mainTable.tableName });
    new cdk.CfnOutput(this, 'DevTableName', { value: devTable.tableName });
  }

  private buildTable(id: string, tableName: string): dynamodb.Table {
    const table = new dynamodb.Table(this, id, {
      tableName,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: false, // matches live state today on both tables (PITR is OFF) — see DESIGN.md follow-up on enabling it
    });

    for (const gsiName of ['GSI1', 'GSI2', 'GSI3']) {
      table.addGlobalSecondaryIndex({
        indexName: gsiName,
        partitionKey: { name: `${gsiName}PK`, type: dynamodb.AttributeType.STRING },
        sortKey: { name: `${gsiName}SK`, type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });
    }

    return table;
  }

  /**
   * Resolves the current live JWT_SECRET value without ever having it pass
   * through this codebase, chat, logs, or version control. This value was
   * incidentally exposed in a prior session's tool output and must be
   * treated as compromised — do not read it back out, log it, or write it
   * into any file. Supply it locally, out of band, at synth/import/deploy
   * time only.
   */
  private resolveJwtSecret(): string {
    const fromContext = this.node.tryGetContext('jwtSecret');
    const fromEnv = process.env.WDH_JWT_SECRET;
    const value = fromContext ?? fromEnv;
    if (!value) {
      throw new Error(
        'JWT_SECRET value not provided. Export WDH_JWT_SECRET=<current live value> in your shell before ' +
          'running cdk synth/import/deploy, or pass --context jwtSecret=<value>. Retrieve the current value ' +
          'yourself — do not paste it into chat, commit it, or log it. See DESIGN.md "JWT_SECRET handling".',
      );
    }
    return value;
  }

  private toConstructId(functionName: string): string {
    return functionName
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }
}
