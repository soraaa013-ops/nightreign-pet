import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import type { Page } from '@playwright/test'
import { shortPreset } from '../fixtures'
import { command, expect, snapshot, startFromControl, test, view } from './app'
import { inspectCharacterRig } from './character-rig'

const actions = ['idle', 'touch', 'battle', 'ultimate', 'victory'] as const
type Action = (typeof actions)[number]

async function ready(pet: Page) {
  await expect(pet.locator('.pet-model')).toBeVisible()
  await expect(pet.locator('.pet-concept')).toHaveCount(0, { timeout: 20_000 })
  await expect.poll(() => pet.evaluate(() => Boolean(window.Live2DCubismCore))).toBe(true)
}

async function modelPixels(pet: Page, output: string) {
  const png = await pet.screenshot({
    path: output,
    omitBackground: true,
    style: '.pet-scene > :not(.pet-model) { visibility: hidden !important }',
  })
  return pet.evaluate(async (base64) => {
    const image = new Image()
    image.src = 'data:image/png;base64,' + base64
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    const { data } = ctx.getImageData(0, 0, image.width, image.height)
    let opaque = 0,
      transparent = 0,
      nearest = Infinity
    let solid = { x: 0, y: 0 }
    const painted = { left: image.width, top: image.height, right: -1, bottom: -1 }
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const alpha = data[4 * (y * image.width + x) + 3]
        if (alpha < 8) transparent++
        if (alpha >= 32) {
          painted.left = Math.min(painted.left, x)
          painted.top = Math.min(painted.top, y)
          painted.right = Math.max(painted.right, x)
          painted.bottom = Math.max(painted.bottom, y)
        }
        if (alpha < 225) continue
        opaque++
        const d = Math.hypot(x - image.width / 2, y - image.height / 2)
        if (d < nearest) {
          nearest = d
          solid = { x: (x * innerWidth) / image.width, y: (y * innerHeight) / image.height }
        }
      }
    }
    // Find a transparent opening between opaque parts of the silhouette. Its
    // center stays clear if the idle pose moves by a few pixels before clicking.
    let gap: { x: number; y: number } | undefined
    let best = 11
    for (let y = 4; y < image.height * 0.78; y++) {
      let lastSolid = -1
      for (let x = 0; x < image.width; x++) {
        if (data[(y * image.width + x) * 4 + 3] < 64) continue
        const width = x - lastSolid,
          mid = Math.floor((lastSolid + x) / 2)
        if (lastSolid >= 0 && width > best) {
          let clear = true
          for (let dy = -3; dy <= 3 && clear; dy++)
            for (let dx = -3; dx <= 3; dx++)
              if (data[((y + dy) * image.width + mid + dx) * 4 + 3] > 4) clear = false
          if (clear) {
            best = width
            gap = { x: (mid * innerWidth) / image.width, y: (y * innerHeight) / image.height }
          }
        }
        lastSolid = x
      }
    }
    return {
      width: image.width,
      height: image.height,
      coverage: opaque / (image.width * image.height),
      transparent: transparent / (image.width * image.height),
      solid,
      painted,
      gap,
      corner: data[3],
    }
  }, png.toString('base64'))
}

type FrameRange = { count: number; changed: string[]; acceptedActions: string[] }
declare global {
  interface Window {
    characterFrameAudit: {
      start(): void
      read(): FrameRange
    }
  }
}

// Record parameter ranges from the live renderer's own Core model. This observer
// delegates to the original update method and never writes to the model.
async function observeUpdates(pet: Page, loadedModule: string) {
  await pet.evaluate(async (url) => {
    // Import the exact module this window loaded, so we see the production
    // play() result even when a competing motion uses the same parameters.
    const { CubismRuntime } = await import(url)
    const runtime = CubismRuntime.prototype
    const play = runtime.play
    const setBase = runtime.setBaseAction
    const accepted = new Set<string>()
    runtime.play = function (action: string) {
      const started = play.call(this, action)
      if (started) accepted.add(action)
      return started
    }
    if (setBase)
      runtime.setBaseAction = function (action: string) {
        setBase.call(this, action)
        accepted.add(action)
      }
    const prototype = window.Live2DCubismCore.Model.prototype
    const update = prototype.update
    let frames = 0
    const ranges = new Map<string, [number, number]>()
    window.characterFrameAudit = {
      start() {
        frames = 0
        ranges.clear()
      },
      read() {
        return {
          count: frames,
          acceptedActions: [...accepted],
          changed: [...ranges].filter(([, [low, high]]) => high - low > 0.0001).map(([id]) => id),
        }
      },
    }
    prototype.update = function () {
      update.call(this)
      frames++
      this.parameters.ids.forEach((id, index) => {
        const value = this.parameters.values[index],
          old = ranges.get(id)
        if (old) {
          old[0] = Math.min(old[0], value)
          old[1] = Math.max(old[1], value)
        } else ranges.set(id, [value, value])
      })
    }
  }, loadedModule)
}

