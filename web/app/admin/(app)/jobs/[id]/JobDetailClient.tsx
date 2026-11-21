'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { JobMeta, SourceBadge, StatusBadge, formatDateTime, formatDuration } from '../jobUi'

export default function JobDetailClient({ id }: { id: string }) {
  const [job, setJob] = useState<JobMeta | null>(null)
  const [log, setLog] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let cancelled = false
    let eventSource: EventSource | null = null

    async function load() {
      const response = await fetch(`/api/admin/jobs/${id}`)
      if (cancelled) return
      if (!response.ok) {
        setError('Job not found')
        return
      }
      const data = await response.json()
      if (cancelled) return
      setJob(data.job)
      setLog(data.log)

      if (data.job.status === 'running') {
        const source = new EventSource(`/api/admin/jobs/${id}/stream`)
        if (cancelled) {
          // Cleanup already ran before this async fetch resolved; don't
          // leave a dangling connection open on a torn-down effect.
          source.close()
          return
        }
        eventSource = source
        source.onmessage = event => {
          const payload = JSON.parse(event.data)
          if (typeof payload.log === 'string') {
            // Full resync of the log as of connection time (covers the gap
            // between the initial fetch and the SSE connection opening).
            setLog(payload.log)
          }
          if (payload.line) {
            setLog(prev => prev + payload.line)
          }
          if (payload.done) {
            setJob(prev =>
              prev ? { ...prev, status: payload.status, finishedAt: prev.finishedAt ?? new Date().toISOString() } : prev
            )
            source.close()
          }
        }
      }
    }

    load()

    return () => {
      cancelled = true
      eventSource?.close()
    }
  }, [id])

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight)
  }, [log])

  // Keep the duration of a running job ticking.
  useEffect(() => {
    if (job?.status !== 'running') return
    const timer = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(timer)
  }, [job?.status])

  if (error) {
    return (
      <main>
        <Link href="/admin/jobs" className="back-link">
          ← All jobs
        </Link>
        <div className="notice error-notice">{error}</div>
      </main>
    )
  }
  if (!job) {
    return (
      <main>
        <p className="muted">Loading…</p>
      </main>
    )
  }

  return (
    <main>
      <Link href="/admin/jobs" className="back-link">
        ← All jobs
      </Link>
      <div className="page-header">
        <div className="row">
          <h1>
            <span className="region-tag">{job.region}</span> fetch
          </h1>
          <StatusBadge status={job.status} />
        </div>
      </div>

      <section className="card">
        <dl className="meta-grid" style={{ margin: 0 }}>
          <div>
            <dt>Source</dt>
            <dd>
              <SourceBadge source={job.source} />
            </dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{formatDateTime(job.startedAt)}</dd>
          </div>
          <div>
            <dt>Finished</dt>
            <dd>{job.finishedAt ? formatDateTime(job.finishedAt) : '—'}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{formatDuration(job.startedAt, job.finishedAt)}</dd>
          </div>
          <div>
            <dt>Exit code</dt>
            <dd>{job.exitCode !== null ? job.exitCode : '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="card flush">
        <div className="card-head">
          <h2>Log</h2>
          <span className="muted">{log ? `${log.split('\n').length - 1} lines` : ''}</span>
        </div>
        <pre ref={logRef} className="log">
          {log || (job.status === 'running' ? 'Waiting for output…' : 'No output recorded.')}
        </pre>
      </section>
    </main>
  )
}
