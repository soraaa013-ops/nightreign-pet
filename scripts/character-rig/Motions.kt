import io.github.psd2live.format.model.Clip
import io.github.psd2live.format.model.Curve
import io.github.psd2live.format.model.CurveSegment

/** Control points sit a third of the way along each beat, with a level tangent at each extremum. */
private fun track(control: Control, vararg keys: Pair<Double, Double>): Curve {
    require(keys.size >= 2 && keys.first().first == 0.0)
    val segments = keys.asList().zipWithNext { (start, from), (end, to) ->
        require(start < end && to in control.keys.first().toDouble()..control.keys.last().toDouble())
        val third = (end - start) / 3.0
        CurveSegment.Bezier((start + third).toFloat(), from.toFloat(), (end - third).toFloat(),
            to.toFloat(), end.toFloat(), to.toFloat())
    }
    return Curve(control.id, 0f, keys.first().second.toFloat(), segments)
}

private fun clip(group: String, length: Double, vararg tracks: Curve): Clip {
    val id = group.lowercase()
    require(tracks.all { it.segments.last().time == length.toFloat() })
    return Clip(id, group, group, id, length.toFloat(), 30f, id == "idle", .09f, .12f, tracks.toList())
}

fun motions(): List<Clip> = listOf(
    clip("Idle", 6.4,
        track(Control.TILT, 0.0 to 0.0, 1.7 to -.21, 3.65 to .16, 5.4 to -.06, 6.4 to 0.0),
        track(Control.WIND, 0.0 to 0.0, 1.95 to .29, 4.25 to -.28, 6.4 to 0.0),
        track(Control.HARP, 0.0 to 0.0, 2.4 to -.14, 4.5 to .15, 6.4 to 0.0),
        track(Control.PLUCK, 0.0 to 0.0, 1.62 to -.14, 1.91 to .18, 2.75 to 0.0, 6.4 to 0.0),
        track(Control.EYES, 0.0 to 1.0, 3.03 to 1.0, 3.16 to 0.0, 3.25 to 0.0, 3.43 to 1.0, 6.4 to 1.0)),
    clip("Touch", 1.45,
        track(Control.TILT, 0.0 to 0.0, .31 to -.75, .68 to -.62, 1.45 to 0.0),
        track(Control.WIND, 0.0 to 0.0, .48 to .31, .98 to -.17, 1.45 to 0.0),
        track(Control.HARP, 0.0 to 0.0, .42 to .22, 1.45 to 0.0),
        track(Control.PLUCK, 0.0 to 0.0, .32 to -.34, .54 to .45, .88 to .12, 1.45 to 0.0),
        track(Control.EYES, 0.0 to 1.0, .16 to 0.0, .26 to 0.0, .49 to 1.0, 1.45 to 1.0)),
    clip("Battle", 2.8,
        track(Control.TILT, 0.0 to 0.0, .4 to .45, .84 to -.22, 1.45 to .38, 2.22 to -.37, 2.8 to 0.0),
        track(Control.WIND, 0.0 to 0.0, .56 to -.65, 1.09 to .43, 1.7 to -.51, 2.34 to .5, 2.8 to 0.0),
        track(Control.HARP, 0.0 to 0.0, .38 to -.62, .73 to .62, 1.14 to -.32, 1.64 to .53, 2.12 to -.44, 2.8 to 0.0),
        track(Control.PLUCK, 0.0 to 0.0, .32 to -.78, .48 to .88, .89 to -.65, 1.05 to .86,
            1.5 to -.67, 1.68 to .83, 2.0 to -.6, 2.17 to .67, 2.8 to 0.0),
        track(Control.EYES, 0.0 to 1.0, 1.83 to 1.0, 1.94 to 0.0, 2.02 to 0.0, 2.16 to 1.0, 2.8 to 1.0)),
    clip("Ultimate", 2.05,
        track(Control.TILT, 0.0 to 0.0, .54 to .9, .86 to -.86, 1.35 to -.55, 2.05 to 0.0),
        track(Control.WIND, 0.0 to 0.0, .61 to -.89, 1.02 to 1.0, 1.46 to -.38, 1.78 to .16, 2.05 to 0.0),
        track(Control.HARP, 0.0 to 0.0, .59 to -1.0, .89 to .99, 1.36 to .56, 2.05 to 0.0),
        track(Control.PLUCK, 0.0 to 0.0, .55 to -1.0, .68 to -.91, .83 to 1.0, 1.12 to .64, 1.42 to .78, 2.05 to 0.0),
        track(Control.EYES, 0.0 to 1.0, .34 to .1, .49 to 0.0, .61 to 0.0, .78 to 1.0, 2.05 to 1.0)),
    clip("Victory", 3.15,
        track(Control.TILT, 0.0 to 0.0, .64 to -.95, 1.49 to -.91, 2.3 to .28, 3.15 to 0.0),
        track(Control.WIND, 0.0 to 0.0, .89 to .78, 1.73 to .31, 2.52 to -.41, 3.15 to 0.0),
        track(Control.HARP, 0.0 to 0.0, .56 to .92, 1.28 to .8, 2.21 to -.24, 3.15 to 0.0),
        track(Control.PLUCK, 0.0 to 0.0, .46 to -.81, .72 to .96, 1.43 to .61, 2.28 to -.21, 3.15 to 0.0),
        track(Control.EYES, 0.0 to 1.0, .34 to 1.0, .51 to 0.0, 1.41 to 0.0, 1.73 to 1.0, 3.15 to 1.0)),
)
