import io.github.psd2live.format.model.Clip
import io.github.psd2live.format.model.Curve
import io.github.psd2live.format.model.CurveSegment
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.sin

enum class Action(val id: String, val group: String) {
    IDLE("idle", "Idle"), TOUCH("touch", "Touch"), NIGHT_ONE("battle", "Battle"),
    NIGHT_TWO("battle2", "NightTwo"), NIGHTLORD("nightlord", "Nightlord"),
    ULTIMATE("ultimate", "Ultimate"), VICTORY("victory", "Victory"),
}

private const val FPS = 30
private typealias Key = Pair<Int, Double>

/** Shape-preserving cubic tangents carry speed through passing poses and flatten at reversals and holds. */
private class Track(val keys: List<Key>) {
    private val slopes = keys.zipWithNext { a, b ->
        require(b.first > a.first) { "Out-of-order keys: $a, $b" }
        (b.second - a.second) / (b.first - a.first)
    }
    private val tangents = keys.indices.map { i ->
        if (i == 0 || i == keys.lastIndex || slopes[i - 1] * slopes[i] <= 0) 0.0
        else {
            val left = keys[i].first - keys[i - 1].first
            val right = keys[i + 1].first - keys[i].first
            val a = 2.0 * right + left
            val b = right + 2.0 * left
            (a + b) / (a / slopes[i - 1] + b / slopes[i])
        }
    }

    fun sample(frame: Int): Double {
        val index = keys.binarySearchBy(frame) { it.first }
        if (index >= 0) return keys[index].second
        val i = -index - 2
        val (start, a) = keys[i]
        val (end, b) = keys[i + 1]
        val dt = (end - start).toDouble()
        val t = (frame - start) / dt
        val s = 1 - t
        return (1 + 2 * t) * s * s * a + s * s * t * dt * tangents[i] +
            t * t * (3 - 2 * t) * b - t * t * s * dt * tangents[i + 1]
    }

    fun curve(control: Control): Curve {
        val segments = keys.zipWithNext().mapIndexed { i, (a, b) ->
            val third = (b.first - a.first) / 3.0
            CurveSegment.Bezier(
                ((a.first + third) / FPS).toFloat(), (a.second + third * tangents[i]).toFloat(),
                ((b.first - third) / FPS).toFloat(), (b.second - third * tangents[i + 1]).toFloat(),
                b.first.toFloat() / FPS, b.second.toFloat(),
            )
        }
        return Curve(control.id, 0f, keys.first().second.toFloat(), segments)
    }
}

private data class Note(val contact: Int, val strength: Double)
private val controls = listOf(Control.LEAN, Control.STEP, Control.LEVEL, Control.ARM, Control.PLUCK,
    Control.HARP, Control.TILT, Control.NOD, Control.GAZE, Control.EYES, Control.WIND, Control.HEM, Control.RESONANCE, Control.SPIRIT, Control.MARCH, Control.WAVE, Control.RETURN)

private class Performance(private val action: Action, private val name: String, private val frames: Int) {
    private val lanes = mutableMapOf<Control, MutableList<Key>>()
    private val notes = mutableListOf<Note>()
    // Variations in the same scene meet in a shared playing stance, including a raised playing wrist.
    private val stance = when (action) {
        Action.NIGHT_ONE, Action.NIGHT_TWO, Action.NIGHTLORD -> mapOf(Control.ARM to .16,
            Control.HARP to -.12, Control.LEVEL to -.10, Control.GAZE to .18, Control.PLUCK to -.12)
        else -> emptyMap()
    }

    fun lane(control: Control, vararg keys: Key) {
        lanes.getOrPut(control) { mutableListOf() }.addAll(keys)
    }

    fun blink(close: Int, hold: Int = 2) = lane(Control.EYES,
        close - 3 to 1.0, close to 0.0, close + hold to 0.0, close + hold + 6 to 1.0)

    /** The finger loads before contact. Its release and the vibration of the string have separate tracks. */
    fun note(contact: Int, strength: Double, pickup: Int = 9, release: Int = 4) {
        require(pickup >= 3 && release >= 2 && strength in 0.0..1.0)
        lane(Control.PLUCK, contact - pickup to -.48 * strength, contact - 2 to -.88 * strength,
            contact to 0.0, contact + release to .95 * strength)
        notes += Note(contact, strength)
    }

