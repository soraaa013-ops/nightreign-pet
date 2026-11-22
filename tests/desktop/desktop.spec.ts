import { once } from 'node:events'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { ElectronApplication, Page } from '@playwright/test'
import type { AppSnapshot, Session } from '../../src/contracts/types'
import { shortPreset } from '../fixtures'
import { command, expect, screenshot, snapshot, startFromControl, test, view } from './app'

async function openControl(app: ElectronApplication, pet: Page) {
  await command(pet, { type: 'openControl', page: 'prepare' })
  return view(app, 'control')
}

async function preferences(control: Page, patch: Partial<AppSnapshot['preferences']>) {
  const current = await snapshot(control)
  return command(control, {
    type: 'preferences',
    expectedRevision: current.preferences.revision,
    patch,
  })
}

async function sessionAt(pet: Page, status: Session['status'], timeout = 7000) {
  let session: Session | null = null
  await expect
    .poll(
      async () => {
        session = (await snapshot(pet)).session
        return session?.status
      },
      { timeout },
    )
    .toBe(status)
  if (!session) throw new Error('预期有一局渡夜')
  return session as Session
}

test('默认准备页、真实渲染和受限的桥接接口', async ({ launchApp }, info) => {
  const app = await launchApp()
  const control = await view(app, 'control')
  const pet = await view(app, 'pet')
  const external: string[] = []
  for (const page of [control, pet])
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) external.push(request.url())
    })

  const sortie = control.getByRole('button', { name: '出击', exact: true })
  await expect(sortie).toBeEnabled()
  await expect(control.getByText('40:00', { exact: false })).toBeVisible()
  await control.getByRole('button', { name: /完整时间线/ }).click()
  await expect(control.getByText('第一天第一次缩圈', { exact: true })).toBeVisible()
  await expect(control.getByText('04:30', { exact: true }).first()).toBeVisible()
  await expect(control.getByText('第二天第二次缩圈', { exact: true })).toBeVisible()
  await screenshot(control, info, 'prepare')
  await screenshot(pet, info, 'pet')

  const bridge = await pet.evaluate(() => ({
    electronApi: Object.keys(window.nightreign).sort(),
    require: typeof require,
    process: typeof globalThis.process,
    ipcRenderer: typeof Reflect.get(window, 'ipcRenderer'),
    popupDenied: window.open('about:blank') === null,
  }))
  expect(bridge).toEqual({
    electronApi: ['command', 'getSnapshot', 'onPresentation', 'onSnapshot', 'previewTimeline'],
    require: 'undefined',
    process: 'undefined',
    ipcRenderer: 'undefined',
    popupDenied: true,
  })
  expect(
    await pet.evaluate(() => [
      getComputedStyle(document.documentElement).backgroundColor,
      getComputedStyle(document.body).backgroundColor,
    ]),
  ).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'])
  const policy = await app.evaluate(({ BrowserWindow, screen }) => {
    const petWindow = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().includes('view=pet'),
    )
    if (!petWindow) throw new Error('没有桌宠窗')
    const { contextIsolation, sandbox, nodeIntegration } = (
      petWindow.webContents as Electron.WebContents & {
        getLastWebPreferences(): Electron.WebPreferences
      }
    ).getLastWebPreferences()
    return {
      contextIsolation,
      sandbox,
      nodeIntegration,
      focusable: petWindow.isFocusable(),
      alwaysOnTop: petWindow.isAlwaysOnTop(),
      rect: petWindow.getBounds(),
      workArea: screen.getPrimaryDisplay().workArea,
    }
  })
  expect(policy).toMatchObject({
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    focusable: false,
    alwaysOnTop: true,
  })
  expect(policy.rect.x + policy.rect.width).toBeLessThanOrEqual(
    policy.workArea.x + policy.workArea.width,
  )
  expect(policy.rect.y + policy.rect.height).toBeLessThanOrEqual(
    policy.workArea.y + policy.workArea.height,
  )
  expect(policy.rect.x).toBeGreaterThan((policy.workArea.x + policy.workArea.width) / 2)
  expect(policy.rect.y).toBeGreaterThan((policy.workArea.y + policy.workArea.height) / 2)

  await expect(command(pet, { type: 'start', presetId: 'original-40' })).rejects.toThrow(/无法执行/)
  await expect(command(control, { type: 'hitTest', hit: true })).rejects.toThrow(/无法执行/)
  await expect(
    control.evaluate(() => window.nightreign.command({ type: 'drag', dx: NaN, dy: 0 })),
  ).rejects.toThrow(/拖动距离/)
  await expect(
    control.evaluate(() =>
      window.nightreign.command({ type: 'visibility', visible: true, unknown: true } as never),
    ),
  ).rejects.toThrow(/未知字段/)
  expect((await snapshot(pet)).session).toBeNull()
  expect(external).toEqual([])

  await control.close()
  await pet.getByRole('button', { name: /等待出击/ }).click()
  await expect(
    (await view(app, 'control')).getByRole('button', { name: '出击', exact: true }),
  ).toBeEnabled()
})

