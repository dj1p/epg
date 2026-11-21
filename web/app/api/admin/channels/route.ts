// web/app/api/admin/channels/route.ts
//
// Manages the per-region fetch lists (th, no, uk, sg, us). Edits are stored as
// overrides on the data volume and applied by scripts/build-channels.js, which
// is re-run after every change so public/channels-<region>.xml is current.
import { NextRequest, NextResponse } from 'next/server'
import { execFileSync } from 'child_process'
import path from 'path'
import { Channel } from '@/lib/channels'
import {
  isRegion,
  isCustom,
  addToRegion,
  removeFromRegion,
  listRemoved,
  readOverrides,
  readRegionChannels,
  Region
} from '@/lib/channelOverrides'
import { isAuthorized } from '@/lib/session'

function rebuildChannelFiles() {
  execFileSync('node', ['scripts/build-channels.js'], {
    cwd: path.resolve(process.cwd(), '..')
  })
}

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

function badRegion() {
  return NextResponse.json({ error: 'unknown region' }, { status: 400 })
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized()

  const region = new URL(request.url).searchParams.get('region')
  if (!isRegion(region)) return badRegion()

  const overrides = readOverrides()
  const channels = readRegionChannels(region).map(ch => ({
    ...ch,
    custom: isCustom(region, ch, overrides)
  }))
  return NextResponse.json({ region, channels, removed: listRemoved(region) })
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized()

  const body = await request.json().catch(() => null)
  const region = typeof body?.region === 'string' ? body.region : null
  if (!isRegion(region)) return badRegion()

  const site = typeof body?.site === 'string' ? body.site.trim() : ''
  const siteId = typeof body?.siteId === 'string' ? body.siteId.trim() : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const lang = typeof body?.lang === 'string' && body.lang.trim() ? body.lang.trim() : 'en'
  const xmltvId = typeof body?.xmltvId === 'string' ? body.xmltvId.trim() : ''

  if (!site || !siteId || !name) {
    return NextResponse.json({ error: 'site, siteId and name are required' }, { status: 400 })
  }

  const channel: Channel = { site, siteId, lang, xmltvId, name }

  // Check against the list as it is now, so a channel already in the region
  // is reported as a duplicate even when it comes from the curated baseline.
  if (readRegionChannels(region).some(ch => ch.site === site && ch.siteId === siteId)) {
    return NextResponse.json({ error: 'duplicate' }, { status: 409 })
  }

  const result = addToRegion(region, channel)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }

  return rebuiltResponse(region, 'channel saved', 201)
}

export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized()

  const { searchParams } = new URL(request.url)
  const region = searchParams.get('region')
  const site = searchParams.get('site')
  const siteId = searchParams.get('siteId')

  if (!isRegion(region)) return badRegion()
  if (!site || !siteId) {
    return NextResponse.json({ error: 'site and siteId query params are required' }, { status: 400 })
  }

  const existing = readRegionChannels(region).find(ch => ch.site === site && ch.siteId === siteId)
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  removeFromRegion(region, { site, siteId }, existing.name)
  return rebuiltResponse(region, 'channel removed', 200)
}

function rebuiltResponse(region: Region, what: string, status: number) {
  try {
    rebuildChannelFiles()
  } catch (error) {
    console.error(`rebuildChannelFiles failed (${region})`, error)
    return NextResponse.json(
      {
        ok: true,
        warning: `${what}, but rebuilding the channel files failed — run node scripts/build-channels.js manually`
      },
      { status }
    )
  }
  return NextResponse.json({ ok: true }, { status })
}
