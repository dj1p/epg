// web/app/api/admin/channels/restore/route.ts
//
// Undo the removal of a channel from a region's fetch list.
import { NextRequest, NextResponse } from 'next/server'
import { execFileSync } from 'child_process'
import path from 'path'
import { isRegion, restoreToRegion } from '@/lib/channelOverrides'
import { isAuthorized } from '@/lib/session'

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const region = typeof body?.region === 'string' ? body.region : null
  const site = typeof body?.site === 'string' ? body.site : ''
  const siteId = typeof body?.siteId === 'string' ? body.siteId : ''

  if (!isRegion(region)) {
    return NextResponse.json({ error: 'unknown region' }, { status: 400 })
  }
  if (!site || !siteId) {
    return NextResponse.json({ error: 'site and siteId are required' }, { status: 400 })
  }

  const result = restoreToRegion(region, { site, siteId })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 })
  }

  try {
    execFileSync('node', ['scripts/build-channels.js'], { cwd: path.resolve(process.cwd(), '..') })
  } catch (error) {
    console.error(`rebuildChannelFiles failed after restore (${region})`, error)
    return NextResponse.json(
      { ok: true, warning: 'channel restored, but rebuilding the channel files failed — run node scripts/build-channels.js manually' },
      { status: 200 }
    )
  }
  return NextResponse.json({ ok: true })
}
