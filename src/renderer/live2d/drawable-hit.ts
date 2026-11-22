import type { CubismModel } from './vendor/cubism-framework.js'

export interface TextureMask {
  width: number
  height: number
  alpha: Uint8Array
}

/** Keep a small CPU copy of texture coverage so pointer motion never stalls the GPU. */
export function textureMask(image: ImageBitmap): TextureMask {
  const scale = Math.min(1, 1024 / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const context = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('无法读取角色贴图的透明区域。')
  context.drawImage(image, 0, 0, width, height)
  const pixels = context.getImageData(0, 0, width, height).data
  const alpha = new Uint8Array(width * height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3]
  return { width, height, alpha }
}

/** Interpolate the UV at the pointer using the current (deformed) triangle. */
function paintedTriangle(
  vertices: Float32Array,
  uv: Float32Array,
  mask: TextureMask,
  a: number,
  b: number,
  c: number,
  x: number,
  y: number,
  opacity: number,
): boolean {
  const ax = vertices[a],
    ay = vertices[a + 1]
  const bx = vertices[b],
    by = vertices[b + 1]
  const cx = vertices[c],
    cy = vertices[c + 1]
  if (
    x < Math.min(ax, bx, cx) ||
    x > Math.max(ax, bx, cx) ||
    y < Math.min(ay, by, cy) ||
    y > Math.max(ay, by, cy)
  )
    return false
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  if (Math.abs(area) < 1e-10) return false
  const wb = ((x - ax) * (cy - ay) - (y - ay) * (cx - ax)) / area
  const wc = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / area
  const wa = 1 - wb - wc
  if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) return false
  const u = wa * uv[a] + wb * uv[b] + wc * uv[c]
  // Cubism's vertex shader flips V before sampling the top-origin atlas.
  const v = 1 - (wa * uv[a + 1] + wb * uv[b + 1] + wc * uv[c + 1])
  const col = Math.max(0, Math.min(mask.width - 1, Math.floor(u * mask.width)))
  const row = Math.max(0, Math.min(mask.height - 1, Math.floor(v * mask.height)))
  return mask.alpha[row * mask.width + col] * opacity > 24
}

export function hitDrawables(
  model: CubismModel,
  masks: TextureMask[],
  x: number,
  y: number,
): boolean {
  for (let i = model.getDrawableCount() - 1; i >= 0; i--) {
    const opacity = model.getDrawableOpacity(i)
    const mask = masks[model.getDrawableTextureIndex(i)]
    if (!mask || opacity < 0.1 || !model.getDrawableDynamicFlagIsVisible(i)) continue
    const vertices = model.getDrawableVertexPositions(i)
    const uv = model.getDrawableVertexUvs(i)
    const indices = model.getDrawableVertexIndices(i)
    for (let j = 0; j < indices.length; j += 3) {
      if (
        paintedTriangle(
          vertices,
          uv,
          mask,
          indices[j] * 2,
          indices[j + 1] * 2,
          indices[j + 2] * 2,
          x,
          y,
          opacity,
        )
      )
        return true
    }
  }
  return false
}
