export const characterActions = [
  'idle',
  'touch',
  'battle',
  'battle2',
  'nightlord',
  'ultimate',
  'victory',
] as const
export type CharacterAction = (typeof characterActions)[number]
export type BaseAction = 'idle' | 'battle' | 'battle2' | 'nightlord'

export interface ActionMapping {
  motion?: { group: string; index: number; variants?: boolean }
  expression?: string
}

export interface CubismManifest {
  version: 1
  status: 'available'
  model: string
  actions: Partial<Record<CharacterAction, ActionMapping>>
  hitAreas?: string[]
  decorativeDrawables?: string[]
  scale?: number
  offsetX?: number
  offsetY?: number
}

type Manifest = CubismManifest | { version: 1; status: 'missing'; reason: string }

export async function readAsset(url: URL, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`无法读取 ${url.pathname}（HTTP ${response.status}）。`)
  return response
}

export async function readManifest(url: URL, signal: AbortSignal): Promise<CubismManifest> {
  const response = await readAsset(url, signal)
  const value: unknown = await response.json()
  if (!isManifest(value)) throw new Error(`角色资源清单无效：${url.pathname}。`)
  if (value.status === 'missing') throw new Error(value.reason)
  return value
}

export function assetUrl(path: string, parent: URL): URL {
  const root = new URL('./', parent)
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes(':') ||
    /%2f|%5c|%00/i.test(path)
  ) {
    throw new Error(`角色资源必须是相对路径：${path}。`)
  }
  const url = new URL(path, root)
  if (
    url.protocol !== root.protocol ||
    url.host !== root.host ||
    !url.pathname.startsWith(root.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new Error(`角色资源必须在模型目录内：${path}。`)
  }
  return url
}

function isManifest(value: unknown): value is Manifest {
  if (!isRecord(value) || value.version !== 1) return false
  if (value.status === 'missing') return typeof value.reason === 'string' && value.reason.length > 0
  if (
    value.status !== 'available' ||
    typeof value.model !== 'string' ||
    !value.model.endsWith('.model3.json')
  )
    return false
  if (
    !isRecord(value.actions) ||
    !Object.entries(value.actions).every(
      ([name, mapping]) =>
        characterActions.some((action) => action === name) && isActionMapping(mapping),
    )
  )
    return false
  for (const names of [value.hitAreas, value.decorativeDrawables]) {
    if (
      names !== undefined &&
      (!Array.isArray(names) || !names.every((name) => typeof name === 'string'))
    )
      return false
  }
  for (const position of [value.scale, value.offsetX, value.offsetY]) {
    if (position !== undefined && (typeof position !== 'number' || !Number.isFinite(position)))
      return false
  }
  return value.scale === undefined || (typeof value.scale === 'number' && value.scale > 0)
}

function isActionMapping(value: unknown): value is ActionMapping {
  if (!isRecord(value)) return false
  if (value.expression !== undefined && (typeof value.expression !== 'string' || !value.expression))
    return false
  if (value.motion === undefined) return value.expression !== undefined
  return (
    isRecord(value.motion) &&
    typeof value.motion.group === 'string' &&
    value.motion.group.length > 0 &&
    typeof value.motion.index === 'number' &&
    Number.isSafeInteger(value.motion.index) &&
    (value.motion.variants === undefined || typeof value.motion.variants === 'boolean') &&
    value.motion.index >= 0
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
