import { _electron as electron, expect } from '@playwright/test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  const dataLocation = relative(profile, result.environment.userData)
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
  await expect(pet.locator('.pet-concept')).toHaveCount(0, { timeout: 20_000 })
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
  expect(result.character.canvas).toBe(true)
  expect(result.character.textures.length).toBeGreaterThan(0)

  await control.evaluate(() =>
    window.nightreign.command({
      type: 'savePreset',
      preset: {
        id: 'packaged-smoke',
        name: '打包验证',
        mode: 'custom',
        customSeconds: Array(11).fill(1),
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

  await expect
    .poll(() => events.find((event) => event.kind === 'victory'), { timeout: 25_000 })
    .toBeDefined()
  result.completed = await pet.evaluate(async () => (await window.nightreign.getSnapshot()).session)
  expect(result.completed).toMatchObject({
    status: 'completed',
    elapsedMs: 11_000,
    usedUltimates: [],
  })
  await expect(pet.getByText('NIGHTLORD SLAIN', { exact: true })).toBeVisible()
  const phases = events.filter((event) => event.kind === 'phase')
  const victories = events.filter((event) => event.kind === 'victory')
  expect(phases).toHaveLength(11)
  expect(victories).toHaveLength(1)
  expect(victories[0].label).toBe('NIGHTLORD SLAIN')
  result.observedDurationMs = victories[0].observedMs - phases[0].observedMs
  expect(Math.abs(result.observedDurationMs - 11_000)).toBeLessThanOrEqual(1000)
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