    private fun authored(control: Control): Track {
        val anchor = stance[control] ?: control.neutral.toDouble()
        val points = lanes[control].orEmpty().sortedBy { it.first }
        require(points.all { it.first in 1 until frames && it.second in control.keys.first().toDouble()..control.keys.last().toDouble() }) {
            "Invalid $control key in $name"
        }
        return Track(listOf(0 to anchor) + points + (frames to anchor))
    }

    /** Bake material lag from the authored figure. Hair follows the head, the heavier hem follows weight transfer. */
    private fun follow(stiffness: Double, damping: Double, driver: (Int) -> Double): Track {
        var follower = driver(0)
        var velocity = 0.0
        val samples = mutableListOf(0 to 0.0)
        for (frame in 1 until frames) {
            val target = driver(frame)
            velocity += (target - follower) * stiffness - velocity * damping
            follower += velocity
            if (frame % 3 == 0) samples += frame to (follower - target).coerceIn(-1.0, 1.0)
        }
        return Track(samples + (frames to 0.0))
    }

    fun clip(hasSpirit: Boolean): Clip {
        val tracks = controls.associateWith { authored(it) }.toMutableMap()
        fun value(c: Control, f: Int) = tracks.getValue(c).sample(f)
        tracks[Control.WIND] = follow(.065, .31) { f ->
            1.55 * value(Control.LEAN, f) + 1.1 * value(Control.TILT, f) + .80 * value(Control.STEP, f)
        }
        tracks[Control.HEM] = follow(.042, .30) { f ->
            1.65 * value(Control.STEP, f) + .84 * value(Control.LEAN, f) + .52 * value(Control.LEVEL, f)
        }
        if (notes.isNotEmpty()) {
            val framesToSample = notes.flatMap { (contact, _) -> (contact..contact + 15).toList() }.toSortedSet()
            val ring = framesToSample.filter { it in 1 until frames }.map { f ->
                val amplitude = notes.sumOf { (contact, strength) ->
                    val t = f - contact
                    if (t !in 1..14) 0.0 else strength * exp(-t / 4.3) * sin(t * PI / 2.25)
                }
                f to amplitude.coerceIn(-1.0, 1.0)
            }
            tracks[Control.RESONANCE] = Track(listOf(0 to 0.0) + ring + (frames to 0.0))
        }
        tracks[Control.CAST_BODY] = tracks.getValue(Control.MARCH)
        val curves = tracks.filterKeys { it != Control.SPIRIT || hasSpirit }.map { (control, track) -> track.curve(control) }
        return Clip(name, name, action.group, name, frames.toFloat() / FPS, FPS.toFloat(), false, .10f, .16f, curves)
    }
}

