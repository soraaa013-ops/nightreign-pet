import { hitDrawables, textureMask, type TextureMask } from './drawable-hit'
import { assetUrl, characterActions, readAsset } from './manifest'
import type { BaseAction, CharacterAction, CubismManifest } from './manifest'
import {
  CubismEyeBlink,
  CubismFramework,
  CubismMatrix44,
  CubismModelSettingJson,
  CubismShaderManager_WebGL,
  CubismUserModel,
} from './vendor/cubism-framework.js'
import type { CubismId, CubismMotion } from './vendor/cubism-framework.js'

const priorities: Record<CharacterAction, number> = {
  idle: 1,
  touch: 2,
  battle: 3,
  battle2: 3,
  nightlord: 3,
  ultimate: 4,
  victory: 5,
}
let frameworkUsers = 0

interface LoadedAction {
  motions: CubismMotion[]
  next: number
  expression?: CubismMotion
}

export class CubismRuntime extends CubismUserModel {
  private readonly textures: WebGLTexture[] = []
  private readonly masks: TextureMask[] = []
  private readonly actions = new Map<CharacterAction, LoadedAction>()
  private readonly hitAreas: CubismId[] = []
  private readonly projection = new CubismMatrix44()
  private blink: CubismEyeBlink | undefined
  private breath: CubismId | undefined
  private activeAction: CharacterAction | undefined
  private baseAction: BaseAction = 'idle'
  private expressionTime = 0
  private breathTime = 0
  private viewX = 1
  private viewY = 1
  private closed = false

