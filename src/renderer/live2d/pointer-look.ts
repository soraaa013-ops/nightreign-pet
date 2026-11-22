import { CubismFramework, type CubismModel } from './vendor/cubism-framework.js'

export class PointerLook {
  private readonly eye: number
  private readonly tilt: number
  private readonly pitch: number
  private x = 0
  private y = 0
  private eyeX = 0
  private headX = 0
  private headY = 0
  private weight = 0
  private attention = 0

  constructor(private readonly model: CubismModel) {
    const index = (id: string) => {
      const value = model.getParameterIndex(CubismFramework.getIdManager().getId(id))
      return value < model.getParameterCount() ? value : -1
    }
    this.eye = index('ParamGaze')
    this.tilt = index('ParamHeadTilt')
    this.pitch = index('ParamHeadPitch')
  }

  aim(x: number, y: number): void {
    this.x = Math.max(-1, Math.min(1, x))
    this.y = Math.max(-1, Math.min(1, y))
    this.attention = 3
  }

  release(immediate: boolean): void {
    this.attention = 0
    if (immediate) {
      this.weight = 0
      this.eyeX = this.headX = this.headY = 0
    }
  }

  apply(elapsed: number): void {
    this.attention = Math.max(0, this.attention - elapsed)
    const following = this.attention > 0
    if (!following && this.weight === 0) return
    const headBlend = 1 - Math.exp(-6 * elapsed)
    if (following) {
      this.eyeX += (this.x - this.eyeX) * (1 - Math.exp(-16 * elapsed))
      this.headX += (this.x - this.headX) * headBlend
      this.headY += (this.y - this.headY) * headBlend
    }
    this.weight +=
      ((following ? 1 : 0) - this.weight) * (1 - Math.exp(-(following ? 12 : 7) * elapsed))
    if (!following && this.weight < 0.001) {
      this.release(true)
      return
    }
    // Blend over this frame's authored pose. The motion manager saved its own pose earlier.
    if (this.eye >= 0) this.model.setParameterValueByIndex(this.eye, this.eyeX, 0.9 * this.weight)
    if (this.tilt >= 0)
      this.model.setParameterValueByIndex(this.tilt, 0.45 * this.headX, 0.8 * this.weight)
    if (this.pitch >= 0)
      this.model.setParameterValueByIndex(this.pitch, 0.55 * this.headY, 0.78 * this.weight)
  }
}
