import { command, expect, snapshot, test, view } from './app'

type Pose = { eye: number; tilt: number; pitch: number; offset: number; frame: number }

declare global {
  interface Window {
    readLookPose(): Pose
  }
}

test('小蜗看向鼠标，离开、开启穿透或减少动态后恢复编排动作', async ({ launchApp }) => {
  test.setTimeout(90_000)
  const app = await launchApp()
  const pet = await view(app, 'pet')
  const panel = await view(app, 'control')
  const [module] = await Promise.all([
    pet.waitForRequest((req) =>
      /\/cubism-runtime(?:-[\w-]+)?\.(?:js|ts)$/.test(new URL(req.url()).pathname),
    ),
    pet.reload(),
  ])
  const canvas = pet.locator('.pet-model')
  await expect(pet.locator('.pet-concept')).toHaveCount(0, { timeout: 20_000 })
  await pet.evaluate(async (url) => {
    const { CubismRuntime } = await import(url)
    const draw = CubismRuntime.prototype.draw
    let frame = 0
    CubismRuntime.prototype.draw = function (...args: unknown[]) {
      draw.apply(this, args)
      const model = this.getModel()
      const { ids, values } = model.getModel().parameters
      const [eye, tilt, pitch] = ['ParamGaze', 'ParamHeadTilt', 'ParamHeadPitch'].map((id) =>
        ids.indexOf(id),
      )
      const offset = Math.max(
        ...[eye, tilt, pitch].map((i) => Math.abs(values[i] - model._savedParameters[i])),
      )
      const pose = {
        eye: values[eye],
        tilt: values[tilt],
        pitch: values[pitch],
        offset,
        frame: ++frame,
      }
      window.readLookPose = () => pose
    }
  }, module.url())
  const pose = () => pet.evaluate(() => window.readLookPose())
  await expect.poll(() => pet.evaluate(() => Boolean(window.readLookPose))).toBe(true)
  const bounds = (await canvas.boundingBox())!
  const move = (x: number, y: number) =>
    canvas.dispatchEvent('pointermove', {
      pointerType: 'mouse',
      buttons: 0,
      clientX: bounds.x + bounds.width * x,
      clientY: bounds.y + bounds.height * y,
    })
  await expect
    .poll(async () => {
      await move(0.92, 0.86)
      const { eye, tilt, pitch } = await pose()
      return eye > 0.68 && tilt > 0.12 && pitch > 0.15
    })
    .toBe(true)
  await expect
    .poll(async () => {
      await move(0.06, 0.01)
      const { eye, tilt, pitch } = await pose()
      return eye < -0.68 && tilt < -0.12 && pitch < -0.1
    })
    .toBe(true)
  await canvas.dispatchEvent('pointerout', { pointerType: 'mouse', relatedTarget: null })
  await expect.poll(async () => (await pose()).offset).toBeLessThan(0.005)

  for (const mode of ['clickThrough', 'quietMode'] as const) {
    const prefs = (await snapshot(panel)).preferences
    await command(panel, {
      type: 'preferences',
      expectedRevision: prefs.revision,
      patch: { [mode]: true },
    })
    await expect.poll(async () => (await snapshot(pet)).preferences[mode]).toBe(true)
    await move(0.9, 0.9)
    const before = await pose()
    await expect.poll(async () => (await pose()).frame).toBeGreaterThan(before.frame + 8)
    expect((await pose()).offset).toBeLessThan(0.005)
    await command(panel, {
      type: 'preferences',
      expectedRevision: (await snapshot(panel)).preferences.revision,
      patch: { [mode]: false },
    })
  }
})
