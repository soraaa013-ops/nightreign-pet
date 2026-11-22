import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, AppSnapshot, PresentationEvent } from '../contracts/types'

function subscribe<T>(channel: string, listener: (payload: T) => void) {
  if (typeof listener !== 'function') throw new Error('请选择有效的状态监听器。')
  const callback = (_event: Electron.IpcRendererEvent, data: T) => listener(data)
  ipcRenderer.on(channel, callback)
  return () => {
    ipcRenderer.removeListener(channel, callback)
  }
}
ipcRenderer.on('night:navigate', (_event, page: unknown) => {
  if (page !== 'prepare' && page !== 'settings' && page !== 'result') return
  document.documentElement.dataset.requestedControlPage = page
  window.dispatchEvent(new Event('nightreign:navigate'))
})

const api: DesktopApi = {
  getSnapshot: () => ipcRenderer.invoke('night:read'),
  command: (command) =>
    ipcRenderer.invoke('night:command', { requestId: crypto.randomUUID(), command }),
  previewTimeline: (preset) => ipcRenderer.invoke('night:preview', preset),
  onSnapshot: (listener) => subscribe<AppSnapshot>('night:snapshot', listener),
  onPresentation: (listener) => subscribe<PresentationEvent>('night:present', listener),
}
contextBridge.exposeInMainWorld('nightreign', api)
