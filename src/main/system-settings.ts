import { app, globalShortcut } from 'electron'
import type { Preferences } from '../contracts/types'

type Bindings = Preferences['shortcuts']
export type ShortcutAction = keyof Bindings
const keys: ShortcutAction[] = ['settings', 'pause', 'visibility', 'clickThrough']

export class SystemSettings {
  shortcuts: Bindings = { settings: '', pause: '', visibility: '', clickThrough: '' }
  constructor(private invoke: (action: ShortcutAction) => void) {}
  loginStatus() {
    return process.platform !== 'linux' && app.getLoginItemSettings().openAtLogin
  }
  setLogin(enabled: boolean) {
    if (process.platform === 'linux') throw new Error('当前 Linux 版本不支持设置开机启动。')
    try {
      app.setLoginItemSettings({ openAtLogin: enabled })
      if (this.loginStatus() === enabled) return
    } catch {
      /* Use a platform-independent error for the settings panel. */
    }
    throw new Error('系统未应用开机启动设置，请检查系统登录项权限。')
  }

  private bind(key: ShortcutAction, accelerator: string) {
    if (!accelerator) return
    let registered = false
    try {
      registered = globalShortcut.register(accelerator, () => this.invoke(key))
    } catch {
      /* Invalid accelerator. */
    }
    if (!registered) throw new Error('快捷键「' + accelerator + '」无效或已被占用。')
    this.shortcuts[key] = accelerator
  }

  restore(saved: Bindings) {
    const errors: string[] = []
    for (const key of keys) {
      try {
        this.bind(key, saved[key])
      } catch (e) {
        errors.push((e as Error).message)
      }
    }
    return errors
  }

  setBindings(next: Bindings) {
    const previous = { ...this.shortcuts }
    const changed = keys.filter((key) => next[key] !== previous[key])
    const clear = (key: ShortcutAction) => {
      if (this.shortcuts[key]) globalShortcut.unregister(this.shortcuts[key])
      this.shortcuts[key] = ''
    }
    for (const key of changed) clear(key)
    try {
      for (const key of changed) this.bind(key, next[key])
    } catch (error) {
      for (const key of changed) clear(key)
      let rollbackFailed = false
      for (const key of changed) {
        try {
          this.bind(key, previous[key])
        } catch {
          rollbackFailed = true
        }
      }
      if (rollbackFailed) throw new Error('快捷键注册失败，部分原快捷键也被系统占用。请重新设置。')
      throw error
    }
  }
}
