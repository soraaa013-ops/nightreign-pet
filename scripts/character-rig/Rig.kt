import io.github.psd2live.format.model.*
import kotlin.math.*

enum class Control(val id: String, val title: String, val keys: List<Float>, val neutral: Float, val additive: Boolean = false) {
    BREATH("ParamBreath", "呼吸 / Breath", listOf(0f, 1f), 0f),
    TILT("ParamHeadTilt", "侧首 / Head tilt", listOf(-1f, 0f, 1f), 0f),
    WIND("ParamHairSway", "发尾与披肩 / Hair sway", listOf(-1f, 0f, 1f), 0f),
    EYES("ParamEyeOpen", "睁眼 / Eyes open", listOf(0f, 1f), 1f),
    HARP("ParamHarp", "持琴 / Cradle lyre", listOf(-1f, 0f, 1f), 0f),
    PLUCK("ParamPluck", "拨弦 / Pluck", listOf(-1f, 0f, 1f), 0f),
    LEAN("ParamBodyLean", "移重心 / Shift weight", listOf(-1f, 0f, 1f), 0f, true),
    STEP("ParamStride", "交替侧步 / Sidestep", listOf(-1f, 0f, 1f), 0f, true),
    LEVEL("ParamBodyLevel", "屈膝与跃起 / Crouch and spring", listOf(-1f, 0f, 1f), 0f, true),
    ARM("ParamArmLift", "抬肘与扬琴 / Conduct", listOf(-1f, 0f, 1f), 0f, true),
    SPIRIT("ParamSpirit", "召唤灵 / Spirit", listOf(0f, .45f, 1f), 0f);

    fun parameter() = Parameter(id, title, keys.first(), keys.last(), neutral, blend = additive)
    fun axis() = KeyAxis(id, Floats.wrap(keys.toFloatArray()))
}

private val lids = setOf("LidLeft", "LidRight")
private val handsAndLyre = setOf("PluckArm", "Lyre", "HoldArm")
private val footLayers = setOf("LeftFoot", "RightFoot")

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
private fun Point.shift(x: Float, y: Float) = Point(this.x + x, this.y + y)

private fun blink(p: Point, openness: Float, eyes: List<Eye>): Point {
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
        result = result.shift(-s * shift, c * shift)
    }
    return result
}

private fun geometryAxes(role: String): List<Control> = when (role) {
    "Spirit" -> listOf(Control.SPIRIT)
    "Head" -> listOf(Control.BREATH, Control.TILT, Control.EYES)
    "FrontHair", in lids -> listOf(Control.BREATH, Control.TILT)
    "BackHair" -> listOf(Control.BREATH, Control.TILT, Control.WIND)
    "Dress", "Cape", in footLayers -> listOf(Control.BREATH, Control.WIND)
    "PluckArm", "Lyre" -> listOf(Control.BREATH, Control.HARP, Control.PLUCK)
    "HoldArm" -> listOf(Control.BREATH, Control.HARP)
    else -> error("Unknown layer role $role")
}

