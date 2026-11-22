import { describe, expect, test, vi } from 'vitest'
import type { PresentationEvent, Session } from '../../src/contracts/types'
import { compileTimeline, getPhase } from '../../src/core/timeline'
import { SessionEngine } from '../../src/main/session'
import { preset, shortPreset } from '../fixtures'

function createEngine(restored?: Session | null) {
  let now = 5000
  const events: PresentationEvent[] = []
  const writes: (Session | null)[] = []
  const save = vi.fn(async (session: Session | null) => {
    writes.push(structuredClone(session))
  })
  const engine = new SessionEngine({
    now: () => now,
    save,
    emit: (event) => events.push(event),
    restored,
  })

  return {
    engine,
    events,
    save,
    writes,
    advance(ms: number) {
      now += ms
    },
    current(): Session {
      const session = engine.snapshot()
      if (!session) throw new Error('预期有一局渡夜')
      return session
    },
  }
}

describe('渡夜会话与单调时钟', () => {
  test('无操作走完实际默认时间线，完成和阶段事件各最多一次', async () => {
    const run = createEngine()
    await run.engine.start(preset())

    expect(run.current()).toMatchObject({ status: 'running', elapsedMs: 0 })
    await expect(run.engine.start(shortPreset())).rejects.toThrow()

    let last = 0
    const boundaries = [270, 450, 660, 840, 1020, 1290, 1470, 1680, 1860, 2100, 2400]
    for (const boundary of boundaries) {
      const ms = boundary * 1000
      run.advance(ms - last - 1)
      await run.engine.tick()
      expect(run.current()).toMatchObject({ status: 'running', elapsedMs: ms - 1 })
      run.advance(1)
      await run.engine.tick()
      await run.engine.tick()
      expect(run.current().elapsedMs).toBe(ms)
      last = ms
    }

    expect(run.current().status).toBe('completed')
    expect(run.writes.at(-1)).toMatchObject({ status: 'completed', elapsedMs: 2_400_000 })
    expect(
      run.events.filter((event) => event.kind === 'phase').map((event) => event.phaseId),
    ).toEqual(run.current().timeline.phases.map((phase) => phase.id))
    expect(run.events.filter((event) => event.kind === 'victory')).toHaveLength(1)
    expect(new Set(run.events.map((event) => event.id)).size).toBe(run.events.length)

    run.advance(3_600_000)
    await run.engine.tick()
    expect(run.current()).toMatchObject({ status: 'completed', elapsedMs: 2_400_000 })
    expect(run.events.filter((event) => event.kind === 'victory')).toHaveLength(1)
  })

  test('暂停和多次继续只算有效时间，修改系统日期不改变进度', async () => {
    const run = createEngine()
    await run.engine.start(preset())
    const { id } = run.current()
    run.advance(885_321)
    await run.engine.pause(id)
    const paused = run.current()

    const wallClock = vi.spyOn(Date, 'now')
    try {
      wallClock.mockReturnValue(1000)
      run.advance(75_000)
      await run.engine.tick()
      expect(run.current()).toEqual(paused)

      await run.engine.resume(id)
      wallClock.mockReturnValue(4_000_000_000_000)
      run.advance(1000)
      await run.engine.pause(id)
      expect(run.current()).toMatchObject({ status: 'paused', elapsedMs: 886_321 })
      run.advance(250_000)
      await run.engine.resume(id)
      run.advance(133_678)
      await run.engine.tick()
      expect(getPhase(run.current().timeline, run.current().elapsedMs)?.kind).toBe('battle')
      run.advance(1)
      await run.engine.tick()
      expect(run.current()).toMatchObject({ status: 'running', elapsedMs: 1_020_000 })
      expect(getPhase(run.current().timeline, run.current().elapsedMs)?.kind).toBe('explore')
    } finally {
      wallClock.mockRestore()
    }
  })

  test('阻塞跨越多个阶段后只播当前，越过终点直接完成', async () => {
    const run = createEngine()
    await run.engine.start(shortPreset())
    run.events.length = 0

    run.advance(6500)
    await run.engine.tick()
    expect(run.events).toMatchObject([
      { kind: 'phase', phaseId: run.current().timeline.phases[6].id },
    ])
    expect(run.current().elapsedMs).toBe(6500)

    run.events.length = 0
    run.advance(14_000)
    await run.engine.tick()
    expect(run.events).toMatchObject([{ kind: 'victory' }])
    expect(run.current()).toMatchObject({ status: 'completed', elapsedMs: 11_000 })
  })

  test('同一场绝招只使用一次，精确边界优先切换并保持总时间', async () => {
    const run = createEngine()
    await run.engine.start(shortPreset())
    const { id, timeline } = run.current()
    const [firstBattle, secondBattle, lastBattle] = [
      timeline.phases[4],
      timeline.phases[9],
      timeline.phases[10],
    ]

    run.advance(3999)
    await expect(run.engine.ultimate(id, firstBattle.id)).rejects.toThrow()
    run.advance(1)
    await run.engine.ultimate(id, firstBattle.id)
    expect(run.current()).toMatchObject({ elapsedMs: 4000, usedUltimates: [firstBattle.id] })
    expect(run.writes.at(-1)?.usedUltimates).toEqual([firstBattle.id])
    await expect(run.engine.ultimate(id, firstBattle.id)).rejects.toThrow()

    run.advance(5000)
    await run.engine.pause(id)
    await expect(run.engine.ultimate(id, secondBattle.id)).rejects.toThrow()
    run.advance(90_000)
    await run.engine.resume(id)
    await expect(run.engine.ultimate(id, firstBattle.id)).rejects.toThrow()
    await run.engine.ultimate(id, secondBattle.id)
    expect(run.current().elapsedMs).toBe(9000)

    run.advance(1000)
    await expect(run.engine.ultimate(id, secondBattle.id)).rejects.toThrow()
    await run.engine.ultimate(id, lastBattle.id)
    expect(run.current().elapsedMs).toBe(10_000)
    run.advance(999)
    await run.engine.tick()
    expect(run.current()).toMatchObject({ status: 'running', elapsedMs: 10_999 })
    run.advance(1)
    await run.engine.tick()

    expect(run.current()).toMatchObject({
      status: 'completed',
      elapsedMs: 11_000,
      usedUltimates: [firstBattle.id, secondBattle.id, lastBattle.id],
    })
    expect(
      run.events.filter((event) => event.kind === 'ultimate').map((event) => event.phaseId),
    ).toEqual([firstBattle.id, secondBattle.id, lastBattle.id])
  })

  test('旧会话命令不干扰新局，提前结束不触发胜利', async () => {
    const run = createEngine()
    const next = shortPreset()
    await run.engine.start(next)
    const previousId = run.current().id
    await run.engine.abandon(previousId)
    expect(run.engine.snapshot()).toBeNull()
    expect(run.writes.at(-1)).toBeNull()
    expect(run.events.filter((event) => event.kind === 'victory')).toHaveLength(0)

    next.customSeconds[0] = 10
    await run.engine.start(next)
    next.customSeconds[0] = 500
    next.name = '修改后的预设'
    for (const action of [
      () => run.engine.pause(previousId),
      () => run.engine.resume(previousId),
      () => run.engine.abandon(previousId),
      () => run.engine.ultimate(previousId, run.current().timeline.phases[4].id),
    ])
      await expect(action()).rejects.toThrow()

    expect(run.current()).toMatchObject({
      status: 'running',
      presetName: '测试渡夜',
      timeline: { durationMs: 20_000 },
    })
    expect(run.current().timeline.phases[0].endMs).toBe(10_000)
    expect(run.current().id).not.toBe(previousId)
  })

  test('重启按保存进度暂停恢复，保留已用绝招，离线期间不计时', async () => {
    const first = createEngine()
    await first.engine.start(shortPreset())
    const session = first.current()
    const firstBattle = session.timeline.phases[4]
    first.advance(4100)
    await first.engine.ultimate(session.id, firstBattle.id)
    const saved = first.writes.at(-1)
    expect(saved).toMatchObject({
      status: 'running',
      elapsedMs: 4100,
      usedUltimates: [firstBattle.id],
    })

    const restarted = createEngine(saved)
    restarted.advance(86_400_000)
    await restarted.engine.tick()
    expect(restarted.current()).toMatchObject({
      id: session.id,
      status: 'paused',
      elapsedMs: 4100,
      usedUltimates: [firstBattle.id],
    })
    expect(restarted.events).toHaveLength(0)
    await restarted.engine.resume(session.id)
    await expect(restarted.engine.ultimate(session.id, firstBattle.id)).rejects.toThrow()
    restarted.advance(6899)
    await restarted.engine.tick()
    expect(restarted.current()).toMatchObject({ status: 'running', elapsedMs: 10_999 })
    restarted.advance(1)
    await restarted.engine.tick()
    expect(restarted.current()).toMatchObject({ status: 'completed', elapsedMs: 11_000 })
  })

  test('正常睡眠与漏收睡眠通知均保留暂停，后者回到可用检查点', async () => {
    const timeline = compileTimeline(shortPreset())
    const run = createEngine()
    await run.engine.start(shortPreset())
    run.advance(2100)
    await run.engine.suspend()
    run.advance(80_000)
    await run.engine.wake(false)
    expect(run.current()).toMatchObject({ status: 'paused', elapsedMs: 2100 })
    expect(run.current().timeline).toEqual(timeline)

    const { id } = run.current()
    await run.engine.resume(id)
    run.advance(2050)
    await run.engine.tick()
    const checkpoint = run.writes.at(-1)?.elapsedMs
    expect(checkpoint).toBe(4150)
    run.advance(360_000)
    await run.engine.wake(true)
    expect(run.current()).toMatchObject({ status: 'paused', elapsedMs: checkpoint })
    expect(run.events.filter((event) => event.kind === 'victory')).toHaveLength(0)
  })

  test('默认锁屏暂停，关闭该选项后只更新状态，不补播锁屏期间的事件', async () => {
    const run = createEngine()
    await run.engine.start(shortPreset())
    run.advance(1500)
    await run.engine.lock(true)
    run.advance(60_000)
    await run.engine.unlock()
    expect(run.current()).toMatchObject({ status: 'paused', elapsedMs: 1500 })

    await run.engine.resume(run.current().id)
    run.events.length = 0
    await run.engine.lock(false)
    run.advance(6000)
    await run.engine.tick()
    await run.engine.unlock()
    expect(run.current()).toMatchObject({ status: 'running', elapsedMs: 7500 })
    expect(run.events).toHaveLength(0)

    run.advance(500)
    await run.engine.tick()
    expect(run.events).toMatchObject([
      { kind: 'phase', phaseId: run.current().timeline.phases[8].id },
    ])
    run.events.length = 0
    await run.engine.lock(false)
    run.advance(4000)
    await run.engine.unlock()
    expect(run.current()).toMatchObject({ status: 'completed', elapsedMs: 11_000 })
    expect(run.events).toHaveLength(0)
  })

  test('检查点持续写失败时冻结并提示，写入恢复后可继续', async () => {
    const run = createEngine()
    await run.engine.start(preset())
    const { id } = run.current()
    run.save.mockRejectedValue(new Error('磁盘已满'))

    run.advance(2000)
    await expect(run.engine.tick()).rejects.toThrow(/保存/)
    expect(run.current().status).toBe('running')
    run.advance(3001)
    await expect(run.engine.tick()).rejects.toThrow(/保存/)
    const stopped = run.current()
    expect(stopped.status).toBe('paused')
    expect(stopped.elapsedMs).toBeGreaterThanOrEqual(2000)
    expect(stopped.elapsedMs).toBeLessThanOrEqual(5001)
    expect(run.engine.error).toMatch(/保存/)

    run.advance(60_000)
    await expect(run.engine.resume(id)).rejects.toThrow(/保存/)
    expect(run.current()).toEqual(stopped)
    run.save.mockResolvedValue(undefined)
    await run.engine.resume(id)
    run.advance(500)
    expect(run.current()).toMatchObject({ status: 'running', elapsedMs: stopped.elapsedMs + 500 })
    expect(run.engine.error).toBeUndefined()
  })

  test('检查点超过五秒未响应时暂停，迟到的保存成功也不会自行继续', async () => {
    const run = createEngine()
    await run.engine.start(preset())
    let finishSave: () => void = () => {
      throw new Error('尚未开始保存')
    }
    run.save.mockImplementationOnce(
      (session) =>
        new Promise<void>((resolve) => {
          finishSave = () => {
            run.writes.push(structuredClone(session))
            resolve()
          }
        }),
    )

    run.advance(2000)
    const pending = run.engine.tick()
    expect(run.save).toHaveBeenCalledTimes(2)
    run.advance(3001)
    expect(run.engine.checkStorageHealth()).toBe(true)
    const paused = run.current()
    expect(paused).toMatchObject({ status: 'paused', elapsedMs: 5001 })
    expect(run.engine.error).toMatch(/暂停/)
    finishSave()
    await pending

    expect(run.writes.at(-1)).toMatchObject({ status: 'paused', elapsedMs: 5001 })
    expect(run.current()).toEqual(paused)
    run.advance(6000)
    expect(run.current().elapsedMs).toBe(5001)
    await run.engine.resume(paused.id)
    run.advance(1)
    expect(run.current()).toMatchObject({ status: 'running', elapsedMs: 5002 })
  })

  test('重要写入即时失败时，绝招、放弃和完成均不提前确认', async () => {
    const run = createEngine()
    await run.engine.start(shortPreset())
    const { id, timeline } = run.current()
    run.advance(4000)
    await run.engine.tick()

    run.save.mockRejectedValueOnce(new Error('不可写'))
    await expect(run.engine.ultimate(id, timeline.phases[4].id)).rejects.toThrow(/保存/)
    expect(run.current().usedUltimates).toEqual([])
    expect(run.events.filter((event) => event.kind === 'ultimate')).toHaveLength(0)
    await run.engine.ultimate(id, timeline.phases[4].id)

    run.save.mockRejectedValueOnce(new Error('不可写'))
    await expect(run.engine.abandon(id)).rejects.toThrow(/保存/)
    expect(run.current().id).toBe(id)
    run.advance(7000)

    run.save.mockRejectedValueOnce(new Error('不可写'))
    await expect(run.engine.tick()).rejects.toThrow(/保存/)
    expect(run.current().status).not.toBe('completed')
    expect(run.events.filter((event) => event.kind === 'victory')).toHaveLength(0)
  })

  test('绝招和完成事件必须在成功保存后才发出', async () => {
    const run = createEngine()
    await run.engine.start(shortPreset())
    const { id, timeline } = run.current()
    run.advance(4000)
    await run.engine.tick()

    let finishSave: () => void = () => {
      throw new Error('等待保存尚未开始')
    }
    run.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
        }),
    )
    const ultimate = run.engine.ultimate(id, timeline.phases[4].id)
    await vi.waitFor(() =>
      expect(run.save.mock.lastCall?.[0]?.usedUltimates).toEqual([timeline.phases[4].id]),
    )
    expect(run.events.filter((event) => event.kind === 'ultimate')).toHaveLength(0)
    finishSave()
    await ultimate
    expect(run.events.filter((event) => event.kind === 'ultimate')).toHaveLength(1)

    run.advance(7000)
    run.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
        }),
    )
    const completion = run.engine.tick()
    await vi.waitFor(() => expect(run.save.mock.lastCall?.[0]?.status).toBe('completed'))
    expect(run.events.filter((event) => event.kind === 'victory')).toHaveLength(0)
    finishSave()
    await completion
    expect(run.events.filter((event) => event.kind === 'victory')).toHaveLength(1)
  })
})
