import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** Slide the painted iris inside the eye opening. The lash line and corners stay pinned. */
fun gaze(p: Point, amount: Float, eyes: List<Eye>): Point {
    if (amount == 0f) return p
    for (eye in eyes) {
        val dx = p.x - eye.center.x
        val dy = p.y - eye.center.y
        val c = cos(eye.angle)
        val s = sin(eye.angle)
        val x = (dx * c + dy * s) / eye.halfWidth
        val y = (dy * c - dx * s) / eye.halfHeight
        val radius = sqrt(x * x + y * y)
        if (radius >= .88f) continue
        // Move the pupil as a unit and taper the displacement into the white of the eye.
        val u = ((.88f - radius) / .55f).coerceAtMost(1f)
        val weight = amount * u * u * (3f - 2f * u)
        return Point(p.x + weight * eye.halfWidth * .25f, p.y + weight * eye.halfHeight * .14f)
    }
    return p
}
