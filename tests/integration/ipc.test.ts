import { describe, expect, test, vi } from 'vitest'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { AppSnapshot, Command } from '../../src/contracts/types'
import { DEFAULT_PREFERENCES, DEFAULT_PRESET } from '../../src/core/defaults'
import { attachIpc } from '../../src/main/ipc'
import type { View, Windows } from '../../src/main/windows'
import { shortPreset } from '../fixtures'

type Handler = (event: IpcMainInvokeEvent, payload?: unknown) => unknown

function createIpc() {
  const handlers = new Map<string, Handler>()
  const senders = new Map<number, View>()
  const ipc = {
    handle: (name: string, handler: Handler) => handlers.set(name, handler),
  } as unknown as IpcMain
  const url = (view: View) => `file:///renderer/index.html?view=${view}`
  const windows = {
    view: (sender: { id: number }) => senders.get(sender.id),
    trusted: (candidate: string, view: View) => candidate === url(view),
  } as unknown as Windows
  const snapshot: AppSnapshot = {
    revision: 0,
    preferences: DEFAULT_PREFERENCES,
    session: null,
    presets: [DEFAULT_PRESET],
    petVisible: true,
  }
  const run = vi.fn(async (_command: Command) => snapshot)
  attachIpc(ipc, windows, () => snapshot, run)

  function frame(
    view: View | undefined,
    id: number,
    options: { url?: string; isSubframe?: boolean } = {},
  ) {
    if (view) senders.set(id, view)
    const mainFrame = { url: view ? url(view) : '' }
    const senderFrame = options.isSubframe ? { ...mainFrame } : mainFrame
    if (options.url) senderFrame.url = options.url
    return { sender: { id, mainFrame }, senderFrame } as unknown as IpcMainInvokeEvent
  }

  function invoke(name: string, event: IpcMainInvokeEvent, payload?: unknown) {
    const handler = handlers.get(name)
    if (!handler) throw new Error(`缺少 IPC 处理器 ${name}`)
    return handler(event, payload)
  }

  return { frame, invoke, run, snapshot }
}

describe('IPC 路由', () => {
  test('限制窗口角色、顶层框架和受信资源', async () => {
    const { frame, invoke, run, snapshot } = createIpc()
    const pet = frame('pet', 1)
    const control = frame('control', 2)
    const overlay = frame('overlay', 3)
    const unknown = frame(undefined, 4)
    const embedded = frame('control', 5, { isSubframe: true })
    const otherUrl = frame('control', 6, { url: 'https://example.invalid/' })

    for (const sender of [pet, control, overlay])
      expect(invoke('night:read', sender)).toEqual(snapshot)
    for (const sender of [unknown, embedded, otherUrl])
      expect(() => invoke('night:read', sender)).toThrow(/权限/)
    for (const sender of [pet, overlay])
      expect(() => invoke('night:preview', sender, shortPreset())).toThrow(/仅控制/)
    expect(invoke('night:preview', control, shortPreset())).toMatchObject({ durationMs: 11_000 })

    const start = { requestId: 'a', command: { type: 'start', presetId: 'original-40' } }
    const drag = { requestId: 'b', command: { type: 'drag', dx: 10, dy: 20 } }
    expect(() => invoke('night:command', pet, start)).toThrow(/无法执行/)
    expect(() => invoke('night:command', overlay, start)).toThrow(/无法执行/)
    expect(() => invoke('night:command', control, drag)).toThrow(/无法执行/)
    expect(run).not.toHaveBeenCalled()
    await expect(invoke('night:command', control, start)).resolves.toEqual(snapshot)
    await expect(invoke('night:command', pet, drag)).resolves.toEqual(snapshot)
    expect(run.mock.calls).toEqual([[start.command], [drag.command]])
  })

  test('没有渡夜也能从角色或准备页连续请求行军，重放同一请求只分发一次', async () => {
    const { frame, invoke, run, snapshot } = createIpc()
    const pet = frame('pet', 1)
    const panel = frame('control', 2)
    const command = { type: 'ultimate' }
    for (const [sender, requestId] of [
      [pet, 'first'],
      [pet, 'first'],
      [pet, 'second'],
      [panel, 'third'],
    ] as const) {
      await expect(invoke('night:command', sender, { requestId, command })).resolves.toEqual(
        snapshot,
      )
    }
    expect(run.mock.calls).toEqual([[command], [command], [command]])
    expect(() =>
      invoke('night:command', frame('overlay', 3), { requestId: 'other', command }),
    ).toThrow(/无法执行/)
  })

  test('同一窗口的重复请求只执行一次，另一个窗口独立去重', async () => {
    const { frame, invoke, run, snapshot } = createIpc()
    const control = frame('control', 1)
    const second = frame('control', 2)
    const command = { type: 'start', presetId: 'original-40' }
    let finish: () => void = () => {
      throw new Error('未开始请求')
    }
    run.mockImplementationOnce(
      () =>
        new Promise<AppSnapshot>((resolve) => {
          finish = () => resolve(snapshot)
        }),
    )

    const first = invoke('night:command', control, { requestId: 'a', command })
    const pending = invoke('night:command', control, { requestId: 'a', command: { ...command } })
    expect(() =>
      invoke('night:command', control, { requestId: 'a', command: { type: 'quit' } }),
    ).toThrow(/其他请求/)
    expect(run).toHaveBeenCalledTimes(1)
    finish()
    await expect(first).resolves.toEqual(snapshot)
    await expect(pending).resolves.toEqual(snapshot)
    await expect(invoke('night:command', control, { requestId: 'a', command })).resolves.toEqual(
      snapshot,
    )
    expect(run).toHaveBeenCalledTimes(1)

    await expect(invoke('night:command', second, { requestId: 'a', command })).resolves.toEqual(
      snapshot,
    )
    expect(run).toHaveBeenCalledTimes(2)
  })

  test('拒绝无效封包和命令，允许后续有效请求', async () => {
    const { frame, invoke, run, snapshot } = createIpc()
    const control = frame('control', 1)
    for (const invalid of [
      { type: 'quit' },
      { requestId: '', command: { type: 'quit' } },
      { requestId: 'a', command: { type: 'start' } },
      { requestId: 'a', command: { type: 'quit', unexpected: true } },
      { requestId: 'a', command: { type: 'quit' }, unexpected: true },
    ])
      expect(() => invoke('night:command', control, invalid)).toThrow()
    expect(run).not.toHaveBeenCalled()

    await expect(
      invoke('night:command', control, { requestId: 'a', command: { type: 'quit' } }),
    ).resolves.toEqual(snapshot)
    expect(run).toHaveBeenCalledExactlyOnceWith({ type: 'quit' })
  })
})