const fallbackManifestUrl = 'app://assets/character/revenant/manifest.json'
const fallbackReason = '测试资源暂不可用'

async function showCharacterFallback(pet: Page) {
  await pet.route(fallbackManifestUrl, (route) =>
    route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: { version: 1, status: 'missing', reason: fallbackReason },
    }),
  )
  await pet.reload()
  await expect(pet.getByRole('button', { name: '查看模型加载详情' })).toBeVisible()
}

test('角色读取失败显示具体原因，资源恢复后可重试', async ({ launchApp }) => {
  const app = await launchApp()
  const pet = await view(app, 'pet')
  await showCharacterFallback(pet)
  const details = pet.getByRole('button', { name: '查看模型加载详情' })
  await details.click()
  await expect(details).toHaveAttribute('aria-expanded', 'true')
  await expect(pet.getByRole('status').filter({ hasText: '模型加载详情' })).toContainText(
    fallbackReason,
  )
  await pet.getByRole('button', { name: '关闭详情' }).click()
  await expect(details).toHaveAttribute('aria-expanded', 'false')
  await pet.unroute(fallbackManifestUrl)
  await pet.getByRole('button', { name: /重新加载/ }).click()
  await expect(pet.locator('.pet-concept')).toHaveCount(0, { timeout: 20000 })
  await expect(
    (await view(app, 'control')).getByRole('button', { name: '出击', exact: true }),
  ).toBeEnabled()
})

test('回退立绘的透明区域不打开面板，拖动与点击分离，锁定仍可点击', async ({ launchApp }) => {
  const app = await launchApp()
  const pet = await view(app, 'pet')
  const initial = await view(app, 'control')
  await showCharacterFallback(pet)
  const preview = pet.getByRole('img', { name: /同人立绘预览/ })
  await expect(preview).toBeVisible()
  await expect
    .poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0)
  await initial.close()

  const coordinates = await preview.evaluate((img: HTMLImageElement) => {
    const box = img.getBoundingClientRect()
    const canvas = document.createElement('canvas')
    canvas.width = 40
    canvas.height = Math.ceil((40 * img.naturalHeight) / img.naturalWidth)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const scale = Math.min(box.width / canvas.width, box.height / canvas.height)
    const ox = box.left + (box.width - canvas.width * scale) / 2
    const oy = box.top + (box.height - canvas.height * scale) / 2
    let shape: { x: number; y: number } | undefined
    for (let y = Math.floor(canvas.height / 3); y < (canvas.height * 2) / 3 && !shape; y += 1) {
      for (let x = Math.floor(canvas.width / 3); x < (canvas.width * 2) / 3; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] < 245) continue
        shape = { x: ox + (x + 0.5) * scale, y: oy + (y + 0.5) * scale }
        break
      }
    }
    if (!shape) throw new Error('没有可用于测试的立绘像素')
    return { shape, transparent: { x: box.x + 2, y: box.y + 2 } }
  })

  const bounds = () =>
    app.evaluate(({ BrowserWindow }) => {
      const target = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes('view=pet'),
      )
      if (!target) throw new Error('缺少桌宠窗口')
      return target.getBounds()
    })
  await pet.mouse.click(coordinates.transparent.x, coordinates.transparent.y)
  expect((await bounds()).width).toBe(320)
  expect(app.windows()).toHaveLength(1)

  const move = async () => {
    const { x, y } = coordinates.shape
    await pet.mouse.move(x, y)
    await pet.mouse.down()
    await pet.mouse.move(x - 35, y - 20, { steps: 3 })
    await pet.mouse.up()
  }
  const start = await bounds()
  await move()
  await expect.poll(bounds).not.toEqual(start)
  expect(app.windows()).toHaveLength(1)

  const control = await openControl(app, pet)
  await preferences(control, { positionLocked: true })
  await control.close()
  const locked = await bounds()
  await move()
  expect(await bounds()).toEqual(locked)
  await pet.mouse.click(coordinates.shape.x, coordinates.shape.y)
  await expect(
    (await view(app, 'control')).getByRole('button', { name: '出击', exact: true }),
  ).toBeEnabled()
})

