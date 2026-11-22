import { BrowserWindow, dialog, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { JsonStore } from './storage'

const noticeVersion = 'live2d-proprietary-2.1/notice-1'
const officialLicense =
  'https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_cn.html'

async function askConsent(): Promise<boolean> {
  const file = join(process.resourcesPath, 'resources', 'licenses', 'cubism-core.html')
  const page = pathToFileURL(file)
  page.searchParams.set('view', 'consent')
  const window = new BrowserWindow({
    title: 'Cubism Core 使用条款',
    width: 630,
    height: 550,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#131a21',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
    },
  })
  if (process.platform !== 'darwin') window.removeMenu()
  return new Promise<boolean>((resolve, reject) => {
    window.once('closed', () => resolve(false))
    window.once('ready-to-show', () => {
      if (!window.isDestroyed()) window.show()
    })
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url === officialLicense) {
        void shell.openExternal(officialLicense).catch(() => {
          if (!window.isDestroyed()) dialog.showErrorBox('无法打开默认浏览器', officialLicense)
        })
      }
      return { action: 'deny' }
    })
    // Both choices are plain HTML form submissions from this one local document.
    window.webContents.on('will-navigate', (event) => {
      event.preventDefault()
      if (window.webContents.getURL() !== page.href) return
      const target = new URL(event.url)
      const decision = target.searchParams.get('decision')
      if (
        target.protocol !== page.protocol ||
        target.host !== page.host ||
        target.pathname !== page.pathname ||
        target.searchParams.get('view') !== 'consent' ||
        (decision !== 'accept' && decision !== 'exit')
      )
        return
      resolve(decision === 'accept')
      window.destroy()
    })
    window.webContents.on('will-redirect', (event) => event.preventDefault())
    window.webContents.once('render-process-gone', () => window.destroy())
    void window.loadURL(page.href).catch(() => {
      if (window.isDestroyed()) return
      reject(new Error('无法打开本地 Cubism Core 使用条款。请检查安装文件。'))
      window.destroy()
    })
  })
}

export async function confirmCoreConsent(store: JsonStore): Promise<boolean> {
  const current = await store.read(
    'cubism-core-consent',
    (value) => {
      if (typeof value !== 'string') throw new Error('使用条款记录损坏。')
      return value
    },
    '',
  )
  if (current === noticeVersion) return true
  if (!(await askConsent())) return false
  await store.write('cubism-core-consent', noticeVersion)
  return true
}
