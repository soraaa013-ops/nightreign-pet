import type { ProcessMetric } from 'electron'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import type { PresentationEvent } from '../../src/contracts/types'
import { command, expect, screenshot, snapshot, startFromControl, test, view } from './app'
import { inspectCharacterRig } from './character-rig'

interface CharacterSample {
  frames: number
  ready: boolean
}

declare global {
  interface Window {
    longRunCharacter(): CharacterSample
  }
}

test('默认预设真实运行 40 分钟并以独立时钟核对阶段与终点', async ({ launchApp }, info) => {
  test.skip(
    process.env.NIGHTREIGN_LONG_TEST !== '1',
    '设置 NIGHTREIGN_LONG_TEST=1 执行真实 40 分钟测试',
  )
  test.setTimeout(42 * 60_000)

  const app = await launchApp()
  const pet = await view(app, 'pet')
  const control = await view(app, 'control')
  await expect(pet.locator('.pet-model')).toBeVisible()
  await expect(pet.locator('.pet-concept')).toHaveCount(0, { timeout: 20_000 })
  const rig = await pet.evaluate(inspectCharacterRig)
  expect(rig.consistency).toBe(1)
  expect(rig.drawableIds).toContain('ArtPluckArm')
  const environment = await app.evaluate(({ app: main }) => ({
    version: main.getVersion(),
    electron: process.versions.electron,
    packaged: main.isPackaged,
  }))
  await pet.evaluate(() => {
    const core = window.Live2DCubismCore.Model.prototype
    const update = core.update
    let frames = 0
    core.update = function () {
      update.call(this)
      frames++
    }
    window.longRunCharacter = () => {
      const gl = document.querySelector<HTMLCanvasElement>('.pet-model')?.getContext('webgl2')
      return {
        frames,
        ready: Boolean(gl && !gl.isContextLost() && !document.querySelector('.pet-concept')),
      }
    }
  })
  const events: (PresentationEvent & { observedMs: number })[] = []
  const samples: { observedMs: number; metrics: ProcessMetric[]; character: CharacterSample }[] = []
  const exceptions: string[] = []
  await mkdir(info.outputDir, { recursive: true })
  pet.on('pageerror', (error) => exceptions.push(error.message))
  await pet.exposeFunction('reportPresentationToTest', (event: PresentationEvent) => {
    const observedMs = performance.now()
    events.push({ ...event, observedMs })
    if (event.kind === 'phase' || event.kind === 'victory') {
      console.info(
        `[40 分钟实跑] ${event.label ?? event.phaseId} · ${(observedMs - events[0].observedMs).toFixed(1)} 毫秒`,
      )
      return appendFile(
        info.outputPath('clock-events.jsonl'),
        JSON.stringify({ ...event, observedMs, utc: new Date().toISOString() }) + '\n',
      )
    }
  })
  await pet.evaluate(() => {
    const report = Reflect.get(window, 'reportPresentationToTest') as (
      event: PresentationEvent,
    ) => void
    window.nightreign.onPresentation(report)
  })

  async function sample() {
    const [metrics, character] = await Promise.all([
      app.evaluate(({ app: main }) => main.getAppMetrics()),
      pet.evaluate(() => window.longRunCharacter()),
    ])
    samples.push({ observedMs: performance.now(), metrics, character })
  }

  await sample()
  const sampler = setInterval(
    () => void sample().catch((error: Error) => exceptions.push(error.message)),
    30_000,
  )
  try {
    await startFromControl(control, control.getByRole('button', { name: '出击', exact: true }))
    const started = await snapshot(pet)
    expect(started.session).toMatchObject({
      status: 'running',
      timeline: { durationMs: 2_400_000 },
    })
    await expect
      .poll(() => events.find((event) => event.kind === 'victory'), {
        timeout: 40 * 60_000 + 20_000,
        intervals: [100, 1000],
      })
      .toBeDefined()

    const phases = events.filter((event) => event.kind === 'phase')
    const victories = events.filter((event) => event.kind === 'victory')
    const boundaries = [0, 270, 450, 660, 840, 1020, 1290, 1470, 1680, 1860, 2100]
    expect(phases).toHaveLength(boundaries.length)
    expect(phases.map((event) => event.phaseId)).toEqual(
      started.session!.timeline.phases.map((phase) => phase.id),
    )
    expect(samples.length).toBeGreaterThanOrEqual(79)
    expect(samples.every((sample) => sample.character.ready)).toBe(true)
    expect(
      samples
        .slice(1)
        .every((sample, index) => sample.character.frames > samples[index].character.frames),
    ).toBe(true)
    const start = phases[0].observedMs
    for (const [index, seconds] of boundaries.entries()) {
      const drift = phases[index].observedMs - start - seconds * 1000
      expect(
        Math.abs(drift),
        `第 ${index + 1} 阶段，偏差 ${drift.toFixed(1)} 毫秒`,
      ).toBeLessThanOrEqual(1000)
    }
    expect(victories).toHaveLength(1)
    expect(victories[0].label).toBe('NIGHTLORD SLAIN')
    expect(Math.abs(victories[0].observedMs - start - 2_400_000)).toBeLessThanOrEqual(1000)
    expect(exceptions).toEqual([])
    expect((await snapshot(pet)).session).toMatchObject({
      status: 'completed',
      elapsedMs: 2_400_000,
    })
    await command(pet, { type: 'openControl', page: 'result' })
    const result = await view(app, 'control')
    await expect(result.getByText('渡夜成功', { exact: true })).toBeVisible()
    await screenshot(result, info, 'result')
  } finally {
    clearInterval(sampler)
    await mkdir(info.outputDir, { recursive: true })
    await writeFile(
      info.outputPath('time-and-process-metrics.json'),
      JSON.stringify({ environment, rig, events, samples, exceptions }, null, 2),
    )
  }
})
