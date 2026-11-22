import type { Page } from '@playwright/test'
import { shortPreset } from '../fixtures'
import { command, expect, snapshot, startFromControl, test, view } from './app'
import { modelPixels } from './model-pixels'

async function countMarches(pet: Page) {
  let count = 0
  await pet.exposeFunction('recordGestureMarch', () => {
    count++
  })
  await pet.evaluate(() =>
    window.nightreign.onPresentation((event) => {
      if (event.kind === 'ultimate') Reflect.get(window, 'recordGestureMarch')()
    }),
  )
  return () => count
}

test('待机、探索、暂停、战斗和结算均可双击施放，单击与拖动保持独立', async ({ launchApp }) => {
  test.setTimeout(90_000)
  const app = await launchApp()
  const pet = await view(app, 'pet')
  const control = await view(app, 'control')
  const casts = await countMarches(pet)
  await command(control, {
    type: 'savePreset',
    preset: shortPreset({ customSeconds: [8, 1, 1, 1, 8, 1, 1, 1, 1, 1, 1] }),
  })
  await control.close()
  await expect(pet.locator('.pet-concept')).toHaveCount(0, { timeout: 20_000 })
  const { solid } = await modelPixels(pet)
  const doubleTap = () => pet.mouse.dblclick(solid.x, solid.y)
  await pet.mouse.dblclick(2, 2)
  await pet.mouse.move(solid.x, solid.y)
  await pet.mouse.down()
  await pet.mouse.move(solid.x - 16, solid.y - 8, { steps: 3 })
  await pet.mouse.up()
  expect(casts()).toBe(0)
  await doubleTap()
  await doubleTap()
  await expect.poll(casts).toBe(2)
  await pet.waitForTimeout(650)
  expect(app.windows()).toHaveLength(1)
  expect((await snapshot(pet)).session).toBeNull()
  await pet.mouse.click(solid.x, solid.y)
  expect(app.windows()).toHaveLength(1)
  await pet.locator('.pet-status').click()
  const prepare = await view(app, 'control')
  await startFromControl(prepare, prepare.getByRole('button', { name: '出击', exact: true }))
  await doubleTap()
  await expect.poll(casts).toBe(3)
  await pet.locator('.pet-status').click()
  const panel = await view(app, 'control')
  await panel.getByRole('button', { name: '暂停渡夜' }).click()
  await expect.poll(async () => (await snapshot(pet)).session?.status).toBe('paused')
  const paused = (await snapshot(pet)).session
  await doubleTap()
  await expect.poll(casts).toBe(4)
  expect((await snapshot(pet)).session).toEqual(paused)
  for (const clickThrough of [true, false]) {
    await command(panel, {
      type: 'preferences',
      expectedRevision: (await snapshot(panel)).preferences.revision,
      patch: { clickThrough, statusBar: clickThrough ? 'hidden' : 'compact' },
    })
    await expect(pet.locator('.pet-status')).toHaveCount(clickThrough ? 0 : 1)
    if (clickThrough) {
      await doubleTap()
      expect(casts()).toBe(4)
    }
  }
  await panel.getByRole('button', { name: '继续渡夜' }).click()
  await panel.close()
  await expect(pet.getByRole('progressbar', { name: '战斗进度' })).toBeVisible({ timeout: 18_000 })
  await doubleTap()
  await expect.poll(casts).toBe(5)
  await expect
    .poll(async () => (await snapshot(pet)).session?.status, { timeout: 30_000 })
    .toBe('completed')
  await doubleTap()
  await expect.poll(casts).toBe(6)
  await pet.waitForTimeout(650)
  expect(app.windows()).toHaveLength(1)
})

test('准备页 Alt+U 随时可用，正在确认结束时屏蔽快捷键', async ({ launchApp }) => {
  const app = await launchApp()
  const pet = await view(app, 'pet')
  const control = await view(app, 'control')
  const casts = await countMarches(pet)
  await expect(control.getByText(/Alt\+U/)).toBeVisible()
  await control.keyboard.press('Alt+u')
  await expect.poll(casts).toBe(1)
  await startFromControl(control, control.getByRole('button', { name: '出击', exact: true }))
  await command(pet, { type: 'openControl', page: 'prepare' })
  const panel = await view(app, 'control')
  await panel.getByRole('button', { name: '结束本次' }).click()
  await panel.keyboard.press('Alt+u')
  expect(casts()).toBe(1)
  await panel.getByRole('dialog').getByRole('button', { name: '取消' }).click()
  await panel.keyboard.press('Alt+u')
  await expect.poll(casts).toBe(2)
  await expect(panel.getByText(/Alt\+U/)).toBeVisible()
})