test('四页设置可由键盘操作，非法草稿被拒，局部默认及偏好即时生效', async ({ launchApp }, info) => {
  const app = await launchApp()
  const control = await view(app, 'control')
  const pet = await view(app, 'pet')
  const nav = control.getByRole('navigation', { name: '主导航' })

  const time = nav.getByRole('button', { name: /渡夜节奏/ })
  await time.focus()
  await control.keyboard.press('Enter')
  await expect(control.getByRole('heading', { name: '渡夜预设' })).toBeVisible()
  await control.getByRole('button', { name: /适配课长/ }).click()
  await control.getByRole('spinbutton', { name: /课堂总时长/ }).fill('30')
  await expect(control.getByRole('alert')).toContainText('31')
  await expect(control.getByRole('button', { name: '保存节奏' })).toBeDisabled()
  await control.getByRole('spinbutton', { name: /课堂总时长/ }).fill('45')
  await expect(control.getByRole('button', { name: '保存节奏' })).toBeEnabled()

  await nav.getByRole('button', { name: /小蜗与桌面/ }).click()
  const dirty = control.getByRole('dialog')
  await expect(dirty).toBeVisible()
  await expect(dirty.getByRole('button', { name: '取消' })).toBeFocused()
  await control.keyboard.press('Shift+Tab')
  await expect
    .poll(() => dirty.evaluate((node) => node.contains(document.activeElement)))
    .toBe(true)
  await expect(dirty.getByRole('button', { name: /保存/ })).toBeVisible()
  await control.keyboard.press('Escape')
  await expect(dirty).toHaveCount(0)
  await nav.getByRole('button', { name: /小蜗与桌面/ }).click()
  await dirty.getByRole('button', { name: /放弃/ }).click()

  const slider = control.getByRole('slider', { name: '小蜗大小' })
  await slider.focus()
  await control.keyboard.press('End')
  await expect.poll(async () => (await snapshot(pet)).preferences.scale).toBe(200)
  await control.getByRole('switch', { name: '锁定位置' }).click()
  await expect(control.getByRole('switch', { name: '锁定位置' })).toBeChecked()
  await control.getByRole('combobox', { name: '状态条' }).selectOption('hidden')
  await expect(pet.getByRole('button', { name: /等待出击/ })).toHaveCount(0)
  await control.getByRole('button', { name: '恢复本页默认' }).click()
  await expect(dirty).toBeVisible()
  await dirty.getByRole('button', { name: '恢复默认', exact: true }).click()
  await expect.poll(async () => (await snapshot(pet)).preferences.scale).toBe(100)
  await expect(pet.getByRole('button', { name: /等待出击/ })).toBeVisible()

  await time.click()
  await control.getByRole('button', { name: /适配课长/ }).click()
  await control.getByRole('textbox', { name: '预设名称' }).fill('课长预设测试')
  await control.getByRole('spinbutton', { name: /课堂总时长/ }).fill('45')
  await expect(control.getByText('45:00', { exact: true })).toBeVisible()
  await nav.getByRole('button', { name: /声音与演出/ }).click()
  await dirty.getByRole('button', { name: '保存并离开' }).click()
  await expect(control.getByRole('heading', { name: '声音', exact: true })).toBeVisible()
  const saved = await snapshot(pet)
  expect(
    saved.presets.find((preset) => preset.id === saved.preferences.selectedPresetId),
  ).toMatchObject({
    name: '课长预设测试',
    mode: 'classroom',
    classroomSeconds: 2700,
  })
  await time.click()
  await control.getByRole('button', { name: '恢复本页默认' }).click()
  await dirty.getByRole('button', { name: '恢复默认', exact: true }).click()
  await expect
    .poll(async () => (await snapshot(pet)).preferences.selectedPresetId)
    .not.toBe(saved.preferences.selectedPresetId)
  expect((await snapshot(pet)).presets).toContainEqual(
    expect.objectContaining({ name: '课长预设测试' }),
  )

  await nav.getByRole('button', { name: /声音与演出/ }).click()
  await expect(control.getByRole('button', { name: '未配置' })).toBeDisabled()
  await control.getByRole('combobox', { name: '演出强度' }).selectOption('high')
  const volume = control.getByRole('slider', { name: '提示与战斗音效' })
  await volume.focus()
  await control.keyboard.press('End')
  await control.getByRole('switch', { name: '安静模式' }).click()
  await expect
    .poll(async () => (await snapshot(pet)).preferences)
    .toMatchObject({ quietMode: true, intensity: 'high', sfxVolume: 100 })
  await control.getByRole('switch', { name: '安静模式' }).click()
  await expect
    .poll(async () => (await snapshot(pet)).preferences)
    .toMatchObject({ quietMode: false, intensity: 'high', sfxVolume: 100 })
  await control.getByRole('button', { name: '预览', exact: true }).click()
  await expect(pet.getByText('夜雨将至', { exact: true })).toBeVisible()
  const hasRain = () =>
    pet.locator('.rain-canvas').evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d')!
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 0) return true
      return false
    })
  await expect.poll(hasRain).toBe(true)
  await control.getByRole('switch', { name: '安静模式' }).click()
  await expect.poll(hasRain).toBe(false)
  await control.getByRole('switch', { name: '安静模式' }).click()
  expect((await snapshot(pet)).session).toBeNull()
  await screenshot(control, info, 'sound-settings')

  await nav.getByRole('button', { name: /操作与运行/ }).click()
  await expect(control.getByRole('switch', { name: '锁屏后暂停' })).toBeChecked()
  await expect(control.getByRole('textbox', { name: '打开设置快捷键' })).toBeVisible()
  if (process.platform === 'linux') {
    await control.getByRole('switch', { name: '开机启动' }).click()
    await expect(control.getByRole('alert')).toContainText(/不支持/)
    await expect(control.getByRole('switch', { name: '开机启动' })).not.toBeChecked()
  }
})