test('正式小蜗在 Cubism 中局部变形，并在桌面完成待机、轻触、战斗、绝招和胜利', async ({
  launchApp,
}, info) => {
  test.setTimeout(90_000)
  const app = await launchApp()
  const pet = await view(app, 'pet')
  const control = await view(app, 'control')
  const errors: string[] = []
  pet.on('pageerror', (error) => errors.push(error.message))
  const [runtimeRequest] = await Promise.all([
    pet.waitForRequest((request) =>
      /\/cubism-runtime(?:-[\w-]+)?\.(?:js|ts)$/.test(new URL(request.url()).pathname),
    ),
    pet.reload(),
  ])
  await ready(pet)
  const rig = await pet.evaluate(inspectCharacterRig)
  expect(rig.consistency).toBe(1)
  expect(rig.parameterMeshes.ParamHeadTilt).toContain('ArtHead')
  expect(rig.parameterMeshes.ParamHairSway).toContain('ArtBackHair')
  expect(rig.parameterMeshes.ParamPluck).toContain('ArtPluckArm')
  expect(rig.parameterMeshes.ParamHarp).toContain('ArtLyre')
  expect(rig.parameterMeshes.ParamEyeOpen.sort()).toEqual(['ArtHead', 'ArtLidLeft', 'ArtLidRight'])
  expect(rig.triangles).toBeGreaterThan(2)
  for (const action of actions)
    expect(rig.actions[action]?.meshes.length, action).toBeGreaterThan(0)
  expect(new Set(actions.map((action) => rig.actions[action].files.join('|'))).size).toBe(
    actions.length,
  )

  await mkdir(info.outputDir, { recursive: true })
  const layout = await pet.evaluate(() => ({
    modelBottom: document.querySelector('.pet-model')!.getBoundingClientRect().bottom,
    statusTop: document.querySelector('.pet-status')!.getBoundingClientRect().top,
  }))
  expect(layout.modelBottom, '裙摆和状态条应有独立空间').toBeLessThanOrEqual(layout.statusTop + 1)
  await pet.screenshot({ path: info.outputPath('desktop.png'), omitBackground: true })
  const pixels = await modelPixels(pet, info.outputPath('idle.png'))
  expect(pixels.coverage, '真实角色的不透明像素').toBeGreaterThan(0.025)
  expect(pixels.transparent, '透明桌面区域').toBeGreaterThan(0.1)
  expect(pixels.corner).toBe(0)
  await observeUpdates(pet, runtimeRequest.url())
  const startAudit = () => pet.evaluate(() => window.characterFrameAudit.start())
  const readAudit = () => pet.evaluate(() => window.characterFrameAudit.read())
  const measurements: Partial<Record<Action, FrameRange>> = {}
  async function verifyAction(action: Action, seconds = 1.25) {
    await delay(seconds * 1000)
    const range = await readAudit()
    measurements[action] = range
    expect(range.count, action).toBeGreaterThan(0)
    if (action !== 'idle') expect(range.acceptedActions, action + ' 应被角色接受').toContain(action)
    const driven = rig.actions[action].parameters
    const actionSpecific =
      action === 'idle'
        ? driven
        : driven.filter((id) => id !== 'ParamBreath' && !rig.actions.idle.parameters.includes(id))
    const candidates = actionSpecific.length ? actionSpecific : driven
    expect(
      range.changed.some((id) => candidates.includes(id)),
      action + ' 的动作参数应随时间改变',
    ).toBe(true)
  }
  await startAudit()
  await verifyAction('idle')

  await control.close()
  await pet.mouse.click(2, 2)
  if (pixels.gap) await pet.mouse.click(pixels.gap.x, pixels.gap.y)
  expect(app.windows()).toHaveLength(1)
  await pet.mouse.click(pixels.solid.x, pixels.solid.y)
  const panel = await view(app, 'control')
  const prefs = (await snapshot(panel)).preferences
  await command(panel, {
    type: 'preferences',
    expectedRevision: prefs.revision,
    patch: { scale: 125 },
  })
  await expect
    .poll(() => pet.evaluate(() => document.querySelector('canvas')!.width))
    .toBeGreaterThan(pixels.width)
  await command(panel, { type: 'visibility', visible: false })
  await delay(200)
  await startAudit()
  await delay(300)
  expect((await readAudit()).count).toBe(0)
  await command(panel, { type: 'visibility', visible: true })

  const preset = shortPreset({ customSeconds: [7, 1, 1, 1, 6, 1, 1, 1, 1, 1, 1] })
  await command(panel, { type: 'savePreset', preset })
  await startFromControl(panel, panel.getByRole('button', { name: '出击', exact: true }))
  await startAudit()
  const newShape = await modelPixels(pet, info.outputPath('exploration.png'))
  await pet.mouse.click(newShape.solid.x, newShape.solid.y)
  await verifyAction('touch')
  await modelPixels(pet, info.outputPath('touch.png'))

  await command(pet, { type: 'openControl', page: 'prepare' })
  const active = await view(app, 'control')
  const session = (await snapshot(active)).session!
  await command(active, { type: 'pause', sessionId: session.id })
  await expect(pet.locator('.pet-status')).toContainText('已暂停')
  await expect
    .poll(
      async () => {
        await startAudit()
        await delay(350)
        return (await readAudit()).count
      },
      { message: '窗口布局稳定后暂停停止模型刷新' },
    )
    .toBe(0)
  await command(active, { type: 'resume', sessionId: session.id })
  await active.close()

  const ultimate = pet.getByRole('button', { name: '释放绝招' })
  await ultimate.waitFor({ timeout: 18_000 })
  await startAudit()
  await verifyAction('battle', 0.8)
  await modelPixels(pet, info.outputPath('battle.png'))
  await startAudit()
  await ultimate.click()
  await verifyAction('ultimate', 0.7)
  await modelPixels(pet, info.outputPath('ultimate.png'))
  await pet.getByText('NIGHTLORD SLAIN', { exact: true }).waitFor({ timeout: 25_000 })
  await startAudit()
  await verifyAction('victory', 0.7)
  await modelPixels(pet, info.outputPath('victory.png'))
  expect(errors).toEqual([])
  await writeFile(
    info.outputPath('character.json'),
    JSON.stringify({ rig, pixels, layout, measurements, errors }, null, 2),
  )
})

