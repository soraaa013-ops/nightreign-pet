/** The surface used by the desktop renderer, from Cubism Web Framework 5-r.5. */
export interface CubismId { readonly __cubismId: never }

export class CubismFramework {
  static startUp(): boolean
  static initialize(): void
  static dispose(): void
  static isInitialized(): boolean
  static getIdManager(): { getId(id: string): CubismId }
}

export class CubismModelSettingJson {
  constructor(buffer: ArrayBuffer, size: number)
  release(): void
  getModelFileName(): string
  getTextureCount(): number
  getTextureFileName(index: number): string
  getPhysicsFileName(): string
  getPoseFileName(): string
  getHitAreasCount(): number
  getHitAreaName(index: number): string
  getHitAreaId(index: number): CubismId
  getMotionFileName(group: string, index: number): string
  getMotionCount(group: string): number
  getEyeBlinkParameterCount(): number
  getEyeBlinkParameterId(index: number): CubismId
  getExpressionCount(): number
  getExpressionName(index: number): string
  getExpressionFileName(index: number): string
}

export class CubismMatrix44 {
  scale(x: number, y: number): void
  translate(x: number, y: number): void
  multiplyByMatrix(matrix: CubismMatrix44): void
}

interface CubismModelMatrix extends CubismMatrix44 {
  invertTransformX(value: number): number
  invertTransformY(value: number): number
}

export interface CubismModel {
  getCanvasWidth(): number
  getCanvasHeight(): number
  getDrawableCount(): number
  getDrawableIndex(id: CubismId): number
  getDrawableOpacity(index: number): number
  getDrawableVertexUvs(index: number): Float32Array
  getDrawableTextureIndex(index: number): number
  getDrawableDynamicFlagIsVisible(index: number): boolean
  getDrawableVertexIndices(index: number): Uint16Array
  getDrawableVertexPositions(index: number): Float32Array
  getParameterCount(): number
  getParameterIndex(id: CubismId): number
  setParameterValueByIndex(index: number, value: number, weight?: number): void
  setParameterValueById(id: CubismId, value: number): void
  saveParameters(): void
  loadParameters(): void
  update(): void
}

export interface CubismMotion {
  release(): void
  setLoop(loop: boolean): void
  setEffectIds(eyeBlink: CubismId[], lipSync: CubismId[]): void
}

interface CubismRenderer {
  startUp(gl: WebGL2RenderingContext): void
  setIsPremultipliedAlpha(enabled: boolean): void
  bindTexture(index: number, texture: WebGLTexture): void
  loadShaders(path: string): void
  setMvpMatrix(matrix: CubismMatrix44): void
  setRenderState(framebuffer: WebGLFramebuffer | null, viewport: number[]): void
  drawModel(shaderPath: string): void
}

export class CubismUserModel {
  loadModel(buffer: ArrayBuffer, shouldCheckMocConsistency?: boolean): void
  loadMotion(buffer: ArrayBuffer, size: number, name: string, finished?: undefined, began?: undefined,
    setting?: CubismModelSettingJson, group?: string, index?: number, shouldCheckMotionConsistency?: boolean): CubismMotion | null
  loadExpression(buffer: ArrayBuffer, size: number, name: string): CubismMotion | null
  loadPhysics(buffer: ArrayBuffer, size: number): void
  loadPose(buffer: ArrayBuffer, size: number): void
  getModel(): CubismModel | null
  getModelMatrix(): CubismModelMatrix
  getRenderer(): CubismRenderer
  createRenderer(width: number, height: number): void
  isHit(drawableId: CubismId, x: number, y: number): boolean
  release(): void
  protected _physics: { evaluate(model: CubismModel, elapsed: number): void } | null
  protected _pose: { updateParameters(model: CubismModel, elapsed: number): void } | null
  protected _motionManager: CubismMotionManager
  protected _expressionManager: {
    startMotion(motion: CubismMotion, autoDelete: boolean): number
    stopAllMotions(): void
    updateMotion(model: CubismModel, elapsed: number): boolean
  }
}

export class CubismEyeBlink {
  static create(setting: CubismModelSettingJson): CubismEyeBlink
  updateParameters(model: CubismModel, elapsed: number): void
}

export class CubismMotionManager {
  startMotionPriority(motion: CubismMotion, autoDelete: boolean, priority: number): number
  updateMotion(model: CubismModel, elapsed: number): boolean
  isFinished(): boolean
  stopAllMotions(): void
}

export class CubismShaderManager_WebGL {
  static getInstance(): CubismShaderManager_WebGL
  getShader(gl: WebGL2RenderingContext): {
    _isShaderLoaded: boolean
    _isShaderLoading: boolean
    _shaderSets: { shaderProgram: WebGLProgram | null }[]
  }
}
