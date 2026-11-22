import io.github.psd2live.format.model.Clip
import io.github.psd2live.format.model.Curve
import io.github.psd2live.format.model.CurveSegment
import kotlin.math.min

enum class Action(val id: String, val group: String) {
    IDLE("idle", "Idle"), TOUCH("touch", "Touch"), NIGHT_ONE("battle", "Battle"),
    NIGHT_TWO("battle2", "NightTwo"), NIGHTLORD("nightlord", "Nightlord"),
    ULTIMATE("ultimate", "Ultimate"), VICTORY("victory", "Victory"),
}

/** The stance travels through feet, pelvis, shoulder and wrist. Hair trails each change of direction. */
private data class Pose(
    val lean: Double = 0.0, val step: Double = 0.0, val level: Double = 0.0, val arm: Double = 0.0,
    val pluck: Double = 0.0, val harp: Double = 0.0, val tilt: Double = 0.0, val wind: Double = 0.0,
)

private val rest = Pose()
private val listen = Pose(lean = -.28, step = -.14, arm = .19, harp = .21, tilt = -.64, wind = .23)
private val readStrings = Pose(lean = .24, level = -.26, arm = -.22, pluck = -.44, harp = -.34, tilt = .65, wind = -.17)
private val testNote = Pose(lean = -.19, level = .13, arm = .35, pluck = .72, harp = .26, tilt = -.32, wind = .28)
private val glance = Pose(lean = .36, step = .44, level = -.12, arm = .14, pluck = .15, tilt = -.67, wind = -.41)
private val stepLeft = Pose(lean = -.35, step = -.85, level = -.24, arm = .2, pluck = -.26, harp = -.16, tilt = .18, wind = .47)
private val stepRight = Pose(lean = .35, step = .85, level = -.24, arm = -.08, pluck = .13, harp = .17, tilt = -.25, wind = -.52)
private val upbeat = Pose(lean = -.32, step = -.26, level = .32, arm = .82, pluck = -.55, harp = .26, tilt = -.48, wind = .33)
private val sweep = Pose(lean = .79, step = .52, level = .38, arm = .57, pluck = .88, harp = .93, tilt = -.67, wind = -.78)
private val lowGuard = Pose(lean = .25, step = .45, level = -.93, arm = .56, pluck = -.68, harp = -.48, tilt = .58, wind = -.43)
private val flourish = Pose(lean = -.45, step = -.19, level = .23, arm = .98, pluck = .43, harp = .87, tilt = -.64, wind = .59)
private val salute = Pose(lean = .18, step = .29, level = -.67, arm = -.28, pluck = .22, harp = -.31, tilt = .85, wind = -.22)

private val readyToPluck = Pose(arm = .69, pluck = -.86, harp = .08, tilt = .23)
private val strikeString = Pose(arm = -.26, pluck = .97, harp = -.12, lean = .15, wind = -.18)
private val tuckLyre = Pose(step = -.46, lean = -.26, level = -.26, arm = .22, pluck = -.33, harp = -.56)
private val callSpirit = Pose(arm = .96, pluck = -.55, harp = .42, tilt = -.32, lean = -.16)

private val bodyTracks = listOf(
    Control.LEAN to Pose::lean, Control.STEP to Pose::step, Control.LEVEL to Pose::level,
    Control.ARM to Pose::arm, Control.PLUCK to Pose::pluck, Control.HARP to Pose::harp,
    Control.TILT to Pose::tilt, Control.WIND to Pose::wind,
)

private fun track(control: Control, keys: List<Pair<Double, Double>>): Curve {
    require(keys.size >= 2 && keys.first().first == 0.0)
    require(keys.all { it.second in control.keys.first().toDouble()..control.keys.last().toDouble() })
    val needed = keys.filterIndexed { i, (_, value) ->
        i == 0 || i == keys.lastIndex || value != keys[i - 1].second || value != keys[i + 1].second
    }
    val segments = needed.zipWithNext { (start, from), (end, to) ->
        require(start < end)
        val third = (end - start) / 3.0
        CurveSegment.Bezier((start + third).toFloat(), from.toFloat(), (end - third).toFloat(),
            to.toFloat(), end.toFloat(), to.toFloat())
    }
    return Curve(control.id, 0f, keys.first().second.toFloat(), segments)
}

