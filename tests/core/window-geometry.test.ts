import { expect, test } from 'vitest'
import { dragBounds, petSize } from '../../src/main/window-geometry'

test('连续跨越左右显示器，再在含负坐标的目标工作区收好整窗', () => {
  const left = { x: -1280, y: -120, width: 1280, height: 680 },
    right = { x: 0, y: 0, width: 1920, height: 1040 }
  const size = petSize(100)
  let rect = { x: 0, y: 60, ...size }
  for (let i = 0; i < 185; i++) rect = dragBounds(rect, -1, 0, size, [left, right], left, false)
  expect(rect).toEqual({ x: -185, y: 60, ...size })
  expect(dragBounds(rect, 0, 0, size, [left, right], left, true)).toEqual({
    x: -320,
    y: 60,
    ...size,
  })
})

test('目标屏比偏好尺寸小时使用可显示尺寸，离开该屏重新按偏好计算', () => {
  const small = { x: 0, y: 0, width: 450, height: 530 },
    big = { x: 450, y: 0, width: 1600, height: 1040 }
  const size = petSize(200)
  const fitted = dragBounds({ x: 10, y: 10, ...size }, 0, 0, size, [small, big], small, true)
  expect(fitted).toEqual(small)
  expect(dragBounds(fitted, 500, 5, size, [small, big], big, true)).toEqual({
    x: 500,
    y: 5,
    width: 640,
    height: 700,
  })
})