test('从界面保存 11 秒预设，无操作自动成功，结算横幅释放且可重看', async ({ launchApp }, info) => {
  test.setTimeout(55_000)
  const app = await launchApp()
  const pet = await view(app, 'pet')
  const control = await view(app, 'control')
  await control.getByRole('button', { name: /渡夜节奏/ }).click()
  await control.getByRole('button', { name: /自定义/ }).click()
  await control.getByRole('textbox', { name: '预设名称' }).fill('11 秒自动化流程')
  const phases = control.getByRole('spinbutton')
  await expect(phases).toHaveCount(11)
  for (const field of await phases.all()) await field.fill('1')
  await expect(control.getByText('00:11', { exact: true })).toBeVisible()
  await control.getByRole('button', { name: '保存节奏' }).click()
  await expect(
    control.getByRole('combobox', { name: '当前预设' }).locator('option:checked'),
  ).toHaveText('11 秒自动化流程')
  await control.getByRole('button', { name: /声音与演出/ }).click()
  await control.getByRole('combobox', { name: '结算位置' }).selectOption('center')
  await expect
    .poll(async () => (await snapshot(control)).preferences.victoryPosition)
    .toBe('center')
  await control.getByRole('button', { name: /出击准备/ }).click()

  const errors: string[] = []
  pet.on('pageerror', (error) => errors.push(error.message))
  await startFromControl(control, control.getByRole('button', { name: '出击', exact: true }))
  await expect(pet.getByRole('progressbar', { name: '整局进度' })).toBeVisible()
  await expect(pet.getByRole('button', { name: '释放绝招' })).toBeVisible()
  await screenshot(pet, info, 'battle')

  const finished = await sessionAt(pet, 'completed', 13_000)
  const overlay = await view(app, 'overlay')
  const victory = overlay.getByText('NIGHTLORD SLAIN', { exact: true })
  await expect(victory).toBeVisible()
  const centerOffset = await victory.evaluate((element) => {
    const text = document.createRange()
    text.selectNodeContents(element)
    const bounds = text.getBoundingClientRect()
    return Math.abs(bounds.y + bounds.height / 2 - innerHeight / 2)
  })
  expect(centerOffset).toBeLessThanOrEqual(7)
  expect(
    await overlay.evaluate(() => [
      getComputedStyle(document.documentElement).backgroundColor,
      getComputedStyle(document.body).backgroundColor,
    ]),
  ).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'])
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().includes('view=overlay'))
        ?.isFocusable(),
    ),
  ).toBe(false)
  await screenshot(overlay, info, 'victory')
  expect(finished).toMatchObject({ elapsedMs: 11_000, usedUltimates: [] })
  expect(errors).toEqual([])
  await overlay.waitForEvent('close', { timeout: 7000 })
  expect(app.windows()).toHaveLength(1)

  const result = await openControl(app, pet)
  await expect(result.getByText('渡夜成功', { exact: true })).toBeVisible()
  await expect(result.getByText(/本次用时 00:11/)).toBeVisible()
  await Promise.all([
    result.waitForEvent('close'),
    result.getByRole('button', { name: '收起结算', exact: true }).click(),
  ])
  expect((await snapshot(pet)).session?.id).toBe(finished.id)
  const again = await openControl(app, pet)
  await startFromControl(again, again.getByRole('button', { name: '再次出击', exact: true }))
  expect((await sessionAt(pet, 'running')).id).not.toBe(finished.id)
})

