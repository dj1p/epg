// web/app/admin/channels/ChannelsClient.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

const REGIONS = ['th', 'no', 'uk', 'sg', 'us']
const PAGE_SIZE = 200

interface Channel {
  site: string
  siteId: string
  lang: string
  xmltvId: string
  name: string
}

interface ListedChannel extends Channel {
  custom: boolean
}

interface RemovedChannel {
  site: string
  siteId: string
  name?: string
}

type Message = { text: string; error: boolean; jobId?: string }

function keyOf(ch: { site: string; siteId: string }) {
  return `${ch.site}|${ch.siteId}`
}

export default function ChannelsClient() {
  const [region, setRegion] = useState('no')
  const [channels, setChannels] = useState<ListedChannel[]>([])
  const [removed, setRemoved] = useState<RemovedChannel[]>([])
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState('')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Channel[]>([])
  const [manual, setManual] = useState({ site: '', siteId: '', lang: 'en', xmltvId: '', name: '' })
  const [message, setMessage] = useState<Message | null>(null)
  const [fetching, setFetching] = useState(false)

  async function loadChannels(forRegion = region) {
    const response = await fetch(`/api/admin/channels?region=${forRegion}`)
    if (!response.ok) {
      setMessage({ text: 'Failed to load channels', error: true })
      return
    }
    const data = await response.json()
    setChannels(data.channels || [])
    setRemoved(data.removed || [])
    setLoaded(true)
  }

  useEffect(() => {
    setLoaded(false)
    setFilter('')
    setShown(PAGE_SIZE)
    setQuery('')
    setResults([])
    setMessage(null)
    loadChannels(region)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region])

  useEffect(() => {
    setShown(PAGE_SIZE)
  }, [filter])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const controller = new AbortController()
    fetch(`/api/admin/channels/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then(async r => {
        const data = await r.json()
        if (!r.ok) {
          setMessage({ text: 'Channel search failed', error: true })
          return
        }
        setResults(data.results || [])
      })
      .catch(err => {
        if (err instanceof Error && err.name === 'AbortError') return
        setMessage({ text: 'Channel search failed', error: true })
      })
    return () => controller.abort()
  }, [query])

  const inList = useMemo(() => new Set(channels.map(keyOf)), [channels])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return channels
    return channels.filter(
      ch => ch.name.toLowerCase().includes(q) || ch.site.toLowerCase().includes(q) || ch.xmltvId.toLowerCase().includes(q)
    )
  }, [channels, filter])

  const regionLabel = region.toUpperCase()

  async function addChannel(channel: Channel) {
    setMessage(null)
    try {
      const response = await fetch('/api/admin/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...channel, region })
      })
      const data = await response.json()
      if (!response.ok) {
        setMessage({
          text: data.error === 'duplicate' ? `"${channel.name}" is already in the ${regionLabel} list` : data.error,
          error: true
        })
        return
      }
      setMessage({
        text: data.warning || `Added "${channel.name}" to ${regionLabel}. Fetch ${regionLabel} to pull its schedule.`,
        error: !!data.warning
      })
      await loadChannels()
    } catch (err) {
      setMessage({ text: 'Failed to add channel', error: true })
    }
  }

  async function removeChannel(ch: ListedChannel) {
    setMessage(null)
    try {
      const response = await fetch(
        `/api/admin/channels?region=${region}&site=${encodeURIComponent(ch.site)}&siteId=${encodeURIComponent(ch.siteId)}`,
        { method: 'DELETE' }
      )
      const data = await response.json()
      if (!response.ok) {
        setMessage({ text: data.error, error: true })
        return
      }
      setMessage({
        text: data.warning || `Removed "${ch.name}" from ${regionLabel}. It will drop out of the guide at the next fetch.`,
        error: !!data.warning
      })
      await loadChannels()
    } catch (err) {
      setMessage({ text: 'Failed to remove channel', error: true })
    }
  }

  async function restoreChannel(ch: RemovedChannel) {
    setMessage(null)
    try {
      const response = await fetch('/api/admin/channels/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region, site: ch.site, siteId: ch.siteId })
      })
      const data = await response.json()
      if (!response.ok) {
        setMessage({ text: data.error, error: true })
        return
      }
      setMessage({ text: `Restored "${ch.name || ch.siteId}" to ${regionLabel}.`, error: false })
      await loadChannels()
    } catch (err) {
      setMessage({ text: 'Failed to restore channel', error: true })
    }
  }

  async function fetchNow() {
    if (fetching) return
    setFetching(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/fetch/${region}`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) {
        setMessage({ text: data.error, error: true })
        return
      }
      setMessage({ text: `Started fetch for ${regionLabel}.`, error: false, jobId: data.job?.id })
    } catch (err) {
      setMessage({ text: 'Failed to start fetch', error: true })
    } finally {
      setFetching(false)
    }
  }

  return (
    <main>
      <div className="page-header">
        <div>
          <h1>Channels</h1>
          <p className="page-sub">What each region&apos;s fetch pulls. Changes apply from the next fetch.</p>
        </div>
        <div className="tabs" role="tablist">
          {REGIONS.map(r => (
            <button
              key={r}
              role="tab"
              aria-selected={region === r}
              className={region === r ? 'tab active' : 'tab'}
              onClick={() => setRegion(r)}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div className={message.error ? 'notice error-notice' : 'notice'}>
          {message.text}
          {message.jobId && (
            <>
              {' '}
              <Link href={`/admin/jobs/${message.jobId}`}>View log</Link>
            </>
          )}
        </div>
      )}

      <section className="card">
        <h2>Add to {regionLabel}</h2>
        <input
          style={{ width: '100%' }}
          placeholder="Search the catalog by channel name or site (e.g. bbc)"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {results.length > 0 && (
          <div className="table-wrap" style={{ marginTop: '0.9rem', maxHeight: '320px', overflowY: 'auto' }}>
            <table>
              <tbody>
                {results.map(entry => (
                  <tr key={keyOf(entry)}>
                    <td>{entry.name}</td>
                    <td className="muted">{entry.site}</td>
                    <td className="muted">{entry.lang}</td>
                    <td style={{ textAlign: 'right' }}>
                      {inList.has(keyOf(entry)) ? (
                        <span className="muted">In list</span>
                      ) : (
                        <button className="btn-sm" onClick={() => addChannel(entry)}>
                          Add
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <details style={{ marginTop: '1rem' }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>
            Add a channel manually
          </summary>
          <form
            className="row"
            style={{ marginTop: '0.8rem' }}
            onSubmit={e => {
              e.preventDefault()
              addChannel(manual)
            }}
          >
            <input
              placeholder="site (e.g. example.com)"
              value={manual.site}
              onChange={e => setManual({ ...manual, site: e.target.value })}
            />
            <input
              placeholder="site_id"
              value={manual.siteId}
              onChange={e => setManual({ ...manual, siteId: e.target.value })}
            />
            <input
              style={{ width: '5rem' }}
              placeholder="lang"
              value={manual.lang}
              onChange={e => setManual({ ...manual, lang: e.target.value })}
            />
            <input
              placeholder="xmltv_id (optional)"
              value={manual.xmltvId}
              onChange={e => setManual({ ...manual, xmltvId: e.target.value })}
            />
            <input
              placeholder="display name"
              value={manual.name}
              onChange={e => setManual({ ...manual, name: e.target.value })}
            />
            <button type="submit" className="btn-primary">
              Add
            </button>
          </form>
        </details>
      </section>

      <section className="card flush">
        <div className="card-head">
          <h2>
            {regionLabel} fetch list
            {loaded && <span className="muted"> · {channels.length} channels</span>}
          </h2>
          <div className="row">
            <input
              placeholder="Filter by name, site or id"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{ minWidth: '14rem' }}
            />
            <button className="btn-primary" onClick={fetchNow} disabled={fetching}>
              {fetching ? 'Starting…' : `Fetch ${regionLabel} now`}
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Site</th>
                <th>Lang</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, shown).map(ch => (
                <tr key={keyOf(ch)}>
                  <td>
                    {ch.name} {ch.custom && <span className="badge plain">Added</span>}
                  </td>
                  <td className="muted">{ch.site}</td>
                  <td className="muted">{ch.lang}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-sm btn-danger" onClick={() => removeChannel(ch)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loaded && channels.length === 0 && (
            <div className="empty">
              No channels in {regionLabel} yet. If this is a fresh deploy, the lists are built at startup.
            </div>
          )}
          {loaded && channels.length > 0 && filtered.length === 0 && (
            <div className="empty">No channels match &ldquo;{filter}&rdquo;.</div>
          )}
          {!loaded && <div className="empty">Loading…</div>}
          {filtered.length > shown && (
            <div className="empty">
              <button onClick={() => setShown(s => s + PAGE_SIZE)}>
                Show more ({filtered.length - shown} more)
              </button>
            </div>
          )}
        </div>
      </section>

      {removed.length > 0 && (
        <section className="card flush">
          <div className="card-head">
            <h2>Removed from {regionLabel}</h2>
            <span className="muted">{removed.length} removed</span>
          </div>
          <div className="table-wrap">
            <table>
              <tbody>
                {removed.map(ch => (
                  <tr key={keyOf(ch)}>
                    <td>{ch.name || ch.siteId}</td>
                    <td className="muted">{ch.site}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-sm" onClick={() => restoreChannel(ch)}>
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  )
}