test('50%、125%、200% 缩放下的小蜗从花冠到鞋均完整，三种状态条保留独立空间', async ({
  launchApp,
}, info) => {
  test.setTimeout(90_000)
  const app = await launchApp()
  const pet = await view(app, 'pet')
  await ready(pet)
  const prepare = await view(app, 'control')
  await startFromControl(prepare, prepare.getByRole('button', { name: '出击', exact: true }))
  await command(pet, { type: 'openControl', page: 'settings' })
  const settings = await view(app, 'control')
  await settings
    .getByRole('navigation', { name: '主导航' })
    .getByRole('button', { name: /小蜗与桌面/ })
    .click()
  await expect(pet.locator('.pet-stage')).toHaveCount(0, { timeout: 7_000 })
  const slider = settings.getByRole('slider', { name: '小蜗大小' })
  const status = settings.getByRole('combobox', { name: '状态条' })
  await mkdir(info.outputDir, { recursive: true })
  const results = []
  for (const scale of [50, 125, 200]) {
    if (scale === 125) {
      // The middle of the range is 125%. Correct integer rounding with native keys.
      await slider.click()
      await expect.poll(() => slider.inputValue()).not.toBe('50')
      const value = Number(await slider.inputValue())
      expect(Math.abs(value - scale)).toBeLessThanOrEqual(1)
      if (value !== scale) await slider.press(value < scale ? 'ArrowRight' : 'ArrowLeft')
    } else await slider.press(scale === 50 ? 'Home' : 'End')
    await expect.poll(async () => (await snapshot(pet)).preferences.scale).toBe(scale)
    const width = Math.round((320 * scale) / 100),
      height = Math.round((350 * scale) / 100)
    await expect.poll(() => pet.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
    for (const mode of ['compact', 'detailed', 'hidden']) {
      await status.selectOption(mode)
      await expect.poll(async () => (await snapshot(pet)).preferences.statusBar).toBe(mode)
      const bar = pet.locator('.pet-status')
      if (mode === 'hidden') await expect(bar).toHaveCount(0)
      else {
        await expect(bar).toBeVisible()
        if (mode === 'detailed') await expect(bar).toContainText('本次剩余')
      }
      const layout = await pet.evaluate(() => {
        const model = document.querySelector<HTMLCanvasElement>('.pet-model')!
        const rect = model.getBoundingClientRect()
        const status = document.querySelector('.pet-status')?.getBoundingClientRect()
        return {
          canvasHeight: rect.height,
          canvasBottom: rect.bottom,
          statusTop: status?.top ?? null,
          statusBottom: status?.bottom ?? null,
          ready: !document.querySelector('.pet-concept'),
        }
      })
      const name = `scale-${scale}-${mode}`
      await pet.screenshot({ path: info.outputPath(name + '.png'), omitBackground: true })
      const pixels = await modelPixels(pet, info.outputPath(name + '-model.png'))
      const ratio = pixels.height / height
      const bounds = pixels.painted
      expect(layout.ready).toBe(true)
      expect(bounds.left).toBeGreaterThan(0)
      expect(bounds.right).toBeLessThan(pixels.width - 1)
      expect(bounds.top).toBeGreaterThan(0)
      expect(bounds.bottom).toBeLessThan(layout.canvasBottom * ratio - 1)
      expect(bounds.bottom - bounds.top).toBeGreaterThan(layout.canvasHeight * ratio * 0.75)
      if (mode === 'hidden') expect(layout.canvasHeight).toBe(height)
      else {
        expect(layout.statusTop).toBeGreaterThanOrEqual(layout.canvasBottom - 1)
        expect(layout.statusBottom).toBeLessThanOrEqual(height)
      }
      results.push({ scale, mode, width, height, ...layout, painted: bounds, ratio })
    }
  }
  await writeFile(info.outputPath('scales.json'), JSON.stringify(results, null, 2))
})
