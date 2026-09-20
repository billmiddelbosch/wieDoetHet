/**
 * Deploy the wiedoethet-admin Lambda and wire up any of its routes that are
 * missing from API Gateway.
 *
 * Why this exists: this project has no IaC (see infra/, which is an empty
 * scaffold) — API Gateway resources/methods/CORS are otherwise created by
 * hand in the console. Adding a route in index.js (e.g. POST /admin/mail)
 * silently does nothing on its own; someone has to remember to replicate it
 * in the console too. This script is the "remember for you" step: it
 * uploads the freshly bundled code, then ensures each route this function
 * owns exists in API Gateway (creating resource/method/integration/CORS/
 * Lambda permission only if missing — safe to re-run), then deploys the
 * stage.
 *
 * Handles the admin routes added since the console-wired ones (/admin/mail,
 * the mail-automation routes). If another new /admin/* route is added later,
 * extend ROUTES below rather than hand-wiring it in the console again.
 *
 * Usage:
 *   node scripts/deploy-admin.js [stage]   (default stage: development)
 *
 * Requires AWS credentials resolvable via the standard SDK/CLI credential
 * chain, and the AWS CLI itself installed (this shells out to `aws`).
 */

import { execFileSync } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import { platform } from 'node:os'
import { resolve } from 'node:path'

const REGION = 'eu-west-2'
const ACCOUNT_ID = '344050431068'
const REST_API_ID = 'eicwh88y07'
const FUNCTION_NAME = 'wiedoethet-admin'
const STAGE = process.argv[2] ?? 'development'

const DIST_INDEX = resolve(import.meta.dirname, '../dist/wiedoethet-admin/index.js')
const ZIP_PATH = resolve(import.meta.dirname, '../wiedoethet-admin.zip')

const CORS_ALLOW_HEADERS = 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'

// Routes this Lambda owns that API Gateway needs to know about. Extend this
// list (and nothing else in this file) when adding a new /admin/* route.
// Missing ancestor resources are created on the way down. An existing resource
// is matched on its path with every {param} normalised, so the routes below
// reuse e.g. an existing /admin/users/{id} whatever its parameter is called.
const ROUTES = [
  {
    fullPath: '/admin/mail',
    method: 'POST',
    permissionSid: 'admin-mail-post',
    methodResponses: ['200', '400', '401'],
  },
  {
    fullPath: '/admin/mail-templates',
    method: 'GET',
    permissionSid: 'admin-mail-templates-get',
    methodResponses: ['200', '401', '403'],
  },
  {
    fullPath: '/admin/mail-templates/{templateId}',
    method: 'PATCH',
    permissionSid: 'admin-mail-templates-patch',
    methodResponses: ['200', '400', '401', '403', '404'],
  },
  {
    fullPath: '/admin/mail-templates/{templateId}/test',
    method: 'POST',
    permissionSid: 'admin-mail-templates-test-post',
    methodResponses: ['200', '401', '403', '404', '502'],
  },
  {
    fullPath: '/admin/mail-log',
    method: 'GET',
    permissionSid: 'admin-mail-log-get',
    methodResponses: ['200', '400', '401', '403'],
  },
  {
    fullPath: '/admin/users/{userId}/mail-opt-out',
    method: 'PATCH',
    permissionSid: 'admin-users-mail-opt-out-patch',
    methodResponses: ['200', '400', '401', '403', '404'],
  },
]

const normalisePath = (path) => path.replace(/\{[^}]+\}/g, '{}')

function aws(args) {
  return execFileSync('aws', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, AWS_PAGER: '' },
  })
}

function awsJson(args) {
  return JSON.parse(aws([...args, '--output', 'json']))
}

function createZip() {
  if (existsSync(ZIP_PATH)) unlinkSync(ZIP_PATH)
  if (platform() === 'win32') {
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${DIST_INDEX}' -DestinationPath '${ZIP_PATH}' -Force`,
    ])
  } else {
    execFileSync('zip', ['-j', ZIP_PATH, DIST_INDEX])
  }
  console.log(`Zipped ${DIST_INDEX} -> ${ZIP_PATH}`)
}

function updateFunctionCode() {
  aws(['lambda', 'update-function-code', '--region', REGION, '--function-name', FUNCTION_NAME, '--zip-file', `fileb://${ZIP_PATH}`])
  console.log(`Uploaded new code to ${FUNCTION_NAME} ($LATEST)`)
}

function getResources() {
  return awsJson(['apigateway', 'get-resources', '--rest-api-id', REST_API_ID, '--region', REGION, '--query', 'items[]'])
}

// Walks route.fullPath from the API root, creating whichever segments are
// missing, and returns the id of the final resource. `resources` is updated in
// place so later routes see what earlier ones created.
function ensureResource(resources, route) {
  const root = resources.find((r) => r.path === '/')
  if (!root) throw new Error('API root resource not found')

  let parent = root
  let path = ''
  for (const segment of route.fullPath.split('/').filter(Boolean)) {
    path += `/${segment}`
    const existing = resources.find((r) => normalisePath(r.path) === normalisePath(path))
    if (existing) {
      parent = existing
      continue
    }
    const created = awsJson([
      'apigateway', 'create-resource', '--rest-api-id', REST_API_ID, '--region', REGION,
      '--parent-id', parent.id, '--path-part', segment,
    ])
    console.log(`Created ${path} resource (${created.id})`)
    parent = { id: created.id, path }
    resources.push(parent)
  }

  console.log(`${route.fullPath} resource: ${parent.id} (${parent.path})`)
  return parent.id
}

