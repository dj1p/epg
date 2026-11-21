#!/usr/bin/env node
/**
 * Runs scripts/grab-with-history.sh and records the run as a job, so scheduled
 * (cron / startup) grabs show up in the /admin Jobs page next to manual ones.
 *
 * Usage: node scripts/run-job.js <region> [grab args...]
 *   e.g. node scripts/run-job.js no --channels=public/channels-no.xml --output=public/no/guide.xml
 *
 * Writes <data>/jobs/<id>.json (meta) and <data>/jobs/<id>.log, using the same
 * shape and atomic-write approach as web/lib/jobStorage.ts. Meta carries
 * source "scheduled" and this process's pid so the admin UI can tell a live
 * run from an orphaned one. The exit code of the grab is passed through.
 */
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const REPO_ROOT = path.resolve(__dirname, '..')
const DATA_DIR = process.env.EPG_DATA_DIR || path.join(REPO_ROOT, 'data')
const JOBS_DIR = path.join(DATA_DIR, 'jobs')
const KEEP_JOBS = Number(process.env.EPG_KEEP_JOBS || 300)

const [region, ...grabArgs] = process.argv.slice(2)
if (!region) {
  console.error('usage: node scripts/run-job.js <region> [grab args...]')
  process.exit(2)
}

const id = `${Date.now()}-${region}`
const metaFile = path.join(JOBS_DIR, `${id}.json`)
const logFile = path.join(JOBS_DIR, `${id}.log`)

function writeMeta(meta) {
  fs.mkdirSync(JOBS_DIR, { recursive: true })
  const tmp = `${metaFile}.${process.pid}-${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2))
  fs.renameSync(tmp, metaFile)
}

function pruneOldJobs() {
  try {
    const ids = fs
      .readdirSync(JOBS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''))
      // ids start with the epoch ms, so lexical == chronological for same length
      .sort()
    const stale = ids.slice(0, Math.max(0, ids.length - KEEP_JOBS))
    for (const old of stale) {
      for (const ext of ['.json', '.log']) {
        try {
          fs.unlinkSync(path.join(JOBS_DIR, old + ext))
        } catch (_) {
          /* already gone */
        }
      }
    }
  } catch (_) {
    /* pruning is best effort */
  }
}

const meta = {
  id,
  region,
  status: 'running',
  startedAt: new Date().toISOString(),
  finishedAt: null,
  exitCode: null,
  source: 'scheduled',
  pid: process.pid
}

try {
  writeMeta(meta)
} catch (err) {
  // Never let bookkeeping stop the grab itself: run it unrecorded.
  console.error(`[run-job] cannot write job record (${err.message}); running without it`)
  const direct = spawn('bash', ['scripts/grab-with-history.sh', region, ...grabArgs], {
    cwd: REPO_ROOT,
    stdio: 'inherit'
  })
  direct.on('close', code => process.exit(code === null ? 1 : code))
  return
}

const logStream = fs.createWriteStream(logFile, { flags: 'a' })
const child = spawn('bash', ['scripts/grab-with-history.sh', region, ...grabArgs], {
  cwd: REPO_ROOT,
  stdio: ['ignore', 'pipe', 'pipe']
})

let finalized = false
function finalize(status, exitCode) {
  if (finalized) return
  finalized = true
  try {
    writeMeta({ ...meta, status, finishedAt: new Date().toISOString(), exitCode })
  } catch (err) {
    console.error(`[run-job] cannot update job record: ${err.message}`)
  }
  pruneOldJobs()
}

child.stdout.on('data', chunk => {
  logStream.write(chunk)
  process.stdout.write(chunk) // keep pm2 logs as they were
})
child.stderr.on('data', chunk => {
  logStream.write(chunk)
  process.stderr.write(chunk)
})

child.on('error', err => {
  logStream.write(`\n[run-job] failed to start process: ${err.message}\n`)
  logStream.end(() => {
    finalize('failed', null)
    process.exit(1)
  })
})

child.on('close', code => {
  logStream.end(() => {
    finalize(code === 0 ? 'success' : 'failed', code)
    process.exit(code === null ? 1 : code)
  })
})

// pm2 stop/restart or a container redeploy sends SIGTERM: stop the grab and
// record the run as interrupted instead of leaving it "running".
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    child.kill(signal)
    logStream.write(`\n[run-job] received ${signal}, stopping\n`)
    logStream.end(() => {
      finalize('interrupted', null)
      process.exit(1)
    })
  })
}
