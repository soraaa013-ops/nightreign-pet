import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateSession } from '../../src/core/validation'
import { compileTimeline } from '../../src/core/timeline'
import { JsonStore } from '../../src/main/storage'
import { shortPreset } from '../fixtures'

type Entry = { value: number }

function validateEntry(value: unknown): Entry {
  if (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    typeof value.value === 'number'
  ) {
    return { value: value.value }
  }
  throw new Error('测试记录值无效')
}

describe('本地 JSON 存储', () => {
  let directory: string
  let store: JsonStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nightreign-json-'))
    store = new JsonStore(directory)
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  test('并发写入按调用顺序保存，并保留上一份可读取的备份', async () => {
    await Promise.all([
      store.write('preferences', { value: 1 }),
      store.write('presets', { value: 10 }),
      store.write('preferences', { value: 2 }),
      store.write('preferences', { value: 3 }),
    ])

    const next = new JsonStore(directory)
    await expect(next.read('preferences', validateEntry, { value: 0 })).resolves.toEqual({
      value: 3,
    })
    await expect(next.read('presets', validateEntry, { value: 0 })).resolves.toEqual({ value: 10 })
    expect(JSON.parse(await readFile(join(directory, 'preferences.json.bak'), 'utf8'))).toEqual({
      schemaVersion: 1,
      data: { value: 2 },
    })
    expect((await readdir(directory)).some((name) => name.endsWith('.tmp'))).toBe(false)
  })

  test.each([
    '{"schemaVersion":1,"data":',
    '{"schemaVersion":0,"data":{"value":20}}',
    '{"schemaVersion":1,"data":{"value":"bad"}}',
  ])('正式记录无效时读取备份并保存原字节 %s', async (damaged) => {
    await store.write('preferences', { value: 1 })
    await store.write('preferences', { value: 2 })
    await writeFile(join(directory, 'preferences.json'), damaged)

    const next = new JsonStore(directory)
    await expect(next.read('preferences', validateEntry, { value: 0 })).resolves.toEqual({
      value: 1,
    })
    expect(next.warnings).toHaveLength(2)
    const retained = (await readdir(directory)).find((name) =>
      name.startsWith('preferences.json.corrupt-'),
    )
    if (!retained) throw new Error('无法找到归档的受损记录')
    await expect(readFile(join(directory, retained), 'utf8')).resolves.toBe(damaged)

    await next.write('preferences', { value: 3 })
    const restarted = new JsonStore(directory)
    await expect(restarted.read('preferences', validateEntry, { value: 0 })).resolves.toEqual({
      value: 3,
    })
    expect(JSON.parse(await readFile(join(directory, 'preferences.json.bak'), 'utf8'))).toEqual({
      schemaVersion: 1,
      data: { value: 1 },
    })
  })

  test('两份会话无效时不捏造存档，也不从孤立临时文件恢复', async () => {
    const session = {
      id: 'existing-expedition',
      status: 'running',
      presetName: '测试恢复',
      timeline: compileTimeline(shortPreset()),
      elapsedMs: 500,
      usedUltimates: [],
    }
    await writeFile(join(directory, 'session.json'), '{}')
    await writeFile(join(directory, 'session.json.bak'), 'null')
    await writeFile(
      join(directory, 'session.json.orphan.tmp'),
      JSON.stringify({ schemaVersion: 1, data: session }),
    )

    await expect(store.read('session', validateSession, null)).resolves.toBeNull()
    expect((await readdir(directory)).filter((name) => name.includes('.corrupt-'))).toHaveLength(2)
  })

  test('备份替换失败保留旧记录，移除故障后串行队列可继续写入', async () => {
    await store.write('preferences', { value: 1 })
    const blocked = join(directory, 'preferences.json.bak')
    await mkdir(blocked)

    await expect(store.write('preferences', { value: 2 })).rejects.toThrow()
    const next = new JsonStore(directory)
    await expect(next.read('preferences', validateEntry, { value: 0 })).resolves.toEqual({
      value: 1,
    })
    expect((await readdir(directory)).some((name) => name.endsWith('.tmp'))).toBe(false)

    await rm(blocked, { recursive: true })
    await store.write('preferences', { value: 3 })
    const restarted = new JsonStore(directory)
    await expect(restarted.read('preferences', validateEntry, { value: 0 })).resolves.toEqual({
      value: 3,
    })
  })

  test('数据目录无法创建时显式失败，修复后同一存储实例能保存', async () => {
    const target = join(directory, 'blocked')
    await writeFile(target, '占用数据目录路径')
    const unavailable = new JsonStore(target)

    await expect(unavailable.write('preferences', { value: 4 })).rejects.toThrow()
    expect(await readFile(target, 'utf8')).toBe('占用数据目录路径')
    await rm(target)
    await unavailable.write('preferences', { value: 4 })
    await expect(unavailable.read('preferences', validateEntry, { value: 0 })).resolves.toEqual({
      value: 4,
    })
  })
})