private fun blink(at: Double, hold: Double = .085) = listOf(
    at - .14 to 1.0, at to 0.0, at + hold to 0.0, at + hold + .19 to 1.0,
)

private fun motion(action: Action, name: String, length: Double, vararg beats: Pair<Double, Pose>,
                   eyes: List<Pair<Double, Double>> = emptyList(),
                   spirit: List<Pair<Double, Double>> = emptyList()): Clip {
    val frames = listOf(0.0 to rest) + beats + (length to rest)
    require(frames.zipWithNext().all { (a, b) -> a.first < b.first })
    val tracks = bodyTracks.map { (control, sample) ->
        val delay = when (control) { Control.WIND -> .115; Control.TILT -> .035; else -> 0.0 }
        track(control, frames.mapIndexed { i, (time, pose) ->
            val late = if (i == 0 || i == frames.lastIndex) 0.0 else min(delay, (frames[i + 1].first - time) * .34)
            (time + late) to sample(pose)
        })
    }.toMutableList()
    tracks += track(Control.EYES, listOf(0.0 to 1.0) + eyes + (length to 1.0))
    // Every clip also keys rest to zero, so a cancelled summon can fade into an ordinary action.
    tracks += track(Control.SPIRIT, listOf(0.0 to 0.0) + spirit + (length to 0.0))
    return Clip(name, name, action.group, name, length.toFloat(), 30f, false, .095f, .145f, tracks)
}

