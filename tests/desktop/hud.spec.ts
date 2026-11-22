import { shortPreset } from '../fixtures'
import { command, expect, screenshot, snapshot, startFromControl, test, view } from './app'

test('持续显示阶段和整局进度，缩圈不弹横幅，小尺寸及完成状态可读', async ({ launchApp }, info) => {
  test.setTimeout(100_000)
  const app = await launchApp()
  const pet = await view(app, 'pet')
  const control = await view(app, 'control')
  let preferences = (await snapshot(pet)).preferences
  await command(control, {
    type: 'preferences',
    expectedRevision: preferences.revision,
    patch: { scale: 50, statusBar: 'compact', muted: true },
  })
  await command(control, {
    type: 'savePreset',
    preset: shortPreset({ customSeconds: [2, 8, 2, 2, 8, 2, 2, 2, 2, 8, 8] }),
  })
  await startFromControl(control, control.getByRole('button', { name: '出击', exact: true }))
  const current = (await snapshot(pet)).session!
  await command(pet, { type: 'openControl', page: 'prepare' })
  const panel = await view(app, 'control')
  await expect(pet.getByRole('progressbar', { name: '整局进度' })).toBeVisible()
  const shrink = pet.getByRole('progressbar', { name: '缩圈进度' })
  await expect(shrink).toBeVisible()
  await expect
    .poll(async () => Number(await shrink.getAttribute('aria-valuenow')))
    .toBeGreaterThan(15)
  await command(panel, { type: 'pause', sessionId: current.id })
  await expect(pet.locator('.pet-stage')).toHaveCount(0)
  const winder = pet.locator('.dial-winder')
  const readout = pet.locator('.dial-readout')
  await expect(readout).toBeHidden()
  await winder.hover()
  await expect(readout).toBeVisible()
  await expect(readout).toContainText('缩圈剩余')
  await pet.mouse.move(1, 1)
  await expect(readout).toBeHidden()
  await expect(winder).toHaveAccessibleName(/已暂停/)
  const frozen = await shrink.getAttribute('aria-valuenow')
  for (const scale of [50, 100, 200]) {
    preferences = (await snapshot(pet)).preferences
    await command(panel, {
      type: 'preferences',
      expectedRevision: preferences.revision,
      patch: { scale, statusBar: scale === 100 ? 'detailed' : 'compact' },
    })
    await expect.poll(() => pet.evaluate(() => innerWidth)).toBe((320 * scale) / 100)
    const geometry = await pet.evaluate(() => {
      const hud = document.querySelector('.pet-dial')!
      const box = hud.getBoundingClientRect()
      const canvas = document.querySelector('.pet-model')!.getBoundingClientRect()
      return {
        inside:
          box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
        clipped: hud.scrollWidth > hud.clientWidth,
        modelHeight: canvas.height,
        badgeOnly:
          hud.querySelectorAll('[data-pet-control]').length === 1 &&
          getComputedStyle(hud).pointerEvents === 'none',
        underFace: !document
          .elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          ?.closest('.pet-dial'),
        circular: Math.abs(box.width - box.height) < 1,
        hand: document.querySelector('.dial-cursor')?.getAttribute('transform'),
      }
    })
    expect(geometry.inside).toBe(true)
    expect(geometry.clipped).toBe(false)
    expect(geometry.badgeOnly && geometry.underFace && geometry.circular).toBe(true)
    expect(geometry.hand).toMatch(/^translate\(/)
    expect(geometry.modelHeight).toBeGreaterThan(50)
    expect(await shrink.getAttribute('aria-valuenow')).toBe(frozen)
    await screenshot(pet, info, `hud-shrink-${scale}`)
  }
  await expect(panel.locator('.panel-session-progress')).toContainText('第一天第一次缩圈')
  expect(
    await panel.getByRole('progressbar', { name: '缩圈进度' }).getAttribute('aria-valuenow'),
  ).toBe(frozen)
  await screenshot(panel, info, 'panel-progress')
  preferences = (await snapshot(pet)).preferences
  await command(panel, {
    type: 'preferences',
    expectedRevision: preferences.revision,
    patch: { scale: 50, statusBar: 'detailed' },
  })
  await command(panel, { type: 'resume', sessionId: current.id })
  await expect(readout).toContainText('第一夜 · 首领战', { timeout: 20_000 })
  await expect(pet.getByRole('progressbar', { name: '战斗进度' })).toBeVisible()
  await expect(readout).toContainText('战斗剩余')
  await screenshot(pet, info, 'hud-night1-50')
  await expect(readout).toContainText('第二夜 · 首领战', { timeout: 25_000 })
  const total = pet.getByRole('progressbar', { name: '整局进度' })
  await expect
    .poll(async () => Number(await total.getAttribute('aria-valuenow')))
    .toBeGreaterThanOrEqual(74)
  const hand = (await pet.locator('.dial-cursor').boundingBox())!
  const crown = (await winder.boundingBox())!
  expect(crown.x).toBeGreaterThanOrEqual(0)
  expect(crown.y + crown.height).toBeLessThan(hand.y)
  expect((await readout.boundingBox())!.x).toBeGreaterThan(hand.x + hand.width)
  await screenshot(pet, info, 'dial-three-quarters-50')
  await expect(readout).toContainText('夜王战', { timeout: 12_000 })
  await screenshot(pet, info, 'hud-nightlord-50')
  await expect(readout).toContainText('渡夜完成', { timeout: 12_000 })
  await expect(pet.getByRole('progressbar', { name: '整局进度' })).toHaveAttribute(
    'aria-valuenow',
    '100',
  )
  await expect(readout).toContainText('用时 00:46')
  await screenshot(pet, info, 'hud-complete-50')
})
