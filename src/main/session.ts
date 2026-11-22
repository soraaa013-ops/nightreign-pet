import { randomUUID } from 'node:crypto'
import type { PresentationEvent, Preset, Session } from '../contracts/types'
import { compileTimeline, getPhase } from '../core/timeline'

interface SessionOptions {
  now(): number
  save(session: Session | null): Promise<void>
  emit(event: PresentationEvent): void
  restored?: Session | null
}

// The desktop coordinator serializes all asynchronous commands and ticks.
export class SessionEngine {
  private current: Session | null
  private anchor: number
  private lastSaved: Session | null
  private savedAt: number
  private phaseId?: string
  private failedWrite = false
  private writing = false
  private interrupted = false
  error?: string
  locked = false

  constructor(private options: SessionOptions) {
    this.anchor = this.savedAt = options.now()
    this.current = structuredClone(options.restored ?? null)
    this.lastSaved = structuredClone(this.current)
    if (this.current && this.current.status !== 'completed') {
      this.current.status = 'paused'
      this.current.pauseReason = '上次渡夜尚未结束'
    }
    if (this.current) this.phaseId = getPhase(this.current.timeline, this.current.elapsedMs)?.id
  }

  get running() {
    return this.current?.status === 'running'
  }

  snapshot(at = this.options.now()): Session | null {
    const session = this.current
    if (!session) return null
    const elapsedMs =
      session.status === 'running'
        ? Math.min(session.timeline.durationMs, session.elapsedMs + Math.max(0, at - this.anchor))
        : session.elapsedMs
    return structuredClone({ ...session, elapsedMs })
  }

  private event(
    kind: PresentationEvent['kind'],
    session: Session,
    phaseId?: string,
    label?: string,
  ) {
    if (!this.locked)
      this.options.emit({ id: randomUUID(), kind, sessionId: session.id, phaseId, label })
  }

  private async persist(session: Session | null) {
    this.writing = true
    try {
      const wasInterrupted = this.interrupted
      await this.options.save(structuredClone(session))
      if (
        !wasInterrupted &&
        this.interrupted &&
        session?.status === 'running' &&
        this.current?.status === 'paused'
      ) {
        const pause = { ...this.current, usedUltimates: session.usedUltimates }
        await this.options.save(structuredClone(pause))
        this.current = pause
        session = pause
      }
      this.lastSaved = structuredClone(session)
      this.failedWrite = false
      this.savedAt = this.options.now()
      this.error =
        this.interrupted && session?.status === 'paused'
          ? '保存响应缓慢，渡夜已暂停。可继续渡夜。'
          : undefined
    } catch {
      this.failedWrite = true
      this.error = '渡夜记录保存失败。请检查磁盘空间和数据目录权限后重试。'
      this.checkStorageHealth()
      throw new Error(this.error)
    } finally {
      this.writing = false
    }
  }

  // Called outside the command queue too, so slow file writes can freeze the clock.
  checkStorageHealth() {
    if (
      (!this.failedWrite && !this.writing) ||
      this.options.now() - this.savedAt < 5000 ||
      this.current?.status !== 'running'
    )
      return false
    const frozen = this.snapshot()!
    frozen.elapsedMs = Math.min(frozen.elapsedMs, frozen.timeline.durationMs - 1)
    this.current = { ...frozen, status: 'paused', pauseReason: '保存故障，进度已暂停' }
    this.interrupted = true
    this.error = '超过 5 秒未能保存渡夜进度，已暂停。请检查磁盘后继续。'
    return true
  }

  async start(preset: Preset) {
    await this.tick()
    if (this.current && this.current.status !== 'completed')
      throw new Error('已有一局渡夜正在进行。')
    const session: Session = {
      id: randomUUID(),
      status: 'running',
      presetName: preset.name,
      timeline: compileTimeline(preset),
      elapsedMs: 0,
      usedUltimates: [],
    }
    await this.persist(session)
    this.current = session
    this.interrupted = false
    this.anchor = this.options.now()
    this.phaseId = session.timeline.phases[0].id
    this.event('phase', session, this.phaseId, 'DAY 1')
  }

  private expect(id: string, at: number, ...statuses: Session['status'][]): Session {
    const session = this.snapshot(at)
    if (!session || session.id !== id) throw new Error('该渡夜已结束，请刷新后重试。')
    if (!statuses.includes(session.status)) throw new Error('当前渡夜状态无法执行此操作。')
    return session
  }

