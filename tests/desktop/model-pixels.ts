import type { Page } from '@playwright/test'

export async function modelPixels(pet: Page, output?: string) {
  const png = await pet.screenshot({
    path: output,
    omitBackground: true,
    style: '.pet-scene > :not(.pet-model) { visibility: hidden !important }',
  })
  return pet.evaluate(async (base64) => {
    const image = new Image()
    image.src = 'data:image/png;base64,' + base64
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    const { data } = ctx.getImageData(0, 0, image.width, image.height)
    let opaque = 0,
      transparent = 0,
      nearest = Infinity
    let solid = { x: 0, y: 0 }
    const painted = { left: image.width, top: image.height, right: -1, bottom: -1 }
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const alpha = data[4 * (y * image.width + x) + 3]
        if (alpha < 8) transparent++
        if (alpha >= 32) {
          painted.left = Math.min(painted.left, x)
          painted.top = Math.min(painted.top, y)
          painted.right = Math.max(painted.right, x)
          painted.bottom = Math.max(painted.bottom, y)
        }
        if (alpha < 225) continue
        opaque++
        const d = Math.hypot(x - image.width / 2, y - image.height / 2)
        if (d < nearest) {
          nearest = d
          solid = { x: (x * innerWidth) / image.width, y: (y * innerHeight) / image.height }
        }
      }
    }
    // Find a transparent opening between opaque parts of the silhouette. Its
    // center stays clear if the idle pose moves by a few pixels before clicking.
    let gap: { x: number; y: number } | undefined
    let best = 11
    for (let y = 4; y < image.height * 0.78; y++) {
      let lastSolid = -1
      for (let x = 0; x < image.width; x++) {
        if (data[(y * image.width + x) * 4 + 3] < 64) continue
        const width = x - lastSolid,
          mid = Math.floor((lastSolid + x) / 2)
        if (lastSolid >= 0 && width > best) {
          let clear = true
          for (let dy = -3; dy <= 3 && clear; dy++)
            for (let dx = -3; dx <= 3; dx++)
              if (data[((y + dy) * image.width + mid + dx) * 4 + 3] > 4) clear = false
          if (clear) {
            best = width
            gap = { x: (mid * innerWidth) / image.width, y: (y * innerHeight) / image.height }
          }
        }
        lastSolid = x
      }
    }
    return {
      width: image.width,
      height: image.height,
      coverage: opaque / (image.width * image.height),
      transparent: transparent / (image.width * image.height),
      solid,
      painted,
      gap,
      corner: data[3],
    }
  }, png.toString('base64'))
}