test('缩圈倒计时有明确含义，圈内探索保持已收紧的光环', async ({ launchApp }) => {
  const app = await launchApp()
  const pet = await view(app, 'pet')
  const control = await view(app, 'control')
  const input = shortPreset({ customSeconds: [4, 3, 3, 3, 1, 4, 1, 1, 1, 1, 1] })
  await command(control, { type: 'savePreset', preset: input })
  const scale = () =>
    pet
      .locator('.pet-halo')
      .evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a)
  // Capture the full-size baseline before the clock starts moving the ring.
  const full = await scale()
  expect(full).toBe(1)
  await startFromControl(control, control.getByRole('button', { name: '出击', exact: true }))
  await expect(pet.locator('.pet-status').getByText('第一天探索', { exact: true })).toBeVisible()
  await expect(
    pet.locator('.pet-status').getByText('第一天第一次缩圈', { exact: true }),
  ).toBeVisible()
  await expect.poll(scale).toBeLessThan(full - 0.05)
  await expect(
    pet.locator('.pet-status').getByText('第一天圈内探索', { exact: true }),
  ).toBeVisible()
  const inner = await scale()
  expect(inner).toBeLessThan(full - 0.15)
  await expect(
    pet.locator('.pet-status').getByText('第一天第二次缩圈', { exact: true }),
  ).toBeVisible()
  expect(await scale()).toBeLessThanOrEqual(inner + 0.01)
  await expect(pet.locator('.pet-status').getByText('第二天探索', { exact: true })).toBeVisible()
  expect(await scale()).toBeCloseTo(full)
})

