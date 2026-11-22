import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Settings } from '../../src/main/preferences'
import { JsonStore } from '../../src/main/storage'
import { shortPreset } from '../fixtures'

describe('设置和预设持久化', () => {
  let directory: string
  let store: JsonStore
  let settings: Settings

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nightreign-settings-'))
    store = new JsonStore(directory)
    settings = await Settings.load(store)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  test('首次启动使用规格默认值，普通设置保存后重启保留', async () => {
    expect(settings.preferences).toMatchObject({
      revision: 0,
      selectedPresetId: settings.presets[0].id,
      scale: 100,
      alwaysOnTop: true,
      positionLocked: false,
      clickThrough: false,
      statusBar: 'compact',
      muted: false,
      quietMode: false,
      sfxVolume: 20,
      musicVolume: 0,
      shrinkAlerts: true,
      intensity: 'standard',
      victoryPosition: 'pet',
      pauseOnLock: true,
      autoStart: false,
      shortcuts: { settings: '', pause: '', visibility: '', clickThrough: '' },
    })
    expect(settings.presets).toHaveLength(1)
    expect(settings.presets[0]).toMatchObject({ builtin: true, mode: 'original' })
    await settings.savePreferences(settings.next({ scale: 150, muted: true, intensity: 'low' }, 0))
    const restarted = await Settings.load(new JsonStore(directory))
    expect(restarted.preferences).toMatchObject({
      revision: 1,
      scale: 150,
      muted: true,
      intensity: 'low',
    })
    expect(restarted.preferences.sfxVolume).toBe(20)
  })

  test('修改内置预设创建副本，用户预设可改名和删除', async () => {
    const original = structuredClone(settings.presets[0])
    await expect(settings.deletePreset(original.id)).rejects.toThrow()
    await settings.savePreset(shortPreset({ id: original.id, name: ' 测试课间渡夜 ' }))
    const newId = settings.preferences.selectedPresetId
    expect(newId).not.toBe(original.id)
    expect(settings.find(original.id)).toEqual(original)
    expect(settings.find(newId)).toMatchObject({ name: '测试课间渡夜', builtin: false })

    await settings.savePreset({ ...settings.find(newId), name: '改名后的预设' })
    const restarted = await Settings.load(new JsonStore(directory))
    expect(restarted.preferences.selectedPresetId).toBe(newId)
    expect(restarted.find(newId).name).toBe('改名后的预设')
    await restarted.deletePreset(newId)
    expect(restarted.preferences.selectedPresetId).toBe(original.id)
    expect(restarted.presets).toEqual([original])
  })

  test('旧版本更新和未知预设不覆盖现有值，保存失败不更新内存', async () => {
    await settings.savePreferences(settings.next({ scale: 150 }, 0))
    await settings.savePreset(shortPreset())
    const saved = structuredClone(settings.preferences)
    expect(() => settings.next({ scale: 100 }, 1)).toThrow(/设置/)
    expect(() => settings.next({ selectedPresetId: 'missing' }, saved.revision)).toThrow(/预设/)

    vi.spyOn(store, 'write').mockRejectedValueOnce(new Error('不可写'))
    await expect(
      settings.savePreferences(settings.next({ scale: 175 }, saved.revision)),
    ).rejects.toThrow()
    expect(settings.preferences).toEqual(saved)
    const restarted = await Settings.load(new JsonStore(directory))
    expect(restarted.preferences).toEqual(saved)
  })
})
