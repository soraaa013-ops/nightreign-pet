import type { Rectangle } from 'electron'

export function clampBounds(bounds: Rectangle, area: Rectangle): Rectangle {
  const width = Math.min(bounds.width, area.width)
  const height = Math.min(bounds.height, area.height)
  return {
    width,
    height,
    x: Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))),
  }
}

export function petSize(scale: number) {
  return { width: Math.round((320 * scale) / 100), height: Math.round((350 * scale) / 100) }
}

// During a gesture the pet may straddle adjacent screens. On release the whole
// window fits the selected screen, including layouts with gaps or an offset Dock.
export function dragBounds(
  previous: Rectangle,
  dx: number,
  dy: number,
  size: { width: number; height: number },
  workAreas: Rectangle[],
  destination: Rectangle,
  finished: boolean,
): Rectangle {
  const requested = { ...size, x: previous.x + dx, y: previous.y + dy }
  if (finished || workAreas.length <= 1) return clampBounds(requested, destination)
  const x = Math.min(...workAreas.map((a) => a.x)),
    y = Math.min(...workAreas.map((a) => a.y))
  const right = Math.max(...workAreas.map((a) => a.x + a.width)),
    bottom = Math.max(...workAreas.map((a) => a.y + a.height))
  return clampBounds(requested, { x, y, width: right - x, height: bottom - y })
}
