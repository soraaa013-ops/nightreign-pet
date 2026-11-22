import { afterEach, describe, expect, test, vi } from 'vitest'
import { assetUrl, readManifest } from '../../src/renderer/live2d/manifest'

const manifestUrl = new URL('app://assets/character/revenant/manifest.json')

describe('角色资源清单', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('引用只能解析到模型目录内的本地文件', () => {
    expect(assetUrl('textures/face.png', manifestUrl).href).toBe(
      'app://assets/character/revenant/textures/face.png',
    )
    for (const path of [
      '',
      '../outside.png',
      '%2e%2e/outside.png',
      'textures/a%2fb.png',
      'a%5cb.png',
      '/absolute.png',
      'https://example.invalid/model.model3.json',
      'a.png?x=1',
      'a.png#anchor',
      'win\\a.png',
    ])
      expect(() => assetUrl(path, manifestUrl), path).toThrow()
  })

  test('缺失清单和未知动作返回明确错误，正常动作映射可读', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const signal = new AbortController().signal
    fetch.mockResolvedValueOnce(new Response(null, { status: 404 }))
    await expect(readManifest(manifestUrl, signal)).rejects.toThrow(/manifest\.json.*404/)
    fetch.mockResolvedValueOnce(
      Response.json({ version: 1, status: 'missing', reason: '尚无可用小蜗资源。' }),
    )
    await expect(readManifest(manifestUrl, signal)).rejects.toThrow('尚无可用小蜗资源。')
    fetch.mockResolvedValueOnce(
      Response.json({
        version: 1,
        status: 'available',
        model: 'model.model3.json',
        actions: { unknown: { expression: 'a' } },
      }),
    )
    await expect(readManifest(manifestUrl, signal)).rejects.toThrow(/清单无效/)

    const valid = {
      version: 1,
      status: 'available',
      model: 'model.model3.json',
      actions: { idle: { motion: { group: 'Idle', index: 0 } }, touch: { expression: 'smile' } },
    }
    fetch.mockResolvedValueOnce(Response.json(valid))
    await expect(readManifest(manifestUrl, signal)).resolves.toEqual(valid)
    expect(fetch).toHaveBeenLastCalledWith(manifestUrl, { signal })
  })
})
