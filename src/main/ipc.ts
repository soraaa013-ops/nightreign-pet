import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { AppSnapshot, Command } from '../contracts/types'
import { compileTimeline } from '../core/timeline'
import { fields, record, requireValue, validateCommand, validatePreset } from '../core/validation'
import type { View, Windows } from './windows'

const commands: Record<View, readonly Command['type'][]> = {
  pet: ['hitTest', 'drag', 'openControl', 'contextMenu', 'ultimate'],
  control: [
    'start',
    'pause',
    'resume',
    'abandon',
    'dismissResult',
    'savePreset',
    'deletePreset',
    'preferences',
    'openControl',
    'visibility',
    'resetPosition',
    'preview',
    'quit',
  ],
  overlay: [],
}
export function allowedFor(view: View, type: Command['type']) {
  return commands[view].includes(type)
}

export function attachIpc(
  ipc: IpcMain,
  windows: Windows,
  snapshot: () => AppSnapshot,
  run: (c: Command) => Promise<AppSnapshot>,
) {
  const identity = (event: IpcMainInvokeEvent) => {
    const view = windows.view(event.sender)
    requireValue(
      view &&
        event.senderFrame &&
        event.senderFrame === event.sender.mainFrame &&
        windows.trusted(event.senderFrame.url, view),
      '此页面没有操作权限。',
    )
    return view
  }
  const replies = new Map<string, { key: string; result: Promise<AppSnapshot> }>()
  const pending = new Map<string, { key: string; result: Promise<AppSnapshot> }>()
  ipc.handle('night:read', (event, ...args) => {
    identity(event)
    requireValue(
      !args.length || (args.length === 1 && args[0] === undefined),
      '读取状态不接受额外参数。',
    )
    return snapshot()
  })
  ipc.handle('night:preview', (event, value, ...extra) => {
    requireValue(!extra.length, '预览参数无效。')
    requireValue(identity(event) === 'control', '仅控制面板可预览时间线。')
    return compileTimeline(validatePreset(value))
  })
  ipc.handle('night:command', (event, envelope, ...extra) => {
    requireValue(!extra.length, '操作包含额外参数。')
    const view = identity(event)
    const body = record(envelope)
    fields(body, ['requestId', 'command'])
    requireValue(
      typeof body.requestId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(body.requestId),
      '操作编号无效。',
    )
    const command = validateCommand(body.command)
    requireValue(allowedFor(view, command.type), '此窗口无法执行该操作。')
    const id = event.sender.id + '/' + body.requestId
    const key = JSON.stringify(command)
    const cached = replies.get(id) ?? pending.get(id)
    if (cached) {
      requireValue(cached.key === key, '该操作编号已用于其他请求。')
      return cached.result
    }
    requireValue(pending.size < 128, '操作过于频繁，请稍后重试。')
    const entry = { key, result: run(command) }
    pending.set(id, entry)
    const settle = () => {
      pending.delete(id)
      replies.set(id, entry)
      if (replies.size > 100) replies.delete(replies.keys().next().value!)
    }
    void entry.result.then(settle, settle)
    return entry.result
  })
}
