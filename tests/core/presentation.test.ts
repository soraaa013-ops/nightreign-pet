import { describe, expect, test } from 'vitest'
import { compileTimeline } from '../../src/core/timeline'
import { haloScale, imageHit } from '../../src/renderer/pet/presentation'
import { shortPreset } from '../fixtures'

describe('局部光环与立绘命中', () => {
  test('第一圈收紧后保持半径，第二圈持续收紧，下一天才重置', () => {
    const phases = compileTimeline(shortPreset()).phases
    for (const dayStart of [0, 5]) {
      const start = dayStart * 1000
      const [explore, shrinkOne, inner, shrinkTwo, battle] = phases.slice(dayStart, dayStart + 5)
      const full = haloScale(explore, start)
      const firstMiddle = haloScale(shrinkOne, start + 1500)
      const firstEnd = haloScale(shrinkOne, start + 2000)
      const secondMiddle = haloScale(shrinkTwo, start + 3500)
      const secondEnd = haloScale(shrinkTwo, start + 4000)

      expect(full).toBe(1)
      expect(firstMiddle).toBeLessThan(full)
      expect(firstEnd).toBeLessThan(firstMiddle)
      expect(haloScale(inner, start + 2000)).toBeCloseTo(firstEnd)
      expect(haloScale(inner, start + 2999)).toBeCloseTo(firstEnd)
      expect(haloScale(shrinkTwo, start + 3000)).toBeCloseTo(firstEnd)
      expect(secondMiddle).toBeLessThan(firstEnd)
      expect(secondEnd).toBeLessThan(secondMiddle)
      expect(haloScale(battle, start + 4000)).toBeCloseTo(secondEnd)
    }
  })

  test('透明像素和缩放产生的空白不拦截操作', () => {
    const mask = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 255, 255, 0, 0, 0, 0, 255]),
    }
    const box = { left: 100, top: 100, width: 200, height: 200 }

    expect(imageHit(null, box, 255, 190)).toBe(false)
    expect(imageHit(mask, box, 255, 190)).toBe(true)
    expect(imageHit(mask, box, 150, 190)).toBe(false)
    expect(imageHit(mask, box, 255, 149)).toBe(false)
    expect(imageHit(mask, box, 255, 251)).toBe(false)
    expect(imageHit(mask, box, 300, 190)).toBe(false)
    expect(imageHit(mask, { ...box, height: 0 }, 255, 190)).toBe(false)
  })
})