  async tick(at = this.options.now()) {
    const session = this.snapshot(at)
    if (!session || session.status !== 'running') return
    const phase = getPhase(session.timeline, session.elapsedMs)
    if (!phase) {
      const completed: Session = {
        ...session,
        status: 'completed',
        elapsedMs: session.timeline.durationMs,
      }
      await this.persist(completed)
      this.current = completed
      this.phaseId = undefined
      this.event('victory', completed, undefined, 'NIGHTLORD SLAIN')
      return
    }
    const changed = phase.id !== this.phaseId
    if (!changed && this.options.now() - this.savedAt < 2000) return
    await this.persist(session)
    if (
      changed &&
      !this.interrupted &&
      getPhase(session.timeline, this.snapshot()!.elapsedMs)?.id === phase.id
    ) {
      this.phaseId = phase.id
      this.event('phase', session, phase.id, phase.id === 'day2-explore' ? 'DAY 2' : phase.label)
    }
  }

  async pause(id: string, reason = '手动暂停') {
    const at = this.options.now()
    await this.tick(at)
    const session = this.expect(id, at, 'running')
    const next: Session = { ...session, status: 'paused', pauseReason: reason }
    await this.persist(next)
    this.current = next
  }

  async resume(id: string) {
    const at = this.options.now()
    await this.tick(at)
    const { pauseReason: _reason, ...previous } = this.expect(id, at, 'paused')
    const next: Session = { ...previous, status: 'running' }
    await this.persist(next)
    this.current = next
    this.anchor = this.options.now()
    this.interrupted = false
    this.phaseId = getPhase(next.timeline, next.elapsedMs)?.id
  }

  async ultimate(id: string, phaseId: string) {
    const at = this.options.now()
    await this.tick(at)
    const session = this.expect(id, at, 'running')
    const phase = getPhase(session.timeline, session.elapsedMs)
    if (!phase || phase.kind !== 'battle' || phase.id !== phaseId)
      throw new Error('当前阶段无法发动这场战斗的绝招。')
    if (session.usedUltimates.includes(phaseId)) throw new Error('本场战斗已发动过绝招。')
    session.usedUltimates.push(phaseId)
    await this.persist(session)
    this.current!.usedUltimates = session.usedUltimates
    if (!this.interrupted && getPhase(session.timeline, this.snapshot()!.elapsedMs)?.id === phaseId)
      this.event('ultimate', session, phaseId)
  }

  async abandon(id: string) {
    const at = this.options.now()
    await this.tick(at)
    this.expect(id, at, 'running', 'paused')
    await this.persist(null)
    this.current = null
    this.phaseId = undefined
  }

  async suspend(reason = '系统睡眠', observedAt = this.options.now()) {
    const session = this.current
    if (session?.status !== 'running') return
    const elapsedMs = Math.min(
      session.timeline.durationMs,
      session.elapsedMs + Math.max(0, observedAt - this.anchor),
    )
    if (elapsedMs === session.timeline.durationMs) {
      await this.tick()
      return
    }
    // Freeze even when storage is unavailable; waking must never count offline time.
    this.current = { ...session, elapsedMs, status: 'paused', pauseReason: reason }
    await this.persist(this.current)
  }

  checkpoint() {
    return structuredClone(this.lastSaved)
  }

  async wake(unpaired: boolean, checkpoint = this.lastSaved) {
    if (unpaired && this.current?.status === 'running' && checkpoint?.id === this.current.id) {
      this.current = {
        ...structuredClone(checkpoint),
        status: 'paused',
        pauseReason: '系统唤醒，已回到最近保存进度',
      }
      await this.persist(this.current)
    }
  }

  async lock(pauseOnLock: boolean, observedAt = this.options.now()) {
    this.locked = true
    if (pauseOnLock) await this.suspend('系统锁屏', observedAt)
  }

  async unlock() {
    try {
      await this.tick()
    } finally {
      this.locked = false
    }
  }

  async saveOnQuit(observedAt = this.options.now()) {
    if (this.current?.status === 'running') await this.suspend('上次退出时保存', observedAt)
    else if (this.current) await this.persist(this.current)
  }
}
