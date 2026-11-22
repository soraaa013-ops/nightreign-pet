import type { Preferences, Preset } from '../contracts/types'

export const DEFAULT_PRESET: Preset = {
  id: 'original-40',
  name: '40 分钟 · 原作节奏',
  builtin: true,
  mode: 'original',
  battleSeconds: [180, 240, 300],
  classroomSeconds: 2400,
  customSeconds: [270, 180, 210, 180, 180, 270, 180, 210, 180, 240, 300],
}

export const DEFAULT_PREFERENCES: Preferences = {
  revision: 0,
  selectedPresetId: DEFAULT_PRESET.id,
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
}
