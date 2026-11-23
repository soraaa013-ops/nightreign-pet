import { _electron as electron, expect } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

const executable = resolve(
  process.argv[2] ??
    process.env.NIGHTREIGN_PACKAGED_EXECUTABLE ??
    'release/linux-unpacked/nightreign-pet',
)
const output = resolve(process.env.NIGHTREIGN_PACKAGED_REPORT ?? 'test-results/packaged-smoke.json')

const profile = await mkdtemp(join(tmpdir(), 'nightreign-packaged-'))
const result = {
  executable,
  platform: process.platform,
  architecture: process.arch,
  remoteRequests: [],
  pass: false,
}
let app
async function launchPackaged() {
  const launched = await electron.launch({
    executablePath: executable,
    chromiumSandbox: process.env.NIGHTREIGN_CHROMIUM_NO_SANDBOX !== '1',
    args: [
      `--user-data-dir=${profile}`,
      ...(process.env.NIGHTREIGN_TEST_SOFTWARE_WEBGL === '1'
        ? ['--enable-unsafe-swiftshader']
        : []),
    ],
    timeout: 60_000,
    env: { ...process.env },
  })
  await launched.context().route(/^https?:\/\//, async (route) => {
    result.remoteRequests.push(route.request().url())
    await route.abort()
  })
  return launched
}
async function stopPackaged() {
  if (!app) return
  const closed = app.waitForEvent('close', { timeout: 10_000 })
  await app.evaluate(({ app: main }) => main.exit(0)).catch(() => {})
  await closed
  app = undefined
}
async function consentPage() {
  let consent
  await expect
    .poll(
      () => {
        consent = app.windows().find((page) => page.url().includes('view=consent'))
        return Boolean(consent)
      },
      { timeout: 20_000 },
    )
    .toBe(true)
  await expect(consent.getByRole('button', { name: '同意并进入', exact: true })).toBeVisible()
  expect(
    app.windows().filter((page) => /view=(pet|control|overlay)/.test(page.url())),
  ).toHaveLength(0)
  return consent
}
try {
  app = await launchPackaged()
  result.environment = await app.evaluate(({ app: main }) => ({
    packaged: main.isPackaged,
    userData: main.getPath('userData'),
    version: main.getVersion(),
    platform: process.platform,
    architecture: process.arch,
    electron: process.versions.electron,
    chromiumSandbox: !main.commandLine.hasSwitch('no-sandbox'),
    softwareWebGL: main.commandLine.hasSwitch('enable-unsafe-swiftshader'),
  }))
  expect(result.environment.packaged).toBe(true)
  expect(result.environment.platform).toBe(process.platform)
  expect(result.environment.architecture).toBe(process.env.NIGHTREIGN_EXPECTED_ARCH ?? process.arch)
  // macOS /var aliases /private/var; compare filesystem identities, not spellings.
  const [canonicalProfile, canonicalUserData] = await Promise.all([
    realpath(profile),
    realpath(result.environment.userData),
  ])
  result.profileIsolation = { requested: profile, canonicalProfile, canonicalUserData }
  const dataLocation = relative(canonicalProfile, canonicalUserData)
  expect(
    isAbsolute(dataLocation) ||
      dataLocation === '..' ||
      dataLocation.startsWith('../') ||
      dataLocation.startsWith('..\\'),
  ).toBe(false)

  const firstConsent = await consentPage()
  const declined = app.waitForEvent('close', { timeout: 10_000 })
  await firstConsent
    .getByRole('button', { name: '退出', exact: true })
    .click()
    .catch((error) => {
      if (!firstConsent.isClosed()) throw error
    })
  await declined
  app = await launchPackaged()
  const consent = await consentPage()
  await consent
    .getByRole('button', { name: '同意并进入', exact: true })
    .click()
    .catch((error) => {
      if (!consent.isClosed()) throw error
    })
  await expect.poll(() => consent.isClosed(), { timeout: 10_000 }).toBe(true)
  result.consent = {
    declinedWithoutStarting: true,
    acceptedThroughUI: true,
    rememberedOnRestart: false,
  }

  let control
  let pet
  await expect
    .poll(
      () => {
        control = app.windows().find((page) => page.url().includes('view=control'))
        pet = app.windows().find((page) => page.url().includes('view=pet'))
        return Boolean(control && pet)
      },
      { timeout: 20_000 },
    )
    .toBe(true)

  await expect(pet.locator('.pet-model')).toBeVisible()
  result.environment.gpuFeatures = await app.evaluate(({ app: main }) => main.getGPUFeatureStatus())
  const portraitOnly =
    process.platform === 'darwin' &&
    process.arch === 'x64' &&
    !result.environment.softwareWebGL &&
    result.environment.gpuFeatures.webgl === 'disabled_off'
  if (portraitOnly) {
    await expect(pet.locator('.concept-label')).toHaveAttribute('title', '无法初始化 WebGL 2。', {
      timeout: 45_000,
    })
    const portrait = pet.getByRole('img', { name: '复仇者小蜗同人立绘预览' })
    await expect(portrait).toBeVisible()
    await expect.poll(() => portrait.evaluate((img) => img.naturalWidth)).toBeGreaterThan(100)
  } else {
    await expect(pet.locator('.pet-concept')).toHaveCount(0, { timeout: 45_000 })
  }
  result.character = await pet.evaluate(async () => {
    const manifestUrl = new URL('app://assets/character/revenant/manifest.json')
    const manifest = await (await fetch(manifestUrl)).json()
    if (manifest.status !== 'available') throw new Error('随包角色缺失')
    const modelUrl = new URL(manifest.model, manifestUrl)
    const { FileReferences } = await (await fetch(modelUrl)).json()
    const files = [
      FileReferences.Moc,
      ...FileReferences.Textures,
      ...Object.values(FileReferences.Motions ?? {})
        .flat()
        .map((motion) => motion.File),
      ...(FileReferences.Expressions ?? []).map((expression) => expression.File),
      FileReferences.Physics,
      FileReferences.Pose,
    ].filter(Boolean)
    const resources = []
    for (const file of new Set(files)) {
      const response = await fetch(new URL(file, modelUrl))
      if (!response.ok) throw new Error(`资源读取失败：${file} (${response.status})`)
      const bytes = (await response.arrayBuffer()).byteLength
      if (!bytes) throw new Error(`资源为空：${file}`)
      resources.push({ file, bytes })
    }
    const moc = await (await fetch(new URL(FileReferences.Moc, modelUrl))).arrayBuffer()
    const core = window.Live2DCubismCore
    const gl = document.querySelector('.pet-model').getContext('webgl2')
    const debug = gl?.getExtension('WEBGL_debug_renderer_info')
    return {
      model: manifest.model,
      bytes: moc.byteLength,
      consistency: core.Moc.prototype.hasMocConsistency(moc),
      textures: FileReferences.Textures,
      resources,
      canvas: Boolean(gl),
      renderer: gl?.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
    }
  })
  expect(result.character.consistency).toBe(1)
  expect(result.character.canvas).toBe(!portraitOnly)
  expect(result.character.textures.length).toBeGreaterThan(0)

  if (process.platform === 'darwin') {
    const windowState = () =>
      app.evaluate(({ BrowserWindow, screen }) => {
        const win = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().includes('view=pet'),
        )
        const bounds = win.getBounds()
        const area = screen.getDisplayMatching(bounds).workArea
        return {
          visible: win.isVisible(),
          onScreen:
            bounds.x >= area.x &&
            bounds.y >= area.y &&
            bounds.x + bounds.width <= area.x + area.width &&
            bounds.y + bounds.height <= area.y + area.height,
          allSpaces: win.isVisibleOnAllWorkspaces(),
          id: win.getMediaSourceId().split(':')[1],
        }
      })
    const shown = { visible: true, onScreen: true, allSpaces: true }
    await expect.poll(windowState).toMatchObject(shown)
    await control.evaluate(() => window.nightreign.command({ type: 'visibility', visible: false }))
    await expect.poll(windowState).toMatchObject({ visible: false })
    await control.getByRole('button', { name: '找回小蜗', exact: true }).click()
    await expect.poll(windowState).toMatchObject(shown)

    // Only the model paints the center of the idle transparent window.
    const bodyPixels = () =>
      app.evaluate(async ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find((w) =>
          w.webContents.getURL().includes('view=pet'),
        )
        const { width, height } = win.getContentBounds()
        const crop = await win.webContents.capturePage({
          x: Math.floor(width * 0.42),
          y: Math.floor(height * 0.4),
          width: Math.floor(width * 0.16),
          height: Math.floor(height * 0.22),
        })
        const pixels = crop.toBitmap()
        let painted = 0
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i + 3] > 128 && Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 96)
            painted++
        return pixels.length ? (4 * painted) / pixels.length : 0
      })
    await expect.poll(bodyPixels, { timeout: 12_000 }).toBeGreaterThan(0.15)
    const state = await windowState()
    const probe = join(profile, 'probe')
    const swift = fileURLToPath(new URL('./mac-pet-visibility.swift', import.meta.url))
    await promisify(execFile)('/usr/bin/swiftc', [swift, '-o', probe])
    const { stdout } = await promisify(execFile)(probe, [state.id], { timeout: 30_000 })
    expect(stdout.trim()).toBe('visible-above-fullscreen')
    result.macVisibility = {
      ...state,
      paintedBodyFraction: await bodyPixels(),
      foregroundProbe: stdout.trim(),
    }
  }

  await control.evaluate(() =>
    window.nightreign.command({
      type: 'savePreset',
      preset: {
        id: 'packaged-smoke',
        name: '打包验证',
        mode: 'custom',
        customSeconds: [1, 1, 1, 1, 8, 1, 1, 1, 1, 1, 1],
        battleSeconds: [180, 240, 300],
        classroomSeconds: 2400,
      },
    }),
  )
  const events = []
  await pet.exposeFunction('recordPackagedSmokeEvent', (event) =>
    events.push({ ...event, observedMs: performance.now() }),
  )
  await pet.evaluate(() => window.nightreign.onPresentation(window.recordPackagedSmokeEvent))

  const start = control.getByRole('button', { name: '出击', exact: true })
  await expect(start).toBeEnabled()
  await Promise.all([
    control.waitForEvent('close'),
    start.click().catch((error) => {
      if (!control.isClosed()) throw error
    }),
  ])

  await expect(pet.getByRole('progressbar', { name: '战斗进度' })).toBeVisible({ timeout: 12_000 })
  const modelBounds = await pet.locator('.pet-model').boundingBox()
  await pet.mouse.dblclick(
    modelBounds.x + modelBounds.width / 2,
    modelBounds.y + modelBounds.height / 2,
  )
  await pet.mouse.dblclick(
    modelBounds.x + modelBounds.width / 2,
    modelBounds.y + modelBounds.height / 2,
  )
  await expect.poll(() => events.filter((event) => event.kind === 'ultimate').length).toBe(2)
  await expect
    .poll(() => events.find((event) => event.kind === 'victory'), { timeout: 25_000 })
    .toBeDefined()
  result.completed = await pet.evaluate(async () => (await window.nightreign.getSnapshot()).session)
  expect(result.completed).toMatchObject({
    status: 'completed',
    elapsedMs: 18_000,
    usedUltimates: [],
  })
  await expect(pet.getByText('NIGHTLORD SLAIN', { exact: true })).toBeVisible()
  const phases = events.filter((event) => event.kind === 'phase')
  const victories = events.filter((event) => event.kind === 'victory')
  expect(phases).toHaveLength(11)
  expect(victories).toHaveLength(1)
  expect(victories[0].label).toBe('NIGHTLORD SLAIN')
  result.observedDurationMs = victories[0].observedMs - phases[0].observedMs
  expect(Math.abs(result.observedDurationMs - 18_000)).toBeLessThanOrEqual(1000)
  result.victoryCount = victories.length
  expect(result.remoteRequests).toEqual([])
  await mkdir(dirname(output), { recursive: true })
  await pet.screenshot({
    path: output.replace(/\.json$/, '') + '-victory.png',
    omitBackground: true,
  })
  await stopPackaged()
  app = await launchPackaged()
  await expect
    .poll(() => app.windows().some((page) => page.url().includes('view=pet')), { timeout: 20_000 })
    .toBe(true)
  expect(app.windows().filter((page) => page.url().includes('view=consent'))).toHaveLength(0)
  result.consent.rememberedOnRestart = true
  expect(result.remoteRequests).toEqual([])
  result.pass = true
  console.info(
    `打包冒烟通过。11 个阶段、1 次结算，观测 ${result.observedDurationMs.toFixed(1)} 毫秒。`,
  )
} catch (error) {
  const pet = app?.windows().find((page) => page.url().includes('view=pet'))
  if (pet && !pet.isClosed()) {
    result.modelStatus = await pet
      .locator('.concept-label')
      .getAttribute('title', { timeout: 1000 })
      .catch(() => undefined)
    if (result.modelStatus) console.error('角色加载状态', result.modelStatus)
  }
  result.failure = String(error)
  throw error
} finally {
  await stopPackaged().catch((error) => {
    result.cleanupFailure = String(error)
  })
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(result, null, 2))
}
