import fs from 'fs'
import path from 'path'
import { dataDir, publicDir } from '@/lib/paths'
import { Channel, parseChannelsXml } from '@/lib/channels'

// Admin edits to the per-region fetch lists. The curated lists in
// channels-sources/ ship with the repo/image and are the baseline; edits made
// in /admin are stored here, on the persistent data volume, and applied on top
// by scripts/build-channels.js. This keeps edits across redeploys without
// touching git-tracked files.

export const REGIONS = ['th', 'no', 'uk', 'sg', 'us'] as const
export type Region = (typeof REGIONS)[number]

export function isRegion(value: string | null | undefined): value is Region {
  return !!value && (REGIONS as readonly string[]).includes(value)
}

export interface ChannelKey {
  site: string
  siteId: string
}

/** A removed channel; the name is kept only so the UI can show what was removed. */
export interface RemovedChannel extends ChannelKey {
  name?: string
}

export interface Overrides {
  added: Partial<Record<Region, Channel[]>>
  removed: Partial<Record<Region, RemovedChannel[]>>
}

export function overridesPath(): string {
  return path.join(dataDir(), 'channel-overrides.json')
}

export function readOverrides(): Overrides {
  const file = overridesPath()
  if (!fs.existsSync(file)) return { added: {}, removed: {} }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    return { added: raw.added || {}, removed: raw.removed || {} }
  } catch (err) {
    console.error('[channelOverrides] unreadable overrides file, treating as empty:', err)
    return { added: {}, removed: {} }
  }
}

function writeOverrides(overrides: Overrides): void {
  const file = overridesPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // Temp file + rename: a crash mid-write must never leave a torn file that
  // build-channels.js would then ignore (silently dropping every edit).
  const tmp = `${file}.${process.pid}-${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(overrides, null, 2))
  fs.renameSync(tmp, file)
}

function sameKey(a: ChannelKey, b: ChannelKey): boolean {
  return a.site === b.site && a.siteId === b.siteId
}

/** The region's current list as built by build-channels.js (baseline + edits). */
export function readRegionChannels(region: Region): Channel[] {
  const file = path.join(publicDir(), `channels-${region}.xml`)
  if (!fs.existsSync(file)) return []
  return parseChannelsXml(fs.readFileSync(file, 'utf8'))
}

export function listRemoved(region: Region): RemovedChannel[] {
  return readOverrides().removed[region] || []
}

export function isCustom(region: Region, key: ChannelKey, overrides = readOverrides()): boolean {
  return (overrides.added[region] || []).some(ch => sameKey(ch, key))
}

/**
 * Add a channel to a region. If it was previously removed, this just undoes the
 * removal (so the baseline entry comes back) instead of creating a second copy.
 */
export function addToRegion(region: Region, channel: Channel): { ok: true } | { ok: false; error: 'duplicate' } {
  const overrides = readOverrides()
  const removed = overrides.removed[region] || []
  if (removed.some(r => sameKey(r, channel))) {
    overrides.removed[region] = removed.filter(r => !sameKey(r, channel))
    writeOverrides(overrides)
    return { ok: true }
  }
  const added = overrides.added[region] || []
  if (added.some(ch => sameKey(ch, channel))) return { ok: false, error: 'duplicate' }
  overrides.added[region] = [...added, channel]
  writeOverrides(overrides)
  return { ok: true }
}

/**
 * Remove a channel from a region: a channel added through the admin is simply
 * deleted; a baseline (curated) one is recorded as removed.
 */
export function removeFromRegion(region: Region, key: ChannelKey, name?: string): void {
  const overrides = readOverrides()
  const added = overrides.added[region] || []
  if (added.some(ch => sameKey(ch, key))) {
    overrides.added[region] = added.filter(ch => !sameKey(ch, key))
  } else {
    const removed = overrides.removed[region] || []
    if (!removed.some(r => sameKey(r, key))) {
      overrides.removed[region] = [...removed, { site: key.site, siteId: key.siteId, ...(name ? { name } : {}) }]
    }
  }
  writeOverrides(overrides)
}

export function restoreToRegion(region: Region, key: ChannelKey): { ok: true } | { ok: false; error: 'not_found' } {
  const overrides = readOverrides()
  const removed = overrides.removed[region] || []
  if (!removed.some(r => sameKey(r, key))) return { ok: false, error: 'not_found' }
  overrides.removed[region] = removed.filter(r => !sameKey(r, key))
  writeOverrides(overrides)
  return { ok: true }
}