  private constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly manifest: CubismManifest,
    private readonly shaderUrl: URL,
  ) {
    super()
  }

  static async create(
    canvas: HTMLCanvasElement,
    manifest: CubismManifest,
    manifestUrl: URL,
    shaderUrl: URL,
    signal: AbortSignal,
  ): Promise<CubismRuntime> {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true })
    if (!gl || gl.isContextLost()) throw new Error('无法初始化 WebGL 2。')
    if (!CubismFramework.isInitialized()) {
      if (!CubismFramework.startUp()) throw new Error('Cubism Framework 初始化失败。')
      CubismFramework.initialize()
    }
    const runtime = new CubismRuntime(gl, manifest, shaderUrl)
    frameworkUsers++
    try {
      await runtime.loadFrom(assetUrl(manifest.model, manifestUrl), signal)
      return runtime
    } catch (error) {
      runtime.close()
      throw error
    }
  }

  get capabilities(): CharacterAction[] {
    const actions = [...this.actions.keys()]
    if (!actions.includes('idle') && (this.blink || this.breath)) actions.push('idle')
    return actions
  }

  play(action: CharacterAction): boolean {
    if (this.activeAction && priorities[this.activeAction] > priorities[action]) return false
    return this.startAction(action)
  }

  setBaseAction(action: BaseAction): void {
    if ((action === 'battle2' || action === 'nightlord') && !this.actions.has(action))
      action = 'battle'
    if (this.baseAction === action) return
    this.baseAction = action
    // The completed snapshot can arrive in the same tick as the victory performance.
    if (this.activeAction !== 'victory') this.startAction(action)
  }

  private startAction(action: CharacterAction): boolean {
    const definition = this.actions.get(action)
    if (!definition) return action === 'idle' && Boolean(this.blink || this.breath)
    this.activeAction = action
    const motion = definition.motions[definition.next]
    this.expressionTime = definition.expression && !motion ? 1.2 : 0
    if (motion) {
      definition.next = (definition.next + 1) % definition.motions.length
      this._motionManager.startMotionPriority(motion, false, priorities[action])
    }
    this._expressionManager.stopAllMotions()
    if (definition.expression) this._expressionManager.startMotion(definition.expression, false)
    return true
  }

  draw(elapsed: number, reducedMotion: boolean): void {
    const model = this.getModel()
    if (!model) return
    model.loadParameters()
    const moving = this._motionManager.updateMotion(model, elapsed)
    model.saveParameters()
    this.expressionTime = Math.max(0, this.expressionTime - elapsed)
    if (this._motionManager.isFinished() && this.expressionTime === 0) {
      if (this.activeAction !== undefined && this.activeAction !== 'idle')
        this._expressionManager.stopAllMotions()
      this.activeAction = undefined
      if (!reducedMotion && this.actions.has(this.baseAction)) this.startAction(this.baseAction)
    }
    if (!moving && !reducedMotion) this.blink?.updateParameters(model, elapsed)
    if (!moving && this.breath && !reducedMotion) {
      this.breathTime += elapsed
      model.setParameterValueById(this.breath, (Math.sin(this.breathTime * 1.8) + 1) / 2)
    }
    this._expressionManager.updateMotion(model, elapsed)
    this._physics?.evaluate(model, elapsed)
    this._pose?.updateParameters(model, elapsed)
    model.update()

    const { gl } = this
    const width = gl.drawingBufferWidth
    const height = gl.drawingBufferHeight
    const aspect = width / height
    const modelAspect = model.getCanvasWidth() / model.getCanvasHeight()
    this.viewY = Math.min(1, aspect / modelAspect) * (this.manifest.scale ?? 1)
    this.viewX = this.viewY / aspect
    this.projection.scale(this.viewX, this.viewY)
    this.projection.translate(this.manifest.offsetX ?? 0, this.manifest.offsetY ?? 0)
    this.projection.multiplyByMatrix(this.getModelMatrix())

    const renderer = this.getRenderer()
    renderer.setMvpMatrix(this.projection)
    renderer.setRenderState(null, [0, 0, width, height])
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    renderer.drawModel(this.shaderUrl.href)
  }

  hitTest(ndcX: number, ndcY: number): boolean {
    const x = (ndcX - (this.manifest.offsetX ?? 0)) / this.viewX
    const y = (ndcY - (this.manifest.offsetY ?? 0)) / this.viewY
    const model = this.getModel()
    if (!model) return false
    if (this.hitAreas.length && !this.hitAreas.some((id) => this.isHit(id, x, y))) return false
    const matrix = this.getModelMatrix()
    return hitDrawables(model, this.masks, matrix.invertTransformX(x), matrix.invertTransformY(y))
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.release()
    for (const action of this.actions.values()) {
      for (const motion of action.motions) motion.release()
      action.expression?.release()
    }
    this.actions.clear()
    for (const texture of this.textures) this.gl.deleteTexture(texture)
    this.textures.length = 0
    this.masks.length = 0
    frameworkUsers--
    if (frameworkUsers === 0) CubismFramework.dispose()
  }

  private async loadFrom(url: URL, signal: AbortSignal): Promise<void> {
    const definition = await loadBuffer(url, signal)
    if (definition.byteLength === 0) throw new Error(`模型文件为空：${url.pathname}。`)
    const setting = new CubismModelSettingJson(definition, definition.byteLength)
    try {
      const mocUrl = assetUrl(setting.getModelFileName(), url)
      const moc = await loadBuffer(mocUrl, signal)
      if (moc.byteLength < 64 || new TextDecoder().decode(moc.slice(0, 4)) !== 'MOC3') {
        throw new Error(`模型二进制文件无效：${mocUrl.pathname}。`)
      }
      this.loadModel(moc, true)
      const model = this.getModel()
      if (!model) throw new Error(`Cubism Core 无法读取 ${mocUrl.pathname}。`)
      const textureCount = setting.getTextureCount()
      if (textureCount === 0) throw new Error(`模型未声明贴图：${url.pathname}。`)

      await this.loadOptionalModelData(setting, url, signal)
      const breath = CubismFramework.getIdManager().getId('ParamBreath')
      if (model.getParameterIndex(breath) < model.getParameterCount()) this.breath = breath
      this.blink = setting.getEyeBlinkParameterCount() ? CubismEyeBlink.create(setting) : undefined
      const hits = this.manifest.hitAreas
      for (let index = 0; index < setting.getHitAreasCount(); index++) {
        const id = setting.getHitAreaId(index)
        if (hits?.includes(setting.getHitAreaName(index)) && model.getDrawableIndex(id) >= 0)
          this.hitAreas.push(id)
      }
      if (hits?.length && this.hitAreas.length !== hits.length)
        throw new Error('模型缺少清单指定的命中区域。')

      for (const action of characterActions) await this.loadAction(action, setting, url, signal)
      this.createRenderer(this.gl.drawingBufferWidth, this.gl.drawingBufferHeight)
      const renderer = this.getRenderer()
      renderer.startUp(this.gl)
      renderer.setIsPremultipliedAlpha(true)
      for (let index = 0; index < textureCount; index++) {
        const { texture, mask } = await loadTexture(
          this.gl,
          assetUrl(setting.getTextureFileName(index), url),
          signal,
        )
        this.textures.push(texture)
        this.masks.push(mask)
        renderer.bindTexture(index, texture)
      }
      await this.prepareShaders(signal)
    } finally {
      setting.release()
    }
  }

  private async loadOptionalModelData(
    setting: CubismModelSettingJson,
    url: URL,
    signal: AbortSignal,
  ): Promise<void> {
    const physics = setting.getPhysicsFileName()
    if (physics) {
      const file = await loadBuffer(assetUrl(physics, url), signal)
      this.loadPhysics(file, file.byteLength)
    }
    const pose = setting.getPoseFileName()
    if (pose) {
      const file = await loadBuffer(assetUrl(pose, url), signal)
      this.loadPose(file, file.byteLength)
    }
  }

  private async loadAction(
    action: CharacterAction,
    setting: CubismModelSettingJson,
    url: URL,
    signal: AbortSignal,
  ): Promise<void> {
    const definition = this.manifest.actions[action]
    if (!definition) return
    const result: LoadedAction = { motions: [], next: 0 }
    this.actions.set(action, result)
    if (definition.motion) {
      const { group, index, variants } = definition.motion
      const count = setting.getMotionCount(group)
      if (index >= count) throw new Error(`模型缺少动作 ${group}/${index}。`)
      const blink = Array.from({ length: setting.getEyeBlinkParameterCount() }, (_, i) =>
        setting.getEyeBlinkParameterId(i),
      )
      for (let n = 0; n < (variants ? count : 1); n++) {
        const slot = (index + n) % count
        const path = assetUrl(setting.getMotionFileName(group, slot), url)
        const file = await loadBuffer(path, signal)
        const motion = this.loadMotion(
          file,
          file.byteLength,
          action,
          undefined,
          undefined,
          setting,
          group,
          slot,
          true,
        )
        if (!motion) throw new Error(`动作文件无效：${path.pathname}。`)
        motion.setLoop(false)
        motion.setEffectIds(blink, [])
        result.motions.push(motion)
      }
    }
    if (definition.expression) {
      const index = Array.from({ length: setting.getExpressionCount() }, (_, i) => i).find(
        (i) => setting.getExpressionName(i) === definition.expression,
      )
      if (index === undefined) throw new Error(`模型缺少表情 ${definition.expression}。`)
      const path = assetUrl(setting.getExpressionFileName(index), url)
      const file = await loadBuffer(path, signal)
      const expression = this.loadExpression(file, file.byteLength, definition.expression)
      if (!expression) throw new Error(`表情文件无效：${path.pathname}。`)
      result.expression = expression
    }
  }

  private async prepareShaders(signal: AbortSignal): Promise<void> {
    const shader = CubismShaderManager_WebGL.getInstance().getShader(this.gl)
    this.getRenderer().loadShaders(this.shaderUrl.href)
    const deadline = performance.now() + 8_000
    while (shader._isShaderLoading && performance.now() < deadline) {
      signal.throwIfAborted()
      await new Promise((resolve) => window.setTimeout(resolve, 16))
    }
    signal.throwIfAborted()
    if (
      !shader._isShaderLoaded ||
      shader._shaderSets.slice(0, 4).some((set) => !set.shaderProgram)
    ) {
      throw new Error(`Cubism 着色器加载失败：${this.shaderUrl.pathname}。`)
    }
  }
}

async function loadBuffer(url: URL, signal: AbortSignal): Promise<ArrayBuffer> {
  return (await readAsset(url, signal)).arrayBuffer()
}

async function loadTexture(
  gl: WebGL2RenderingContext,
  url: URL,
  signal: AbortSignal,
): Promise<{ texture: WebGLTexture; mask: TextureMask }> {
  const response = await readAsset(url, signal)
  const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'premultiply' })
  try {
    signal.throwIfAborted()
    if (
      bitmap.width > gl.getParameter(gl.MAX_TEXTURE_SIZE) ||
      bitmap.height > gl.getParameter(gl.MAX_TEXTURE_SIZE)
    ) {
      throw new Error(`贴图尺寸超过显卡上限：${url.pathname}。`)
    }
    const mask = textureMask(bitmap)
    const texture = gl.createTexture()
    if (!texture) throw new Error(`无法分配贴图：${url.pathname}。`)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    gl.bindTexture(gl.TEXTURE_2D, null)
    return { texture, mask }
  } finally {
    bitmap.close()
  }
}
