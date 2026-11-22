import { Menu, nativeImage, Tray } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import type { AppSnapshot, Command, Preferences } from '../contracts/types'

// A monochrome crescent remains legible in the menu bar and system tray.
function trayImage() {
  const size = 32,
    pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5),
        cut = Math.hypot(x - 21, y - 11)
      const alpha = Math.max(0, Math.min(1, 14.5 - d, cut - 10))
      const i = 4 * (y * size + x)
      pixels[i] = 106
      pixels[i + 1] = 199
      pixels[i + 2] = 239
      pixels[i + 3] = Math.round(255 * alpha)
    }
  const icon = nativeImage
    .createFromBitmap(pixels, { width: size, height: size })
    .resize({ width: 18, height: 18 })
  if (process.platform === 'darwin') icon.setTemplateImage(true)
  return icon
}
export class DesktopMenu {
  readonly tray = new Tray(trayImage())
  private key = ''
  constructor(
    private snapshot: () => AppSnapshot,
    private invoke: (command: Command) => void,
    private abandon: () => void,
  ) {
    this.tray.setToolTip('小蜗渡夜')
    this.tray.on('double-click', () => invoke({ type: 'openControl', page: 'prepare' }))
    this.refresh()
  }

  private build(tray: boolean) {
    const { session: s, preferences: p, petVisible } = this.snapshot()
    const running = s && s.status !== 'completed'
    const check = (
      label: string,
      checked: boolean,
      patch: Partial<Preferences>,
    ): MenuItemConstructorOptions => ({
      label,
      type: 'checkbox',
      checked,
      click: () =>
        this.invoke({
          type: 'preferences',
          expectedRevision: this.snapshot().preferences.revision,
          patch,
        }),
    })
    const action = (label: string, command: Command): MenuItemConstructorOptions => ({
      label,
      click: () => this.invoke(command),
    })
    const entries: MenuItemConstructorOptions[] = []
    if (tray) {
      entries.push(
        action(petVisible ? '隐藏小蜗' : '显示小蜗', { type: 'visibility', visible: !petVisible }),
        action('重置位置并显示小蜗', { type: 'resetPosition' }),
        { type: 'separator' },
      )
    }
    if (running)
      entries.push(
        action(s.status === 'running' ? '暂停渡夜' : '继续渡夜', {
          type: s.status === 'running' ? 'pause' : 'resume',
          sessionId: s.id,
        }),
      )
    else entries.push(action('出击准备', { type: 'openControl', page: 'prepare' }))
    if (s?.status === 'completed')
      entries.push(action('最近一次结算', { type: 'openControl', page: 'result' }))
    entries.push(
      check('静音', p.muted, { muted: !p.muted }),
      check('安静模式', p.quietMode, { quietMode: !p.quietMode }),
      check('显示计时环', p.statusBar !== 'hidden', {
        statusBar: p.statusBar === 'hidden' ? 'compact' : 'hidden',
      }),
      check('锁定位置', p.positionLocked, { positionLocked: !p.positionLocked }),
      check('鼠标穿透', p.clickThrough, { clickThrough: !p.clickThrough }),
      action('设置', { type: 'openControl', page: 'settings' }),
    )
    if (running) entries.push({ label: '结束本次渡夜…', click: () => this.abandon() })
    entries.push({ type: 'separator' }, action('退出小蜗渡夜', { type: 'quit' }))
    return Menu.buildFromTemplate(entries)
  }
  refresh(s = this.snapshot()) {
    const key = JSON.stringify([
      s.preferences.revision,
      s.petVisible,
      s.session?.id,
      s.session?.status,
    ])
    if (this.key === key) return
    this.key = key
    this.tray.setContextMenu(this.build(true))
  }
  popup() {
    this.build(false).popup()
  }
}
