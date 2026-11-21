'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { JobMeta, REGIONS, StatusBadge, formatDateTime, formatDuration, formatRelative } from './jobs/jobUi'

export default function DashboardClient() {
  const [jobs, setJobs] = useState<JobMeta[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch('/api/admin/jobs')
        if (!response.ok || cancelled) return
        const data = await response.json()
        if (!cancelled) setJobs(data.jobs || [])
      } catch {
        /* leave the cards empty; the Jobs page shows errors */
      }
    }
    load()
    const interval = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // jobs arrive newest-first, so the first match per region is its latest run.
  const latest = (region: string) => jobs?.find(job => job.region === region)

  return (
    <main>
      <div className="page-header">
        <div>
          <h1>EPG Admin</h1>
          <p className="page-sub">Guide fetches and channel lists for epg.austheim.app</p>
        </div>
      </div>

      <h2>Latest fetch per region</h2>
      <div className="grid" style={{ marginBottom: '1.75rem' }}>
        {REGIONS.map(region => {
          const job = latest(region)
          return (
            <Link key={region} href={job ? `/admin/jobs/${job.id}` : '/admin/jobs'} className="stat">
              <div className="stat-title">
                <span className="region-tag">{region}</span>
                {job ? <StatusBadge status={job.status} /> : <span className="muted">—</span>}
              </div>
              <div className="stat-meta">
                {job ? (
                  <>
                    <span title={formatDateTime(job.startedAt)}>{formatRelative(job.startedAt)}</span>
                    {' · '}
                    {formatDuration(job.startedAt, job.finishedAt)}
                  </>
                ) : jobs === null ? (
                  'Loading…'
                ) : (
                  'No runs recorded yet'
                )}
              </div>
            </Link>
          )
        })}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <Link href="/admin/channels" className="card link-card">
          <h2>Channels</h2>
          <p>Search the catalog, add or remove channels.</p>
        </Link>
        <Link href="/admin/jobs" className="card link-card">
          <h2>Jobs &amp; logs</h2>
          <p>Scheduled and manual fetches, with live logs.</p>
        </Link>
      </div>
    </main>
  )
}
