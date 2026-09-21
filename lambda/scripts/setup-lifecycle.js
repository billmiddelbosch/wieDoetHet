/**
 * One-time (and safely re-runnable) AWS setup for the lifecycle mail automation:
 * IAM role, the wiedoethet-lifecycle Lambda, the EventBridge Scheduler role and
 * the weekday schedule. See lambda/SES_SETUP.md ("Lifecycle mail").
 *
 * Idempotent: every resource is looked up first and only created when missing.
 * Existing resources are never overwritten (a config difference is reported as
 * a warning); the Lambda's code is deploy-lifecycle.js's job, not this script's.
 *
 * One lifecycle function serves ONE table. Default is wdh-dev (safe for testing);
 * re-point it at production with `--table wdh-main`.
 *
 * Usage (from lambda/):
 *   npm run setup:lifecycle -- --plan                 read-only: show what would happen
 *   npm run setup:lifecycle                           apply (bundles first)
 *   npm run setup:lifecycle -- --table wdh-main       target the production table
 *   npm run setup:lifecycle -- --schedule-disabled    create the schedule DISABLED
 *
 * What it does NOT do: GSI3 backfill (scripts/backfill-gsi3.js), SES sandbox /
 * identity setup (only warns), turning on the master switch or any template
 * (both happen in Admin -> Automatisering), CloudWatch alarms.
 *
 * Requires AWS credentials for account 344050431068 via the standard credential
 * chain and the AWS CLI itself (this shells out to `aws`).
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { platform, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REGION = 'eu-west-2'
const ACCOUNT_ID = '344050431068'
const TABLES = ['wdh-dev', 'wdh-main']
const DEFAULT_TABLE = 'wdh-dev'

const FUNCTION_NAME = 'wiedoethet-lifecycle'
const ADMIN_FUNCTION_NAME = 'wiedoethet-admin'
const FUNCTION_ARN = `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}`
const RUNTIME = 'nodejs24.x'
const HANDLER = 'index.handler'
const TIMEOUT_SECONDS = 300
const MEMORY_MB = 256

const LAMBDA_ROLE = 'wiedoethet-lifecycle-role'
const LAMBDA_ROLE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role/${LAMBDA_ROLE}`
const BASIC_EXECUTION_POLICY_ARN = 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'

const SCHEDULER_ROLE = 'wiedoethet-lifecycle-scheduler-role'
const SCHEDULER_ROLE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role/${SCHEDULER_ROLE}`

const SCHEDULE_NAME = 'wiedoethet-lifecycle-weekdays'
const SCHEDULE_EXPRESSION = 'cron(0 10 ? * MON-FRI *)'
const SCHEDULE_TIMEZONE = 'Europe/Amsterdam'

const ROOT = resolve(import.meta.dirname, '..')
const DIST_INDEX = resolve(ROOT, 'dist/wiedoethet-lifecycle/index.js')
const ZIP_PATH = resolve(ROOT, 'dist/wiedoethet-lifecycle.zip')

const args = process.argv.slice(2)
const PLAN = args.includes('--plan')
const SCHEDULE_ENABLED = !args.includes('--schedule-disabled')
const tableFlag = args.indexOf('--table')
const EXPLICIT_TABLE = tableFlag === -1 ? null : args[tableFlag + 1]
const KNOWN_FLAGS = new Set(['--plan', '--schedule-disabled', '--table', EXPLICIT_TABLE].filter(Boolean))

const TMP_DIR = mkdtempSync(join(tmpdir(), 'wdh-lifecycle-'))
const created = []
const existing = []
const changed = []
const warnings = []

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const note = (msg) => console.log(`  ${msg}`)
const warn = (msg) => {
  warnings.push(msg)
  console.log(`  ! ${msg}`)
}
const step = (title) => console.log(`\n== ${title}`)

function aws(cliArgs) {
  try {
    return execFileSync('aws', [...cliArgs, '--region', REGION], {
      encoding: 'utf8',
      env: { ...process.env, AWS_PAGER: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    const stderr = String(err.stderr ?? err.message).trim()
    const failure = new Error(`aws ${cliArgs.slice(0, 2).join(' ')} failed: ${stderr}`)
    failure.stderr = stderr
    throw failure
  }
}

const awsJson = (cliArgs) => JSON.parse(aws([...cliArgs, '--output', 'json']))

function awsOrNull(cliArgs, notFound) {
  try {
    return awsJson(cliArgs)
  } catch (err) {
    if (notFound.test(err.stderr ?? '')) return null
    throw err
  }
}

async function retryOn(pattern, label, fn) {
  const tries = 12
  for (let attempt = 1; ; attempt++) {
    try {
      return fn()
    } catch (err) {
      if (attempt >= tries || !pattern.test(err.message)) throw err
      note(`waiting for IAM propagation (${label}, attempt ${attempt}/${tries})...`)
      await sleep(5000)
    }
  }
}

function fileArg(name, value) {
  const path = join(TMP_DIR, name)
  writeFileSync(path, JSON.stringify(value))
  return `file://${path.replaceAll('\\', '/')}`
}

const canonical = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )

function createZip() {
  if (!existsSync(DIST_INDEX)) throw new Error(`${DIST_INDEX} not found — run \`npm run bundle:lifecycle\` first`)
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
  note(`zipped ${DIST_INDEX} -> ${ZIP_PATH}`)
}

function validateArgs() {
  const unknown = args.filter((a) => a.startsWith('--') && !KNOWN_FLAGS.has(a))
  if (unknown.length) throw new Error(`Unknown option(s): ${unknown.join(', ')}`)
  if (tableFlag !== -1 && !TABLES.includes(EXPLICIT_TABLE)) {
    throw new Error(`--table must be one of: ${TABLES.join(', ')}`)
  }
}

async function ensureRole({ name, description, trustPolicy, managedPolicyArns = [], inlinePolicies = {} }) {
  const role = awsOrNull(['iam', 'get-role', '--role-name', name], /NoSuchEntity/)
  let roleCreated = false
  if (role) {
    existing.push(`IAM role ${name}`)
    note(`role ${name} exists`)
  } else if (PLAN) {
    created.push(`IAM role ${name} (planned)`)
    note(`would create role ${name}`)
  } else {
    aws([
      'iam', 'create-role', '--role-name', name, '--description', description,
      '--assume-role-policy-document', fileArg(`${name}-trust.json`, trustPolicy),
    ])
    created.push(`IAM role ${name}`)
    note(`created role ${name}`)
    roleCreated = true
  }

  const attached = role
    ? awsJson(['iam', 'list-attached-role-policies', '--role-name', name]).AttachedPolicies.map((p) => p.PolicyArn)
    : []
  for (const arn of managedPolicyArns) {
    if (attached.includes(arn)) {
      note(`managed policy ${arn.split('/').pop()} already attached`)
    } else if (PLAN) {
      note(`would attach managed policy ${arn.split('/').pop()}`)
    } else {
      aws(['iam', 'attach-role-policy', '--role-name', name, '--policy-arn', arn])
      created.push(`${name}: managed policy ${arn.split('/').pop()}`)
      note(`attached managed policy ${arn.split('/').pop()}`)
    }
  }

  const inline = role ? awsJson(['iam', 'list-role-policies', '--role-name', name]).PolicyNames : []
  for (const [policyName, document] of Object.entries(inlinePolicies)) {
    if (inline.includes(policyName)) {
      const current = awsJson(['iam', 'get-role-policy', '--role-name', name, '--policy-name', policyName]).PolicyDocument
      if (canonical(current) === canonical(document)) {
        note(`inline policy ${policyName} already matches`)
      } else {
        warn(`${name}: inline policy ${policyName} differs from the repo definition — left untouched`)
      }
    } else if (PLAN) {
      note(`would add inline policy ${policyName}`)
    } else {
      aws([
        'iam', 'put-role-policy', '--role-name', name, '--policy-name', policyName,
        '--policy-document', fileArg(`${name}-${policyName}.json`, document),
      ])
      created.push(`${name}: inline policy ${policyName}`)
      note(`added inline policy ${policyName}`)
    }
  }
  return { roleCreated }
}

function readAdminSesConfig() {
  const config = awsOrNull(
    ['lambda', 'get-function-configuration', '--function-name', ADMIN_FUNCTION_NAME, '--query', 'Environment.Variables'],
    /ResourceNotFoundException/,
  )
  return {
    SES_FROM_EMAIL: config?.SES_FROM_EMAIL,
    SES_REPLY_TO_EMAIL: config?.SES_REPLY_TO_EMAIL ?? config?.SES_FROM_EMAIL,
  }
}

function checkSes(fromEmail) {
  try {
    const account = awsJson(['sesv2', 'get-account'])
    if (!account.ProductionAccessEnabled) {
      warn('SES is still in sandbox: mail only reaches verified recipients until production access is granted')
    }
  } catch (err) {
    warn(`could not read the SES account state (${err.stderr?.split('\n')[0] ?? err.message})`)
  }
  if (!fromEmail) return
  const identities = [fromEmail, fromEmail.split('@')[1]]
  for (const identity of identities) {
    const found = awsOrNull(['sesv2', 'get-email-identity', '--email-identity', identity], /NotFoundException/)
    if (found?.VerifiedForSendingStatus) {
      note(`SES identity ${identity} is verified for sending`)
      return
    }
    if (found) {
      warn(`SES identity ${identity} exists but is not yet verified for sending`)
      return
    }
  }
  warn(`no SES identity found for ${fromEmail} (nor its domain) — verify it before turning mail on`)
}

function desiredEnvironment(currentVars, adminSes, table) {
  const wanted = {
    TABLE_NAME: table,
    SES_FROM_EMAIL: adminSes.SES_FROM_EMAIL,
    SES_REPLY_TO_EMAIL: adminSes.SES_REPLY_TO_EMAIL,
    APP_URL: 'https://wiedoethet.nl',
    LIFECYCLE_MAX_SENDS_PER_RUN: '50',
  }
  const merged = { ...currentVars }
  const added = []
  const changedKeys = []
  for (const [key, value] of Object.entries(wanted)) {
    if (value === undefined) continue
    if (!(key in currentVars)) {
      merged[key] = value
      added.push(key)
    } else if (key === 'TABLE_NAME' && EXPLICIT_TABLE && currentVars[key] !== value) {
      merged[key] = value
      changedKeys.push(key)
    }
  }
  return { merged, added, changedKeys }
}

async function ensureLambda(adminSes, currentConfig, table) {
  const currentVars = currentConfig?.Environment?.Variables ?? {}
  const { merged, added, changedKeys } = desiredEnvironment(currentVars, adminSes, table)

  if (!currentConfig) {
    for (const key of ['SES_FROM_EMAIL', 'SES_REPLY_TO_EMAIL']) {
      if (!merged[key]) throw new Error(`${key} is not set on ${ADMIN_FUNCTION_NAME}; set it there first (see SES_SETUP.md)`)
    }
    if (PLAN) {
      created.push(`Lambda ${FUNCTION_NAME} (planned)`)
      note(`would create ${FUNCTION_NAME}: ${RUNTIME}, ${HANDLER}, ${TIMEOUT_SECONDS}s, ${MEMORY_MB} MB`)
      note(`would set env keys: ${Object.keys(merged).join(', ')} (TABLE_NAME=${table}; the master switch lives in the table and starts off)`)
      if (!existsSync(DIST_INDEX)) note('bundle not built yet; the real run bundles first')
      return
    }
    createZip()
    await retryOn(/cannot be assumed by Lambda/, 'Lambda role', () =>
      aws([
        'lambda', 'create-function', '--function-name', FUNCTION_NAME,
        '--runtime', RUNTIME, '--handler', HANDLER, '--role', LAMBDA_ROLE_ARN,
        '--timeout', String(TIMEOUT_SECONDS), '--memory-size', String(MEMORY_MB),
        '--description', 'Lifecycle mail automation (EventBridge Scheduler, weekdays 10:00)',
        '--zip-file', `fileb://${ZIP_PATH.replaceAll('\\', '/')}`,
        '--environment', fileArg('env.json', { Variables: merged }),
      ]),
    )
    aws(['lambda', 'wait', 'function-active-v2', '--function-name', FUNCTION_NAME])
    created.push(`Lambda ${FUNCTION_NAME}`)
    note(`created ${FUNCTION_NAME}; env keys: ${Object.keys(merged).join(', ')}`)
    return
  }

  existing.push(`Lambda ${FUNCTION_NAME}`)
  note(`function ${FUNCTION_NAME} exists (code is left alone; use \`npm run deploy:lifecycle\`)`)
  const expected = {
    Runtime: RUNTIME, Handler: HANDLER, Timeout: TIMEOUT_SECONDS, MemorySize: MEMORY_MB, Role: LAMBDA_ROLE_ARN,
  }
  for (const [key, value] of Object.entries(expected)) {
    if (currentConfig[key] !== value) warn(`${FUNCTION_NAME}: ${key} is ${currentConfig[key]}, expected ${value} — left untouched`)
  }
  for (const key of ['SES_FROM_EMAIL', 'SES_REPLY_TO_EMAIL']) {
    if (!merged[key]) warn(`${FUNCTION_NAME}: ${key} is not set and not available on ${ADMIN_FUNCTION_NAME} — real runs will fail closed`)
  }
  if (currentVars.LIFECYCLE_MAIL_ENABLED === 'false') {
    warn(`${FUNCTION_NAME}: LIFECYCLE_MAIL_ENABLED=false is a hard emergency stop that overrides the admin master switch — remove that env var to control mail from Admin -> Automatisering (left untouched)`)
  }

  if (!added.length && !changedKeys.length) {
    note('environment already complete')
    return
  }
  if (changedKeys.includes('TABLE_NAME')) {
    warn(`TABLE_NAME changes ${currentVars.TABLE_NAME} -> ${table}: the function will now process that table`)
  }
  if (PLAN) {
    note(`would add env keys: ${added.join(', ') || '-'}; change: ${changedKeys.join(', ') || '-'}`)
    return
  }
  aws(['lambda', 'wait', 'function-updated-v2', '--function-name', FUNCTION_NAME])
  aws(['lambda', 'update-function-configuration', '--function-name', FUNCTION_NAME, '--environment', fileArg('env.json', { Variables: merged })])
  aws(['lambda', 'wait', 'function-updated-v2', '--function-name', FUNCTION_NAME])
  changed.push(`Lambda ${FUNCTION_NAME}: env added [${added.join(', ')}] changed [${changedKeys.join(', ')}]`)
  note(`updated environment (added: ${added.join(', ') || '-'}; changed: ${changedKeys.join(', ') || '-'})`)
}

async function ensureSchedule() {
  const schedule = awsOrNull(['scheduler', 'get-schedule', '--name', SCHEDULE_NAME], /ResourceNotFoundException/)
  if (schedule) {
    existing.push(`Schedule ${SCHEDULE_NAME}`)
    note(`schedule exists: ${schedule.State}, ${schedule.ScheduleExpression} (${schedule.ScheduleExpressionTimezone})`)
    if (schedule.ScheduleExpression !== SCHEDULE_EXPRESSION || schedule.ScheduleExpressionTimezone !== SCHEDULE_TIMEZONE) {
      warn(`schedule differs from ${SCHEDULE_EXPRESSION} (${SCHEDULE_TIMEZONE}) — left untouched`)
    }
    if (schedule.Target?.Arn !== FUNCTION_ARN) warn(`schedule targets ${schedule.Target?.Arn}, expected ${FUNCTION_ARN}`)
    return
  }
  const state = SCHEDULE_ENABLED ? 'ENABLED' : 'DISABLED'
  if (PLAN) {
    created.push(`Schedule ${SCHEDULE_NAME} (planned)`)
    note(`would create schedule ${SCHEDULE_NAME}: ${SCHEDULE_EXPRESSION} (${SCHEDULE_TIMEZONE}), ${state}, payload {}, no retries`)
    return
  }
  const target = {
    Arn: FUNCTION_ARN,
    RoleArn: SCHEDULER_ROLE_ARN,
    Input: '{}',
    RetryPolicy: { MaximumRetryAttempts: 0 },
  }
  await retryOn(/must allow AWS EventBridge Scheduler to assume/i, 'scheduler role', () =>
    aws([
      'scheduler', 'create-schedule', '--name', SCHEDULE_NAME,
      '--description', 'Weekday lifecycle mail run (idempotent; inert until the master switch is turned on in Admin -> Automatisering)',
      '--schedule-expression', SCHEDULE_EXPRESSION,
      '--schedule-expression-timezone', SCHEDULE_TIMEZONE,
      '--flexible-time-window', 'Mode=OFF',
      '--state', state,
      '--target', fileArg('schedule-target.json', target),
    ]),
  )
  created.push(`Schedule ${SCHEDULE_NAME} (${state})`)
  note(`created schedule ${SCHEDULE_NAME} (${state})`)
}

function smokeTest() {
  const outPath = join(TMP_DIR, 'invoke-out.json')
  const result = awsJson([
    'lambda', 'invoke', '--function-name', FUNCTION_NAME,
    '--cli-binary-format', 'raw-in-base64-out',
    '--payload', fileArg('dry-run.json', { dryRun: true }),
    outPath,
  ])
  const body = JSON.parse(readFileSync(outPath, 'utf8'))
  if (result.FunctionError) {
    throw new Error(`smoke test failed (${result.FunctionError}): ${body.errorMessage ?? JSON.stringify(body)}`)
  }
  note(
    `dry run OK: evaluated ${body.evaluated}, would send ${body.wouldSend?.length ?? 0}, sent ${body.sent}, failed ${body.failed}`,
  )
  note('nothing was sent; the dry run wrote LASTRUN in the target table')
}

function printSummary(table) {
  console.log('\n== Summary' + (PLAN ? ' (plan only — nothing was changed)' : ''))
  const list = (label, items) => items.length && console.log(`${label}:\n${items.map((i) => `  - ${i}`).join('\n')}`)
  list(PLAN ? 'Would create' : 'Created', created)
  list('Already existed', existing)
  list('Changed', changed)
  list('Warnings', warnings)

  console.log(`\nStill manual (table ${table}):`)
  console.log(`  1. GSI3 backfill: TABLE_NAME=${table} node scripts/backfill-gsi3.js   (add DRY_RUN=1 to preview)`)
  console.log('  2. SES: production access + a verified sender identity (see warnings above, SES_SETUP.md section 1-2)')
  console.log('  3. Go live: in Admin -> Automatisering enable the templates, then flip the Hoofdschakelaar (stored per table, off by default)')
  console.log('     (needs `npm run deploy:admin` once for the PATCH /admin/mail-master route; LIFECYCLE_MAIL_ENABLED=false on the function is a hard stop that overrides the switch)')
  console.log('  4. Production: `node scripts/setup-lifecycle.js --table wdh-main` and `node scripts/deploy-admin.js production`')
  if (PLAN) console.log('\nRe-run without --plan to apply.')
}

async function main() {
  validateArgs()
  console.log(PLAN ? 'PLAN MODE: read-only, no AWS resources are created or changed.' : 'Applying lifecycle setup.')

  step('Preflight')
  const identity = awsJson(['sts', 'get-caller-identity'])
  if (identity.Account !== ACCOUNT_ID) throw new Error(`Wrong AWS account ${identity.Account}; expected ${ACCOUNT_ID}`)
  note(`AWS identity: ${identity.Arn}`)

  const currentConfig = awsOrNull(['lambda', 'get-function-configuration', '--function-name', FUNCTION_NAME], /ResourceNotFoundException/)
  const table = EXPLICIT_TABLE ?? currentConfig?.Environment?.Variables?.TABLE_NAME ?? DEFAULT_TABLE
  if (!TABLES.includes(table)) throw new Error(`${FUNCTION_NAME} has TABLE_NAME=${table}; expected one of ${TABLES.join(', ')}`)
  const tableInfo = awsOrNull(['dynamodb', 'describe-table', '--table-name', table], /ResourceNotFoundException/)
  if (!tableInfo) throw new Error(`DynamoDB table ${table} not found in ${REGION}`)
  note(`target table: ${table} (${tableInfo.Table.TableStatus}, ${tableInfo.Table.ItemCount} items)`)

  const adminSes = readAdminSesConfig()
  note(`SES sender from ${ADMIN_FUNCTION_NAME}: ${adminSes.SES_FROM_EMAIL ?? '(not set)'}, reply-to: ${adminSes.SES_REPLY_TO_EMAIL ?? '(not set)'}`)
  checkSes(currentConfig?.Environment?.Variables?.SES_FROM_EMAIL ?? adminSes.SES_FROM_EMAIL)

  step(`IAM role ${LAMBDA_ROLE}`)
  const dynamoPolicy = JSON.parse(readFileSync(resolve(ROOT, 'iam-policy-dynamodb.json'), 'utf8'))
  const sesPolicy = JSON.parse(readFileSync(resolve(ROOT, 'iam-policy-ses.json'), 'utf8'))
  const { roleCreated } = await ensureRole({
    name: LAMBDA_ROLE,
    description: 'Execution role of the wiedoethet-lifecycle Lambda',
    trustPolicy: {
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }],
    },
    managedPolicyArns: [BASIC_EXECUTION_POLICY_ARN],
    inlinePolicies: { WdhDynamoDBTableAccess: dynamoPolicy, WdhSesSendAccess: sesPolicy },
  })
  if (roleCreated) await sleep(10000)

  step(`Lambda ${FUNCTION_NAME}`)
  await ensureLambda(adminSes, currentConfig, table)

  step(`IAM role ${SCHEDULER_ROLE}`)
  await ensureRole({
    name: SCHEDULER_ROLE,
    description: 'Lets EventBridge Scheduler invoke the wiedoethet-lifecycle Lambda',
    trustPolicy: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: 'scheduler.amazonaws.com' },
          Action: 'sts:AssumeRole',
          Condition: { StringEquals: { 'aws:SourceAccount': ACCOUNT_ID } },
        },
      ],
    },
    inlinePolicies: {
      InvokeLifecycleLambda: {
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Action: 'lambda:InvokeFunction', Resource: [FUNCTION_ARN, `${FUNCTION_ARN}:*`] }],
      },
    },
  })

  step(`Schedule ${SCHEDULE_NAME}`)
  await ensureSchedule()

  if (!PLAN) {
    step('Smoke test (dryRun, sends nothing)')
    smokeTest()
  }

  printSummary(table)
}

try {
  await main()
} catch (err) {
  console.error(`\nSetup failed: ${err.message}`)
  process.exitCode = 1
} finally {
  rmSync(TMP_DIR, { recursive: true, force: true })
}
