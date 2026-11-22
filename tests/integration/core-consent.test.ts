import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { confirmCoreConsent } from '../../src/main/core-consent'
import { JsonStore } from '../../src/main/storage'

class ConsentWindow extends EventEmitter {
  static current?: ConsentWindow
  webContents = Object.assign(new EventEmitter(), {
    getURL: () => this.url,
    setWindowOpenHandler: vi.fn(),
  })
  url = ''
  constructor() {
    super()
    ConsentWindow.current = this
  }
  async loadURL(url: string) {
    this.url = url
  }
  isDestroyed() {
    return ConsentWindow.current !== this
  }
  removeMenu() {}
  show() {}
  destroy() {
    ConsentWindow.current = undefined
    this.emit('closed')
  }
  agree() {
    const url = new URL(this.url)
    url.searchParams.set('decision', 'accept')
    this.webContents.emit('will-navigate', { url: url.href, preventDefault() {} })
  }
}
vi.mock('electron', () => ({
  get BrowserWindow() {
    return ConsentWindow
  },
  shell: {},
}))

let directory: string
let store: JsonStore
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'core-consent-'))
  store = new JsonStore(directory)
  vi.stubGlobal('process', Object.create(process, { resourcesPath: { value: directory } }))
})
afterEach(async () => {
  vi.unstubAllGlobals()
  ConsentWindow.current?.destroy()
  await rm(directory, { recursive: true, force: true })
})

async function displayed() {
  await vi.waitFor(() => expect(ConsentWindow.current).toBeDefined())
  return ConsentWindow.current!
}

test('关闭与拒绝相同，不写入记录；接受损坏记录后的新条款时原子保存', async () => {
  const first = confirmCoreConsent(store)
  const closed = await displayed()
  closed.destroy()
  await expect(first).resolves.toBe(false)
  expect(await readdir(directory)).toEqual([])

  await writeFile(join(directory, 'cubism-core-consent.json'), '{')
  const second = confirmCoreConsent(store)
  const accepted = await displayed()
  accepted.agree()
  await expect(second).resolves.toBe(true)
  expect((await readdir(directory)).some((name) => name.includes('.corrupt-'))).toBe(true)
  await expect(confirmCoreConsent(new JsonStore(directory))).resolves.toBe(true)
  expect(ConsentWindow.current).toBeUndefined()
})

test('旧版条款要求再次确认，保存失败不能启动桌宠', async () => {
  await store.write('cubism-core-consent', 'old-notice')
  const decision = confirmCoreConsent(store)
  const window = await displayed()
  await mkdir(join(directory, 'cubism-core-consent.json.bak'))
  window.agree()
  await expect(decision).rejects.toThrow()
  expect(await store.read('cubism-core-consent', String, '')).toBe('old-notice')
})
