import io.github.psd2live.format.model.*
import kotlin.math.*

enum class Control(val id: String, val title: String, val keys: List<Float>, val neutral: Float, val additive: Boolean = false) {
    BREATH("ParamBreath", "呼吸 / Breath", listOf(0f, 1f), 0f, true),
    TILT("ParamHeadTilt", "侧首 / Head tilt", listOf(-1f, 0f, 1f), 0f),
    NOD("ParamHeadPitch", "俯仰 / Head pitch", listOf(-1f, 0f, 1f), 0f, true),
    WIND("ParamHairSway", "发尾 / Hair sway", listOf(-1f, 0f, 1f), 0f),
    HEM("ParamHemSway", "裙摆 / Skirt hem", listOf(-1f, 0f, 1f), 0f),
    GAZE("ParamGaze", "目光 / Gaze", listOf(-1f, 0f, 1f), 0f),
    RESONANCE("ParamStringResonance", "弦震 / String resonance", listOf(-1f, 0f, 1f), 0f, true),
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

private fun mix(a: Point, b: Point, t: Float) = a.shift((b.x - a.x) * t, (b.y - a.y) * t)

private fun segmentDistance(p: Point, a: Point, b: Point): Float {
    val dx = b.x - a.x
    val dy = b.y - a.y
    val along = (((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)).coerceIn(0f, 1f)
    return distance(p, a.shift(along * dx, along * dy))
}

private fun direction(a: Point, b: Point) = atan2(b.y - a.y, b.x - a.x)
private fun degrees(radians: Float) = radians * (180f / PI.toFloat())

/** Attach the palm to its target, bending the two painted bone segments at their common elbow. */
private class Arm(val shoulder: Point, val elbow: Point, val wrist: Point, val tip: Point) {
    val upperLength = distance(shoulder, elbow)
    val foreLength = distance(elbow, wrist)
    val originalBend = direction(shoulder, elbow) - direction(shoulder, wrist)

    fun pose(p: Point, target: Point, handAngle: Float): Point {
        val span = distance(shoulder, target).coerceIn(abs(upperLength - foreLength) + .1f, upperLength + foreLength - .1f)
        val bend = acos(((upperLength * upperLength + span * span - foreLength * foreLength) /
            (2f * upperLength * span)).coerceIn(-1f, 1f))
        val angle = direction(shoulder, target) + sign(sin(originalBend)) * bend
        val joint = shoulder.shift(upperLength * cos(angle), upperLength * sin(angle))
        val upperTurn = degrees(angle - direction(shoulder, elbow))
        val lowerTurn = degrees(direction(joint, target) - direction(elbow, wrist))
        val upper = rotate(p, shoulder, upperTurn * smooth(8f, 45f, distance(p, shoulder)))
        val lower = rotate(p, elbow, lowerTurn).shift(joint.x - elbow.x, joint.y - elbow.y)
        val hand = rotate(p, wrist, handAngle).shift(target.x - wrist.x, target.y - wrist.y)
        val above = segmentDistance(p, shoulder, elbow)
        val below = segmentDistance(p, elbow, wrist)
        val palm = segmentDistance(p, wrist, tip)
        val elbowWeight = smooth(-12f, 12f, above - min(below, palm))
        val wristWeight = smooth(-9f, 9f, below - palm)
        return mix(upper, mix(lower, hand, wristWeight), elbowWeight)
    }
}

private fun blink(p: Point, openness: Float, eyes: List<Eye>): Point {
    var result = p
    for (eye in eyes) {
        val c = cos(eye.angle)
        val s = sin(eye.angle)
        val dx = p.x - eye.center.x
        val dy = p.y - eye.center.y
        val across = dx * c + dy * s
        val height = -dx * s + dy * c
        val corner = (across / eye.halfWidth).pow(2).coerceAtMost(1f)
        val lash = eye.lashOffset - corner * min(3f, eye.halfHeight * .24f)
        val horizontal = 1f - smooth(eye.halfWidth, eye.halfWidth * 1.4f, abs(across))
        val vertical = 1f - smooth(eye.halfHeight, eye.halfHeight * 1.65f, abs(height))
        val shift = (lash - height) * .99f * horizontal * vertical * (1f - openness)
        result = result.shift(-s * shift, c * shift)
    }
    return result
}

private fun geometryAxes(role: String): List<Control> = when (role) {
    "Spirit" -> listOf(Control.SPIRIT)
    "Head" -> listOf(Control.TILT, Control.EYES, Control.GAZE)
    "FrontHair", in lids -> listOf(Control.TILT)
    "BackHair" -> listOf(Control.TILT, Control.WIND)
    "Dress", "Cape" -> listOf(Control.HEM)
    in footLayers -> emptyList()
    "PluckArm" -> listOf(Control.HARP, Control.PLUCK)
    "Lyre", "HoldArm" -> listOf(Control.HARP)
    else -> error("Unknown layer role $role")
}

private class Binding(val marks: Landmarks, val hairEnd: Float) {
    private val player = Arm(marks.pluckShoulder, marks.pluckElbow, marks.wrist, marks.strings)
    private val support = Arm(marks.holdShoulder, marks.holdElbow, marks.holdWrist, marks.harpPivot.shift(47f, -16f))

    private fun supportingArm(p: Point, harp: Float, lift: Float): Point {
        val turn = harp * 11f
        val raise = -lift * 18f
        val wrist = rotate(rotate(marks.holdWrist, marks.harpPivot, turn), marks.holdShoulder, raise)
        return support.pose(p, wrist, turn + raise)
    }

    private fun playingArm(p: Point, pluck: Float, harp: Float, lift: Float): Point {
        val raise = -lift * 18f
        val carriedWrist = rotate(rotate(marks.wrist, marks.harpPivot, harp * 11f), marks.holdShoulder, raise)
        val contact = rotate(rotate(marks.strings, marks.harpPivot, harp * 11f), marks.holdShoulder, raise)
        // Raise the wrist around the fingertip on the string. A scored contact stays on the lyre
        // in both the low playing position and the high summoning position.
        val wristTurn = lift * 22f
        val wrist = rotate(carriedWrist, contact, wristTurn).shift(pluck * 15f, pluck * 22f)
        // The fingers close into the palm after passing the string, while the wrist continues its arc.
        val digit = smooth(-5f, 46f, p.x - marks.knuckles.x)
        val curl = rotate(p, marks.knuckles, max(0f, pluck) * digit * 12f)
        return player.pose(curl, wrist, pluck * 16f + harp * 11f + raise + wristTurn)
    }

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
        return when (role) {
            "Head" -> {
                val open = value(Control.EYES)
                val looking = gaze(p, value(Control.GAZE) * open, marks.eyes)
                rotate(blink(looking, open, marks.eyes), marks.neck, tilt)
            }
            "FrontHair", in lids -> rotate(p, marks.neck, tilt)
            "BackHair" -> {
                val fall = smooth(marks.neck.y - 70f, hairEnd, p.y)
                val hair = rotate(p, marks.neck, tilt * (1f - .85f * fall))
                val spread = (p.x - marks.neck.x) / 160f
                hair.shift(wind * fall * (42f + spread * 7f),
                    -abs(wind) * fall * 8f + wind * fall * spread * 7f)
            }
            "Dress", "Cape" -> bodyPose(role, p, Control.HEM, value(Control.HEM))
            in footLayers -> p
            "Lyre" -> rotate(p, marks.harpPivot, 11f * harp)
            "HoldArm" -> supportingArm(p, harp, 0f)
            "PluckArm" -> playingArm(p, pluck, harp, 0f)
            else -> error("Unknown layer role $role")
        }
    }

    /** Blend shapes add body and arm choreography to each of the already keyed local poses. */
    fun bodyPose(role: String, p: Point, control: Control, amount: Float): Point {
        val lower = smooth(marks.hips.y - 75f, marks.feet.y, p.y)
        return when (control) {
            Control.NOD -> {
                // Project a shallow facial volume about the collar. The forehead stays further back
                // than the cheeks so the fringe, eye line and chin travel different distances.
                val eyeY = (marks.eyes[0].center.y + marks.eyes[1].center.y) * .5f
                val headRadius = abs(marks.eyes[1].center.x - marks.eyes[0].center.x) * 1.40f
                val x = (p.x - marks.neck.x) / headRadius
                val y = (p.y - eyeY) / headRadius
                val collar = 1f - smooth(marks.neck.y - .52f * headRadius, marks.neck.y + .05f * headRadius, p.y)
                val forwardDepth = headRadius * (.68f * exp(-1.2f * x * x - 1.7f * y * y) - .045f)
                val angle = amount * .37f
                val vertical = (p.y - marks.neck.y) * (cos(angle) - 1f) + forwardDepth * sin(angle)
                val perspective = (p.x - marks.neck.x) * .020f * amount * exp(-x * x - y * y)
                p.shift(perspective * collar, vertical * collar)
            }
            Control.BREATH -> {
                val rise = 1f - smooth(marks.neck.y + 85f, marks.feet.y, p.y)
                val ribs = 1f - smooth(80f, 370f, abs(p.y - marks.pluckShoulder.y - 37f))
                p.shift(amount * (rise + ribs * (p.x - marks.hips.x) * .009f), -7f * amount * rise)
            }
            Control.LEAN -> {
                val planted = smooth(marks.hips.y + 48f, marks.feet.y - 10f, p.y)
                rotate(p, marks.hips, amount * 4.6f * (1f - planted))
                    .shift(amount * 10f * (1f - planted), 0f)
            }
            Control.STEP -> {
                // Her feet meet at the big toes. Roll the free ankle around that contact.
                val right = smooth(marks.feet.x - 9f, marks.feet.x + 9f, p.x)
                val free = when (role) {
                    "LeftFoot" -> if (amount < 0f) 1f else 0f
                    "RightFoot" -> if (amount > 0f) 1f else 0f
                    else -> if (amount > 0f) right else 1f - right
                }
                val ankle = smooth(marks.feet.y - 155f, marks.feet.y - 80f, p.y)
                val toe = marks.feet.shift(0f, -9f)
                val rolled = rotate(p, toe, -amount * free * ankle * 14f)
                val heelOut = amount * free * ankle * max(0f, toe.y - p.y) * .42f
                rolled.shift(amount * 18f * (1f - ankle) + heelOut, -abs(amount) * 4f * (1f - lower))
            }
            Control.LEVEL -> {
                val planted = smooth(marks.hips.y, marks.feet.y - 92f, p.y)
                val fold = if (amount < 0f) 44f else 25f
                p.shift(-amount * (p.x - marks.hips.x) * .027f * lower * (1f - planted), -amount * fold * (1f - planted))
            }
            Control.ARM -> when (role) {
                "PluckArm" -> playingArm(p, 0f, 0f, amount)
                "HoldArm" -> supportingArm(p, 0f, amount)
                "Lyre" -> rotate(p, marks.holdShoulder, -amount * 18f)
                else -> p
            }
            Control.HEM -> {
                val skirtEnd = marks.feet.y - 102f
                val down = smooth(marks.hips.y - 75f, skirtEnd - 33f, p.y)
                val across = (p.x - marks.hips.x) / 265f
                val edge = smooth(57f, 132f, abs(p.x - marks.feet.x))
                // The two calves share this mesh. Cloth moves freely on either side of them.
                val cloth = down * (1f - smooth(skirtEnd - 36f + edge * 33f, skirtEnd + edge * 12f, p.y))
                p.shift(amount * cloth * (18f + edge * 10f), amount * cloth * across * 11f)
            }
            Control.RESONANCE -> {
                val along = ((p.y - (marks.harpPivot.y - 222f)) / 121f).coerceIn(0f, 1f)
                val left = marks.strings.x - 22f + 24f * along
                val right = marks.strings.x + 69f - 17f * along
                val withinStrings = smooth(left, left + 7f, p.x) * (1f - smooth(right - 7f, right, p.x))
                p.shift(amount * 4.6f * sin(PI.toFloat() * along) * withinStrings, 0f)
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
        val controls = buildList {
            addAll(listOf(Control.BREATH, Control.LEAN, Control.STEP, Control.LEVEL))
            if (layer.role in handsAndLyre) add(Control.ARM)
            if (layer.role == "Head" || layer.role == "FrontHair" || layer.role == "BackHair" || layer.role in lids) add(Control.NOD)
            if (layer.role == "Lyre") add(Control.RESONANCE)
        }
        val restOpacity = if (layer.role in lids) 0f else 1f
        return controls.map { control ->
            val forms = control.keys.map { value ->
                if (value == 0f) null else MeshShape(offsets(points) { bodyPose(layer.role, it, control, value) }, order, restOpacity, Rgb.White, Rgb.Black)
            }
            BlendBinding(control.id, Floats.wrap(control.keys.toFloatArray()), control.keys.indexOf(control.neutral), forms)
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
    val binding = Binding(art.landmarks, art.layers.firstOrNull { it.role == "BackHair" }?.let { (it.y + it.h).toFloat() } ?: art.landmarks.feet.y)
    val meshes = art.layers.map { layer ->
        val surface = makeSurface(layer, atlas, art.landmarks)
        val order = (500 + layer.z * 10).toFloat()
        Mesh(layer.meshId, layer.id, parent = null, geometry = surface.geometry,
            offsets = binding.localKeys(layer.role, surface.points), page = 0, tile = layer.tileId, drawOrder = order,
            shapes = binding.shapes(layer, surface.points, order),
            channels = when (layer.role) {
                // Only expose the painted lash once the iris has collapsed to a thin line.
                in lids -> mapOf(Channel.OPACITY to opacity(Control.EYES, listOf(0f to 1f, .025f to 1f, .1f to 0f, 1f to 0f)))
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