private class Binding(val marks: Landmarks) {
    fun keyPose(role: String, p: Point, values: Map<Control, Float>): Point {
        fun value(control: Control) = values[control] ?: control.neutral
        val tilt = value(Control.TILT) * 10f
        val wind = value(Control.WIND)
        val harp = value(Control.HARP)
        val pluck = value(Control.PLUCK)
        if (role == "Spirit") {
            val reveal = value(Control.SPIRIT)
            val hidden = 1f - reveal
            val contraction = 1f - hidden * .22f
            return Point(marks.hips.x + (p.x - marks.hips.x) * contraction + hidden * 17f,
                marks.neck.y + (p.y - marks.neck.y) * contraction + hidden * 112f)
        }
        val q = when (role) {
            "Head" -> rotate(blink(p, value(Control.EYES), marks.eyes), marks.neck, tilt)
            "FrontHair", in lids -> rotate(p, marks.neck, tilt)
            "BackHair" -> {
                val fall = smooth(marks.neck.y - 140f, marks.feet.y, p.y)
                val hair = rotate(p, marks.neck, tilt * .73f * (1f - fall))
                hair.shift(wind * fall * (34f + 6f * sin(p.y / 122f)), -abs(wind) * fall * 14f + fall * wind * (p.x - marks.hips.x) * .043f)
            }
            "Dress", "Cape" -> {
                val hem = smooth(marks.hips.y - 150f, marks.feet.y - 69f, p.y) * (1f - smooth(marks.feet.y - 34f, marks.feet.y + 5f, p.y))
                val width = if (role == "Cape") 37f else 24f
                p.shift(wind * hem * width, wind * hem * (p.x - marks.hips.x) * .018f)
            }
            in footLayers -> p
            "Lyre" -> {
                val aperture = (1f - smooth(13f, 43f, abs(p.x - marks.strings.x))) * (1f - smooth(20f, 70f, abs(p.y - marks.strings.y)))
                rotate(p.shift(4.6f * pluck * aperture, 0f), marks.harpPivot, 8f * harp)
            }
            "HoldArm" -> {
                val reach = smooth(13f, 115f, distance(p, marks.holdShoulder))
                rotate(p, marks.harpPivot, 8f * harp * reach)
            }
            "PluckArm" -> {
                val forearm = smooth(-35f, 72f, p.x - marks.wrist.x)
                val sleeve = smooth(8f, 129f, distance(p, marks.pluckShoulder))
                val fingers = rotate(p, marks.wrist, pluck * 22f * forearm)
                val arm = rotate(fingers, marks.pluckShoulder, pluck * 11.5f * sleeve)
                rotate(arm, marks.harpPivot, harp * 8f * sleeve)
            }
            else -> error("Unknown layer role $role")
        }
        val rise = 1f - smooth(marks.neck.y + 85f, marks.feet.y, q.y)
        val ribs = 1f - smooth(80f, 370f, abs(q.y - marks.pluckShoulder.y - 37f))
        val breath = value(Control.BREATH)
        return q.shift(breath * (rise + ribs * (q.x - marks.hips.x) * .009f), -10f * breath * rise)
    }

    /** Blend shapes add body and arm choreography to each of the already keyed local poses. */
    fun bodyPose(role: String, p: Point, control: Control, amount: Float): Point {
        val lower = smooth(marks.hips.y - 75f, marks.feet.y, p.y)
        return when (control) {
            Control.LEAN -> {
                val planted = smooth(marks.hips.y + 48f, marks.feet.y - 10f, p.y)
                rotate(p, marks.hips, amount * 4.6f * (1f - planted))
                    .shift(amount * 10f * (1f - planted), 0f)
            }
            Control.STEP -> {
                val rightFoot = when (role) {
                    "LeftFoot" -> 0f
                    "RightFoot" -> 1f
                    else -> smooth(marks.feet.x - 32f, marks.feet.x + 32f, p.x)
                }
                val leading = if (amount > 0f) rightFoot else 1f - rightFoot
                val ankle = smooth(marks.feet.y - 146f, marks.feet.y - 20f, p.y)
                val lateral = 22f * (1f - ankle) + 58f * leading * ankle
                p.shift(amount * lateral, -abs(amount) * (5f * (1f - lower) + 28f * ankle * leading))
            }
            Control.LEVEL -> {
                if (amount < 0) {
                    val folded = 1f - lower
                    p.shift(-amount * (p.x - marks.hips.x) * .035f * lower, -amount * 39f * folded)
                } else {
                    val foot = smooth(marks.hips.y + 28f, marks.feet.y - 13f, p.y)
                    p.shift(-amount * (p.x - marks.hips.x) * .055f * foot, -amount * (19f + 28f * foot))
                }
            }
            Control.ARM -> when (role) {
                "PluckArm" -> {
                    val reach = smooth(13f, 134f, distance(p, marks.pluckShoulder))
                    val arm = rotate(p, marks.pluckShoulder, -amount * 19f * reach)
                    rotate(arm, marks.wrist, -amount * 10f * smooth(-16f, 75f, p.x - marks.wrist.x))
                }
                "HoldArm" -> {
                    val reach = smooth(6f, 121f, distance(p, marks.holdShoulder))
                    rotate(p, marks.holdShoulder, -amount * 13.5f * reach)
                }
                "Lyre" -> rotate(p, marks.holdShoulder, -amount * 13.5f)
                else -> p
            }
            else -> error("Not a body control: $control")
        }
    }

