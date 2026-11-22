import type { Phase } from '../../contracts/types'
/** The ring only resets when a new day begins. */
export function haloScale(phase: Phase | undefined, elapsedMs: number): number {
  if (!phase) return 1
  const progress = Math.max(
    0,
    Math.min(1, (elapsedMs - phase.startMs) / (phase.endMs - phase.startMs)),
  )
  if (phase.id.endsWith('shrink1')) return 1 - 0.24 * progress
  if (phase.id.endsWith('inner')) return 0.76
  if (phase.id.endsWith('shrink2')) return 0.76 - 0.26 * progress
  if (phase.kind === 'battle') return 0.5
  return 1
}
export interface AlphaMask {
  width: number
  height: number
  data: Uint8ClampedArray
}
export function imageHit(
  mask: AlphaMask | null,
  box: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
): boolean {
  if (!mask || box.width <= 0 || box.height <= 0) return false
  const scale = Math.min(box.width / mask.width, box.height / mask.height)
  const left = box.left + (box.width - mask.width * scale) / 2
  const top = box.top + (box.height - mask.height * scale) / 2
  const mx = Math.floor((x - left) / scale),
    my = Math.floor((y - top) / scale)
  if (mx < 0 || my < 0 || mx >= mask.width || my >= mask.height) return false
  return mask.data[(my * mask.width + mx) * 4 + 3] > 24
}