function hasMethod(resourceId, httpMethod) {
  const resource = awsJson(['apigateway', 'get-resource', '--rest-api-id', REST_API_ID, '--region', REGION, '--resource-id', resourceId])
  return Boolean(resource.resourceMethods?.[httpMethod])
}

function ensureProxyMethod(resourceId, route) {
  if (hasMethod(resourceId, route.method)) {
    console.log(`${route.method} ${route.fullPath} method already exists — skipping`)
    return
  }

  aws([
    'apigateway', 'put-method', '--rest-api-id', REST_API_ID, '--region', REGION,
    '--resource-id', resourceId, '--http-method', route.method, '--authorization-type', 'NONE',
  ])

  const lambdaUri = `arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}:\${stageVariables.lambdaAlias}/invocations`
  aws([
    'apigateway', 'put-integration', '--rest-api-id', REST_API_ID, '--region', REGION,
    '--resource-id', resourceId, '--http-method', route.method,
    '--type', 'AWS_PROXY', '--integration-http-method', 'POST', '--uri', lambdaUri,
    '--passthrough-behavior', 'WHEN_NO_TEMPLATES', '--content-handling', 'CONVERT_TO_TEXT',
  ])

  for (const statusCode of route.methodResponses) {
    const responseParameters = statusCode === '200' ? { 'method.response.header.Access-Control-Allow-Origin': false } : undefined
    const args = [
      'apigateway', 'put-method-response', '--rest-api-id', REST_API_ID, '--region', REGION,
      '--resource-id', resourceId, '--http-method', route.method, '--status-code', statusCode,
    ]
    if (responseParameters) args.push('--response-parameters', JSON.stringify(responseParameters))
    aws(args)
  }

  console.log(`Created ${route.method} ${route.fullPath} method + AWS_PROXY integration`)
}

function ensureLambdaPermission(route) {
  // execute-api ARNs spell a path parameter as a wildcard
  const sourceArn = `arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${REST_API_ID}/*/${route.method}${route.fullPath.replace(/\{[^}]+\}/g, '*')}`
  try {
    aws([
      'lambda', 'add-permission', '--region', REGION, '--function-name', FUNCTION_NAME,
      '--qualifier', STAGE, '--statement-id', route.permissionSid,
      '--action', 'lambda:InvokeFunction', '--principal', 'apigateway.amazonaws.com', '--source-arn', sourceArn,
    ])
    console.log(`Added Lambda permission ${route.permissionSid} (alias: ${STAGE})`)
  } catch (err) {
    if (String(err.message ?? err).includes('ResourceConflictException')) {
      console.log(`Lambda permission ${route.permissionSid} already exists — skipping`)
    } else {
      throw err
    }
  }
}

function ensureCorsOptionsMethod(resourceId, route) {
  if (hasMethod(resourceId, 'OPTIONS')) {
    console.log(`OPTIONS ${route.fullPath} method already exists — skipping`)
    return
  }

  aws([
    'apigateway', 'put-method', '--rest-api-id', REST_API_ID, '--region', REGION,
    '--resource-id', resourceId, '--http-method', 'OPTIONS', '--authorization-type', 'NONE',
  ])
  aws([
    'apigateway', 'put-integration', '--rest-api-id', REST_API_ID, '--region', REGION,
    '--resource-id', resourceId, '--http-method', 'OPTIONS', '--type', 'MOCK',
    '--request-templates', JSON.stringify({ 'application/json': '{"statusCode": 200}' }),
    '--passthrough-behavior', 'WHEN_NO_MATCH',
  ])
  aws([
    'apigateway', 'put-method-response', '--rest-api-id', REST_API_ID, '--region', REGION,
    '--resource-id', resourceId, '--http-method', 'OPTIONS', '--status-code', '200',
    '--response-parameters', JSON.stringify({
      'method.response.header.Access-Control-Allow-Headers': false,
      'method.response.header.Access-Control-Allow-Methods': false,
      'method.response.header.Access-Control-Allow-Origin': false,
    }),
  ])
  aws([
    'apigateway', 'put-integration-response', '--rest-api-id', REST_API_ID, '--region', REGION,
    '--resource-id', resourceId, '--http-method', 'OPTIONS', '--status-code', '200',
    '--response-parameters', JSON.stringify({
      'method.response.header.Access-Control-Allow-Headers': `'${CORS_ALLOW_HEADERS}'`,
      'method.response.header.Access-Control-Allow-Methods': `'${route.method},OPTIONS'`,
      'method.response.header.Access-Control-Allow-Origin': "'*'",
    }),
  ])

  console.log(`Created OPTIONS ${route.fullPath} method (CORS)`)
}

function deployStage() {
  aws([
    'apigateway', 'create-deployment', '--rest-api-id', REST_API_ID, '--region', REGION,
    '--stage-name', STAGE, '--description', `deploy-admin.js ${new Date().toISOString()}`,
  ])
  console.log(`Deployed API Gateway stage '${STAGE}'`)
}

function main() {
  createZip()
  updateFunctionCode()

  const resources = getResources()
  for (const route of ROUTES) {
    const resourceId = ensureResource(resources, route)
    ensureProxyMethod(resourceId, route)
    ensureLambdaPermission(route)
    ensureCorsOptionsMethod(resourceId, route)
  }

  deployStage()
}

main()