test('实停 61 秒冻结用时和血条，隐藏和关窗仍计时，下局应用新预设', async ({ launchApp }, info) => {
  test.setTimeout(120_000)
  const app = await launchApp()
  const pet = await view(app, 'pet')
  let control = await view(app, 'control')
  const input = shortPreset({ customSeconds: [1, 1, 1, 1, 30, 1, 1, 1, 1, 1, 1] })
  await command(control, { type: 'savePreset', preset: input })
  await startFromControl(control, control.getByRole('button', { name: '出击', exact: true }))
  await pet.getByRole('button', { name: '释放绝招' }).click()
  await expect.poll(async () => (await snapshot(pet)).session?.usedUltimates.length).toBe(1)
  const first = await sessionAt(pet, 'running')
  expect(first.usedUltimates).toEqual([first.timeline.phases[4].id])

  control = await openControl(app, pet)
  await control.getByRole('button', { name: '暂停渡夜' }).click()
  const paused = await sessionAt(pet, 'paused')
  const bar = pet.locator('.boss-health i')
  await expect(pet.getByRole('button', { name: /已暂停/ })).toBeVisible()
  await expect(bar).toBeVisible()
  const progress = await bar.getAttribute('style')
  await command(control, {
    type: 'savePreset',
    preset: { ...input, customSeconds: Array<number>(11).fill(1) },
  })
  const wallStart = performance.now()
  await delay(61_000)
  const actualPausedMs = performance.now() - wallStart
  expect(actualPausedMs).toBeGreaterThanOrEqual(60_000)
  await expect.poll(async () => (await snapshot(pet)).session).toEqual(paused)
  expect(await bar.getAttribute('style')).toBe(progress)
  await expect(pet.getByRole('button', { name: '释放绝招' })).toHaveCount(0)
  await writeFile(
    info.outputPath('pause-observation.json'),
    JSON.stringify({ actualPausedMs, elapsedMs: paused.elapsedMs, health: progress }, null, 2),
  )

  await control.getByRole('button', { name: '继续渡夜' }).click()
  await command(control, { type: 'visibility', visible: false })
  await control.close()
  await expect
    .poll(async () => (await snapshot(pet)).session?.elapsedMs ?? 0)
    .toBeGreaterThan(paused.elapsedMs + 700)
  expect((await snapshot(pet)).session?.timeline.durationMs).toBe(40_000)
  expect((await snapshot(pet)).petVisible).toBe(false)

  control = await openControl(app, pet)
  await control.getByRole('button', { name: '结束本次' }).click()
  await control.getByRole('dialog').getByRole('button', { name: '取消' }).click()
  expect((await snapshot(pet)).session?.id).toBe(first.id)
  await control.getByRole('button', { name: '结束本次' }).click()
  await control.getByRole('dialog').getByRole('button', { name: '结束渡夜' }).click()
  await expect.poll(async () => (await snapshot(pet)).session).toBeNull()
  await expect(pet.getByText('NIGHTLORD SLAIN', { exact: true })).toHaveCount(0)
  await startFromControl(control, control.getByRole('button', { name: '出击', exact: true }))
  expect((await sessionAt(pet, 'running')).timeline.durationMs).toBe(11_000)
})

test('强杀后暂停恢复，保存过的绝招与设置保留，可放弃本次', async ({ launchApp }) => {
  test.skip(process.platform === 'win32', '该用例以 Unix SIGKILL 模拟强制停止')
  let app = await launchApp()
  let pet = await view(app, 'pet')
  const control = await view(app, 'control')
  await command(control, {
    type: 'savePreset',
    preset: shortPreset({ customSeconds: [1, 1, 1, 1, 30, 1, 1, 1, 1, 1, 1] }),
  })
  await preferences(control, { scale: 150, sfxVolume: 65, statusBar: 'detailed' })
  await startFromControl(control, control.getByRole('button', { name: '出击', exact: true }))
  await pet.getByRole('button', { name: '释放绝招' }).click()
  await expect.poll(async () => (await snapshot(pet)).session?.usedUltimates.length).toBe(1)
  const before = await sessionAt(pet, 'running')
  expect(before.usedUltimates).toHaveLength(1)

  const child = app.process()
  const exit = once(child, 'exit')
  expect(child.kill('SIGKILL')).toBe(true)
  await exit

  app = await launchApp()
  pet = await view(app, 'pet')
  const restored = await view(app, 'control')
  const saved = await sessionAt(pet, 'paused')
  expect(saved.id).toBe(before.id)
  expect(saved.usedUltimates).toEqual(before.usedUltimates)
  expect(before.elapsedMs - saved.elapsedMs).toBeLessThanOrEqual(5000)
  expect(saved.elapsedMs).toBeLessThanOrEqual(before.elapsedMs + 500)
  expect((await snapshot(pet)).preferences).toMatchObject({
    scale: 150,
    sfxVolume: 65,
    statusBar: 'detailed',
  })
  await expect(restored.getByRole('button', { name: '继续渡夜' })).toBeVisible()
  await expect.poll(async () => (await snapshot(pet)).session?.elapsedMs).toBe(saved.elapsedMs)

  await restored.getByRole('button', { name: '继续渡夜' }).click()
  await sessionAt(pet, 'running')
  await expect(pet.getByRole('button', { name: '释放绝招' })).toHaveCount(0)
  await expect(
    command(pet, { type: 'ultimate', sessionId: saved.id, phaseId: saved.usedUltimates[0] }),
  ).rejects.toThrow(/已发动/)
  await restored.getByRole('button', { name: '结束本次' }).click()
  await restored.getByRole('dialog').getByRole('button', { name: '结束渡夜' }).click()
  await expect.poll(async () => (await snapshot(pet)).session).toBeNull()
})