fun motions(hasSpirit: Boolean): List<Clip> {
    val pieces = listOf(
        // Daylight: listen, tune one high and one low string, then take two unhurried steps.
        motion(Action.IDLE, "idle", 5.8, .88 to listen, 2.1 to listen.copy(tilt = -.78, harp = .4), 3.37 to testNote,
            4.45 to readStrings.copy(level = -.09), eyes = blink(2.28)),
        motion(Action.IDLE, "idle_tune", 4.85, .72 to readStrings, 1.08 to testNote, 1.91 to readStrings.copy(arm = .52, harp = -.61),
            2.26 to testNote.copy(arm = .66, tilt = -.49), 3.37 to listen, eyes = blink(3.22)),
        motion(Action.IDLE, "idle_watch", 6.15, .91 to stepLeft.copy(level = -.12), 1.76 to listen.copy(step = -.54),
            3.07 to glance.copy(step = .65), 4.32 to glance.copy(tilt = .48, harp = .31), 5.12 to testNote, eyes = blink(4.68)),
        motion(Action.TOUCH, "touch", 1.65, .18 to lowGuard.copy(level = -.37), .49 to listen.copy(lean = -.54, tilt = -.9),
            .85 to testNote, 1.16 to listen, eyes = blink(.19)),
        motion(Action.TOUCH, "touch_greet", 2.12, .25 to stepRight.copy(step = .35), .62 to flourish,
            1.11 to flourish.copy(tilt = -.91, harp = .44), 1.59 to salute.copy(level = -.4), eyes = blink(1.32)),

        // Plant the feet so the wrist crossing the strings reads as a single accent.
        motion(Action.NIGHT_ONE, "battle", 2.85, .48 to readyToPluck, .82 to readyToPluck,
            1.02 to strikeString, 1.40 to strikeString, 2.08 to readStrings, eyes = blink(2.27)),
        motion(Action.NIGHT_ONE, "battle_feint", 2.55, .48 to readyToPluck, .78 to readStrings,
            1.14 to readyToPluck, 1.34 to strikeString, 1.67 to strikeString, 2.04 to listen),
        motion(Action.NIGHT_ONE, "battle_guard", 2.95, .55 to tuckLyre, 1.20 to tuckLyre,
            1.59 to readyToPluck, 1.82 to strikeString, 2.22 to strikeString, eyes = blink(.84)),
        motion(Action.NIGHT_ONE, "battle_accent", 2.69, .45 to readStrings, .80 to readyToPluck,
            1.04 to strikeString, 1.49 to strikeString, 1.93 to rest, eyes = blink(2.20)),

        // Two or three separated notes. Only the playing hand reverses direction on each note.
        motion(Action.NIGHT_TWO, "night2_triplet", 2.82, .42 to readyToPluck, .62 to strikeString,
            .92 to readyToPluck, 1.10 to strikeString, 1.42 to readyToPluck, 1.62 to strikeString, 2.05 to strikeString),
        motion(Action.NIGHT_TWO, "night2_riposte", 2.99, .46 to tuckLyre, .94 to tuckLyre, 1.30 to readyToPluck,
            1.51 to strikeString, 1.89 to readyToPluck, 2.11 to strikeString, 2.46 to strikeString),
        motion(Action.NIGHT_TWO, "night2_arc", 3.09, .52 to readStrings, .88 to readyToPluck, 1.14 to strikeString,
            1.53 to readyToPluck, 1.87 to strikeString, 2.28 to strikeString),
        motion(Action.NIGHT_TWO, "night2_offbeat", 2.84, .42 to readyToPluck, .65 to strikeString, .87 to readyToPluck,
            1.27 to readyToPluck, 1.48 to strikeString, 1.89 to strikeString, eyes = blink(2.34)),

        motion(Action.NIGHTLORD, "lord_charge", 3.6, .45 to tuckLyre, 1.02 to tuckLyre,
            1.29 to readyToPluck, 1.54 to callSpirit, 2.29 to callSpirit, 2.85 to listen,
            spirit = listOf(1.35 to 0.0, 1.85 to .93, 2.28 to .93, 2.88 to 0.0)),
        motion(Action.NIGHTLORD, "lord_lunge", 3.23, .58 to readyToPluck, .96 to readyToPluck,
            1.23 to strikeString.copy(step = .62), 1.85 to strikeString.copy(step = .62), 2.45 to tuckLyre),
        motion(Action.NIGHTLORD, "lord_recoil", 3.55, .52 to callSpirit, 1.22 to callSpirit,
            1.60 to tuckLyre, 2.18 to tuckLyre, 2.72 to listen,
            spirit = listOf(.38 to 0.0, .85 to 1.0, 1.44 to 1.0, 2.12 to 0.0)),
        motion(Action.NIGHTLORD, "lord_evade", 3.12, .37 to tuckLyre, .66 to tuckLyre.copy(step = -.95),
            1.14 to tuckLyre.copy(step = -.95), 1.67 to readyToPluck, 1.92 to strikeString, 2.44 to strikeString),
        motion(Action.NIGHTLORD, "lord_crescendo", 3.84, .49 to readyToPluck, .80 to strikeString,
            1.13 to readyToPluck, 1.42 to strikeString, 1.86 to callSpirit, 2.72 to callSpirit, 3.22 to listen,
            spirit = listOf(1.64 to 0.0, 2.12 to 1.0, 2.75 to 1.0, 3.29 to 0.0)),

        // Hold still while the guardian enters. Give its silhouette a beat before lowering the hand.
        motion(Action.ULTIMATE, "ultimate", 3.85, .50 to tuckLyre, .94 to tuckLyre, 1.30 to callSpirit,
            2.49 to callSpirit, 2.98 to readStrings, 3.36 to listen,
            eyes = blink(.65, .18), spirit = listOf(1.08 to 0.0, 1.63 to 1.0, 2.47 to 1.0, 3.04 to 0.0)),
        motion(Action.ULTIMATE, "ultimate_requiem", 4.07, .53 to readStrings, .90 to readyToPluck,
            1.15 to strikeString, 1.57 to callSpirit, 2.73 to callSpirit, 3.22 to tuckLyre,
            eyes = blink(.52, .17), spirit = listOf(1.39 to 0.0, 1.92 to 1.0, 2.73 to 1.0, 3.34 to 0.0)),
        motion(Action.VICTORY, "victory", 3.6, .46 to stepRight, .84 to flourish, 1.4 to flourish.copy(arm = .83),
            1.91 to salute.copy(level = -.83), 2.52 to salute, 3.05 to listen, eyes = blink(1.78, .57)),
        motion(Action.VICTORY, "victory_cadence", 4.04, .5 to readStrings, .84 to testNote, 1.25 to upbeat,
            1.61 to sweep, 2.06 to flourish, 2.69 to salute.copy(step = -.42), 3.28 to listen, eyes = blink(2.51, .39)),
    )
    return if (hasSpirit) pieces else pieces.map { clip -> clip.copy(curves = clip.curves.filter { it.parameter != Control.SPIRIT.id }) }
}
