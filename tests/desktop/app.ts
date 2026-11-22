import { test as base, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Locator, Page, TestInfo } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import type { Command } from '../../src/contracts/types'

type View = 'pet' | 'control' | 'overlay'

export const test = base.extend<{ launchApp: () => Promise<ElectronApplication> }>({
  launchApp: async ({}, use) => {
    const profile = await mkdtemp(join(tmpdir(), 'nightreign-electron-'))
    const launched: { app: ElectronApplication; child: ChildProcess }[] = []
    try {
      await use(async () => {
        const executablePath = process.env.NIGHTREIGN_TEST_PACKAGED_EXECUTABLE
        const args = executablePath
          ? [`--user-data-dir=${profile}`]
          : [process.env.NIGHTREIGN_TEST_APP_DIR ?? resolve(__dirname, '../..')]
        if (executablePath && process.env.NIGHTREIGN_TEST_SOFTWARE_WEBGL === '1')
          args.push('--enable-unsafe-swiftshader')
        const env = {
          ...process.env,
          ...(executablePath ? { XDG_CONFIG_HOME: profile } : { NIGHTREIGN_USER_DATA: profile }),
        }
        const chromiumSandbox = process.env.NIGHTREIGN_CHROMIUM_NO_SANDBOX !== '1'
        const app = await electron.launch({ executablePath, args, env, chromiumSandbox })
        launched.push({ app, child: app.process() })
        const identity = await app.evaluate(({ app: main }) => ({
          data: main.getPath('userData'),
          packaged: main.isPackaged,
        }))
        expect(identity.packaged).toBe(Boolean(executablePath))
        expect(identity.data).toBe(profile)
        if (identity.packaged) {
          await expect
            .poll(() =>
              app.windows().some((page) => /[?&]view=(consent|pet|control)\b/.test(page.url())),
            )
            .toBe(true)
          const consent = app.windows().find((page) => page.url().includes('view=consent'))
          if (consent) {
            await startFromControl(
              consent,
              consent.getByRole('button', { name: '同意并进入', exact: true }),
            )
            console.info('发行测试已在独立用户目录通过首次确认。')
          }
        }
        return app
      })
    } finally {
      for (const { app, child } of launched.reverse()) {
        if (child.exitCode !== null || child.signalCode !== null) continue
        const closed = app.waitForEvent('close', { timeout: 5000 }).catch(() => {})
        // Cleanup does not answer an application's native confirmation dialog.
        await app.evaluate(({ app: main }) => main.exit(0)).catch(() => {})
        await closed
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      }
      await rm(profile, { recursive: true, force: true, maxRetries: 2 })
    }
  },
})

export { expect }

export async function view(app: ElectronApplication, name: View): Promise<Page> {
  let found: Page | undefined
  await expect
    .poll(() => {
      found = app.windows().find((page) => {
        try {
          return new URL(page.url()).searchParams.get('view') === name
        } catch {
          return false
        }
      })
      return Boolean(found)
    })
    .toBe(true)
  if (!found) throw new Error(`未找到 ${name} 窗口`)
  await found.locator(`body[data-view="${name}"]`).waitFor()
  return found
}

export async function snapshot(page: Page) {
  return page.evaluate(() => window.nightreign.getSnapshot())
}

export async function command(page: Page, value: Command) {
  return page.evaluate((input) => window.nightreign.command(input), value)
}

export async function startFromControl(control: Page, button: Locator) {
  await expect(button).toBeEnabled()
  await Promise.all([
    control.waitForEvent('close'),
    button.click().catch((error: unknown) => {
      if (!control.isClosed()) throw error
    }),
  ])
}

export async function screenshot(page: Page, info: TestInfo, name: string) {
  const view = new URL(page.url()).searchParams.get('view')
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    omitBackground: view === 'pet' || view === 'overlay',
  })
}
