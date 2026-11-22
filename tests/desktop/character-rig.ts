/** Public Cubism Core fields inspected by the desktop tests. */
interface CoreModel {
  canvasinfo: { PixelsPerUnit: number }
  parameters: {
    ids: string[]
    minimumValues: Float32Array
    maximumValues: Float32Array
    defaultValues: Float32Array
    values: Float32Array
  }
  drawables: {
    ids: string[]
    opacities: Float32Array
    vertexPositions: Float32Array[]
    indices: Uint16Array[]
    indexCounts: Int32Array
  }
  update(): void
  release(): void
}

interface CoreMoc {
  _release(): void
}

interface CubismCore {
  Version: { csmGetVersion(): number; csmGetMocVersion(bytes: ArrayBuffer): number }
  Moc: {
    fromArrayBuffer(bytes: ArrayBuffer): CoreMoc | null
    prototype: { hasMocConsistency(bytes: ArrayBuffer): number }
  }
  Model: { fromMoc(moc: CoreMoc): CoreModel | null; prototype: CoreModel }
}

interface Mapping {
  motion?: { group: string; index: number; variants?: boolean }
  expression?: string
}

interface Definition {
  Moc: string
  Textures: string[]
  Motions?: Record<string, { File: string }[]>
  Expressions?: { Name: string; File: string }[]
}

declare global {
  interface Window {
    Live2DCubismCore: CubismCore
  }
}