    fun localKeys(role: String, points: List<Point>): KeyGrid<MeshOffsets> {
        val axes = geometryAxes(role)
        val cells = mutableListOf<KeyCell<MeshOffsets>>()
        fun visit(coordinate: List<Int>) {
            if (coordinate.size < axes.size) {
                for (key in axes[coordinate.size].keys.indices) visit(coordinate + key)
                return
            }
            val values = axes.indices.associate { axes[it] to axes[it].keys[coordinate[it]] }
            cells += KeyCell(Ints.wrap(coordinate.toIntArray()), MeshOffsets(offsets(points) { keyPose(role, it, values) }))
        }
        visit(emptyList())
        return KeyGrid(axes.map { it.axis() }, cells)
    }

    fun shapes(layer: Layer, points: List<Point>, order: Float): List<BlendBinding<MeshShape>> {
        if (layer.role == "Spirit") return emptyList()
        val controls = listOf(Control.LEAN, Control.STEP, Control.LEVEL) + if (layer.role in handsAndLyre) listOf(Control.ARM) else emptyList()
        val restOpacity = if (layer.role in lids) 0f else 1f
        return controls.map { control ->
            val forms = control.keys.map { value ->
                if (value == 0f) null else MeshShape(offsets(points) { bodyPose(layer.role, it, control, value) }, order, restOpacity, Rgb.White, Rgb.Black)
            }
            BlendBinding(control.id, Floats.wrap(control.keys.toFloatArray()), 1, forms)
        }
    }
}

private fun offsets(points: List<Point>, transform: (Point) -> Point): Floats {
    val deltas = FloatArray(points.size * 2)
    for ((i, p) in points.withIndex()) {
        val q = transform(p)
        deltas[2 * i] = q.x - p.x
        deltas[2 * i + 1] = q.y - p.y
    }
    return Floats.wrap(deltas)
}

private fun opacity(control: Control, levels: List<Pair<Float, Float>>): KeyGrid<ChannelValue> {
    return KeyGrid(listOf(KeyAxis(control.id, Floats.wrap(levels.map { it.first }.toFloatArray()))),
        levels.mapIndexed { index, (_, opacity) -> KeyCell(Ints.values(index), ChannelValue.Scalar(opacity)) })
}

fun makeRig(art: Artwork): RigIR {
    require(art.width == 1000 && art.height == 1120) { "The rig uses a 1000 × 1120 drawing" }
    val atlas = Atlas(art.layers)
    val binding = Binding(art.landmarks)
    val meshes = art.layers.map { layer ->
        val surface = makeSurface(layer, atlas, art.landmarks)
        val order = (500 + layer.z * 10).toFloat()
        Mesh(layer.meshId, layer.id, parent = null, geometry = surface.geometry,
            offsets = binding.localKeys(layer.role, surface.points), page = 0, tile = layer.tileId, drawOrder = order,
            shapes = binding.shapes(layer, surface.points, order),
            channels = when (layer.role) {
                in lids -> mapOf(Channel.OPACITY to opacity(Control.EYES, listOf(0f to 1f, .23f to .98f, .52f to .58f, .82f to 0f, 1f to 0f)))
                "Spirit" -> mapOf(Channel.OPACITY to opacity(Control.SPIRIT, listOf(0f to 0f, .1f to 0f, .45f to .64f, .78f to .94f, 1f to 1f)))
                else -> emptyMap()
            })
    }
    val part = Part("PartRevenant", "Revenant", meshes.map { ChildRef.MeshRef(it.id) })
    val hasSpirit = art.layers.any { it.role == "Spirit" }
    val controls = Control.entries.filter { it != Control.SPIRIT || hasSpirit }
    return RigIR(
        canvas = Canvas(art.width.toFloat(), art.height.toFloat(), art.width * .5f, -art.height * .5f),
        parameters = controls.map { it.parameter() },
        parameterTree = controls.map { ParameterNode.Param(it.id) },
        parameterRoles = listOf(ParameterRole("EyeBlink", listOf(Control.EYES.id))),
        parts = listOf(part), rootChildren = listOf(ChildRef.PartRef(part.id)),
        meshes = meshes, renderRoot = RenderGroup(null, 500, meshes.map { RenderMesh(it.id) }), textures = atlas.textures,
        authoring = Authoring(sources = listOf(SourceFile("Sheet", "Revenant painted parts", null, "png",
            art.layers.map { SourceLayer(it.id, it.id, "", it.x, it.y, it.w, it.h, true) }))), clips = motions(hasSpirit),
    )
}
