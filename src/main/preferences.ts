import { randomUUID } from 'node:crypto'
import type { Preferences, Preset } from '../contracts/types'
import { DEFAULT_PREFERENCES, DEFAULT_PRESET } from '../core/defaults'
import {
  fields,
  integer,
  record,
  requireValue,
  validatePatch,
  validatePreferences,
  validatePreset,
} from '../core/validation'
import type { JsonStore } from './storage'

interface PresetFile {
  users: Preset[]
  selectedPresetId: string
  revision: number
}
function validatePresets(input: unknown): PresetFile {
  const p = record(input)
  fields(p, ['users', 'selectedPresetId', 'revision'])
  requireValue(
    Array.isArray(p.users) && integer(p.revision, 0, Number.MAX_SAFE_INTEGER),
    '预设记录损坏。',
  )
  const users = p.users.map(validatePreset)
  const ids = new Set([DEFAULT_PRESET.id, ...users.map((u) => u.id)])
  requireValue(
    ids.size === users.length + 1 &&
      users.every((u) => !u.builtin) &&
      typeof p.selectedPresetId === 'string' &&
      ids.has(p.selectedPresetId),
    '预设编号重复或不存在。',
  )
  return { users, revision: p.revision, selectedPresetId: p.selectedPresetId }
}

export class Settings {
  private constructor(
    readonly store: JsonStore,
    public preferences: Preferences,
    public presets: Preset[],
  ) {}

  static async load(store: JsonStore) {
    const prefs = await store.read('preferences', validatePreferences, DEFAULT_PREFERENCES)
    const custom = await store.read('presets', validatePresets, {
      users: [],
      revision: 0,
      selectedPresetId: DEFAULT_PRESET.id,
    })
    if (custom.revision > prefs.revision) {
      prefs.selectedPresetId = custom.selectedPresetId
      prefs.revision = custom.revision
    }
    const presets = [structuredClone(DEFAULT_PRESET), ...custom.users]
    if (!presets.some((p) => p.id === prefs.selectedPresetId))
      prefs.selectedPresetId = DEFAULT_PRESET.id
    return new Settings(store, prefs, presets)
  }

  find(id: string) {
    const preset = this.presets.find((p) => p.id === id)
    if (!preset) throw new Error('找不到该预设，请重新选择。')
    return preset
  }

  next(patch: Partial<Omit<Preferences, 'revision'>>, revision: number) {
    if (revision !== this.preferences.revision)
      throw new Error('设置已在其他窗口更新，请按最新值重试。')
    validatePatch(patch)
    if (patch.selectedPresetId !== undefined) this.find(patch.selectedPresetId)
    return { ...this.preferences, ...patch, revision: revision + 1 }
  }

  async savePreferences(next: Preferences) {
    await this.store.write('preferences', next)
    this.preferences = next
  }

  // Selection and custom presets change together in one atomic file replacement.
  private async saveList(presets: Preset[], selectedPresetId: string) {
    const revision = this.preferences.revision + 1
    await this.store.write('presets', {
      users: presets.filter((p) => !p.builtin),
      selectedPresetId,
      revision,
    })
    this.presets = presets
    this.preferences = { ...this.preferences, selectedPresetId, revision }
  }

  async savePreset(input: Preset) {
    validatePreset(input)
    const preset = {
      ...structuredClone(input),
      id: input.id === DEFAULT_PRESET.id ? randomUUID() : input.id,
      builtin: false,
      name: input.name.trim(),
    }
    const presets = this.presets.slice()
    const idx = presets.findIndex((p) => p.id === preset.id)
    if (idx < 0) presets.push(preset)
    else presets[idx] = preset
    await this.saveList(presets, preset.id)
  }

  async deletePreset(id: string) {
    if (this.find(id).builtin) throw new Error('内置预设需要保留。')
    const selectedPresetId =
      this.preferences.selectedPresetId === id
        ? DEFAULT_PRESET.id
        : this.preferences.selectedPresetId
    await this.saveList(
      this.presets.filter((p) => p.id !== id),
      selectedPresetId,
    )
  }
}
