import type { Command, Preferences, Preset, Session } from '../contracts/types'
import { DEFAULT_PREFERENCES, DEFAULT_PRESET } from './defaults'
import { compileTimeline } from './timeline'

export function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function record(value: unknown): Record<string, unknown> {
  requireValue(
    value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      [null, Object.prototype].includes(Object.getPrototypeOf(value)),
    '数据格式无效。',
  )
  return value as Record<string, unknown>
}
export function fields(value: Record<string, unknown>, allowed: string[], required = allowed) {
  requireValue(
    Object.keys(value).every((key) => allowed.includes(key)) &&
      required.every((key) => Object.hasOwn(value, key)),
    '数据包含未知字段或缺少必填字段。',
  )
}
export function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}
const identifier = (value: unknown) =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value)
const title = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 100

export function validatePreset(input: unknown): Preset {
  const p = record(input)
  const required = ['id', 'name', 'mode', 'customSeconds', 'classroomSeconds', 'battleSeconds']
  fields(p, [...required, 'builtin'], required)
  requireValue(identifier(p.id) && title(p.name), '请输入有效的预设名称和编号。')
  requireValue(p.builtin === undefined || typeof p.builtin === 'boolean', '内置预设标记无效。')
  for (const [key, count] of [
    ['customSeconds', 11],
    ['battleSeconds', 3],
  ] as const)
    requireValue(
      Array.isArray(p[key]) &&
        p[key].length === count &&
        Array.from(p[key]).every((n) => integer(n, 1, 10800)),
      '各阶段须为 1 至 10800 的整数秒。',
    )
  requireValue(integer(p.classroomSeconds, 1, 10800), '目标课长须为有效整数秒。')
  const preset = input as Preset
  compileTimeline(preset)
  return preset
}

export function validatePatch(input: unknown): Partial<Omit<Preferences, 'revision'>> {
  const data = record(input)
  fields(
    data,
    Object.keys(DEFAULT_PREFERENCES).filter((k) => k !== 'revision'),
    [],
  )
  for (const [key, val] of Object.entries(data)) {
    let valid: boolean
    switch (key) {
      case 'selectedPresetId':
        valid = identifier(val)
        break
      case 'scale':
        valid = integer(val, 50, 200)
        break
      case 'sfxVolume':
      case 'musicVolume':
        valid = integer(val, 0, 100)
        break
      case 'statusBar':
        valid = ['hidden', 'compact', 'detailed'].includes(String(val)) && typeof val === 'string'
        break
      case 'intensity':
        valid = ['low', 'standard', 'high'].includes(String(val)) && typeof val === 'string'
        break
      case 'victoryPosition':
        valid = val === 'pet' || val === 'center'
        break
      case 'shortcuts': {
        const keys = record(val)
        fields(keys, Object.keys(DEFAULT_PREFERENCES.shortcuts))
        valid = Object.values(keys).every(
          (s) => typeof s === 'string' && s.length <= 80 && !/[\x00-\x1f]/.test(s),
        )
        break
      }
      default:
        valid = typeof val === 'boolean'
    }
    requireValue(valid, '设置值超出范围或格式不正确。')
  }
  return data
}

export function validatePreferences(input: unknown): Preferences {
  const data = record(input)
  fields(data, Object.keys(DEFAULT_PREFERENCES))
  const { revision, ...patch } = data
  requireValue(integer(revision, 0, Number.MAX_SAFE_INTEGER), '设置版本无效。')
  validatePatch(patch)
  return input as Preferences
}

