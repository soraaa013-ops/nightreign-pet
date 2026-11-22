import { app, dialog, globalShortcut, ipcMain, powerMonitor, screen, session } from 'electron'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import { access } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import type { AppSnapshot, Command } from '../contracts/types'
import { validateSession } from '../core/validation'
import { attachIpc } from './ipc'
import { applyDesktopSettings } from './apply-settings'
import { Settings } from './preferences'
import { registerScheme, serveResources } from './resources'
import { SessionEngine } from './session'
import { getPhase } from '../core/timeline'
import { JsonStore } from './storage'
import { confirmCoreConsent } from './core-consent'
import { SystemSettings } from './system-settings'
import { DesktopMenu } from './tray'
import { Windows, validateWindowState } from './windows'

registerScheme()
if (
  !app.isPackaged &&
  process.env.NIGHTREIGN_USER_DATA &&
  isAbsolute(process.env.NIGHTREIGN_USER_DATA)
)
  app.setPath('userData', process.env.NIGHTREIGN_USER_DATA)

async function boot() {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  )
  session.defaultSession.setPermissionCheckHandler(() => false)
  const directory = app.getPath('userData')
  const firstRun = await access(join(directory, 'window-state.json')).then(
    () => false,
    () => true,
  )
  const store = new JsonStore(directory)
  if (app.isPackaged && !(await confirmCoreConsent(store))) {
    app.quit()
    return
  }
  const settings = await Settings.load(store)
  const restored = await store.read('session', validateSession, null)
  const positions = await store.read('window-state', validateWindowState, {})
  let revision = 0
  let error = store.warnings.length ? store.warnings.join(' ') : undefined
  let awaitingTick = false
  let boundary: NodeJS.Timeout | undefined
  let boundaryKey = ''
  let shuttingDown = false
  let savingToExit = false
  let quittingAllowed = false
  let persistPosition: NodeJS.Timeout | undefined
  let menu: DesktopMenu | undefined
  let pending: Promise<unknown> = Promise.resolve()
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation)
    pending = result.catch(() => {})
    return result
  }
  function report(e: unknown) {
    const message =
      typeof e === 'string'
        ? e
        : e instanceof Error && !('code' in e)
          ? e.message
          : '保存失败，请检查本地数据目录和磁盘空间。'
    if (!engine.error) error = message
    publish()
  }
  const engine = new SessionEngine({
    now: () => performance.now(),
    restored,
    save: (s) => store.write('session', s),
    emit: (event) => windows.present(event),
  })
  const windows = new Windows(positions, () => settings.preferences, {
    changed: publish,
    moved: () => {
      clearTimeout(persistPosition)
      persistPosition = setTimeout(
        () => void store.write('window-state', positions).catch(report),
        250,
      )
    },
    issue: report,
    sessionEnding: () => {
      const when = performance.now()
      void serialize(async () => {
        await engine.suspend('系统会话即将结束', when)
        await store.write('window-state', positions)
        publish()
      }).catch(report)
    },
    petCrash: () => {
      const when = performance.now()
      void serialize(async () => {
        await engine.suspend('小蜗窗口中断', when)
        publish()
      }).catch(report)
    },
  })
  function snapshot(): AppSnapshot {
    return {
      revision: ++revision,
      session: engine.snapshot(),
      preferences: structuredClone(settings.preferences),
      presets: structuredClone(settings.presets),
      petVisible: windows.petVisible,
      error: engine.error ?? error,
    }
  }
  function publish() {
    const state = snapshot()
    windows.broadcast('night:snapshot', state)
    menu?.refresh(state)
    const s = state.session
    const phase = s?.status === 'running' ? getPhase(s.timeline, s.elapsedMs) : null
    const key = phase && s ? s.id + '/' + phase.id : ''
    if (key !== boundaryKey) {
      clearTimeout(boundary)
      boundaryKey = key
      if (phase && s) boundary = setTimeout(tick, Math.max(1, Math.ceil(phase.endMs - s.elapsedMs)))
    }
  }
  const system = new SystemSettings((action) => {
    const s = engine.snapshot()
    switch (action) {
      case 'settings':
        windows.openControl('settings')
        break
      case 'visibility':
        windows.visibility(!windows.petVisible)
        break
      case 'pause':
        if (s && s.status !== 'completed')
          fire({ type: s.status === 'paused' ? 'resume' : 'pause', sessionId: s.id })
        break
      case 'clickThrough':
        fire({
          type: 'preferences',
          patch: { clickThrough: !settings.preferences.clickThrough },
          expectedRevision: settings.preferences.revision,
        })
    }
  })
  const issues = system.restore(settings.preferences.shortcuts)
  let login = settings.preferences.autoStart
  try {
    login = system.loginStatus()
  } catch {
    issues.push('无法读取系统开机启动状态。')
  }
  if (issues.length || login !== settings.preferences.autoStart) {
    await settings.savePreferences({
      ...settings.preferences,
      shortcuts: { ...system.shortcuts },
      autoStart: login,
      revision: settings.preferences.revision + 1,
    })
    if (issues.length) error = [error, ...issues].filter(Boolean).join(' ')
  }

  async function handle(command: Command) {
    switch (command.type) {
      case 'start':
        await engine.start(settings.find(command.presetId))
        windows.closeControl()
        break
      case 'pause':
        await engine.pause(command.sessionId)
        break
      case 'resume':
        await engine.resume(command.sessionId)
        break
      case 'abandon':
        await engine.abandon(command.sessionId)
        break
      case 'dismissResult': {
        const s = engine.snapshot()
        if (s?.id !== command.sessionId || s.status !== 'completed')
          throw new Error('该结算记录已更新。')
        windows.closeControl()
        break
      }
      case 'ultimate':
        await engine.ultimate(command.sessionId, command.phaseId)
        break
      case 'savePreset':
        await settings.savePreset(command.preset)
        break
      case 'deletePreset':
        await settings.deletePreset(command.id)
        break
      case 'preferences':
        await applyDesktopSettings(command, settings, system, windows, report)
        if (settings.preferences.clickThrough && !positions.clickThroughHintSeen) {
          positions.clickThroughHintSeen = true
          void store.write('window-state', positions).catch(report)
        }
        break
      case 'openControl':
        windows.openControl(command.page)
        break
      case 'visibility':
        windows.visibility(command.visible)
        break
      case 'resetPosition':
        windows.resetPosition()
        break
      case 'preview':
        windows.present({ id: randomUUID(), kind: 'preview' })
        break
      case 'contextMenu':
        menu?.popup()
        break
      case 'hitTest':
        windows.setHit(command.hit)
        return snapshot()
      case 'drag':
        windows.drag(command.dx, command.dy)
        return snapshot()
      case 'quit':
        void requestQuit()
        break
    }
    publish()
    return snapshot()
  }
  function run(command: Command) {
    if (savingToExit) return Promise.reject(new Error('应用正在保存并退出。'))
    return serialize(async () => {
      try {
        return await handle(command)
      } catch (e) {
        publish()
        if (e instanceof Error && 'code' in e)
          throw new Error('操作未保存，请检查磁盘和数据目录后重试。')
        throw e
      }
    })
  }
  function fire(command: Command) {
    if (
      command.type === 'preferences' &&
      command.patch.clickThrough &&
      !positions.clickThroughHintSeen
    ) {
      void windows
        .confirm(
          '开启后，桌宠上的点击将传给下面的窗口。可从系统托盘或菜单栏关闭「鼠标穿透」找回小蜗。',
          '开启穿透',
        )
        .then((yes) => {
          if (yes) return run(command)
        })
        .catch(report)
    } else void run(command).catch(report)
  }
  async function confirmAbandon() {
    const s = engine.snapshot()
    if (
      s &&
      s.status !== 'completed' &&
      (await windows.confirm('结束本次渡夜？当前进度将被放弃。', '结束本次'))
    )
      fire({ type: 'abandon', sessionId: s.id })
  }
  async function requestQuit(confirm = true) {
    if (shuttingDown || quittingAllowed) return
    shuttingDown = true
    try {
      const s = engine.snapshot()
      if (
        confirm &&
        s &&
        s.status !== 'completed' &&
        !(await windows.confirm('当前渡夜将保存，下次可继续。', '保存并退出'))
      )
        return
      if (confirm && !(await windows.closeControlForQuit())) return
      savingToExit = true
      const when = performance.now()
      await serialize(async () => {
        await engine.saveOnQuit(when)
        clearTimeout(persistPosition)
        await store.write('window-state', positions)
        quittingAllowed = true
        windows.dispose()
        globalShortcut.unregisterAll()
        menu?.tray.destroy()
      })
      app.quit()
    } catch (e) {
      report(e)
      windows.openControl('prepare')
    } finally {
      savingToExit = quittingAllowed
      shuttingDown = false
    }
  }

  serveResources(report)
  attachIpc(ipcMain, windows, snapshot, run)
  windows.createPet()
  menu = new DesktopMenu(snapshot, fire, () => {
    void confirmAbandon().catch(report)
  })
  if (firstRun || (restored && restored.status !== 'completed') || error)
    windows.openControl('prepare')
  await store.write('window-state', positions).catch(report)
  function tick() {
    if (engine.checkStorageHealth()) publish()
    if (awaitingTick || quittingAllowed || !engine.running) return
    awaitingTick = true
    const when = performance.now()
    void serialize(async () => {
      await engine.tick(when)
      publish()
    })
      .catch(report)
      .finally(() => {
        awaitingTick = false
      })
  }
  const timer = setInterval(tick, 250)
  let suspended = false
  powerMonitor.on('suspend', () => {
    suspended = true
    const when = performance.now()
    void serialize(async () => {
      await engine.suspend('系统睡眠', when)
      publish()
    }).catch(report)
  })
  powerMonitor.on('resume', () => {
    const unpaired = !suspended
    suspended = false
    const checkpoint = engine.checkpoint()
    void serialize(async () => {
      await engine.wake(unpaired, checkpoint)
      publish()
    }).catch(report)
  })
  powerMonitor.on('lock-screen', () => {
    const when = performance.now()
    void serialize(async () => {
      await engine.lock(settings.preferences.pauseOnLock, when)
      publish()
    }).catch(report)
  })
  powerMonitor.on('unlock-screen', () => {
    void serialize(async () => {
      await engine.unlock()
      publish()
    }).catch(report)
  })
  powerMonitor.on('shutdown', (event?: { preventDefault(): void }) => {
    event?.preventDefault()
    void requestQuit(false)
  })
  const reposition = () => windows.reposition()
  screen.on('display-added', reposition)
  screen.on('display-removed', reposition)
  screen.on('display-metrics-changed', reposition)
  app.on('activate', () => windows.openControl('prepare'))
  app.on('second-instance', () => windows.openControl('prepare'))
  app.on('before-quit', (event) => {
    if (quittingAllowed) return
    event.preventDefault()
    void requestQuit()
  })
  app.once('will-quit', () => {
    clearInterval(timer)
    clearTimeout(boundary)
  })
}
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('window-all-closed', () => {
    /* Tray remains available with control windows closed. */
  })
  void app
    .whenReady()
    .then(boot)
    .catch((error) => {
      dialog.showErrorBox(
        '小蜗渡夜启动失败',
        error instanceof Error ? error.message : '无法初始化本地应用。',
      )
      app.exit(1)
    })
}
