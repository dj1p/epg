import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  addToRegion,
  removeFromRegion,
  restoreToRegion,
  readOverrides,
  readRegionChannels,
  listRemoved,
  isCustom,
  isRegion,
  overridesPath
} from '@/lib/channelOverrides'

describe('channelOverrides', () => {
  let tmpDir: string

  const nrk = { site: 'a.no', siteId: 'nrk1', lang: 'no', xmltvId: '', name: 'NRK1' }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epg-overrides-test-'))
    process.env.EPG_DATA_DIR = path.join(tmpDir, 'data')
    process.env.EPG_PUBLIC_DIR = path.join(tmpDir, 'public')
  })

  afterEach(() => {
    delete process.env.EPG_DATA_DIR
    delete process.env.EPG_PUBLIC_DIR
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('isRegion accepts only the five regions', () => {
    expect(['th', 'no', 'uk', 'sg', 'us'].every(isRegion)).toBe(true)
    expect(isRegion('de')).toBe(false)
    expect(isRegion('../etc')).toBe(false)
    expect(isRegion(null)).toBe(false)
  })

  it('reads as empty when no overrides file exists', () => {
    expect(readOverrides()).toEqual({ added: {}, removed: {} })
  })

  it('treats a corrupt overrides file as empty instead of throwing', () => {
    fs.mkdirSync(path.dirname(overridesPath()), { recursive: true })
    fs.writeFileSync(overridesPath(), '{"added": {')
    expect(() => readOverrides()).not.toThrow()
    expect(readOverrides()).toEqual({ added: {}, removed: {} })
  })

  it('adds a channel and marks it custom', () => {
    expect(addToRegion('no', nrk)).toEqual({ ok: true })
    expect(readOverrides().added.no).toEqual([nrk])
    expect(isCustom('no', nrk)).toBe(true)
    expect(isCustom('uk', nrk)).toBe(false)
  })

  it('rejects adding the same channel twice to a region', () => {
    addToRegion('no', nrk)
    expect(addToRegion('no', nrk)).toEqual({ ok: false, error: 'duplicate' })
  })

  it('removing an admin-added channel deletes it instead of recording a removal', () => {
    addToRegion('no', nrk)
    removeFromRegion('no', nrk)
    expect(readOverrides().added.no).toEqual([])
    expect(listRemoved('no')).toEqual([])
  })

  it('removing a baseline channel records it (with name) and restoring undoes it', () => {
    removeFromRegion('no', { site: 'a.no', siteId: 'tv2' }, 'TV 2')
    expect(listRemoved('no')).toEqual([{ site: 'a.no', siteId: 'tv2', name: 'TV 2' }])

    expect(restoreToRegion('no', { site: 'a.no', siteId: 'tv2' })).toEqual({ ok: true })
    expect(listRemoved('no')).toEqual([])
    expect(restoreToRegion('no', { site: 'a.no', siteId: 'tv2' })).toEqual({ ok: false, error: 'not_found' })
  })

  it('removing the same baseline channel twice records it once', () => {
    removeFromRegion('no', { site: 'a.no', siteId: 'tv2' })
    removeFromRegion('no', { site: 'a.no', siteId: 'tv2' })
    expect(listRemoved('no')).toHaveLength(1)
  })

  it('re-adding a removed baseline channel undoes the removal instead of adding a copy', () => {
    removeFromRegion('no', { site: 'a.no', siteId: 'nrk1' }, 'NRK1')
    expect(addToRegion('no', nrk)).toEqual({ ok: true })
    expect(listRemoved('no')).toEqual([])
    expect(readOverrides().added.no ?? []).toEqual([])
  })

  it('keeps regions independent', () => {
    addToRegion('no', nrk)
    removeFromRegion('uk', { site: 'b.uk', siteId: 'bbc1' })
    expect(readOverrides().added.uk).toBeUndefined()
    expect(listRemoved('no')).toEqual([])
  })

  it('writes the overrides file atomically (temp file + rename)', () => {
    const renameSpy = jest.spyOn(fs, 'renameSync')
    addToRegion('no', nrk)
    expect(renameSpy).toHaveBeenCalledTimes(1)
    const [from, to] = renameSpy.mock.calls[0]
    expect(to).toBe(overridesPath())
    expect(from).not.toBe(to)
    renameSpy.mockRestore()
  })

  it('readRegionChannels parses the built per-region file, and is empty before the first build', () => {
    expect(readRegionChannels('no')).toEqual([])
    fs.mkdirSync(process.env.EPG_PUBLIC_DIR!, { recursive: true })
    fs.writeFileSync(
      path.join(process.env.EPG_PUBLIC_DIR!, 'channels-no.xml'),
      '<?xml version="1.0"?>\n<channels>\n  <channel site="a.no" site_id="x&amp;y" lang="no" xmltv_id="">Fox &amp; Friends</channel>\n</channels>\n'
    )
    expect(readRegionChannels('no')).toEqual([
      { site: 'a.no', siteId: 'x&y', lang: 'no', xmltvId: '', name: 'Fox & Friends' }
    ])
  })
})
