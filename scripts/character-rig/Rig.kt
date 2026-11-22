import io.github.psd2live.format.model.*
import kotlin.math.*

/** Coordinates are the landmarks on the approved 1000 × 1120 neutral drawing, in artwork pixels. */
private val neck = Point(508f, 345f)
private val shoulder = Point(442f, 491f)
private val holdingShoulder = Point(593f, 496f)
private val wrist = Point(581f, 493f)
private val lyrePivot = Point(701f, 580f)
private val strings = Point(682f, 463f)
private val closedLids = setOf("LidLeft", "LidRight")

enum class Control(val id: String, val title: String, val keys: List<Float>, val neutral: Float) {
    BREATH("ParamBreath", "呼吸 / Breath", listOf(0f, 1f), 0f),
    TILT("ParamHeadTilt", "侧首 / Head tilt", listOf(-1f, 0f, 1f), 0f),
    WIND("ParamHairSway", "发尾与披肩 / Hair sway", listOf(-1f, 0f, 1f), 0f),
    EYES("ParamEyeOpen", "睁眼 / Eyes open", listOf(0f, 1f), 1f),
    HARP("ParamHarp", "持琴 / Cradle lyre", listOf(-1f, 0f, 1f), 0f),
    PLUCK("ParamPluck", "拨弦 / Pluck", listOf(-1f, 0f, 1f), 0f);

    fun parameter() = Parameter(id, title, keys.first(), keys.last(), neutral)
    fun axis() = KeyAxis(id, Floats.wrap(keys.toFloatArray()))
}

private fun smooth(start: Float, end: Float, x: Float): Float {
    val u = ((x - start) / (end - start)).coerceIn(0f, 1f)
    return u * u * (3f - 2f * u)
}

private fun distance(p: Point, center: Point) = hypot(p.x - center.x, p.y - center.y)

private fun rotate(p: Point, center: Point, degrees: Float): Point {
    val theta = degrees * (PI.toFloat() / 180f)
    val x = p.x - center.x
    val y = p.y - center.y
    return Point(center.x + x * cos(theta) - y * sin(theta), center.y + x * sin(theta) + y * cos(theta))
}

private data class Eye(val center: Point, val halfWidth: Float, val halfHeight: Float, val angle: Float)
private val eyes = listOf(
    Eye(Point(485f, 267f), 33.5f, 18f, -0.336f),
    Eye(Point(578f, 247f), 23f, 16.5f, -0.385f),
)

private fun blink(p: Point, openness: Float): Point {
    var result = p
    for (eye in eyes) {
        val c = cos(eye.angle)
        val s = sin(eye.angle)
        val dx = p.x - eye.center.x
        val dy = p.y - eye.center.y
        val across = dx * c + dy * s
        val arc = (1f - (across / eye.halfWidth).pow(2)).coerceIn(0f, 1f) * 3f
        val height = -dx * s + dy * c - arc
        val horizontal = 1f - smooth(eye.halfWidth * .84f, eye.halfWidth + 11f, abs(across))
        val vertical = 1f - smooth(eye.halfHeight + 1f, eye.halfHeight + 17f, abs(height))
        val shift = -height * .95f * horizontal * vertical * (1f - openness)
        result = Point(result.x - s * shift, result.y + c * shift)
    }
    return result
}

private fun breathe(p: Point, amount: Float): Point {
    val rise = 1f - smooth(430f, 1027f, p.y)
    val ribs = 1f - smooth(80f, 370f, abs(p.y - 528f))
    return Point(p.x + amount * (rise * 1.1f + ribs * (p.x - 510f) * .008f), p.y - 9f * amount * rise)
}

private fun controlsFor(id: String): List<Control> = when (id) {
    "Head" -> listOf(Control.BREATH, Control.TILT, Control.EYES)
    in closedLids -> listOf(Control.BREATH, Control.TILT)
    "BackHair" -> listOf(Control.BREATH, Control.TILT, Control.WIND)
    "Dress" -> listOf(Control.BREATH, Control.WIND)
    "PluckArm", "Lyre" -> listOf(Control.BREATH, Control.HARP, Control.PLUCK)
    "HoldArm" -> listOf(Control.BREATH, Control.HARP)
    else -> error("Missing deformation for $id")
}

