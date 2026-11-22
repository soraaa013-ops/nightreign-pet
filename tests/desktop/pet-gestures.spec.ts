import { shortPreset } from '../fixtures'
import { command, expect, snapshot, startFromControl, test, view } from './app'
import { modelPixels } from './model-pixels'

test('仅战斗中双击角色施放一次绝招，单击、透明区、拖动和暂停不会误触', async ({ launchApp }) => {
  const app = await launchApp()
  const pet = await view(app, 'pet')
  const control = await view(app, 'control')
  await command(control, {
    type: 'savePreset',
    preset: shortPreset({ customSeconds: [1, 1, 1, 1, 30, 1, 1, 1, 1, 1, 1] }),
  })
  await expect(pet.locator('.pet-concept')).toHaveCount(0, { timeout: 20_000 })
  await startFromControl(control, control.getByRole('button', { name: '出击', exact: true }))
  await expect(pet.getByRole('progressbar', { name: '战斗进度' })).toBeVisible({ timeout: 12_000 })
  await expect(pet.getByRole('button', { name: /绝招/ })).toHaveCount(0)
  const { solid } = await modelPixels(pet)
  const used = async () => (await snapshot(pet)).session?.usedUltimates
  await pet.mouse.click(solid.x, solid.y)
  await pet.mouse.dblclick(2, 2)
  await pet.mouse.move(solid.x, solid.y)
  await pet.mouse.down()
  await pet.mouse.move(solid.x - 16, solid.y - 8, { steps: 3 })
  await pet.mouse.up()
  await pet.locator('.pet-status').click()
  const panel = await view(app, 'control')
  await panel.getByRole('button', { name: '暂停渡夜' }).click()
  await expect(pet.locator('.pet-status')).toContainText('已暂停')
  await pet.mouse.dblclick(solid.x, solid.y)
  await panel.keyboard.press('Alt+u')
  expect(await used()).toEqual([])
  await panel.getByRole('button', { name: '继续渡夜' }).click()
  await expect(pet.locator('.pet-status')).not.toContainText('已暂停')
  for (const clickThrough of [true, false]) {
    await command(panel, {
      type: 'preferences',
      expectedRevision: (await snapshot(panel)).preferences.revision,
      patch: { clickThrough, statusBar: clickThrough ? 'hidden' : 'compact' },
    })
    await expect(pet.locator('.pet-status')).toHaveCount(clickThrough ? 0 : 1)
    if (clickThrough) {
      await pet.mouse.dblclick(solid.x, solid.y)
      expect(await used()).toEqual([])
    }
  }
  await panel.close()
  const battle = await modelPixels(pet)
  await pet.mouse.dblclick(battle.solid.x, battle.solid.y)
  await expect.poll(used).toEqual(['night1'])
  await pet.mouse.dblclick(battle.solid.x, battle.solid.y)
  await expect(pet.getByRole('alert')).toHaveCount(0)
  expect(await used()).toEqual(['night1'])
})

test('准备页可用 Alt+U 施放，正在确认结束时屏蔽快捷键', async ({ launchApp }) => {
  const app = await launchApp()
  const pet = await view(app, 'pet')
  const control = await view(app, 'control')
  await command(control, {
    type: 'savePreset',
    preset: shortPreset({ customSeconds: [1, 1, 1, 1, 20, 1, 1, 1, 1, 1, 1] }),
  })
  await startFromControl(control, control.getByRole('button', { name: '出击', exact: true }))
  await command(pet, { type: 'openControl', page: 'prepare' })
  const panel = await view(app, 'control')
  const hint = panel.getByText(/Alt\+U/)
  await expect(hint).toBeVisible({ timeout: 12_000 })
  await panel.getByRole('button', { name: '结束本次' }).click()
  await panel.keyboard.press('Alt+u')
  expect((await snapshot(pet)).session?.usedUltimates).toEqual([])
  await panel.getByRole('dialog').getByRole('button', { name: '取消' }).click()
  await panel.keyboard.press('Alt+u')
  await expect.poll(async () => (await snapshot(pet)).session?.usedUltimates).toEqual(['night1'])
  await expect(hint).toHaveCount(0)
})