test('取消退出保留会话，确认退出保存后下次启动时暂停', async ({ launchApp }) => {
  let app = await launchApp()
  let pet = await view(app, 'pet')
  let control = await view(app, 'control')
  await startFromControl(control, control.getByRole('button', { name: '出击', exact: true }))
  const before = await sessionAt(pet, 'running')
  control = await openControl(app, pet)

  await app.evaluate(({ dialog }) => {
    const qa = { response: 0, messages: [] as string[] }
    Reflect.set(globalThis, 'qaQuitDialog', qa)
    dialog.showMessageBox = async (...args: unknown[]) => {
      const options = args.at(-1) as Electron.MessageBoxOptions
      qa.messages.push(options.message)
      return { response: qa.response, checkboxChecked: false }
    }
  })
  await command(control, { type: 'quit' })
  await expect
    .poll(() => app.evaluate(() => Reflect.get(globalThis, 'qaQuitDialog').messages))
    .toEqual(['当前渡夜将保存，下次可继续。'])
  expect((await sessionAt(pet, 'running')).id).toBe(before.id)

  await app.evaluate(() => {
    Reflect.get(globalThis, 'qaQuitDialog').response = 1
  })
  const exit = once(app.process(), 'exit')
  const requesting = command(control, { type: 'quit' }).catch((error: unknown) => {
    if (!control.isClosed()) throw error
  })
  await exit
  await requesting

  app = await launchApp()
  pet = await view(app, 'pet')
  const restored = await sessionAt(pet, 'paused')
  expect(restored.id).toBe(before.id)
  expect(restored.elapsedMs).toBeGreaterThanOrEqual(before.elapsedMs)
  await expect((await view(app, 'control')).getByRole('button', { name: '继续渡夜' })).toBeEnabled()
})

test('控制窗口连续打开关闭 20 次，每次销毁旧窗口和 WebContents', async ({ launchApp }, info) => {
  test.setTimeout(80_000)
  const app = await launchApp()
  const pet = await view(app, 'pet')
  const initial = await view(app, 'control')
  await initial.close()

  async function currentWindows() {
    return app.evaluate(({ BrowserWindow, webContents }) => ({
      windows: BrowserWindow.getAllWindows().map((win) => ({
        id: win.id,
        contents: win.webContents.id,
      })),
      contents: webContents
        .getAllWebContents()
        .filter((item) => !item.isDestroyed())
        .map((item) => item.id),
    }))
  }

  await expect.poll(async () => (await currentWindows()).windows.length).toBe(1)
  const baseline = await currentWindows()
  const controlContents: number[] = []
  for (let round = 0; round < 20; round += 1) {
    const control = await openControl(app, pet)
    await expect(control.getByRole('button', { name: '出击', exact: true })).toBeEnabled()
    const opened = await currentWindows()
    const extra = opened.contents.filter((id) => !baseline.contents.includes(id))
    expect(opened.windows).toHaveLength(2)
    expect(extra).toHaveLength(1)
    controlContents.push(extra[0])
    await control.close()
    await expect.poll(currentWindows).toEqual(baseline)
  }
  expect(new Set(controlContents).size).toBe(20)
  expect(baseline.windows).toHaveLength(1)
  expect((await snapshot(pet)).session).toBeNull()
  await writeFile(
    info.outputPath('reclaimed-windows.json'),
    JSON.stringify({ baseline, controlContents }, null, 2),
  )
})

