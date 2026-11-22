// Run with Electron. This is a developer tool for placing the painted cutouts on the rig.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const root = path.resolve(__dirname, '../../art/revenant')

async function assemble() {
  const composition = JSON.parse(await fs.readFile(path.join(root, 'composition.json'), 'utf8'))
  const sheet = await fs.readFile(path.join(root, 'painted-parts.png'))
  const blink = await fs.readFile(path.join(root, 'painted-blink.png'))
  const spirit = await fs.readFile(path.join(root, 'painted-spirit.png'))
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  await window.loadURL('about:blank')
  const result = await window.webContents.executeJavaScript(
    `(${rasterize.toString()})(${JSON.stringify(composition)}, ${JSON.stringify(sheet.toString('base64'))}, ${JSON.stringify(blink.toString('base64'))}, ${JSON.stringify(spirit.toString('base64'))})`,
  )
  await fs.mkdir(path.join(root, 'parts'), { recursive: true })
  for (const layer of result.images) {
    await fs.writeFile(path.join(root, layer.file), Buffer.from(layer.data, 'base64'))
  }
  await fs.writeFile(path.join(root, 'layout.json'), JSON.stringify(result.layout, null, 2) + '\n')
  await fs.writeFile(
    path.resolve(root, '../../resources/character/preview/revenant-portrait.webp'),
    Buffer.from(result.portrait, 'base64'),
  )
  window.destroy()
}

async function rasterize(
  { canvas: dimensions, layers, eyelids, spirit, landmarks },
  input,
  blink,
  spiritImage,
) {
  async function decode(base64) {
    const image = new Image()
    image.src = 'data:image/png;base64,' + base64
    await image.decode()
    return image
  }
  const source = await decode(input)
  function surface(width, height) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  const combined = surface(...dimensions)
  const imageData = (canvas) => canvas.toDataURL('image/png').split(',')[1]
  const images = []
  const layout = { canvas: dimensions, landmarks, layers: [] }
  const [sx, sy, sw, sh] = spirit.place
  const ghost = surface(sw, sh)
  const ghostContext = ghost.getContext('2d')
  ghostContext.imageSmoothingQuality = 'high'
  ghostContext.drawImage(await decode(spiritImage), 0, 0, sw, sh)
  images.push({ file: 'parts/Spirit.png', data: imageData(ghost) })
  layout.layers.push({
    id: 'Spirit',
    file: 'parts/Spirit.png',
    x: sx,
    y: sy,
    width: sw,
    height: sh,
    z: 0,
  })
  for (const [
    z,
    {
      id,
      source: crop,
      clip,
      place: [x, y, width, height],
    },
  ] of layers.entries()) {
    const cutout = surface(width, height)
    const ctx = cutout.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingQuality = 'high'
    if (clip) {
      // Adjacent cutouts can overlap in bounding boxes, even with transparent gutters.
      ctx.beginPath()
      clip.forEach(([px, py], i) => {
        const x = ((px - crop[0]) / crop[2]) * width
        const y = ((py - crop[1]) / crop[3]) * height
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath()
      ctx.clip()
    }
    ctx.drawImage(source, ...crop, 0, 0, width, height)
    // Discard near-transparent matte noise outside the painted antialiased outline.
    const pixels = ctx.getImageData(0, 0, width, height)
    for (let i = 3; i < pixels.data.length; i += 4) {
      if (pixels.data[i] < 12) pixels.data[i] = 0
    }
    ctx.putImageData(pixels, 0, 0)
    combined.getContext('2d').drawImage(cutout, x, y)
    const file = `parts/${id}.png`
    images.push({ file, data: imageData(cutout) })
    layout.layers.push({ id, file, x, y, width, height, z: z + 1 })
  }
  images.push({ file: 'neutral.png', data: imageData(combined) })
  const thumbnail = surface(600, 672)
  const thumbContext = thumbnail.getContext('2d')
  thumbContext.imageSmoothingQuality = 'high'
  thumbContext.drawImage(combined, 0, 0, thumbnail.width, thumbnail.height)
  const portrait = thumbnail.toDataURL('image/webp', 0.94).split(',')[1]
  const head = layout.layers.find(({ id }) => id === 'Head')
  const closed = surface(head.width, head.height)
  const closedContext = closed.getContext('2d')
  closedContext.setTransform(...eyelids.registration)
  closedContext.imageSmoothingQuality = 'high'
  closedContext.drawImage(await decode(blink), 0, 0, head.width, head.height)
  for (const {
    id,
    center: [cx, cy],
    radii: [rx, ry],
    tilt,
  } of eyelids.layers) {
    const half = Math.ceil(Math.hypot(rx, ry))
    const size = half * 2
    const cutout = surface(size, size)
    const ctx = cutout.getContext('2d')
    const left = cx - half,
      top = cy - half
    ctx.drawImage(closed, -left, -top)
    const patch = ctx.getImageData(0, 0, size, size)
    const angle = (tilt * Math.PI) / 180
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - half,
          dy = y - half
        const u = (dx * Math.cos(angle) + dy * Math.sin(angle)) / rx
        const v = (dy * Math.cos(angle) - dx * Math.sin(angle)) / ry
        const feather = Math.min(1, Math.max(0, (1 - Math.hypot(u, v)) / 0.19))
        patch.data[(y * size + x) * 4 + 3] *= feather
      }
    }
    ctx.putImageData(patch, 0, 0)
    const file = `parts/${id}.png`
    images.push({ file, data: imageData(cutout) })
    const x = head.x + left,
      y = head.y + top
    layout.layers.push({ id, file, x, y, width: size, height: size, z: layout.layers.length })
    combined.getContext('2d').drawImage(cutout, x, y)
  }
  images.push({ file: 'blink.png', data: imageData(combined) })
  return { images, layout, portrait }
}

app
  .whenReady()
  .then(assemble)
  .then(() => app.quit())
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