export function validateCommand(input: unknown): Command {
  const c = record(input)
  const args = (...keys: string[]) => fields(c, ['type', ...keys])
  switch (c.type) {
    case 'start':
      args('presetId')
      requireValue(identifier(c.presetId), '预设编号无效。')
      break
    case 'ultimate':
      args('sessionId', 'phaseId')
      requireValue(identifier(c.phaseId) && identifier(c.sessionId), '战斗编号无效。')
      break
    case 'abandon':
    case 'dismissResult':
    case 'resume':
    case 'pause':
      args('sessionId')
      requireValue(identifier(c.sessionId), '渡夜编号无效。')
      break
    case 'savePreset':
      args('preset')
      validatePreset(c.preset)
      break
    case 'deletePreset':
      args('id')
      requireValue(identifier(c.id), '预设编号无效。')
      break
    case 'preferences':
      args('patch', 'expectedRevision')
      validatePatch(c.patch)
      requireValue(integer(c.expectedRevision, 0, Number.MAX_SAFE_INTEGER), '设置版本无效。')
      break
    case 'openControl':
      fields(c, ['type', 'page'], ['type'])
      requireValue(
        c.page === undefined ||
          (['prepare', 'settings', 'result'].includes(String(c.page)) &&
            typeof c.page === 'string'),
        '页面无效。',
      )
      break
    case 'visibility':
      args('visible')
      requireValue(typeof c.visible === 'boolean', '可见状态无效。')
      break
    case 'hitTest':
      args('hit')
      requireValue(typeof c.hit === 'boolean', '命中状态无效。')
      break
    case 'drag':
      fields(c, ['type', 'dx', 'dy', 'finished'], ['type', 'dx', 'dy'])
      requireValue(c.finished === undefined || typeof c.finished === 'boolean', '拖动状态无效。')
      requireValue(
        [c.dx, c.dy].every(
          (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 4096,
        ),
        '拖动距离无效。',
      )
      break
    case 'resetPosition':
    case 'contextMenu':
    case 'preview':
    case 'quit':
      args()
      break
    default:
      throw new Error('此操作无法识别。')
  }
  return input as Command
}

export function validateSession(input: unknown): Session | null {
  if (input === null) return null
  const s = record(input)
  const required = ['id', 'status', 'presetName', 'timeline', 'elapsedMs', 'usedUltimates']
  fields(s, [...required, 'pauseReason'], required)
  requireValue(
    identifier(s.id) &&
      title(s.presetName) &&
      typeof s.status === 'string' &&
      ['running', 'paused', 'completed'].includes(s.status),
    '渡夜记录无效。',
  )
  requireValue(s.pauseReason === undefined || title(s.pauseReason), '暂停记录无效。')
  const t = record(s.timeline)
  fields(t, ['phases', 'durationMs'])
  requireValue(Array.isArray(t.phases) && t.phases.length === 11, '渡夜阶段不完整。')
  const durations = t.phases.map((v) => {
    const p = record(v)
    return (Number(p.endMs) - Number(p.startMs)) / 1000
  })
  const timeline = compileTimeline({ ...DEFAULT_PRESET, mode: 'custom', customSeconds: durations })
  requireValue(timeline.durationMs === t.durationMs, '渡夜总时长损坏。')
  for (const [i, v] of t.phases.entries()) {
    const phase = record(v),
      expected = timeline.phases[i]
    fields(phase, Object.keys(expected))
    requireValue(
      Object.entries(expected).every(([key, value]) => phase[key] === value),
      '渡夜阶段记录损坏。',
    )
  }
  requireValue(
    typeof s.elapsedMs === 'number' &&
      Number.isFinite(s.elapsedMs) &&
      s.elapsedMs >= 0 &&
      s.elapsedMs <= timeline.durationMs &&
      (s.status === 'completed') === (s.elapsedMs === timeline.durationMs),
    '渡夜进度无效。',
  )
  const elapsed = s.elapsedMs
  requireValue(
    Array.isArray(s.usedUltimates) &&
      new Set(s.usedUltimates).size === s.usedUltimates.length &&
      s.usedUltimates.every((id) =>
        timeline.phases.some((p) => p.kind === 'battle' && p.id === id && p.startMs <= elapsed),
      ),
    '绝招记录无效。',
  )
  return input as Session
}
