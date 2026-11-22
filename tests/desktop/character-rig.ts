/** Public Cubism Core fields inspected by the desktop tests. */
interface CoreModel {
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
          }
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
      actions,
    }
  } finally {
    model?.release()
    moc._release()
  }
}
