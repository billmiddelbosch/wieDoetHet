/**
 * Deploy the wiedoethet-lifecycle Lambda (lifecycle mail automation).
 *
 * Unlike deploy-admin.js there is no API Gateway wiring: the function is only
 * invoked by EventBridge Scheduler (or by hand with the events in
 * wiedoethet-lifecycle/tests/). This script therefore just zips the bundle and
 * uploads it to the existing function. Create the function, its IAM role, the
 * environment variables and the schedule first — see lambda/SES_SETUP.md
 * ("Lifecycle mail").
 *
 * Usage:
 *   npm run deploy:lifecycle      (bundles, then runs this script)
 *
 * Requires AWS credentials resolvable via the standard SDK/CLI credential
 * chain, and the AWS CLI itself installed (this shells out to `aws`).
 */

import { execFileSync } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import { platform } from 'node:os'
import { resolve } from 'node:path'

const REGION = 'eu-west-2'
const FUNCTION_NAME = 'wiedoethet-lifecycle'

const DIST_INDEX = resolve(import.meta.dirname, '../dist/wiedoethet-lifecycle/index.js')
const ZIP_PATH = resolve(import.meta.dirname, '../dist/wiedoethet-lifecycle.zip')

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
  console.log(`Zipped ${DIST_INDEX} -> ${ZIP_PATH}`)
}

function updateFunctionCode() {
  execFileSync(
    'aws',
    ['lambda', 'update-function-code', '--region', REGION, '--function-name', FUNCTION_NAME, '--zip-file', `fileb://${ZIP_PATH}`],
    { encoding: 'utf8', env: { ...process.env, AWS_PAGER: '' } },
  )
  console.log(`Uploaded new code to ${FUNCTION_NAME} ($LATEST)`)
}

createZip()
updateFunctionCode()
console.log('Done. Nothing is sent until LIFECYCLE_MAIL_ENABLED=true and a template is switched on in the admin panel.')
