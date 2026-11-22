import type { ElectronApplication, Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { command, expect, snapshot, test, view } from './app'
import { modelPixels } from './model-pixels'

async function geometry(app: ElectronApplication, pet: Page) {
  const desktop = await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes('view=pet'),
    )!
    const bounds = window.getBounds()
    return {
      bounds,
      area: screen.getDisplayMatching(bounds).workArea,
      focusable: window.isFocusable(),
      maximized: window.isMaximized(),
      zoom: window.webContents.getZoomFactor(),
    }
  })
  const canvas = await pet.locator('.pet-model').evaluate((el: HTMLCanvasElement) => ({
    cssWidth: el.getBoundingClientRect().width,
    cssHeight: el.getBoundingClientRect().height,
    backingWidth: el.width,
    backingHeight: el.height,
    dpr: devicePixelRatio,
  }))
  return { ...desktop, canvas }
}

for (const factor of [1.25, 1.5]) {
  test(`系统缩放 ${factor * 100}%：反复拖动保持窗口和模型大小，释放后可见`, async ({
    launchApp,
  }, info) => {
    test.setTimeout(90_000)
    const app = await launchApp({ deviceScaleFactor: factor })
    const pet = await view(app, 'pet'),
      control = await view(app, 'control')
    const preferences = (await snapshot(control)).preferences
    await command(control, {
      type: 'preferences',
      expectedRevision: preferences.revision,
      patch: { quietMode: true },
    })
    await control.close()
    await expect(pet.locator('.pet-concept')).toHaveCount(0, { timeout: 20000 })
    await command(pet, { type: 'drag', dx: -40, dy: -30 })
    const before = await geometry(app, pet)
    expect(before.canvas.dpr).toBeCloseTo(factor, 2)
    const painted = await modelPixels(pet, info.outputPath('before.png'))
    expect(painted.coverage).toBeGreaterThan(0.025)
    // This round trip previously enlarged the native window by ~100 logical pixels.
    await pet.evaluate(async () => {
      for (let group = 0; group < 10; group++) {
        await Promise.all(
          Array.from({ length: 10 }, (_, i) => {
            const delta = i % 2 === 0 ? 1 : -1
            return window.nightreign.command({
              type: 'drag',
              dx: delta,
              dy: delta,
              finished: false,
            })
          }),
        )
      }
      await window.nightreign.command({ type: 'drag', dx: 0, dy: 0, finished: true })
    })
    const repeated = await geometry(app, pet)
    expect(repeated.bounds).toEqual(before.bounds)
    expect(repeated.canvas.cssWidth).toBeCloseTo(before.canvas.cssWidth, 0)
    expect(repeated.canvas.backingWidth).toBe(before.canvas.backingWidth)
    expect(repeated.canvas.backingHeight).toBe(before.canvas.backingHeight)

    await pet.evaluate(() => {
      document.body.dataset.nativeDrags = '0'
      window.addEventListener('dragstart', (e) => {
        if (!e.defaultPrevented) document.body.dataset.nativeDrags = '1'
      })
    })
    for (let i = 0; i < 3; i++) {
      await pet.mouse.move(painted.solid.x, painted.solid.y)
      await pet.mouse.down()
      await pet.mouse.move(painted.solid.x - 18, painted.solid.y - 12, { steps: 3 })
      await pet.mouse.up()
    }
    const dragged = await geometry(app, pet)
    expect(dragged.bounds.x).toBeLessThan(before.bounds.x)
    expect(dragged.bounds.y).toBeLessThan(before.bounds.y)
    expect(Math.abs(dragged.bounds.width - before.bounds.width)).toBeLessThanOrEqual(2)
    expect(Math.abs(dragged.bounds.height - before.bounds.height)).toBeLessThanOrEqual(2)
    expect(dragged).toMatchObject({ focusable: false, maximized: false, zoom: 1 })
    expect(await pet.locator('body').getAttribute('data-native-drags')).toBe('0')
    expect(app.windows()).toHaveLength(1)
    const afterPaint = await modelPixels(pet, info.outputPath('after.png'))
    const paintedHeight = (p: typeof painted) => (p.painted.bottom - p.painted.top) / p.height
    expect(Math.abs(paintedHeight(afterPaint) - paintedHeight(painted))).toBeLessThan(0.05)

    await command(pet, { type: 'drag', dx: 4096, dy: 4096, finished: true })
    const corner = await geometry(app, pet)
    expect(
      Math.abs(corner.bounds.x + corner.bounds.width - corner.area.x - corner.area.width),
    ).toBeLessThanOrEqual(2)
    expect(
      Math.abs(corner.bounds.y + corner.bounds.height - corner.area.y - corner.area.height),
    ).toBeLessThanOrEqual(2)
    expect((await snapshot(pet)).preferences.scale).toBe(100)
    await writeFile(
      info.outputPath('geometry.json'),
      JSON.stringify({ before, repeated, dragged, corner }, null, 2),
    )
  })
}
