import type { Command, Preferences } from '../contracts/types'
import type { Settings } from './preferences'
import type { SystemSettings } from './system-settings'
import type { Windows } from './windows'

export async function applyDesktopSettings(
  command: Extract<Command, { type: 'preferences' }>,
  settings: Settings,
  system: SystemSettings,
  windows: Windows,
  warn: (message: string) => void,
) {
  const old = settings.preferences,
    next = settings.next(command.patch, command.expectedRevision)
  const oldBounds = windows.getPetBounds()
  const undo: (() => void)[] = []
  try {
    if (next.autoStart !== old.autoStart) {
      undo.push(() => {
        if (system.loginStatus() !== old.autoStart) system.setLogin(old.autoStart)
      })
      system.setLogin(next.autoStart)
    }
    if (JSON.stringify(old.shortcuts) !== JSON.stringify(next.shortcuts)) {
      undo.push(() => system.setBindings(old.shortcuts))
      system.setBindings(next.shortcuts)
    }
    undo.push(() => {
      windows.apply(next, old)
      if (oldBounds && next.scale !== old.scale) windows.placePet(oldBounds)
    })
    windows.apply(old, next)
    await settings.savePreferences(next)
  } catch (error) {
    let rollbackFailed = false
    for (const restore of undo.reverse()) {
      try {
        restore()
      } catch {
        rollbackFailed = true
      }
    }
    const actual: Preferences = { ...old, shortcuts: { ...system.shortcuts } }
    if (next.autoStart !== old.autoStart) {
      try {
        actual.autoStart = system.loginStatus()
      } catch {
        rollbackFailed = true
      }
    }
    if (rollbackFailed) warn('系统未能还原所有设置，请核对窗口、快捷键和开机启动状态。')
    if (
      old.autoStart !== actual.autoStart ||
      JSON.stringify(old.shortcuts) !== JSON.stringify(actual.shortcuts)
    ) {
      actual.revision++
      settings.preferences = actual
      await settings.savePreferences(actual).catch(() => warn('系统设置已读取，但未能保存到本机。'))
    }
    throw error
  }
}
