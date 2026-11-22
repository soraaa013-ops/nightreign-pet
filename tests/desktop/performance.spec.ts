import { mkdir, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, totalmem } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import type { ElectronApplication } from '@playwright/test'
import type { ProcessMetric } from 'electron'
import { shortPreset } from '../fixtures'
import { command, expect, snapshot, startFromControl, test, view } from './app'

type Sample = { observedMs: number; metrics: ProcessMetric[] }
type Scenario = 'idle' | 'exploration' | 'high-effects' | 'hidden'

async function sampleMetrics(app: ElectronApplication): Promise<ProcessMetric[]> {
  return app.evaluate(({ app: main }) => main.getAppMetrics())
}

function describeSamples(samples: Sample[]) {
  const cpu = samples.map(({ metrics }) =>
    metrics.reduce((sum, proc) => sum + proc.cpu.percentCPUUsage, 0),
  )
  const rss = samples.map(
    ({ metrics }) => metrics.reduce((sum, proc) => sum + proc.memory.workingSetSize, 0) / 1024,
  )
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  return {
    count: samples.length,
    cpuMean: mean(cpu),
    cpuMax: Math.max(...cpu),
    rssMeanMiB: mean(rss),
    rssMaxMiB: Math.max(...rss),
  }
}

test('采样待命、探索、强演出和隐藏的 Electron CPU 与 RSS', async ({ launchApp }, info) => {
  test.skip(
    process.env.NIGHTREIGN_PERF_TEST !== '1',
    '设置 NIGHTREIGN_PERF_TEST=1 执行每态 90 秒性能采样',
  )
  test.setTimeout(9 * 60_000)

  const app = await launchApp()
  const pet = await view(app, 'pet')
  const control = await view(app, 'control')
  const warnings: string[] = []
  pet.on('pageerror', (error) => warnings.push(error.message))
  const desktop = await app.evaluate(({ app: main, screen }) => ({
    version: main.getVersion(),
    versions: process.versions,
    gpu: main.getGPUFeatureStatus(),
    display: {
      bounds: screen.getPrimaryDisplay().bounds,
      scaleFactor: screen.getPrimaryDisplay().scaleFactor,
    },
    chromiumSandbox: !main.commandLine.hasSwitch('no-sandbox'),
  }))
  const manifest = await pet.evaluate(async () =>
    (await fetch('app://assets/character/revenant/manifest.json')).json(),
  )
  await expect(pet.locator('.pet-model')).toBeVisible()
  if (manifest.status === 'available')
    await expect(pet.locator('.pet-concept')).toHaveCount(0, { timeout: 20_000 })
  const character = await pet.evaluate(() => {
    if (document.querySelector('.pet-concept')) return null
    const canvas = document.querySelector<HTMLCanvasElement>('.pet-model')!
    const gl = canvas.getContext('webgl2')!
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    return {
      renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
      width: canvas.width,
      height: canvas.height,
    }
  })
  const evidence = {
    system: {
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      logicalCpu: cpus().length,
      ramBytes: totalmem(),
    },
    desktop,
    manifest,
    character,
    warmupSeconds: 30,
    sampleIntervalSeconds: 1,
    samplesPerScenario: 60,
    scenarios: {} as Partial<
      Record<Scenario, { samples: Sample[]; summary?: ReturnType<typeof describeSamples> }>
    >,
    warnings,
  }
  await mkdir(info.outputDir, { recursive: true })
  const record = () => writeFile(info.outputPath('metrics.json'), JSON.stringify(evidence, null, 2))

  async function scenario(name: Scenario) {
    const samples: Sample[] = []
    const current: (typeof evidence.scenarios)[Scenario] = { samples }
    evidence.scenarios[name] = current
    console.info(`[性能采样] ${name} 预热 30 秒，随后采样 60 秒`)
    await delay(30_000)
    await sampleMetrics(app)
    const start = performance.now()
    for (let index = 1; index <= 60; index += 1) {
      await delay(Math.max(0, start + index * 1000 - performance.now()))
      samples.push({ observedMs: performance.now() - start, metrics: await sampleMetrics(app) })
    }
    current.summary = describeSamples(samples)
    await record()
    console.info(`[性能采样] ${name} ${JSON.stringify(current.summary)}`)
  }

  try {
    await control.close()
    await scenario('idle')
    expect((await snapshot(pet)).session).toBeNull()

    await command(pet, { type: 'openControl', page: 'prepare' })
    let settings = await view(app, 'control')
    await command(settings, {
      type: 'savePreset',
      preset: shortPreset({ customSeconds: [100, 210, 1, 1, 1, 1, 1, 1, 1, 1, 1] }),
    })
    await startFromControl(settings, settings.getByRole('button', { name: '出击', exact: true }))
    await scenario('exploration')
    expect((await snapshot(pet)).session?.elapsedMs).toBeLessThan(100_000)

    await command(pet, { type: 'openControl', page: 'settings' })
    settings = await view(app, 'control')
    const current = await snapshot(settings)
    await command(settings, {
      type: 'preferences',
      expectedRevision: current.preferences.revision,
      patch: { intensity: 'high' },
    })
    await settings.close()
    await expect
      .poll(async () => (await snapshot(pet)).session?.elapsedMs ?? 0, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(100_000)
    await scenario('high-effects')

    await command(pet, { type: 'openControl', page: 'prepare' })
    const visibility = await view(app, 'control')
    await command(visibility, { type: 'visibility', visible: false })
    await visibility.close()
    await expect.poll(async () => (await snapshot(pet)).petVisible).toBe(false)
    await scenario('hidden')
    expect((await snapshot(pet)).session?.elapsedMs).toBeLessThan(310_000)
    expect(warnings).toEqual([])
  } finally {
    await record()
  }
})
