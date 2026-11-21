'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  JobMeta,
  REGIONS,
  SourceBadge,
  StatusBadge,
  formatDateTime,
  formatDuration,
  formatRelative
} from './jobUi'

type SourceFilter = 'all' | 'scheduled' | 'manual'

const SOURCE_TABS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'manual', label: 'Manual' }
]

export default function JobsClient() {
  const [jobs, setJobs] = useState<JobMeta[]>([])
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [fetchAllPending, setFetchAllPending] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [regionFilter, setRegionFilter] = useState('all')
  // Re-render every few seconds so "running for…" and "x min ago" stay current.
  const [, setTick] = useState(0)

  async function loadJobs() {
    const response = await fetch('/api/admin/jobs')
    if (!response.ok) {
      setMessage({ text: 'Failed to load jobs', error: true })
      return
    }
    const data = await response.json()
    setJobs(data.jobs || [])
    setLoaded(true)
  }

  useEffect(() => {
    loadJobs()
    const interval = setInterval(() => {
      loadJobs()
      setTick(t => t + 1)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  async function startFetch(region: string) {
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/fetch/${region}`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        setMessage({ text: data.error, error: true })
        return
      }
      setMessage({ text: `Started fetch for ${region.toUpperCase()}`, error: false })
      await loadJobs()
    } catch (err) {
      setMessage({ text: 'Failed to start fetch', error: true })
    }
  }

  async function startFetchAll() {
    // Belt-and-suspenders only: this stops a normal double-click from firing
    // two requests, but it cannot prevent duplicate requests from two tabs
    // or windows. The server-side guard (jobLock's fetchAllRunning flag) is
    // what actually guarantees only one "fetch all" run proceeds at a time.
    if (fetchAllPending) return
    setMessage(null)
    setFetchAllPending(true)
    try {
      const response = await fetch('/api/admin/fetch/all', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        setMessage({ text: data.error, error: true })
        return
      }
      setMessage({ text: 'Fetch all started', error: false })
      await loadJobs()
    } catch (err) {
      setMessage({ text: 'Failed to start fetch all', error: true })
    } finally {
      setFetchAllPending(false)
    }
  }

  const regionsSeen = useMemo(() => {
    const seen = new Set<string>(REGIONS)
    jobs.forEach(job => seen.add(job.region))
    return Array.from(seen)
  }, [jobs])

  const visible = jobs.filter(job => {
    const source = job.source ?? 'manual'
    if (sourceFilter !== 'all' && source !== sourceFilter) return false
    if (regionFilter !== 'all' && job.region !== regionFilter) return false
    return true
  })

  const runningCount = jobs.filter(job => job.status === 'running').length

  return (
    <main>
      <div className="page-header">
        <div>
          <h1>Jobs</h1>
          <p className="page-sub">
            Scheduled and manual guide fetches
            {runningCount > 0 ? ` · ${runningCount} running now` : ''}
          </p>
        </div>
      </div>

      {message && <div className={message.error ? 'notice error-notice' : 'notice'}>{message.text}</div>}

      <section className="card">
        <h2>Run a fetch now</h2>
        <div className="row">
          {REGIONS.map(region => (
            <button key={region} onClick={() => startFetch(region)}>
              {region.toUpperCase()}
            </button>
          ))}
          <span className="spacer" />
          <button className="btn-primary" onClick={startFetchAll} disabled={fetchAllPending}>
            {fetchAllPending ? 'Starting…' : 'Fetch all regions'}
          </button>
        </div>
      </section>

      <section className="card flush">
        <div className="card-head">
          <h2>History</h2>
          <div className="row">
            <div className="tabs" role="tablist">
              {SOURCE_TABS.map(tab => (
                <button
                  key={tab.value}
                  role="tab"
                  aria-selected={sourceFilter === tab.value}
                  className={sourceFilter === tab.value ? 'tab active' : 'tab'}
                  onClick={() => setSourceFilter(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <select
              value={regionFilter}
              onChange={e => setRegionFilter(e.target.value)}
              aria-label="Filter by region"
            >
              <option value="all">All regions</option>
              {regionsSeen.map(region => (
                <option key={region} value={region}>
                  {region.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Region</th>
                <th>Source</th>
                <th>Status</th>
                <th>Started</th>
                <th>Duration</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(job => (
                <tr key={job.id}>
                  <td>
                    <span className="region-tag">{job.region}</span>
                  </td>
                  <td>
                    <SourceBadge source={job.source} />
                  </td>
                  <td>
                    <StatusBadge status={job.status} />
                  </td>
                  <td title={formatDateTime(job.startedAt)}>{formatRelative(job.startedAt)}</td>
                  <td className="muted">{formatDuration(job.startedAt, job.finishedAt)}</td>
                  <td>
                    <Link href={`/admin/jobs/${job.id}`}>View log</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loaded && visible.length === 0 && <div className="empty">No jobs match this filter yet.</div>}
          {!loaded && <div className="empty">Loading…</div>}
        </div>
      </section>
    </main>
  )
}
