import type { Phase, Preset, Timeline } from '../contracts/types'

const day = [270, 180, 210, 180]
const stages: [string, string, Phase['kind'], Phase['day']][] = [
  ['day1-explore', '第一天探索', 'explore', 1],
  ['day1-shrink1', '第一天第一次缩圈', 'shrink', 1],
  ['day1-inner', '第一天圈内探索', 'explore', 1],
  ['day1-shrink2', '第一天第二次缩圈', 'shrink', 1],
  ['night1', '第一夜', 'battle', 1],
  ['day2-explore', '第二天探索', 'explore', 2],
  ['day2-shrink1', '第二天第一次缩圈', 'shrink', 2],
  ['day2-inner', '第二天圈内探索', 'explore', 2],
  ['day2-shrink2', '第二天第二次缩圈', 'shrink', 2],
  ['night2', '第二夜', 'battle', 2],
  ['nightlord', '夜王战', 'battle', 3],
]

function secondsList(value: unknown, count: number): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== count ||
    !Array.from(value).every((n) => Number.isSafeInteger(n) && n >= 1 && n <= 10800)
  )
    throw new Error('每个阶段须填写至少 1 秒的整数，整局最多 180 分钟。')
  return value
}

function fitClassroom(total: number): number[] {
  if (!Number.isSafeInteger(total) || total < 1860 || total > 10800)
    throw new Error('适配课长须为 31 至 180 分钟的整数秒。更短的课程可使用自定义节奏。')
  const weights = [3, 4, 5]
  const allocation = [0, 0, 0]
  let remaining = total - 1680
  let active = [0, 1, 2]
  while (active.length) {
    const sum = active.reduce((s, i) => s + weights[i], 0)
    const below = active.filter((i) => remaining * weights[i] < 60 * sum)
    if (!below.length) {
      for (const i of active) allocation[i] = Math.floor((remaining * weights[i]) / sum)
      let extra = remaining - active.reduce((s, i) => s + allocation[i], 0)
      const remainder = (i: number) => (remaining * weights[i]) % sum
      for (const i of active.sort((a, b) => remainder(b) - remainder(a) || a - b)) {
        if (extra-- > 0) allocation[i]++
      }
      break
    }
    for (const i of below) allocation[i] = 60
    remaining -= below.length * 60
    active = active.filter((i) => !below.includes(i))
  }
  return allocation
}

export function compileTimeline(preset: Preset): Timeline {
  let seconds: number[]
  switch (preset?.mode) {
    case 'custom':
      seconds = secondsList(preset.customSeconds, 11)
      break
    case 'original':
    case 'classroom': {
      const battles =
        preset.mode === 'original'
          ? secondsList(preset.battleSeconds, 3)
          : fitClassroom(preset.classroomSeconds)
      seconds = [...day, battles[0], ...day, battles[1], battles[2]]
      break
    }
    default:
      throw new Error('请选择有效的渡夜节奏。')
  }
  let durationMs = 0
  const phases = stages.map(([id, label, kind, day], i) => {
    const startMs = durationMs
    durationMs += seconds[i] * 1000
    return { id, label, kind, day, startMs, endMs: durationMs }
  })
  if (durationMs > 10800000) throw new Error('单次渡夜最多 180 分钟。')
  return { phases, durationMs }
}

export function getPhase(timeline: Timeline, elapsedMs: number): Phase | null {
  const elapsed = Math.max(0, elapsedMs)
  return timeline.phases.find((p) => p.startMs <= elapsed && elapsed < p.endMs) ?? null
}
