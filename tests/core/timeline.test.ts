import { describe, expect, test } from 'vitest'
import { DEFAULT_PRESET } from '../../src/core/defaults'
import { compileTimeline, getPhase } from '../../src/core/timeline'
import type { Timeline } from '../../src/contracts/types'
import { preset, shortPreset } from '../fixtures'

const defaultEdges = [0, 270, 450, 660, 840, 1020, 1290, 1470, 1680, 1860, 2100, 2400]
const defaultKinds = [
  'explore',
  'shrink',
  'explore',
  'shrink',
  'battle',
  'explore',
  'shrink',
  'explore',
  'shrink',
  'battle',
  'battle',
]

function phaseSeconds(timeline: Timeline): number[] {
  return timeline.phases.map((phase) => (phase.endMs - phase.startMs) / 1000)
}

function battleSeconds(timeline: Timeline): number[] {
  const seconds = phaseSeconds(timeline)
  return [seconds[4], seconds[9], seconds[10]]
}

describe('渡夜时间线', () => {
  test('内置预设总时长为 2400 秒，阶段范围、类型和归属日符合规格', () => {
    const timeline = compileTimeline(DEFAULT_PRESET)

    expect(timeline.durationMs).toBe(2_400_000)
    expect(timeline.phases.map((phase) => phase.startMs / 1000)).toEqual(defaultEdges.slice(0, -1))
    expect(timeline.phases.map((phase) => phase.endMs / 1000)).toEqual(defaultEdges.slice(1))
    expect(timeline.phases.map((phase) => phase.kind)).toEqual(defaultKinds)
    expect(timeline.phases.map((phase) => phase.day)).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3])
    expect(new Set(timeline.phases.map((phase) => phase.id)).size).toBe(11)
    expect(timeline.phases.every((phase) => phase.id.length > 0 && phase.label.length > 0)).toBe(
      true,
    )
  })

  test.each(defaultEdges.slice(1, -1))('第 %d 秒的精确边界归下一阶段', (seconds) => {
    const timeline = compileTimeline(DEFAULT_PRESET)
    const current = defaultEdges.indexOf(seconds)

    expect(getPhase(timeline, seconds * 1000 - 1)).toEqual(timeline.phases[current - 1])
    expect(getPhase(timeline, seconds * 1000)).toEqual(timeline.phases[current])
    expect(getPhase(timeline, seconds * 1000 + 1)).toEqual(timeline.phases[current])
  })

  test('起点属于第一段，达到终点后没有进行中的阶段', () => {
    const timeline = compileTimeline(DEFAULT_PRESET)

    expect(getPhase(timeline, 0)).toEqual(timeline.phases[0])
    expect(getPhase(timeline, 2_399_999)).toEqual(timeline.phases[10])
    expect(getPhase(timeline, 2_400_000)).toBeNull()
    expect(getPhase(timeline, 2_400_001)).toBeNull()
    expect(getPhase(timeline, 86_400_000)).toBeNull()
  })

  test('原作模式只接受战斗时长调整，两天依旧各有 14 分钟', () => {
    const timeline = compileTimeline(preset({ battleSeconds: [1, 290, 555] }))

    expect(phaseSeconds(timeline)).toEqual([270, 180, 210, 180, 1, 270, 180, 210, 180, 290, 555])
    expect(timeline.durationMs).toBe(2_526_000)
    expect(timeline.phases.map((phase) => phase.id)).toEqual(
      compileTimeline(DEFAULT_PRESET).phases.map((phase) => phase.id),
    )
  })

  test.each([
    { target: 1860, expected: [60, 60, 60] },
    { target: 1861, expected: [60, 60, 61] },
    { target: 1875, expected: [60, 60, 75] },
    { target: 1877, expected: [60, 61, 76] },
    { target: 1920, expected: [60, 80, 100] },
    { target: 1926, expected: [62, 82, 102] },
    { target: 2400, expected: [180, 240, 300] },
    { target: 2700, expected: [255, 340, 425] },
    { target: 10800, expected: [2280, 3040, 3800] },
  ])('适配课长 $target 秒时，战斗时长为 $expected', ({ target, expected }) => {
    const timeline = compileTimeline(preset({ mode: 'classroom', classroomSeconds: target }))

    expect(battleSeconds(timeline)).toEqual(expected)
    expect(timeline.durationMs).toBe(target * 1000)
  })

  test('适配课长全范围保留白天并精确分配每一秒', () => {
    for (let target = 1860; target <= 10800; target += 1) {
      const timeline = compileTimeline(preset({ mode: 'classroom', classroomSeconds: target }))
      const durations = phaseSeconds(timeline)
      const battles = battleSeconds(timeline)
      const days = [...durations.slice(0, 4), ...durations.slice(5, 9)]

      expect(timeline.durationMs, `目标 ${target} 秒`).toBe(target * 1000)
      expect(days, `目标 ${target} 秒`).toEqual([270, 180, 210, 180, 270, 180, 210, 180])
      expect(battles.every((seconds) => Number.isInteger(seconds) && seconds >= 60)).toBe(true)
      expect(battles.reduce((total, seconds) => total + seconds, 0)).toBe(target - 1680)
    }
  })

  test('自定义逐段保存时长并接受最小和最大总时长', () => {
    const distinctSegments = [1, 12, 23, 34, 45, 56, 67, 78, 89, 90, 101]
    expect(phaseSeconds(compileTimeline(shortPreset({ customSeconds: distinctSegments })))).toEqual(
      distinctSegments,
    )
    expect(compileTimeline(shortPreset()).durationMs).toBe(11_000)
    expect(
      compileTimeline(shortPreset({ customSeconds: [10790, ...Array<number>(10).fill(1)] }))
        .durationMs,
    ).toBe(10_800_000)
  })

  test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1', '', null, undefined])(
    '拒绝原作、自定义和适配模式的非法时长 %s',
    (value) => {
      // Cross-process input can have a different type from the compile-time contract.
      const input = value as number

      expect(() => compileTimeline(preset({ battleSeconds: [input, 240, 300] }))).toThrow()
      expect(() =>
        compileTimeline(shortPreset({ customSeconds: [input, ...Array<number>(10).fill(1)] })),
      ).toThrow()
      expect(() =>
        compileTimeline(preset({ mode: 'classroom', classroomSeconds: input })),
      ).toThrow()
    },
  )

  test('拒绝少于 31 分钟、阶段数错误和超过 180 分钟的输入', () => {
    expect(() => compileTimeline(preset({ mode: 'classroom', classroomSeconds: 1859 }))).toThrow()
    expect(() => compileTimeline(preset({ mode: 'classroom', classroomSeconds: 10801 }))).toThrow()
    expect(() =>
      compileTimeline(shortPreset({ customSeconds: Array<number>(10).fill(1) })),
    ).toThrow()
    expect(() =>
      compileTimeline(shortPreset({ customSeconds: Array<number>(12).fill(1) })),
    ).toThrow()
    expect(() =>
      compileTimeline(shortPreset({ customSeconds: [10791, ...Array<number>(10).fill(1)] })),
    ).toThrow()
    expect(() => compileTimeline(preset({ battleSeconds: [9120, 1, 1] }))).toThrow()
  })
})
