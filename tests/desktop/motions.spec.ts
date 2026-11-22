import { command, expect, snapshot, startFromControl, test, view } from './app'
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

test('绝招跨阶段时演完收势，再接新阶段的动作', async ({ launchApp }) => {
  const app = await launchApp()
  const pet = await view(app, 'pet')
  const [moduleRequest] = await Promise.all([
    pet.waitForRequest((r) =>
      /\/cubism-runtime(?:-[\w-]+)?\.(?:js|ts)$/.test(new URL(r.url()).pathname),
    ),
    pet.reload(),
  ])
  await expect(pet.locator('.pet-concept')).toHaveCount(0, { timeout: 20_000 })
  const afterBoundary = await pet.evaluate(async (url) => {
    const { CubismRuntime } = await import(url)
    const proto = CubismRuntime.prototype
    const draw = proto.draw
    return new Promise<{ action: string; base: string }>((resolve) => {
      proto.draw = function (elapsed: number, reduced: boolean) {
        proto.draw = draw
        draw.call(this, elapsed, reduced)
        this.setBaseAction('battle')
        this.play('ultimate')
        this.setBaseAction('battle2')
        Reflect.set(window, 'activePetMotion', () => this.activeAction)
        resolve({ action: this.activeAction, base: this.baseAction })
      }
    })
  }, moduleRequest.url())
  expect(afterBoundary).toEqual({ action: 'ultimate', base: 'battle2' })
  await expect
    .poll(() => pet.evaluate(() => Reflect.get(window, 'activePetMotion')()), { timeout: 12_000 })
    .toBe('battle2')
})

test('暂停中连续施放的演出收势后只接一次，播放结束后恢复静止', async ({ launchApp }) => {
  test.setTimeout(60_000)
  const app = await launchApp()
  const pet = await view(app, 'pet')
  const control = await view(app, 'control')
  const [runtime] = await Promise.all([
    pet.waitForRequest((r) =>
      /\/cubism-runtime(?:-[\w-]+)?\.(?:js|ts)$/.test(new URL(r.url()).pathname),
    ),
    pet.reload(),
  ])
  await expect(pet.locator('.pet-concept')).toHaveCount(0, { timeout: 20_000 })
  await pet.evaluate(async (url) => {
    const { CubismRuntime } = await import(url)
    const proto = CubismRuntime.prototype
    const start = proto.startAction
    const draw = proto.draw
    const audit = { starts: [] as number[], frames: 0, marching: false }
    proto.startAction = function (action: string) {
      if (action === 'ultimate') audit.starts.push(performance.now())
      return start.call(this, action)
    }
    proto.draw = function (...args: unknown[]) {
      draw.apply(this, args)
      audit.frames++
      audit.marching = this.marching
    }
    Reflect.set(window, 'marchAudit', audit)
  }, runtime.url())
  await startFromControl(control, control.getByRole('button', { name: '出击', exact: true }))
  await command(pet, { type: 'openControl', page: 'prepare' })
  const panel = await view(app, 'control')
  await panel.getByRole('button', { name: '暂停渡夜' }).click()
  await expect.poll(async () => (await snapshot(pet)).session?.status).toBe('paused')
  const paused = (await snapshot(pet)).session
  for (let press = 0; press < 4; press++) await command(pet, { type: 'ultimate' })
  const audit = () =>
    pet.evaluate(
      () =>
        Reflect.get(window, 'marchAudit') as {
          starts: number[]
          frames: number
          marching: boolean
        },
    )
  await expect.poll(async () => (await audit()).starts.length, { timeout: 18_000 }).toBe(2)
  await expect.poll(async () => (await audit()).marching, { timeout: 18_000 }).toBe(false)
  const finished = await audit()
  expect(finished.starts[1] - finished.starts[0]).toBeGreaterThan(3000)
  await pet.waitForTimeout(500)
  expect(await audit()).toEqual(finished)
  expect((await snapshot(pet)).session).toEqual(paused)
})
