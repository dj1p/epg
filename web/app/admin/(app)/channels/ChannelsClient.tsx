// web/app/admin/channels/ChannelsClient.tsx
'use client'

import { useEffect, useState } from 'react'

interface Channel {
  site: string
  siteId: string
  lang: string
  xmltvId: string
  name: string
}

interface CatalogEntry extends Channel {}

export default function ChannelsClient() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogEntry[]>([])
  const [manual, setManual] = useState({ site: '', siteId: '', lang: 'en', xmltvId: '', name: '' })
  const [message, setMessage] = useState<string | null>(null)

  async function loadChannels() {
    const response = await fetch('/api/admin/channels')
    if (!response.ok) {
      setMessage('Error: failed to load channels')
      return
    }
    const data = await response.json()
    setChannels(data.channels || [])
  }

  useEffect(() => {
    loadChannels()
  }, [])

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
          setMessage('Error: channel search failed')
          return
        }
        setMessage(null)
        setResults(data.results || [])
      })
      .catch(err => {
        if (err instanceof Error && err.name === 'AbortError') return
        setMessage('Error: channel search failed')
      })
    return () => controller.abort()
  }, [query])

  async function addChannel(channel: Channel) {
    setMessage(null)
    try {
      const response = await fetch('/api/admin/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channel)
      })
      const data = await response.json()
      if (!response.ok) {
        setMessage(`Error: ${data.error}`)
        return
      }
      setMessage(`Added "${channel.name}" — run a fetch to pull its schedule.`)
      await loadChannels()
    } catch (err) {
      setMessage('Error: failed to add channel')
    }
  }

  async function removeChannel(site: string, siteId: string) {
    setMessage(null)
    try {
      const response = await fetch(
        `/api/admin/channels?site=${encodeURIComponent(site)}&siteId=${encodeURIComponent(siteId)}`,
        { method: 'DELETE' }
      )
      const data = await response.json()
      if (!response.ok) {
        setMessage(`Error: ${data.error}`)
        return
      }
      await loadChannels()
    } catch (err) {
      setMessage('Error: failed to remove channel')
    }
  }

  return (
    <main>
      <div className="page-header">
        <div>
          <h1>Channels</h1>
          <p className="page-sub">{channels.length} channels in the current list</p>
        </div>
      </div>

      {message && (
        <div className={message.startsWith('Error') ? 'notice error-notice' : 'notice'}>{message}</div>
      )}

      <section className="card">
        <h2>Add from catalog</h2>
        <input
          style={{ width: '100%' }}
          placeholder="Search by channel name or site (e.g. bbc)"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {results.length > 0 && (
          <div className="table-wrap" style={{ marginTop: '0.9rem' }}>
            <table>
              <tbody>
                {results.map(entry => (
                  <tr key={`${entry.site}|${entry.siteId}`}>
                    <td>{entry.name}</td>
                    <td className="muted">{entry.site}</td>
                    <td className="muted">{entry.lang}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-sm" onClick={() => addChannel(entry)}>
                        Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Add manually</h2>
        <form
          className="row"
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
      </section>

      <section className="card flush">
        <div className="card-head">
          <h2>Current channels ({channels.length})</h2>
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
              {channels.map(ch => (
                <tr key={`${ch.site}|${ch.siteId}`}>
                  <td>{ch.name}</td>
                  <td className="muted">{ch.site}</td>
                  <td className="muted">{ch.lang}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn-sm btn-danger" onClick={() => removeChannel(ch.site, ch.siteId)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {channels.length === 0 && <div className="empty">No channels yet.</div>}
        </div>
      </section>
    </main>
  )
}
