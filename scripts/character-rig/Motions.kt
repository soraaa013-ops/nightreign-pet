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
private val windup = Pose(lean = -.64, step = -.48, level = -.65, arm = .8, pluck = -.87, harp = -.71, tilt = .47, wind = .69)
private val upbeat = Pose(lean = -.32, step = -.26, level = .32, arm = .82, pluck = -.55, harp = .26, tilt = -.48, wind = .33)
private val downbeat = Pose(lean = .63, step = .51, level = -.45, arm = -.58, pluck = .94, harp = .67, tilt = -.61, wind = -.83)
private val sweep = Pose(lean = .79, step = .52, level = .38, arm = .57, pluck = .88, harp = .93, tilt = -.67, wind = -.78)
private val rebound = Pose(lean = -.49, step = .12, level = .17, arm = -.08, pluck = -.42, harp = -.49, tilt = .51, wind = .79)
private val guard = Pose(lean = -.55, step = -.62, level = -.41, arm = .89, pluck = -.37, harp = .77, tilt = -.39, wind = .49)
private val lowGuard = Pose(lean = .25, step = .45, level = -.93, arm = .56, pluck = -.68, harp = -.48, tilt = .58, wind = -.43)
private val flourish = Pose(lean = -.45, step = -.19, level = .23, arm = .98, pluck = .43, harp = .87, tilt = -.64, wind = .59)
private val salute = Pose(lean = .18, step = .29, level = -.67, arm = -.28, pluck = .22, harp = -.31, tilt = .85, wind = -.22)
private val spring = Pose(lean = -.21, step = .77, level = 1.0, arm = .86, pluck = -.76, harp = .74, tilt = -.45, wind = -.77)
private val landing = Pose(lean = .44, step = .77, level = -.91, arm = -.68, pluck = .97, harp = .69, tilt = .53, wind = -.8)
private val heavyWindup = windup.copy(lean = -.91, step = -.86, level = -1.0, arm = 1.0, pluck = -1.0, harp = -.96, wind = .99)
private val heavyStrike = downbeat.copy(lean = .94, step = .91, arm = -.82, pluck = 1.0, harp = .96, wind = -1.0)
private val recoil = rebound.copy(lean = -.79, step = -.51, level = -.51, arm = .67, pluck = -.75, wind = 1.0)

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

        // First night: each ordinary strike has a readable preparation, contact and release.
        motion(Action.NIGHT_ONE, "battle", 2.85, .36 to stepLeft, .78 to windup, .98 to downbeat,
            1.28 to upbeat, 1.5 to sweep, 1.94 to rebound, 2.39 to guard.copy(arm = .48), eyes = blink(2.14)),
        motion(Action.NIGHT_ONE, "battle_feint", 2.55, .36 to stepRight, .62 to guard, .99 to stepLeft,
            1.33 to windup, 1.54 to downbeat, 1.93 to rebound, eyes = blink(.83)),
        motion(Action.NIGHT_ONE, "battle_guard", 2.95, .42 to lowGuard, .91 to guard, 1.28 to guard.copy(harp = 1.0, lean = -.76),
            1.58 to stepRight, 1.89 to sweep, 2.31 to rebound, eyes = blink(2.47)),
        motion(Action.NIGHT_ONE, "battle_accent", 2.69, .42 to readStrings.copy(level = -.56), .87 to windup,
            1.11 to downbeat.copy(level = -.76), 1.57 to rebound, 2.09 to flourish.copy(arm = .57), eyes = blink(.64)),

        // Second night: syncopated clusters change direction and height during a phrase.
        motion(Action.NIGHT_TWO, "night2_triplet", 2.82, .3 to stepLeft, .53 to windup, .70 to downbeat,
            .89 to upbeat, 1.06 to downbeat.copy(lean = .2), 1.26 to lowGuard, 1.48 to sweep, 1.95 to recoil, 2.38 to stepRight),
        motion(Action.NIGHT_TWO, "night2_riposte", 2.99, .38 to stepRight, .73 to lowGuard, 1.05 to lowGuard.copy(level = -.98, arm = .79),
            1.29 to spring.copy(level = .68), 1.55 to landing, 2.02 to rebound, 2.45 to guard, eyes = blink(.93)),
        motion(Action.NIGHT_TWO, "night2_arc", 3.09, .36 to stepLeft, .7 to guard, 1.07 to flourish, 1.32 to stepRight.copy(arm = .69),
            1.57 to sweep, 1.84 to downbeat, 2.23 to rebound, 2.68 to readStrings),
        motion(Action.NIGHT_TWO, "night2_offbeat", 2.84, .28 to windup, .45 to downbeat, .85 to stepLeft,
            1.1 to upbeat, 1.25 to downbeat.copy(step = -.25), 1.55 to windup, 1.76 to sweep, 2.16 to recoil, eyes = blink(2.44)),

        // Nightlord: deeper compression, airborne footwork, larger extensions and a spirit response.
        motion(Action.NIGHTLORD, "lord_charge", 3.6, .4 to lowGuard, .9 to heavyWindup, 1.28 to heavyWindup.copy(tilt = .82),
            1.5 to spring, 1.76 to heavyStrike, 2.06 to recoil, 2.6 to guard, 3.06 to stepRight,
            spirit = listOf(.71 to 0.0, 1.32 to .48, 1.78 to .84, 2.08 to .71, 2.7 to 0.0)),
        motion(Action.NIGHTLORD, "lord_lunge", 3.23, .31 to stepLeft, .62 to heavyWindup, .84 to heavyStrike,
            1.09 to upbeat, 1.27 to downbeat, 1.5 to lowGuard, 1.73 to sweep, 2.01 to recoil, 2.59 to guard),
        motion(Action.NIGHTLORD, "lord_recoil", 3.55, .49 to guard, .94 to heavyWindup, 1.24 to spring,
            1.48 to landing, 1.77 to recoil, 2.03 to recoil.copy(step = -1.0, tilt = -.45), 2.54 to lowGuard, 3.02 to flourish,
            spirit = listOf(.83 to 0.0, 1.33 to .85, 1.6 to 1.0, 1.93 to .72, 2.51 to 0.0)),
        motion(Action.NIGHTLORD, "lord_evade", 3.12, .31 to stepRight, .66 to lowGuard, .92 to spring.copy(step = -1.0),
            1.16 to landing.copy(step = -.91, lean = -.66), 1.56 to guard, 1.89 to sweep, 2.34 to recoil, eyes = blink(.92)),
        motion(Action.NIGHTLORD, "lord_crescendo", 3.84, .42 to lowGuard, .81 to windup, 1.02 to downbeat,
            1.39 to heavyWindup, 1.6 to heavyStrike, 1.88 to spring, 2.12 to landing, 2.43 to recoil, 2.98 to flourish, 3.47 to salute,
            spirit = listOf(1.28 to 0.0, 1.89 to .63, 2.17 to 1.0, 2.54 to .86, 3.11 to 0.0)),

        // The ritual opens a space beside the harp, holds the spirit at full strength, then dismisses it.
        motion(Action.ULTIMATE, "ultimate", 3.85, .45 to lowGuard, .97 to heavyWindup, 1.36 to flourish,
            1.71 to spring, 1.99 to heavyStrike, 2.29 to recoil, 2.7 to flourish.copy(harp = 1.0), 3.24 to salute,
            eyes = blink(.89, .31), spirit = listOf(.41 to 0.0, .92 to .44, 1.5 to 1.0, 2.2 to 1.0, 2.74 to .71, 3.46 to 0.0)),
        motion(Action.ULTIMATE, "ultimate_requiem", 4.07, .44 to listen, .88 to guard, 1.29 to heavyWindup,
            1.61 to flourish, 1.95 to sweep, 2.19 to downbeat, 2.5 to spring, 2.77 to landing, 3.22 to flourish, 3.65 to salute,
            eyes = blink(.79, .34), spirit = listOf(.47 to 0.0, 1.12 to .52, 1.59 to .92, 2.1 to 1.0, 2.8 to .91, 3.6 to 0.0)),
        motion(Action.VICTORY, "victory", 3.6, .46 to stepRight, .84 to flourish, 1.4 to flourish.copy(arm = .83),
            1.91 to salute.copy(level = -.83), 2.52 to salute, 3.05 to listen, eyes = blink(1.78, .57)),
        motion(Action.VICTORY, "victory_cadence", 4.04, .5 to readStrings, .84 to testNote, 1.25 to upbeat,
            1.61 to sweep, 2.06 to flourish, 2.69 to salute.copy(step = -.42), 3.28 to listen, eyes = blink(2.51, .39)),
    )
    return if (hasSpirit) pieces else pieces.map { clip -> clip.copy(curves = clip.curves.filter { it.parameter != Control.SPIRIT.id }) }
}