private fun pose(id: String, point: Point, values: Map<Control, Float>): Point {
    fun value(control: Control) = values[control] ?: control.neutral
    val tilt = value(Control.TILT) * 4.8f
    val wind = value(Control.WIND)
    val harp = value(Control.HARP)
    val pluck = value(Control.PLUCK)
    val p = when (id) {
        "Head" -> rotate(blink(point, value(Control.EYES)), neck, tilt)
        in closedLids -> rotate(point, neck, tilt)
        "BackHair" -> {
            val fall = smooth(180f, 1027f, point.y)
            val hair = rotate(point, neck, tilt * .54f * (1f - fall))
            Point(hair.x + fall * wind * (25f + 5f * sin(point.y / 145f)), hair.y + fall * wind * (point.x - 498f) * .022f)
        }
        "Dress" -> {
            val hem = smooth(590f, 980f, point.y) * (1f - smooth(1000f, 1040f, point.y))
            Point(point.x + wind * hem * 8f, point.y + wind * hem * (point.x - 512f) * .009f)
        }
        "Lyre" -> {
            val aperture = (1f - smooth(13f, 38f, abs(point.x - strings.x))) *
                (1f - smooth(20f, 63f, abs(point.y - strings.y)))
            rotate(Point(point.x + 2.8f * pluck * aperture, point.y), lyrePivot, 5.5f * harp)
        }
        "HoldArm" -> {
            val reach = smooth(27f, 147f, distance(point, holdingShoulder))
            rotate(point, lyrePivot, 5.5f * harp * reach)
        }
        "PluckArm" -> {
            val forearm = smooth(-6f, 82f, point.x - wrist.x)
            val sleeve = smooth(12f, 147f, distance(point, shoulder))
            val finger = rotate(point, wrist, pluck * 8.8f * forearm)
            val arm = rotate(finger, shoulder, pluck * 4.7f * sleeve)
            rotate(arm, lyrePivot, harp * 3.5f * sleeve)
        }
        else -> error("Unknown part $id")
    }
    return breathe(p, value(Control.BREATH))
}

private fun geometryKeys(layer: Layer, points: List<Point>): KeyGrid<MeshOffsets> {
    val axes = controlsFor(layer.id)
    val cells = mutableListOf<KeyCell<MeshOffsets>>()
    fun visit(coordinate: List<Int>) {
        if (coordinate.size < axes.size) {
            for (key in axes[coordinate.size].keys.indices) visit(coordinate + key)
            return
        }
        val values = axes.indices.associate { axes[it] to axes[it].keys[coordinate[it]] }
        val offsets = FloatArray(points.size * 2)
        for ((i, p) in points.withIndex()) {
            val transformed = pose(layer.id, p, values)
            offsets[2 * i] = transformed.x - p.x
            offsets[2 * i + 1] = transformed.y - p.y
        }
        cells += KeyCell(Ints.wrap(coordinate.toIntArray()), MeshOffsets(Floats.wrap(offsets)))
    }
    visit(emptyList())
    return KeyGrid(axes.map { it.axis() }, cells)
}

private fun lidOpacity(): KeyGrid<ChannelValue> {
    val levels = listOf(0f to 1f, .23f to .98f, .52f to .58f, .82f to 0f, 1f to 0f)
    return KeyGrid(listOf(KeyAxis(Control.EYES.id, Floats.wrap(levels.map { it.first }.toFloatArray()))),
        levels.mapIndexed { index, (_, opacity) -> KeyCell(Ints.values(index), ChannelValue.Scalar(opacity)) })
}

fun makeRig(art: Artwork): RigIR {
    require(art.width == 1000 && art.height == 1120) { "The rig landmarks use the 1000 × 1120 Revenant drawing" }
    val atlas = Atlas(art.layers)
    val meshes = art.layers.map { layer ->
        val surface = makeSurface(layer, atlas)
        Mesh(layer.meshId, layer.id, parent = null, geometry = surface.geometry,
            offsets = geometryKeys(layer, surface.points), page = 0, tile = layer.tileId,
            drawOrder = (500 + layer.z * 10).toFloat(),
            channels = if (layer.id in closedLids) mapOf(Channel.OPACITY to lidOpacity()) else emptyMap())
    }
    val refs = meshes.map { ChildRef.MeshRef(it.id) }
    val part = Part("PartRevenant", "Revenant", refs)
    return RigIR(
        canvas = Canvas(art.width.toFloat(), art.height.toFloat(), art.width * .5f, -art.height * .5f),
        parameters = Control.entries.map { it.parameter() },
        parameterTree = Control.entries.map { ParameterNode.Param(it.id) },
        parameterRoles = listOf(ParameterRole("EyeBlink", listOf(Control.EYES.id))),
        parts = listOf(part), rootChildren = listOf(ChildRef.PartRef(part.id)),
        meshes = meshes, renderRoot = RenderGroup(null, 500, meshes.map { RenderMesh(it.id) }),
        textures = atlas.textures,
        authoring = Authoring(sources = listOf(SourceFile("Sheet", "Revenant painted parts", null, "png",
            art.layers.map { SourceLayer(it.id, it.id, "", it.x, it.y, it.w, it.h, true) }))),
        clips = motions(),
    )
}