fun motions(hasSpirit: Boolean): List<Clip> {
    val clips = mutableListOf<Clip>()
    fun scene(action: Action, name: String, frames: Int, script: Performance.() -> Unit) {
        clips += Performance(action, name, frames).apply(script).clip(hasSpirit)
    }
    val eyes = Control.GAZE
    val head = Control.TILT
    val nod = Control.NOD
    val weight = Control.LEAN
    val height = Control.LEVEL
    val foot = Control.STEP
    val elbow = Control.ARM
    val lyre = Control.HARP
    val wrist = Control.PLUCK

    // Daylight. The first gesture simply listens. Playing a note and changing footing belong to later variations.
    scene(Action.IDLE, "idle", 171) {
        lane(eyes, 8 to .0, 13 to -.83, 48 to -.77, 56 to -.37, 80 to -.42, 91 to .10, 137 to .04)
        lane(head, 14 to .0, 34 to -.62, 56 to -.73, 85 to -.51, 116 to .09, 140 to -.04)
        lane(weight, 22 to .0, 50 to -.23, 72 to -.22, 111 to .08, 142 to .02)
        lane(lyre, 34 to .0, 73 to -.24, 113 to -.13)
        lane(elbow, 29 to .0, 62 to -.19, 81 to -.18, 136 to .05)
        blink(97, 3)
    }
    scene(Action.IDLE, "idle_tune", 146) {
        lane(eyes, 9 to .85, 57 to .95, 70 to .76, 89 to -.46, 122 to -.17)
        lane(head, 8 to .0, 32 to .52, 77 to .49, 112 to -.33)
        lane(nod, 12 to .0, 36 to .48, 78 to .41, 110 to -.18)
        lane(lyre, 13 to -.03, 34 to -.42, 65 to -.30, 100 to -.18)
        lane(elbow, 17 to .01, 40 to .26, 56 to .19, 74 to .32, 102 to .04)
        note(47, .48); note(78, .30, 12, 5)
        blink(104, 3)
    }
    scene(Action.IDLE, "idle_watch", 157) {
        lane(eyes, 8 to -.87, 40 to -.78, 49 to .56, 99 to .61, 114 to .14)
        lane(head, 7 to .0, 27 to -.57, 47 to -.63, 77 to .54, 103 to .43)
        lane(weight, 15 to .0, 34 to -.25, 54 to -.18, 74 to .41, 106 to .31, 132 to .04)
        lane(foot, 49 to .0, 68 to .50, 80 to .54, 111 to .0, 127 to .0)
        lane(height, 52 to -.16, 69 to .11, 83 to -.12, 106 to -.04)
        lane(lyre, 60 to -.11, 93 to .13, 123 to .10)
        blink(42)
    }

    scene(Action.TOUCH, "touch", 55) {
        lane(eyes, 4 to -.92, 19 to -.73, 27 to .03, 43 to .07)
        lane(head, 3 to .12, 13 to -.75, 20 to -.72, 32 to -.34, 45 to .08)
        lane(height, 4 to -.34, 12 to .12, 26 to -.07)
        lane(weight, 5 to .13, 16 to -.28, 29 to -.16)
        lane(lyre, 8 to -.32, 19 to -.26, 39 to .08)
        lane(elbow, 4 to -.13, 10 to .28, 25 to .19)
        blink(6, 1)
    }
    scene(Action.TOUCH, "touch_greet", 68) {
        lane(eyes, 6 to -.52, 15 to .01, 49 to -.04)
        lane(head, 9 to -.08, 23 to -.44, 38 to .26, 55 to .16)
        lane(elbow, 8 to -.19, 21 to .52, 31 to .58, 49 to -.03)
        lane(lyre, 12 to -.08, 29 to .46, 36 to .43, 54 to .02)
        lane(wrist, 14 to .05, 28 to -.36, 37 to -.31, 51 to .21)
        lane(height, 29 to .07, 43 to -.30, 53 to -.26)
        blink(40, 5)
    }

    // First night. Separate the note from the approach to the string. Keep both feet planted.
    scene(Action.NIGHT_ONE, "battle", 86) {
        lane(eyes, 5 to .88, 33 to .94, 44 to -.33, 68 to -.24)
        lane(head, 7 to .01, 22 to .44, 39 to .46, 59 to -.37, 73 to -.23)
        lane(nod, 11 to .0, 28 to .24, 41 to .22, 61 to -.15)
        lane(weight, 13 to -.18, 26 to -.27, 36 to .21, 50 to .27, 67 to .06)
        lane(height, 20 to -.25, 32 to -.24, 41 to .10, 56 to -.04)
        lane(elbow, 7 to .16, 21 to .62, 31 to .69, 39 to -.23, 50 to -.17, 68 to .19)
        lane(lyre, 12 to -.23, 30 to -.26, 42 to .05, 52 to .12, 70 to -.09)
        note(35, .92, 14)
    }
    scene(Action.NIGHT_ONE, "battle_feint", 78) {
        lane(eyes, 4 to .75, 17 to .89, 24 to -.57, 37 to .83, 61 to .52)
        lane(head, 14 to .28, 30 to -.32, 47 to .31, 63 to .16)
        lane(elbow, 11 to .56, 18 to .64, 25 to .09, 39 to .49, 50 to -.20, 63 to -.08)
        lane(wrist, 12 to -.53, 20 to -.60, 28 to -.20)
        lane(lyre, 12 to -.32, 29 to -.24, 46 to -.42, 59 to -.11)
        note(47, .69, 10, 3)
    }
    scene(Action.NIGHT_ONE, "battle_guard", 97) {
        lane(eyes, 5 to -.83, 28 to -.78, 45 to .74, 77 to .49)
        lane(head, 10 to -.18, 23 to -.68, 42 to -.61, 58 to .35, 77 to .32)
        lane(weight, 9 to .12, 24 to -.46, 41 to -.49, 67 to .31, 85 to .13)
        lane(height, 20 to -.56, 40 to -.56, 62 to -.18, 72 to -.04)
        lane(lyre, 17 to -.81, 35 to -.84, 52 to -.45, 68 to -.10)
        lane(elbow, 16 to -.30, 33 to -.31, 55 to .53, 67 to -.17, 81 to .03)
        note(63, .73)
    }
    scene(Action.NIGHT_ONE, "battle_accent", 88) {
        lane(eyes, 5 to .79, 34 to .93, 46 to .10, 65 to -.33)
        lane(head, 15 to .36, 31 to .40, 49 to -.22, 63 to -.34)
        lane(height, 21 to -.33, 29 to -.40, 41 to .23, 53 to .12, 65 to -.09)
        lane(weight, 18 to -.32, 30 to -.35, 44 to .44, 61 to .26)
        lane(elbow, 20 to .71, 28 to .79, 39 to -.36, 51 to -.29, 72 to .10)
        lane(lyre, 22 to -.49, 34 to -.48, 47 to .30, 59 to .22)
        note(34, 1.0, 13, 3); blink(64)
    }

    // Second night. The elbow carries a phrase while only the wrist resets between its notes.
    scene(Action.NIGHT_TWO, "night2_triplet", 90) {
        lane(eyes, 5 to .89, 43 to .93, 58 to -.26, 72 to -.31)
        lane(head, 8 to .04, 22 to .42, 43 to .36, 61 to -.31, 75 to -.25)
        lane(weight, 12 to -.20, 28 to -.13, 48 to .30, 66 to .17)
        lane(elbow, 13 to .45, 21 to .49, 47 to -.08, 58 to -.17, 73 to .09)
        lane(lyre, 16 to -.55, 31 to -.38, 50 to .11, 65 to -.01)
        note(23, .58, 9, 3); note(34, .44, 5, 3); note(47, .92, 6, 4)
    }
    scene(Action.NIGHT_TWO, "night2_riposte", 95) {
        lane(eyes, 4 to -.87, 22 to -.89, 33 to .87, 69 to .75, 80 to -.35)
        lane(head, 13 to -.41, 27 to -.55, 46 to .51, 69 to .41)
        lane(weight, 14 to -.50, 25 to -.54, 49 to .27, 68 to .35)
        lane(height, 15 to -.51, 29 to -.47, 51 to .12, 73 to -.05)
        lane(elbow, 11 to -.29, 27 to -.29, 41 to .52, 49 to .28, 68 to -.16)
        lane(lyre, 15 to -.78, 26 to -.82, 48 to -.31, 72 to .15)
        note(46, .91, 10, 3); note(66, .52, 11, 4)
    }
    scene(Action.NIGHT_TWO, "night2_arc", 96) {
        lane(eyes, 6 to .82, 29 to .91, 54 to .63, 76 to -.48)
        lane(head, 18 to .43, 38 to .36, 60 to -.17, 75 to -.43)
        lane(elbow, 15 to -.27, 36 to .19, 53 to .66, 65 to .58, 84 to .18)
        lane(lyre, 17 to -.56, 40 to -.22, 62 to .38, 79 to .23)
        lane(weight, 17 to -.30, 33 to -.22, 58 to .42, 76 to .24)
        note(27, .40, 10, 4); note(56, .82, 14, 6)
    }
    scene(Action.NIGHT_TWO, "night2_offbeat", 87) {
        lane(eyes, 5 to .78, 34 to .90, 53 to .85, 64 to -.40)
        lane(head, 13 to .36, 34 to .31, 45 to .42, 65 to -.25)
        lane(elbow, 13 to .44, 27 to .20, 36 to .32, 46 to .34, 56 to -.17, 73 to .04)
        lane(height, 21 to -.04, 37 to -.26, 46 to -.29, 57 to .13, 74 to -.08)
        lane(lyre, 16 to -.39, 32 to -.25, 46 to -.32, 62 to .16)
        note(20, .63, 9, 3); note(51, .95, 14, 3)
    }

    // Nightlord. Weight and footwork precede the larger attack; a summon can stay visible while she watches it.
    scene(Action.NIGHTLORD, "lord_charge", 106) {
        lane(eyes, 5 to .85, 28 to .93, 37 to -.91, 70 to -.87, 85 to -.38)
        lane(head, 12 to .19, 30 to .45, 49 to -.66, 67 to -.71, 88 to -.31)
        lane(weight, 15 to -.32, 26 to -.44, 42 to .40, 64 to .34, 85 to .14)
        lane(height, 21 to -.52, 28 to -.57, 42 to .27, 57 to .21, 78 to -.04)
        lane(elbow, 13 to -.25, 27 to -.30, 43 to .88, 58 to .93, 72 to .78, 90 to .26)
        lane(lyre, 20 to -.67, 30 to -.66, 48 to .50, 66 to .48, 87 to .08)
        note(37, .90, 13)
        lane(Control.SPIRIT, 39 to .0, 50 to .85, 59 to 1.0, 70 to .96, 85 to .0)
    }
    scene(Action.NIGHTLORD, "lord_lunge", 100) {
        lane(eyes, 5 to -.65, 21 to -.60, 28 to .93, 60 to .80, 74 to -.37)
        lane(head, 13 to -.34, 24 to -.37, 42 to .56, 58 to .50, 83 to -.28)
        lane(weight, 19 to -.53, 29 to -.58, 42 to .72, 58 to .61, 75 to .30)
        lane(foot, 22 to .0, 37 to .83, 49 to .94, 60 to .90, 84 to .0)
        lane(height, 23 to -.46, 28 to -.56, 40 to .21, 52 to -.18, 66 to -.16)
        lane(elbow, 23 to .65, 31 to .72, 44 to -.27, 59 to -.22, 81 to .23)
        lane(lyre, 28 to -.52, 47 to .43, 60 to .49, 76 to .12)
        note(41, .94, 12, 3)
    }
    scene(Action.NIGHTLORD, "lord_recoil", 109) {
        lane(eyes, 6 to .89, 23 to .91, 30 to -.90, 57 to -.95, 78 to -.49)
        lane(head, 15 to .35, 24 to .39, 39 to -.52, 54 to -.72, 84 to -.29)
        lane(weight, 18 to .25, 31 to .36, 45 to -.56, 55 to -.59, 83 to -.20)
        lane(foot, 35 to .0, 47 to -.79, 61 to -.77, 88 to .0)
        lane(height, 24 to .08, 46 to -.53, 62 to -.42, 82 to -.15)
        lane(elbow, 14 to .53, 27 to .74, 36 to .70, 50 to -.37, 69 to -.31, 90 to .12)
        lane(lyre, 19 to .30, 32 to .46, 52 to -.83, 68 to -.72, 90 to -.22)
        note(25, .63)
        lane(Control.SPIRIT, 23 to .0, 35 to 1.0, 49 to .89, 67 to .0)
    }
    scene(Action.NIGHTLORD, "lord_evade", 101) {
        lane(eyes, 4 to -.95, 36 to -.89, 46 to .92, 72 to .80)
        lane(head, 9 to -.29, 18 to -.56, 34 to -.63, 55 to .47, 73 to .36)
        lane(weight, 9 to .22, 20 to -.71, 34 to -.67, 57 to .22, 74 to .44)
        lane(foot, 7 to .0, 17 to -.94, 29 to -.99, 42 to -.79, 62 to .0)
        lane(height, 8 to -.19, 16 to .13, 25 to -.61, 37 to -.55, 59 to -.07)
        lane(lyre, 12 to -.68, 27 to -.85, 49 to -.60, 69 to .28)
        lane(elbow, 13 to -.23, 31 to -.35, 54 to .56, 69 to -.21, 82 to -.10)
        note(65, .90, 14)
    }
    scene(Action.NIGHTLORD, "lord_crescendo", 120) {
        lane(eyes, 6 to .84, 47 to .95, 56 to -.93, 93 to -.88)
        lane(head, 17 to .42, 43 to .39, 64 to -.51, 80 to -.73, 102 to -.31)
        lane(height, 19 to -.18, 44 to -.42, 54 to -.48, 68 to .28, 85 to .18)
        lane(weight, 17 to -.18, 47 to -.32, 67 to .50, 84 to .40, 104 to .14)
        lane(elbow, 15 to .26, 32 to .38, 47 to .55, 64 to .94, 80 to .91, 98 to .52)
        lane(lyre, 18 to -.51, 36 to -.26, 55 to .06, 72 to .66, 87 to .55)
        note(24, .37); note(40, .64, 8, 3); note(60, 1.0, 11, 5)
        lane(Control.SPIRIT, 61 to .0, 75 to 1.0, 88 to 1.0, 105 to .0)
    }

    // Immortal March: fold toward the faceplate, reveal the spirit and cry out, then settle.
    scene(Action.ULTIMATE, "ultimate", 124) {
        lane(Control.MARCH, 6 to .035, 15 to .21, 27 to .43, 33 to .50, 40 to .57, 45 to .63,
            51 to .82, 59 to 1.0, 67 to 1.0, 76 to .89, 91 to .58, 106 to .32, 117 to .08)
        lane(Control.RETURN, 59 to .0, 66 to 1.0, 119 to 1.0)
        lane(Control.WAVE, 47 to .0, 54 to .22, 66 to .64, 81 to .95, 91 to 1.0, 116 to 1.0)
        lane(eyes, 8 to -.29, 25 to -.48, 48 to -.16, 77 to .16)
        lane(head, 16 to .11, 37 to .17, 53 to -.13, 70 to -.10, 94 to .10)
        lane(nod, 12 to .18, 35 to .90, 43 to .91, 55 to -.78, 69 to -.57, 86 to .13, 104 to .27)
        lane(weight, 22 to .18, 41 to .28, 60 to -.32, 81 to -.21, 103 to .12)
        lane(height, 30 to -.29, 43 to -.43, 56 to .48, 69 to .26, 91 to -.22, 113 to -.11)
        lane(lyre, 9 to -.34, 22 to -.60, 101 to -.60, 116 to -.15)
        blink(27, 5)
    }
    scene(Action.ULTIMATE, "ultimate_requiem", 132) {
        lane(Control.MARCH, 8 to .045, 19 to .23, 32 to .45, 39 to .50, 46 to .55, 51 to .63,
            58 to .84, 65 to 1.0, 74 to 1.0, 84 to .88, 99 to .56, 115 to .27, 126 to .055)
        lane(Control.RETURN, 65 to .0, 72 to 1.0, 127 to 1.0)
        lane(Control.WAVE, 52 to .0, 60 to .24, 75 to .68, 89 to .96, 99 to 1.0, 124 to 1.0)
        lane(eyes, 9 to .35, 32 to .50, 54 to .22, 81 to -.12)
        lane(head, 17 to -.13, 43 to -.24, 62 to .20, 74 to .16, 107 to -.09)
        lane(nod, 17 to .26, 41 to .88, 49 to .96, 64 to -.86, 78 to -.55, 99 to .19, 111 to .29)
        lane(weight, 25 to -.19, 49 to -.25, 65 to .36, 85 to .20, 109 to -.13)
        lane(height, 33 to -.32, 50 to -.48, 64 to .53, 77 to .29, 102 to -.23, 121 to -.11)
        lane(lyre, 11 to -.30, 25 to -.56, 109 to -.56, 124 to -.12)
        blink(32, 6)
    }

    scene(Action.VICTORY, "victory", 113) {
        lane(eyes, 7 to .82, 27 to .84, 39 to .04, 49 to .03, 61 to .69, 91 to .12)
        lane(head, 17 to .30, 35 to .40, 48 to .12, 67 to -.68, 79 to -.74, 86 to -.70, 100 to -.10)
        lane(nod, 17 to .14, 37 to -.31, 48 to -.31, 62 to .65, 72 to .96, 82 to .96, 95 to .24, 103 to -.09)
        lane(lyre, 13 to -.29, 32 to .33, 44 to .53, 69 to -.44, 82 to -.57, 99 to -.17)
        lane(elbow, 15 to .29, 35 to .70, 47 to .76, 67 to -.40, 82 to -.42, 100 to -.05)
        lane(weight, 25 to .23, 39 to .40, 53 to -.08, 69 to -.66, 82 to -.68, 100 to -.10)
        lane(foot, 37 to .0, 54 to .62, 66 to .85, 80 to .87, 91 to .62, 106 to .0)
        lane(height, 35 to .23, 44 to .24, 65 to -.90, 72 to -.96, 81 to -.96, 90 to -.55, 101 to -.01)
        note(24, .56, 10, 5); blink(62, 20)
    }
    scene(Action.VICTORY, "victory_cadence", 127) {
        lane(eyes, 5 to .85, 41 to .94, 53 to -.53, 74 to -.46, 90 to .26)
        lane(head, 15 to .42, 38 to .44, 60 to -.47, 73 to -.45, 92 to .58, 103 to .60, 115 to .23)
        lane(nod, 21 to .23, 54 to -.23, 72 to -.14, 92 to .68, 103 to .75, 115 to .28)
        lane(elbow, 13 to .30, 31 to .41, 51 to .70, 66 to .78, 91 to -.26, 107 to -.19)
        lane(lyre, 16 to -.51, 37 to -.30, 57 to .44, 73 to .39, 95 to -.40)
        lane(weight, 21 to .19, 50 to -.30, 68 to -.40, 90 to .53, 103 to .56, 117 to .12)
        lane(foot, 67 to .0, 85 to -.63, 97 to -.75, 110 to -.48, 122 to .0)
        lane(height, 38 to -.19, 57 to .18, 75 to .14, 91 to -.66, 96 to -.75, 104 to -.75, 116 to -.10)
        note(21, .45); note(34, .57, 6, 3); note(50, .78, 9, 5)
        blink(87, 12)
    }
    return clips
}