// Runs inside the actual pet renderer and reads only shipped resources.
export async function inspectCharacterRig() {
  const manifestUrl = new URL('app://assets/character/revenant/manifest.json')
  const get = async (url: URL) => {
    const result = await fetch(url)
    if (!result.ok) throw new Error(`${url.pathname}: HTTP ${result.status}`)
    return result
  }
  const manifest = await (await get(manifestUrl)).json()
  if (manifest.status !== 'available') throw new Error(`角色清单未就绪：${manifest.reason}`)
  const modelUrl = new URL(manifest.model, manifestUrl)
  const refs: Definition = (await (await get(modelUrl)).json()).FileReferences
  const bytes = await (await get(new URL(refs.Moc, modelUrl))).arrayBuffer()
  const core = window.Live2DCubismCore
  const consistency = core.Moc.prototype.hasMocConsistency(bytes)
  if (consistency !== 1) throw new Error('Cubism Core 拒绝了随附的 MOC3。')
  const moc = core.Moc.fromArrayBuffer(bytes)
  if (!moc) throw new Error('无法创建 Cubism Moc。')
  let model: CoreModel | null = null

  try {
    model = core.Model.fromMoc(moc)
    if (!model) throw new Error('无法实例化 Cubism Model。')
    const { parameters, drawables } = model
    parameters.values.set(parameters.defaultValues)
    model.update()
    const rest = drawables.vertexPositions.map((xy) => new Float32Array(xy))
    const restOpacity = new Float32Array(drawables.opacities)

    // Query the model at actual authored keys and compare with the neutral pose.
    function affectedMeshes(id: string, value: number) {
      const index = parameters.ids.indexOf(id)
      if (index < 0) throw new Error(`动作引用了模型中不存在的参数 ${id}`)
      parameters.values.set(parameters.defaultValues)
      parameters.values[index] = value
      model!.update()
      return drawables.ids.filter((_, mesh) => {
        if (Math.abs(drawables.opacities[mesh] - restOpacity[mesh]) > 0.01) return true
        if (Math.max(restOpacity[mesh], drawables.opacities[mesh]) < 0.01) return false
        return drawables.vertexPositions[mesh].some((n, k) => Math.abs(n - rest[mesh][k]) > 0.0001)
      })
    }

    function visibleMarchMeshes(cast: number, wave: number, returning = 0) {
      parameters.values.set(parameters.defaultValues)
      parameters.values[parameters.ids.indexOf('ParamImmortalMarch')] = cast
      parameters.values[parameters.ids.indexOf('ParamMarchPosture')] = cast
      parameters.values[parameters.ids.indexOf('ParamMarchReturn')] = returning
      parameters.values[parameters.ids.indexOf('ParamMarchWave')] = wave
      model!.update()
      return drawables.ids.filter((_, i) => drawables.opacities[i] > 0.01)
    }
    const sleeve = drawables.ids.indexOf('ArtMarchSleeveL')
    const palm = drawables.ids.indexOf('ArtMarchPalmL')
    function palmCentre(cast: number, returning = 0) {
      visibleMarchMeshes(cast, 0, returning)
      const vertices = drawables.vertexPositions[palm]
      const centre = [0, 0]
      for (let i = 0; i < vertices.length; i++) centre[i % 2] += vertices[i]
      return centre.map((n) => (2 * n * model!.canvasinfo.PixelsPerUnit) / vertices.length)
    }
    function travel(a: number[], b: number[]) {
      return Math.hypot(a[0] - b[0], a[1] - b[1])
    }
    function dimensions(id: string) {
      const points = drawables.vertexPositions[drawables.ids.indexOf(id)]
      let left = Infinity,
        right = -Infinity,
        low = Infinity,
        high = -Infinity,
        x = 0,
        y = 0
      for (let i = 0; i < points.length; i += 2) {
        left = Math.min(left, points[i])
        right = Math.max(right, points[i])
        low = Math.min(low, points[i + 1])
        high = Math.max(high, points[i + 1])
        x += points[i]
        y += points[i + 1]
      }
      x *= 2 / points.length
      y *= 2 / points.length
      let radius = 0
      for (let i = 0; i < points.length; i += 2)
        radius = Math.max(radius, Math.hypot(points[i] - x, points[i + 1] - y))
      const scale = model!.canvasinfo.PixelsPerUnit
      return {
        radius: radius * scale,
        width: (right - left) * scale,
        height: (high - low) * scale,
        top: high * scale,
      }
    }
    visibleMarchMeshes(0, 0)
    const palms = ['ArtMarchPalmL', 'ArtMarchPalmR']
    const restPalms = palms.map((id) => dimensions(id).radius)
    const restMouth = dimensions('ArtMarchMouth')
    const crown = dimensions('ArtHead').top
    let maxPalmRatio = 0,
      minPalmRatio = 1,
      maxMouthHeightRatio = 0,
      deepestBowPx = 0
    let leastHeadOpacity = 1,
      leastDressOpacity = 1,
      biggestLimbStep = 0
    for (const returning of [0, 1]) {
      let previous = palmCentre(0, returning)
      for (let i = 1; i <= 100; i++) {
        const current = palmCentre(i / 100, returning)
        if (i >= 65) {
          for (const [side, id] of palms.entries()) {
            const ratio = dimensions(id).radius / restPalms[side]
            maxPalmRatio = Math.max(maxPalmRatio, ratio)
            minPalmRatio = Math.min(minPalmRatio, ratio)
          }
          maxMouthHeightRatio = Math.max(
            maxMouthHeightRatio,
            dimensions('ArtMarchMouth').height / restMouth.height,
          )
        }
        deepestBowPx = Math.max(deepestBowPx, crown - dimensions('ArtHead').top)
        biggestLimbStep = Math.max(biggestLimbStep, travel(previous, current))
        previous = current
        leastHeadOpacity = Math.min(
          leastHeadOpacity,
          drawables.opacities[drawables.ids.indexOf('ArtHead')],
        )
        leastDressOpacity = Math.min(
          leastDressOpacity,
          drawables.opacities[drawables.ids.indexOf('ArtDress')],
        )
      }
    }
    for (const pitch of [-0.9, 0.9]) {
      visibleMarchMeshes(1, 0.4)
      for (const [id, value] of Object.entries({
        ParamHeadPitch: pitch,
        ParamHeadTilt: pitch * 0.24,
        ParamBodyLean: pitch * 0.4,
        ParamBreath: 0.7,
      }))
        parameters.values[parameters.ids.indexOf(id)] = value
      model!.update()
      maxMouthHeightRatio = Math.max(
        maxMouthHeightRatio,
        dimensions('ArtMarchMouth').height / restMouth.height,
      )
    }
    function peakArm(returning: number) {
      visibleMarchMeshes(1, 0, returning)
      return new Float32Array(drawables.vertexPositions[sleeve])
    }
    const outward = peakArm(0),
      inward = peakArm(1)
    const peakSeamPx =
      outward.reduce((n, v, i) => Math.max(n, Math.abs(v - inward[i])), 0) *
      model!.canvasinfo.PixelsPerUnit
    const march = {
      maxPalmRatio,
      minPalmRatio,
      maxMouthHeightRatio,
      deepestBowPx,
      armTravelPx: travel(palmCentre(0.5), palmCentre(1)),
      recoverySeparationPx: travel(palmCentre(0.5), palmCentre(0.5, 1)),
      leastHeadOpacity,
      leastDressOpacity,
      biggestLimbStep,
      peakSeamPx,
      neutral: visibleMarchMeshes(0, 0),
      gathered: visibleMarchMeshes(0.5, 0),
      cry: visibleMarchMeshes(1, 0),
      wave: visibleMarchMeshes(1, 0.4),
      settled: visibleMarchMeshes(0, 1),
      variants: [] as {
        name: string
        cast: number[]
        wave: number[]
        spirit: number[]
        pluck: number[]
      }[],
    }
    const actions: Record<string, { parameters: string[]; meshes: string[]; files: string[] }> = {}
    const parameterMeshes = Object.fromEntries(
      parameters.ids.map((id, index) => {
        const low = affectedMeshes(id, parameters.minimumValues[index])
        const high = affectedMeshes(id, parameters.maximumValues[index])
        return [id, [...new Set([...low, ...high])]]
      }),
    ) as Record<string, string[]>
    for (const [action, mapping] of Object.entries(manifest.actions as Record<string, Mapping>)) {
      const values = new Map<string, number[]>()
      const files: string[] = []
      if (mapping.motion) {
        const { group, index } = mapping.motion
        const slots = mapping.motion.variants
          ? refs.Motions?.[group]
          : refs.Motions?.[group]?.slice(index, index + 1)
        if (!slots?.length) throw new Error(`缺少 ${action} 的 motion3 文件。`)
        for (const { File: path } of slots) {
          files.push(path)
          const motion = await (await get(new URL(path, modelUrl))).json()
          const clipKeys = new Map<string, number[]>()
          for (const curve of motion.Curves) {
            if (curve.Target !== 'Parameter') continue
            const seg: number[] = curve.Segments
            const keys = [seg[1]]
            for (let i = 2; i < seg.length;) {
              // Bezier segments include two handles before the end point.
              const width = seg[i] === 1 ? 7 : 3
              keys.push(seg[i + width - 1])
              i += width
            }
            values.set(curve.Id, [...(values.get(curve.Id) ?? []), ...keys])
            clipKeys.set(curve.Id, keys)
          }
          if (action === 'ultimate')
            march.variants.push({
              name: path,
              cast: clipKeys.get('ParamImmortalMarch') ?? [],
              wave: clipKeys.get('ParamMarchWave') ?? [],
              spirit: clipKeys.get('ParamSpirit') ?? [],
              pluck: clipKeys.get('ParamPluck') ?? [],
            })
        }
      }
      if (mapping.expression) {
        const path = refs.Expressions?.find((entry) => entry.Name === mapping.expression)?.File
        if (!path) throw new Error(`缺少 ${action} 的 exp3 文件。`)
        files.push(path)
        const expression = await (await get(new URL(path, modelUrl))).json()
        for (const { Id, Value, Blend } of expression.Parameters) {
          const neutral = parameters.defaultValues[parameters.ids.indexOf(Id)]
          const value =
            Blend === 'Overwrite' ? Value : Blend === 'Multiply' ? neutral * Value : neutral + Value
          values.set(Id, [...(values.get(Id) ?? []), value])
        }
      }
      const activeParameters = new Set<string>(),
        activeMeshes = new Set<string>()
      for (const [id, keys] of values) {
        const neutral = parameters.defaultValues[parameters.ids.indexOf(id)]
        const farthest = keys.reduce((a, b) =>
          Math.abs(a - neutral) >= Math.abs(b - neutral) ? a : b,
        )
        const meshes = affectedMeshes(id, farthest)
        if (meshes.length > 0) activeParameters.add(id)
        for (const mesh of meshes) activeMeshes.add(mesh)
      }
      actions[action] = { parameters: [...activeParameters], meshes: [...activeMeshes], files }
    }

    // Locate a point on each lid in the underlying head triangle using the neutral mesh.
    // Sampling the same skin point handles the two meshes having different triangulations.
    const head = drawables.ids.indexOf('ArtHead')
    const lids = ['ArtLidLeft', 'ArtLidRight'].map((id) => drawables.ids.indexOf(id))
    function skinAnchor(lid: number) {
      const points = rest[lid]
      const middle = Math.floor(points.length / 4)
      const x = points[middle * 2],
        y = points[middle * 2 + 1]
      const triangles = drawables.indices[head],
        skin = rest[head]
      for (let t = 0; t < triangles.length; t += 3) {
        const [a, b, c] = [triangles[t] * 2, triangles[t + 1] * 2, triangles[t + 2] * 2]
        const bx = skin[b] - skin[a],
          by = skin[b + 1] - skin[a + 1]
        const cx = skin[c] - skin[a],
          cy = skin[c + 1] - skin[a + 1]
        const det = bx * cy - by * cx
        if (Math.abs(det) < 1e-12) continue
        const u = ((x - skin[a]) * cy - (y - skin[a + 1]) * cx) / det
        const v = (bx * (y - skin[a + 1]) - by * (x - skin[a])) / det
        if (Math.min(u, v, 1 - u - v) >= -1e-5)
          return { lid, vertex: middle * 2, corners: [a, b, c], weights: [1 - u - v, u, v] }
      }
      throw new Error(`${drawables.ids[lid]} 的眼睑采样点落在头部网格之外`)
    }
    const anchors = lids.map(skinAnchor)
    let maxLidDriftPx = 0,
      maxClosedGazeDriftPx = 0,
      maxMidBlinkOpacity = 0,
      minClosedOpacity = 1
    for (const tilt of [-1, 0, 1]) {
      parameters.values.set(parameters.defaultValues)
      for (const [id, value] of Object.entries({
        ParamHeadTilt: tilt,
        ParamHeadPitch: -tilt,
        ParamBreath: 0.7,
        ParamBodyLean: tilt,
        ParamStride: -tilt,
        ParamBodyLevel: 0.65,
      }))
        parameters.values[parameters.ids.indexOf(id)] = value
      model.update()
      // A closed lid must follow the skin even while the iris beneath it is being squeezed.
      const skin = new Float32Array(drawables.vertexPositions[head])
      for (const open of [1, 0.75, 0.5, 0.25, 0]) {
        parameters.values[parameters.ids.indexOf('ParamEyeOpen')] = open
        model.update()
        for (const { lid, vertex, corners, weights } of anchors) {
          const point = drawables.vertexPositions[lid]
          const sample = (axis: number) =>
            corners.reduce((n, i, k) => n + weights[k] * skin[i + axis], 0)
          const drift = Math.hypot(sample(0) - point[vertex], sample(1) - point[vertex + 1])
          maxLidDriftPx = Math.max(maxLidDriftPx, drift * model.canvasinfo.PixelsPerUnit)
          if (open === 0) minClosedOpacity = Math.min(minClosedOpacity, drawables.opacities[lid])
          else maxMidBlinkOpacity = Math.max(maxMidBlinkOpacity, drawables.opacities[lid])
        }
      }
      // With the lids closed, the gaze track must no longer displace the painted face.
      const closed = new Float32Array(drawables.vertexPositions[head])
      for (const gaze of [-1, 1]) {
        parameters.values[parameters.ids.indexOf('ParamGaze')] = gaze
        model.update()
        drawables.vertexPositions[head].forEach((value, i) => {
          maxClosedGazeDriftPx = Math.max(
            maxClosedGazeDriftPx,
            Math.abs(value - closed[i]) * model!.canvasinfo.PixelsPerUnit,
          )
        })
      }
    }

    const version = core.Version.csmGetVersion()
    return {
      consistency,
      coreVersion: `${version >>> 24}.${(version >>> 16) & 255}.${version & 65535}`,
      moc: refs.Moc,
      mocVersion: core.Version.csmGetMocVersion(bytes),
      parameterIds: parameters.ids,
      drawableIds: drawables.ids,
      textures: refs.Textures.length,
      triangles: Array.from(drawables.indexCounts).reduce((a, b) => a + b, 0) / 3,
      parameterMeshes,
      march,
      face: { maxLidDriftPx, maxMidBlinkOpacity, minClosedOpacity, maxClosedGazeDriftPx },
      actions,
    }
  } finally {
    model?.release()
    moc._release()
  }
}
