// Shared types and small presentational helpers for the admin job pages.

export type JobStatus = 'running' | 'success' | 'failed' | 'interrupted'
export type JobSource = 'manual' | 'scheduled'

export interface JobMeta {
  id: string
  region: string
  status: JobStatus
  startedAt: string
  finishedAt: string | null
  exitCode: number | null
  source?: JobSource
}

export const REGIONS = ['th', 'no', 'uk', 'sg', 'us']

const STATUS_LABEL: Record<JobStatus, string> = {
  running: 'Running',
  success: 'Success',
  failed: 'Failed',
  interrupted: 'Interrupted'
}

export function StatusBadge({ status }: { status: JobStatus }) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>
}

export function SourceBadge({ source }: { source?: JobSource }) {
  const scheduled = source === 'scheduled'
  return <span className="badge plain">{scheduled ? 'Scheduled' : 'Manual'}</span>
}

export function formatDuration(startedAt: string, finishedAt: string | null): string {
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatRelative(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return 'just now'
  if (abs < 3600) return RELATIVE.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return RELATIVE.format(Math.round(seconds / 3600), 'hour')
  return RELATIVE.format(Math.round(seconds / 86400), 'day')
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
