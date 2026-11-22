import { describe, expect, test } from 'vitest'
import { compileTimeline } from '../../src/core/timeline'
import { validateCommand, validateSession } from '../../src/core/validation'
import type { Command, Session } from '../../src/contracts/types'
import { shortPreset } from '../fixtures'

describe('IPC 指令结构', () => {
  test.each<Command>([
    { type: 'start', presetId: 'original-40' },
    { type: 'ultimate' },
    { type: 'openControl' },
    { type: 'openControl', page: 'settings' },
    { type: 'drag', dx: -0.5, dy: 4096 },
    { type: 'hitTest', hit: false },
    { type: 'preferences', expectedRevision: 0, patch: { scale: 50, musicVolume: 0 } },
    { type: 'savePreset', preset: shortPreset() },
  ])('支持合法的 $type 命令', (command) => {
    expect(validateCommand(command)).toEqual(command)
  })

  test.each([
    { title: '空值', input: null },
    { title: '数组', input: [] },
    { title: '未知命令', input: { type: 'missing' } },
    { title: '缺失必填字段', input: { type: 'start' } },
    { title: '多余字段', input: { type: 'visibility', visible: true, path: '/tmp/test' } },
    { title: '调用继承字段', input: Object.create({ type: 'quit' }) },
    { title: '无效页面', input: { type: 'openControl', page: 'missing' } },
    { title: '布尔字符串', input: { type: 'hitTest', hit: 'true' } },
    { title: '非有限坐标', input: { type: 'drag', dx: Infinity, dy: 0 } },
    { title: '超范围坐标', input: { type: 'drag', dx: 0, dy: -4096.01 } },
    {
      title: '伪造设置版本',
      input: { type: 'preferences', expectedRevision: 1, patch: { revision: 2 } },
    },
    { title: '负数版本', input: { type: 'preferences', expectedRevision: -1, patch: {} } },
    { title: '空版本', input: { type: 'preferences', expectedRevision: undefined, patch: {} } },
    {
      title: '滑块超上限',
      input: { type: 'preferences', expectedRevision: 0, patch: { scale: 201 } },
    },
    {
      title: '负音量',
      input: { type: 'preferences', expectedRevision: 0, patch: { sfxVolume: -1 } },
    },
    {
      title: '非法演出选项',
      input: { type: 'preferences', expectedRevision: 0, patch: { intensity: 'extreme' } },
    },
    {
      title: '不完整快捷键记录',
      input: { type: 'preferences', expectedRevision: 0, patch: { shortcuts: { settings: '' } } },
    },
    {
      title: '单段过短',
      input: {
        type: 'savePreset',
        preset: shortPreset({ customSeconds: [0, ...Array<number>(10).fill(1)] }),
      },
    },
  ])('拒绝$title', ({ input }) => {
    expect(() => validateCommand(input)).toThrow()
  })
})

describe('恢复会话验证', () => {
  const makeSession = (): Session => ({
    id: 'session-1',
    status: 'running',
    presetName: '测试恢复',
    timeline: compileTimeline(shortPreset()),
    elapsedMs: 4500,
    usedUltimates: [],
  })

  test('接受正常进度、空会话和自然完成', () => {
    expect(validateSession(null)).toBeNull()
    const session = makeSession()
    session.usedUltimates = [session.timeline.phases[4].id]
    expect(validateSession(session)).toEqual(session)
    session.status = 'completed'
    session.elapsedMs = 11_000
    expect(validateSession(session)).toEqual(session)
  })

  test.each<{ title: string; damage: (session: Session) => void }>([
    {
      title: '缺失阶段',
      damage: (session) => {
        session.timeline.phases.pop()
      },
    },
    {
      title: '阶段出现重叠',
      damage: (session) => {
        session.timeline.phases[1].startMs -= 1000
        session.timeline.phases[1].endMs -= 1000
      },
    },
    {
      title: '篡改阶段类型',
      damage: (session) => {
        session.timeline.phases[0].kind = 'battle'
      },
    },
    {
      title: '负有效时间',
      damage: (session) => {
        session.elapsedMs = -1
      },
    },
    {
      title: '未完成但已超时',
      damage: (session) => {
        session.elapsedMs = 11_000
      },
    },
    {
      title: '完成但未达到终点',
      damage: (session) => {
        session.status = 'completed'
      },
    },
    {
      title: '状态类型被写成数组',
      damage: (session) => {
        Object.assign(session, { status: ['running'] })
      },
    },
    {
      title: '同场绝招重复',
      damage: (session) => {
        session.usedUltimates = Array<string>(2).fill(session.timeline.phases[4].id)
      },
    },
    {
      title: '尚未到达的战斗有绝招',
      damage: (session) => {
        session.usedUltimates = [session.timeline.phases[9].id]
      },
    },
    {
      title: '非战斗阶段有绝招',
      damage: (session) => {
        session.usedUltimates = [session.timeline.phases[1].id]
      },
    },
  ])('拒绝受损会话：$title', ({ damage }) => {
    const session = makeSession()
    damage(session)
    expect(() => validateSession(session)).toThrow()
  })
})
