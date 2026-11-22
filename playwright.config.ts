import { defineConfig } from '@playwright/test'

const outputDir =
  process.env.NIGHTREIGN_LONG_TEST === '1'
    ? 'long-run'
    : process.env.NIGHTREIGN_PERF_TEST === '1'
      ? 'performance'
      : 'desktop'

export default defineConfig({
  testDir: './tests/desktop',
  timeout: 45_000,
  expect: { timeout: 7000 },
  workers: 1,
  reporter: 'line',
  outputDir: `test-results/${outputDir}`,
})
