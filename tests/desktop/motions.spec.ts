import { command, expect, startFromControl, test, view } from './app'
import { shortPreset } from '../fixtures'

test('三场战斗按阶段切换动作组，每场会换招', async ({ launchApp }) => {
  test.setTimeout(90_000)
  const app = await launchApp()
  const pet = await view(app, 'pet')
  const control = await view(app, 'control')
  const request = pet.waitForRequest((r) =>
    /\/cubism-runtime(?:-[\w-]+)?\.(?:js|ts)$/.test(new URL(r.url()).pathname),
  )
  await pet.reload()
  const moduleUrl = (await request).url()
  await expect(pet.locator('.pet-model')).toBeVisible()
  await expect(pet.locator('.pet-concept')).toHaveCount(0, { timeout: 20_000 })

  const history: { action: string; slot: number }[] = []
  await pet.exposeFunction('recordMotionSlot', (action: string, slot: number) =>
    history.push({ action, slot }),
  )
  await pet.evaluate(async (url) => {
    const { CubismRuntime } = await import(url)
    const model = CubismRuntime.prototype
    const start = model.startAction
    model.startAction = function (action: string) {
      const slot = this.actions.get(action)?.next
      const accepted = start.call(this, action)
      if (accepted && typeof slot === 'number') {
        const report = Reflect.get(window, 'recordMotionSlot')
        void report(action, slot)
      }
      return accepted
    }
  }, moduleUrl)

  await command(control, {
    type: 'savePreset',
    preset: shortPreset({ customSeconds: [2, 1, 1, 1, 14, 1, 1, 1, 1, 14, 17] }),
  })
  await startFromControl(control, control.getByRole('button', { name: '出击', exact: true }))
  for (const action of ['battle', 'battle2', 'nightlord']) {
    await expect
      .poll(
        () =>
          new Set(history.filter((event) => event.action === action).map((event) => event.slot))
            .size,
        { timeout: 26_000 },
      )
      .toBeGreaterThanOrEqual(2)
  }
  await expect
    .poll(() => history.some((event) => event.action === 'victory'), { timeout: 20_000 })
    .toBe(true)
})
