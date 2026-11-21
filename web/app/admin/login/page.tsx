'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const response = await fetch('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })

    setSubmitting(false)

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'login failed' }))
      setError(data.error || 'login failed')
      return
    }

    router.push('/admin')
    router.refresh()
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={handleSubmit}>
        <h1 style={{ marginBottom: '0.25rem' }}>EPG Admin</h1>
        <p className="page-sub" style={{ marginBottom: '1.25rem' }}>
          Sign in to manage channels and fetches
        </p>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
        />
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        {error && (
          <p className="error" style={{ marginTop: '0.9rem' }}>
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
