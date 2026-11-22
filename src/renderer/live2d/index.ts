import { loadCubismCore } from './cubism-core'
import { readManifest } from './manifest'
import type { BaseAction, CharacterAction } from './manifest'

export type { CharacterAction } from './manifest'

export const characterManifestUrl = 'app://assets/character/revenant/manifest.json'
const defaultCoreUrl = 'app://assets/character/cubism-core/live2dcubismcore.min.js'
const defaultShaderUrl = 'app://assets/character/cubism-shaders/'
const frameInterval = 1000 / 30
const reducedFrameInterval = 1000 / 15

export type Live2DStatus =
  | { state: 'loading' }
  | { state: 'ready'; capabilities: readonly CharacterAction[] }
  | { state: 'error'; message: string }

export interface Live2DAdapterOptions {
  manifestUrl?: string
  coreUrl?: string
  shaderUrl?: string
  onStatus?: (status: Live2DStatus) => void
}

export class Live2DAdapter {
  private runtime?: import('./cubism-runtime').CubismRuntime
  private pending?: Promise<void>
  private request?: AbortController
  private frameId?: number
  private previousFrame?: number
  private visible = true
  private reducedMotion = false
  private paused = false
  private hasDrawn = false
  private disposed = false
  private baseAction: BaseAction = 'idle'
  private readonly sizeObserver: ResizeObserver

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: Live2DAdapterOptions = {},
  ) {
    canvas.addEventListener('webglcontextlost', this.contextLost)
    canvas.addEventListener('webglcontextrestored', this.contextRestored)
    this.sizeObserver = new ResizeObserver(() => this.schedule())
    this.sizeObserver.observe(canvas)
  }

  load(): Promise<void> {
    if (this.pending) return this.pending
    if (this.disposed || this.runtime) return Promise.resolve()
    const request = new AbortController()
    this.request = request
    const pending = this.open(request.signal).finally(() => {
      if (this.request === request) {
        this.pending = undefined
        this.request = undefined
      }
    })
    this.pending = pending
    this.options.onStatus?.({ state: 'loading' })
    return pending
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return
    this.visible = visible
    if (visible) this.schedule()
    else this.stopFrames()
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return
    this.paused = paused
    if (paused && this.hasDrawn) this.stopFrames()
    else this.schedule()
  }

  setBaseAction(action: BaseAction): void {
    this.baseAction = action
    this.runtime?.setBaseAction(action)
  }

  play(action: CharacterAction): boolean {
    return this.runtime?.play(action) ?? false
  }

  hitTest(clientX: number, clientY: number): boolean {
    if (!this.visible || !this.hasDrawn || !this.runtime) return false
    const bounds = this.canvas.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return false
    const x = (clientX - bounds.left) / bounds.width
    const y = (clientY - bounds.top) / bounds.height
    if (x < 0 || x > 1 || y < 0 || y > 1) return false
    return this.runtime.hitTest(x * 2 - 1, 1 - y * 2)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.sizeObserver.disconnect()
    this.reset()
    this.canvas.removeEventListener('webglcontextlost', this.contextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.contextRestored)
  }

  private async open(signal: AbortSignal): Promise<void> {
    try {
      const base = document.baseURI
      const manifestUrl = new URL(this.options.manifestUrl ?? characterManifestUrl, base)
      const manifest = await readManifest(manifestUrl, signal)
      await loadCubismCore(new URL(this.options.coreUrl ?? defaultCoreUrl, base))
      signal.throwIfAborted()
      const { CubismRuntime } = await import('./cubism-runtime')
      signal.throwIfAborted()
      this.resize()
      const runtime = await CubismRuntime.create(
        this.canvas,
        manifest,
        manifestUrl,
        new URL(this.options.shaderUrl ?? defaultShaderUrl, base),
        signal,
      )
      if (signal.aborted) {
        runtime.close()
        return
      }
      this.runtime = runtime
      runtime.setBaseAction(this.baseAction)
      this.options.onStatus?.({ state: 'ready', capabilities: runtime.capabilities })
      this.schedule()
    } catch (error) {
      if (!signal.aborted) this.options.onStatus?.({ state: 'error', message: errorMessage(error) })
    }
  }

  private readonly contextLost = (event: Event): void => {
    event.preventDefault()
    this.reset()
    this.options.onStatus?.({ state: 'error', message: 'WebGL 上下文丢失，等待恢复。' })
  }

  private readonly contextRestored = (): void => {
    void this.load()
  }

  private reset(): void {
    this.stopFrames()
    this.request?.abort()
    this.request = undefined
    this.pending = undefined
    this.runtime?.close()
    this.runtime = undefined
    this.hasDrawn = false
  }

  private schedule(): void {
    if (this.visible && this.runtime && this.frameId === undefined)
      this.frameId = requestAnimationFrame(this.draw)
  }

  private stopFrames(): void {
    if (this.frameId !== undefined) cancelAnimationFrame(this.frameId)
    this.frameId = undefined
    this.previousFrame = undefined
  }

  private readonly draw = (time: number): void => {
    this.frameId = undefined
    if (!this.runtime || !this.visible) return
    const interval = this.reducedMotion ? reducedFrameInterval : frameInterval
    const elapsed = this.previousFrame === undefined ? interval : time - this.previousFrame
    if (elapsed < interval - 1) {
      this.schedule()
      return
    }
    this.previousFrame = time
    try {
      this.resize()
      this.runtime.draw(this.paused ? 0 : Math.min(elapsed / 1000, 0.1), this.reducedMotion)
      this.hasDrawn = true
      if (!this.paused) this.schedule()
    } catch (error) {
      this.reset()
      this.options.onStatus?.({ state: 'error', message: errorMessage(error) })
    }
  }

  private resize(): void {
    const { width, height } = this.canvas.getBoundingClientRect()
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 3)
    const pixelWidth = Math.max(1, Math.round(width * pixelRatio))
    const pixelHeight = Math.max(1, Math.round(height * pixelRatio))
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : `角色加载失败：${String(error)}`
}
