import { _electron as electron, expect } from '@playwright/test'
import { execFile } from 'node:child_process'
import { glob, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const paths = await Array.fromAsync(glob('test-results/revenant-final/*/character.json'))
const measurement = process.argv[3] ?? paths[0]
if (!measurement)
  throw new Error('请先运行角色桌面测试生成 character.json，或在第二个参数指定该文件。')
const { pixels } = JSON.parse(await readFile(measurement, 'utf8'))
expect(pixels.gap, '人物轮廓内应有可用于原生测试的空隙').toBeDefined()

// XTest delivers real X11 pointer events to the top eligible native window.
const systemClick = `
from ctypes import CDLL, c_char_p, c_int, c_uint, c_ulong, c_void_p
import sys, time
x = CDLL('libX11.so.6')
test = CDLL('libXtst.so.6')
x.XOpenDisplay.argtypes = [c_char_p]
x.XOpenDisplay.restype = c_void_p
x.XSync.argtypes = [c_void_p, c_int]
x.XCloseDisplay.argtypes = [c_void_p]
test.XTestFakeMotionEvent.argtypes = [c_void_p, c_int, c_int, c_int, c_ulong]
test.XTestFakeButtonEvent.argtypes = [c_void_p, c_uint, c_int, c_ulong]
display = x.XOpenDisplay(None)
if not display: raise RuntimeError('无法打开 X11 显示器')
test.XTestFakeMotionEvent(display, -1, int(sys.argv[1]), int(sys.argv[2]), 0)
x.XSync(display, 0)
time.sleep(0.4)
for pressed in (1, 0):
    test.XTestFakeButtonEvent(display, 1, pressed, 0)
    x.XSync(display, 0)
    time.sleep(0.06)
x.XCloseDisplay(display)
`

const profile = await mkdtemp(join(tmpdir(), 'revenant-native-hit-'))
let app
try {
  app = await electron.launch({
    executablePath: resolve(process.argv[2] ?? 'release/linux-unpacked/nightreign-pet'),
    args: process.env.NIGHTREIGN_TEST_SOFTWARE_WEBGL === '1' ? ['--enable-unsafe-swiftshader'] : [],
    chromiumSandbox: process.env.NIGHTREIGN_CHROMIUM_NO_SANDBOX !== '1',
    env: { ...process.env, XDG_CONFIG_HOME: profile },
  })
  const view = (name) => app.windows().find((page) => page.url().includes('view=' + name))
  await expect.poll(() => Boolean(view('pet') && view('control'))).toBe(true)
  const pet = view('pet')
  await expect(pet.locator('.pet-model')).toBeVisible()
  await expect(pet.locator('.pet-concept')).toHaveCount(0, { timeout: 20_000 })
  await view('control').close()
  const bounds = await app.evaluate(async ({ BrowserWindow }) => {
    const pet = BrowserWindow.getAllWindows().find((win) =>
      win.webContents.getURL().includes('view=pet'),
    )
    const bounds = pet.getBounds()
    const target = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      title: 'X11 pointer target',
    })
    await target.loadURL('data:text/html,<body>Pointer target</body>')
    await target.webContents.executeJavaScript(
      `window.points = []; addEventListener('pointerup', e => window.points.push([e.clientX, e.clientY])); true`,
    )
    target.show()
    pet.showInactive()
    pet.moveTop()
    return bounds
  })
  const target = app.windows().find((page) => page.url().startsWith('data:text/html,'))
  const received = () => target.evaluate(() => window.points)
  async function click({ x, y }) {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().includes('view=pet'))
        .moveTop(),
    )
    await run('python3', [
      '-c',
      systemClick,
      String(bounds.x + Math.round(x)),
      String(bounds.y + Math.round(y)),
    ])
  }
  const corner = { x: 15, y: 10 }
  await click(corner)
  await expect.poll(received).toEqual([[corner.x, corner.y]])
  await click(pixels.gap)
  const transparentHits = [
    [corner.x, corner.y],
    [pixels.gap.x, pixels.gap.y],
  ]
  await expect.poll(received).toEqual(transparentHits)
  expect(view('control')).toBeUndefined()
  await click(pixels.solid)
  await expect.poll(() => Boolean(view('control'))).toBe(true)
  expect(await received()).toEqual(transparentHits)
  console.log(JSON.stringify({ desktopReceived: transparentHits, characterReceived: pixels.solid }))
} finally {
  if (app) await app.evaluate(({ app: main }) => main.exit(0)).catch(() => {})
  await rm(profile, { recursive: true, force: true, maxRetries: 3 })
}
