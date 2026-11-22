import { app, BrowserWindow, dialog, screen } from 'electron'
import type { Rectangle, WebContents } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AppSnapshot, Preferences, PresentationEvent } from '../contracts/types'
import { fields, integer, record, requireValue } from '../core/validation'
import { clampBounds, dragBounds, petSize } from './window-geometry'

export type View = 'pet' | 'control' | 'overlay'
export type Page = 'prepare' | 'settings' | 'result'
type Placement = { x: number; y: number; width: number; height: number; displayId: number }
export type WindowState = {
  pet?: Placement
  control?: Placement
  petVisible?: boolean
  clickThroughHintSeen?: boolean
}
export function validateWindowState(value: unknown): WindowState {
  const state = record(value)
  fields(state, ['pet', 'control', 'petVisible', 'clickThroughHintSeen'], [])
  if (state.petVisible !== undefined)
    requireValue(typeof state.petVisible === 'boolean', '可见状态无效。')
  if (state.clickThroughHintSeen !== undefined)
    requireValue(typeof state.clickThroughHintSeen === 'boolean', '穿透说明标记无效。')
  for (const p of [state.pet, state.control])
    if (p !== undefined) {
      const rect = record(p)
      fields(rect, ['x', 'y', 'width', 'height', 'displayId'])
      requireValue(
        ['x', 'y', 'displayId'].every((k) =>
          integer(rect[k], -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
        ) && ['width', 'height'].every((k) => integer(rect[k], 1, 32768)),
        '窗口位置无效。',
      )
    }
  return value as WindowState
}

const placement = (rect: Rectangle) => ({ ...rect, displayId: screen.getDisplayMatching(rect).id })

interface Callbacks {
  changed(): void
  moved(): void
  petCrash(): void
  sessionEnding(): void
  issue(error: string): void
}
export class Windows {
  pet?: BrowserWindow
  control?: BrowserWindow
  overlay?: BrowserWindow
  petVisible: boolean
  private logicalPetBounds?: Rectangle
  private dragRemainder = { x: 0, y: 0 }
  private pendingControlPage?: Page
  private hit = true
  private ignored?: boolean
  private overlayTimeout?: NodeJS.Timeout
  private linuxHover?: NodeJS.Timeout
  private base: URL
  private quitting = false

  constructor(
    public state: WindowState,
    private prefs: () => Preferences,
    private callbacks: Callbacks,
  ) {
    this.petVisible = state.petVisible ?? true
    const dev = !app.isPackaged && process.env.ELECTRON_RENDERER_URL
    this.base = dev ? new URL(dev) : pathToFileURL(join(__dirname, '../renderer/index.html'))
    if (
      dev &&
      (!['http:', 'https:'].includes(this.base.protocol) ||
        !['localhost', '127.0.0.1', '[::1]'].includes(this.base.hostname))
    )
      throw new Error('开发界面须从本机加载。')
  }

  view(contents: WebContents): View | undefined {
    if (contents === this.pet?.webContents) return 'pet'
    if (contents === this.control?.webContents) return 'control'
    if (contents === this.overlay?.webContents) return 'overlay'
  }
  trusted(url: string, view: View) {
    try {
      const u = new URL(url)
      return (
        u.origin === this.base.origin &&
        u.protocol === this.base.protocol &&
        u.pathname === this.base.pathname &&
        u.searchParams.get('view') === view
      )
    } catch {
      return false
    }
  }
  private load(window: BrowserWindow, view: View, page?: Page) {
    const url = new URL(this.base)
    url.searchParams.set('view', view)
    if (page) url.searchParams.set('page', page)
    void window.loadURL(url.href).catch((e) => {
      if (!window.isDestroyed() && !String(e).includes('ERR_ABORTED'))
        this.callbacks.issue('无法加载应用界面。')
    })
  }
  private create(options: Electron.BrowserWindowConstructorOptions, pet = false) {
    const window = new BrowserWindow({
      ...options,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: !pet,
        autoplayPolicy: 'no-user-gesture-required',
      },
    })
    window.setMenuBarVisibility(false)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-frame-navigate', (event) => event.preventDefault())
    window.webContents.on('will-redirect', (event) => event.preventDefault())
    window.webContents.on('will-attach-webview', (event) => event.preventDefault())
    return window
  }

  private restoreBounds(
    view: 'pet' | 'control',
    width: number,
    height: number,
    reset = false,
  ): Rectangle {
    const saved = reset ? undefined : this.state[view]
    const display = saved && screen.getAllDisplays().find((d) => d.id === saved.displayId)
    const area = (display || screen.getPrimaryDisplay()).workArea
    width = view === 'control' && saved ? saved.width : width
    height = view === 'control' && saved ? saved.height : height
    const x =
      display && saved
        ? saved.x
        : area.x + (view === 'pet' ? area.width - width - 24 : (area.width - width) / 2)
    const y =
      display && saved
        ? saved.y
        : area.y + (view === 'pet' ? area.height - height - 16 : (area.height - height) / 2)
    return clampBounds({ x, y, width, height }, area)
  }
  private petBounds(reset = false) {
    const { width, height } = petSize(this.prefs().scale)
    return this.restoreBounds('pet', width, height, reset)
  }
  private remember(view: 'pet' | 'control', window: BrowserWindow) {
    if (window.isDestroyed() || window.isMinimized() || window.isMaximized()) return
    this.state[view] = placement(window.getBounds())
    this.callbacks.moved()
  }
  createPet() {
    if (this.pet && !this.pet.isDestroyed()) return
    const bounds = this.petBounds()
    const window = this.create(
      {
        ...bounds,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        title: '小蜗',
        focusable: false,
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        hasShadow: false,
        alwaysOnTop: this.prefs().alwaysOnTop,
      },
      true,
    )
    this.pet = window
    this.logicalPetBounds = bounds
    this.ignored = undefined
    this.hit = true
    this.setHit(true)
    window.once('ready-to-show', () => {
      if (this.petVisible) window.showInactive()
      // Some window managers change the initial mapped size at fractional scale.
      if (this.logicalPetBounds) this.placePet(this.logicalPetBounds)
    })
    if (process.platform === 'win32') window.on('query-session-end', this.callbacks.sessionEnding)
    window.on('close', (event) => {
      if (!this.quitting) {
        event.preventDefault()
        this.visibility(false)
      }
    })
    window.webContents.once('render-process-gone', () => {
      if (this.quitting) return
      this.callbacks.petCrash()
      window.destroy()
      this.pet = undefined
      this.createPet()
    })
    this.load(window, 'pet')
    // X11 lacks mouse forwarding for ignored windows. Sample pointer motion only
    // while ignored and inject the normal local move for renderer hit testing.
    if (process.platform === 'linux' && !this.linuxHover) {
      let last = ''
      this.linuxHover = setInterval(() => {
        if (
          !this.ignored ||
          this.prefs().clickThrough ||
          !this.petVisible ||
          !this.pet ||
          this.pet.isDestroyed()
        ) {
          last = ''
          return
        }
        const p = screen.getCursorScreenPoint(),
          b = this.pet.getBounds()
        const x = p.x - b.x,
          y = p.y - b.y
        const key = x + ',' + y
        if (x >= 0 && x < b.width && y >= 0 && y < b.height && key !== last)
          this.pet.webContents.sendInputEvent({ type: 'mouseMove', x, y })
        last = key
      }, 40)
    }
  }
  openControl(page: Page = 'prepare') {
    let window = this.control
    if (!window || window.isDestroyed()) {
      const bounds = this.restoreBounds('control', 1020, 720)
      window = this.create({
        ...bounds,
        minWidth: Math.min(480, bounds.width),
        minHeight: Math.min(400, bounds.height),
        title: '小蜗渡夜',
        backgroundColor: '#11161e',
      })
      this.control = window
      const current = window
      current.on('move', () => this.remember('control', current))
      current.on('resize', () => this.remember('control', current))
      current.on('closed', () => {
        if (this.control === current) {
          this.control = undefined
          this.pendingControlPage = undefined
        }
      })
      current.webContents.on('will-prevent-unload', (event) => {
        const choice = dialog.showMessageBoxSync(current, {
          type: 'question',
          buttons: ['继续编辑', '放弃修改'],
          defaultId: 0,
          cancelId: 0,
          message: '渡夜节奏尚未保存。',
        })
        if (choice === 1) event.preventDefault()
      })
      current.webContents.on('did-finish-load', () => {
        if (this.pendingControlPage && this.control === current) {
          current.webContents.send('night:navigate', this.pendingControlPage)
          this.pendingControlPage = undefined
        }
      })
      current.webContents.once('render-process-gone', () => current.destroy())
      current.once('ready-to-show', () => {
        if (!current.isDestroyed()) {
          current.show()
          current.focus()
        }
      })
      this.load(window, 'control', page)
    } else {
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
      if (window.webContents.isLoadingMainFrame()) this.pendingControlPage = page
      else window.webContents.send('night:navigate', page)
    }
  }
  closeControl() {
    this.control?.close()
  }
  async closeControlForQuit(): Promise<boolean> {
    const window = this.control
    if (!window || window.isDestroyed()) return true
    return new Promise((resolve) => {
      const closed = () => {
        resolve(true)
      }
      const blocked = (event: Electron.Event) => {
        if (event.defaultPrevented) return
        window.removeListener('closed', closed)
        resolve(false)
      }
      window.once('closed', closed)
      window.webContents.once('will-prevent-unload', blocked)
      window.close()
    })
  }
  visibility(visible: boolean) {
    this.petVisible = this.state.petVisible = visible
    if (visible) this.pet?.showInactive()
    else this.pet?.hide()
    this.callbacks.moved()
    this.callbacks.changed()
  }
  setHit(hit: boolean, prefs = this.prefs()) {
    this.hit = hit
    const ignore = prefs.clickThrough || !hit
    if (ignore === this.ignored) return
    this.pet?.setIgnoreMouseEvents(ignore, { forward: ignore && !prefs.clickThrough })
    this.ignored = ignore
  }
  getPetBounds() {
    return this.logicalPetBounds && { ...this.logicalPetBounds }
  }
  placePet(bounds: Rectangle) {
    if (!this.pet) return
    // Readback bounds are rounded outwards on fractional-DPI displays.
    // Keep authored DIPs separate so a move can never feed that rounding back into the size.
    this.pet.setBounds(bounds)
    this.logicalPetBounds = { ...bounds }
    this.dragRemainder = { x: 0, y: 0 }
    this.state.pet = placement(bounds)
    this.callbacks.moved()
  }
  drag(dx: number, dy: number, finished = true) {
    const previous = this.logicalPetBounds,
      prefs = this.prefs()
    if (!previous || prefs.positionLocked || prefs.clickThrough) return
    const size = petSize(prefs.scale)
    const offsetX = dx + this.dragRemainder.x,
      offsetY = dy + this.dragRemainder.y
    const intendedX = previous.x + offsetX,
      intendedY = previous.y + offsetY
    const destination = screen.getDisplayMatching({
      ...size,
      x: Math.round(intendedX),
      y: Math.round(intendedY),
    }).workArea
    const next = dragBounds(
      previous,
      offsetX,
      offsetY,
      size,
      screen.getAllDisplays().map((d) => d.workArea),
      destination,
      finished,
    )
    if (
      finished ||
      next.x !== previous.x ||
      next.y !== previous.y ||
      next.width !== previous.width ||
      next.height !== previous.height
    )
      this.placePet(next)
    // Fractional pointer coordinates are common at 125% and 150% display scale.
    this.dragRemainder = {
      x: !finished && next.x === Math.round(intendedX) ? intendedX - next.x : 0,
      y: !finished && next.y === Math.round(intendedY) ? intendedY - next.y : 0,
    }
  }
  apply(old: Preferences, next: Preferences) {
    if (old.clickThrough !== next.clickThrough) {
      this.ignored = undefined
      this.setHit(this.hit, next)
    }
    if (old.alwaysOnTop !== next.alwaysOnTop) this.pet?.setAlwaysOnTop(next.alwaysOnTop)
    if (old.scale !== next.scale && this.logicalPetBounds) {
      const b = this.logicalPetBounds,
        area = screen.getDisplayMatching(b).workArea
      const { width, height } = petSize(next.scale)
      this.placePet(
        clampBounds({ x: b.x + b.width - width, y: b.y + b.height - height, width, height }, area),
      )
    }
  }
  resetPosition() {
    if (this.pet) {
      this.placePet(this.petBounds(true))
      this.visibility(true)
    }
  }
  reposition() {
    this.placePet(this.petBounds())
    if (this.control) {
      const b = this.restoreBounds('control', 1020, 720)
      this.control.setMinimumSize(Math.min(b.width, 480), Math.min(b.height, 400))
      this.control.setBounds(b)
    }
    if (this.overlay) this.overlay.setBounds(this.overlayBounds())
  }
  private overlayBounds() {
    const area = (
      this.pet ? screen.getDisplayMatching(this.pet.getBounds()) : screen.getPrimaryDisplay()
    ).workArea
    const width = Math.min(area.width, 680),
      height = Math.min(area.height, 200)
    return clampBounds(
      {
        x: area.x + (area.width - width) / 2,
        y: area.y + (area.height - height) / 2,
        width,
        height,
      },
      area,
    )
  }
  private showOverlay() {
    this.overlay?.destroy()
    clearTimeout(this.overlayTimeout)
    const window = this.create({
      ...this.overlayBounds(),
      transparent: true,
      frame: false,
      focusable: false,
      resizable: false,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
    })
    this.overlay = window
    window.setIgnoreMouseEvents(true)
    window.once('ready-to-show', () => {
      if (!window.isDestroyed()) window.showInactive()
    })
    window.on('closed', () => {
      if (this.overlay === window) this.overlay = undefined
    })
    this.load(window, 'overlay')
    this.overlayTimeout = setTimeout(() => {
      if (!window.isDestroyed()) window.destroy()
    }, 5100)
  }
  broadcast(channel: string, data: AppSnapshot | PresentationEvent) {
    for (const window of [this.pet, this.control, this.overlay])
      if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
        window.webContents.send(channel, data)
  }
  present(event: PresentationEvent) {
    if (event.kind === 'victory' && this.petVisible && this.prefs().victoryPosition === 'center')
      this.showOverlay()
    this.broadcast('night:present', event)
  }
  async confirm(message: string, accept: string): Promise<boolean> {
    const options: Electron.MessageBoxOptions = {
      type: 'question',
      buttons: ['取消', accept],
      defaultId: 0,
      cancelId: 0,
      message,
    }
    const answer = this.control?.isVisible()
      ? await dialog.showMessageBox(this.control, options)
      : await dialog.showMessageBox(options)
    return answer.response === 1
  }
  dispose() {
    this.quitting = true
    clearTimeout(this.overlayTimeout)
    clearInterval(this.linuxHover)
  }
}