test('控制渲染器崩溃后继续计时，桌宠渲染器崩溃后重建并暂停', async ({ launchApp }) => {
  const app = await launchApp()
  let pet = await view(app, 'pet')
  let control = await view(app, 'control')
  await startFromControl(control, control.getByRole('button', { name: '出击', exact: true }))
  await sessionAt(pet, 'running')
  control = await openControl(app, pet)

  async function crash(name: 'control' | 'pet', page: Page) {
    await Promise.all([
      page.waitForEvent('crash'),
      app.evaluate(({ BrowserWindow }, name) => {
        const win = BrowserWindow.getAllWindows().find((item) =>
          item.webContents.getURL().includes(`view=${name}`),
        )
        if (!win) throw new Error(`缺少 ${name} 窗口`)
        win.webContents.forcefullyCrashRenderer()
      }, name),
    ])
    await expect.poll(() => page.isClosed()).toBe(true)
  }

  const before = await sessionAt(pet, 'running')
  await crash('control', control)
  expect((await sessionAt(pet, 'running')).elapsedMs).toBeGreaterThan(before.elapsedMs)
  control = await openControl(app, pet)
  await expect(control.getByRole('button', { name: '暂停渡夜' })).toBeEnabled()

  await crash('pet', pet)
  pet = await view(app, 'pet')
  const after = await sessionAt(pet, 'paused')
  expect(after.id).toBe(before.id)
  expect(after.elapsedMs).toBeGreaterThanOrEqual(before.elapsedMs)
  await expect(control.getByRole('button', { name: '继续渡夜' })).toBeEnabled()
  await expect.poll(async () => (await snapshot(pet)).session?.elapsedMs).toBe(after.elapsedMs)
})

test('桌面设置保存失败回退实际窗口状态，用户修复后可重试', async ({ launchApp }) => {
  const app = await launchApp()
  const pet = await view(app, 'pet')
  const control = await view(app, 'control')
  await preferences(control, { scale: 125 })
  const profile = await app.evaluate(({ app: main }) => main.getPath('userData'))
  const formal = join(profile, 'preferences.json')
  const original = await readFile(formal, 'utf8')
  const backup = join(profile, 'preferences.json.bak')
  await mkdir(backup)

  await control.getByRole('button', { name: '小蜗与桌面', exact: true }).click()
  const toggle = control.getByRole('switch', { name: '窗口置顶' })
  await expect(toggle).toBeChecked()
  await toggle.click()
  await expect(control.getByRole('alert')).toContainText(/保存/)
  expect((await snapshot(pet)).preferences.alwaysOnTop).toBe(true)
  const onTop = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((item) => item.webContents.getURL().includes('view=pet'))
        ?.isAlwaysOnTop(),
    )
  await expect.poll(onTop).toBe(true)
  expect(await readFile(formal, 'utf8')).toBe(original)

  await rm(backup, { recursive: true })
  await toggle.click()
  await expect(toggle).not.toBeChecked()
  await expect.poll(onTop).toBe(false)
  await expect(control.getByRole('alert')).toHaveCount(0)
})

test('启动时损坏设置提示可以关闭，正式设置可重新保存', async ({ launchApp }) => {
  let app = await launchApp()
  await view(app, 'control')
  const profile = await app.evaluate(({ app: main }) => main.getPath('userData'))
  const exit = once(app.process(), 'exit')
  await app.evaluate(({ app: main }) => main.exit(0)).catch(() => {})
  await exit
  const file = join(profile, 'preferences.json')
  await writeFile(file, '{"schemaVersion":1,"data":')

  app = await launchApp()
  const control = await view(app, 'control')
  await expect(control.getByRole('alert')).toContainText(/原文件已保留/)
  await control.getByRole('button', { name: '关闭错误提示' }).click()
  await expect(control.getByRole('alert')).toHaveCount(0)
  const saved = await preferences(control, { muted: true })
  expect(saved.preferences.muted).toBe(true)
  await expect(control.getByRole('alert')).toHaveCount(0)
  expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
    schemaVersion: 1,
    data: { muted: true },
  })
})
