import kotlin.math.*

val marchSleeves = setOf("MarchSleeveL", "MarchSleeveR")
val marchFingers = setOf("MarchFingersL", "MarchFingersR")
val marchPalms = setOf("MarchPalmL", "MarchPalmR")
val marchFace = setOf("MarchSkull", "MarchMouth")
val marchLimbs = marchSleeves + marchFingers + marchPalms

private data class Angles(val upper: Float, val fore: Float, val palm: Float)
private data class ArmKey(val amount: Float, val left: Angles, val right: Angles)
private fun key(t: Float, lu: Int, lf: Int, lh: Int, ru: Int, rf: Int, rh: Int) =
    ArmKey(t, Angles(lu.toFloat(), lf.toFloat(), lh.toFloat()), Angles(ru.toFloat(), rf.toFloat(), rh.toFloat()))

// Absolute bone angles on the drawing plane. The hands arrive at the temples
// before the shoulders rise. On the return the elbows sink toward the waist.
private val outward = listOf(
    key(0f, 82, -51, -38, 86, 12, -12), key(.09f, 85, -54, -42, 82, 9, -15),
    key(.19f, 105, -76, -58, 60, -21, -43), key(.32f, 142, -87, -74, 20, -72, -76),
    key(.43f, 172, -75, -89, -12, -119, -105), key(.5f, 183, -65, -92, -22, -142, -115),
    key(.59f, 191, -61, -92, -25, -149, -119), key(.66f, 182, -78, -105, -17, -126, -105),
    key(.73f, 166, -108, -127, -1, -88, -82), key(.81f, 148, -147, -160, 17, -50, -50),
    key(.9f, 136, -176, -184, 28, -13, -13), key(1f, 132, -196, -198, 32, 17, 13))
private val homeward = listOf(
    key(0f, 82, -51, -38, 86, 12, -12), key(.12f, 83, -49, -34, 86, 14, -10),
    key(.28f, 93, -29, -20, 82, 25, -4), key(.43f, 102, -3, -5, 75, 45, 12),
    key(.55f, 116, 27, 16, 69, 62, 27), key(.67f, 126, 67, 52, 67, 78, 52),
    key(.79f, 139, 109, 98, 59, 69, 50), key(.90f, 141, 143, 137, 44, 41, 32),
    key(1f, 132, 164, 162, 32, 17, 13))

private fun angles(keys: List<ArmKey>, t: Float, left: Boolean): Angles {
    val i = keys.indexOfFirst { it.amount >= t }.coerceAtLeast(0)
    fun at(k: Int) = if (left) keys[k].left else keys[k].right
    if (i == 0) return at(0)
    val f = (t - keys[i - 1].amount) / (keys[i].amount - keys[i - 1].amount)
    val a = at(i - 1)
    val b = at(i)
    return Angles(a.upper + f * (b.upper - a.upper), a.fore + f * (b.fore - a.fore), a.palm + f * (b.palm - a.palm))
}

private class CastArm(val shoulder: Point, val elbow: Point, val wrist: Point, val left: Boolean) {
    val palm = if (left) -38f else -12f

    fun pose(role: String, p: Point, t: Float, returning: Boolean): Point {
        val a = angles(if (returning) homeward else outward, t, left)
        // Relative angles preserve the precise source registration at the first and last key.
        val base = angles(outward, 0f, left)
        val upperTurn = a.upper - base.upper
        val lowerTurn = a.fore - base.fore
        val elbowPos = rotate(elbow, shoulder, upperTurn)
        val wristPos = rotate(wrist, elbow, lowerTurn).shift(elbowPos.x - elbow.x, elbowPos.y - elbow.y)
        if (role !in marchSleeves) {
            return rotate(p, wrist, a.palm - palm).shift(wristPos.x - wrist.x, wristPos.y - wrist.y)
        }
        val toUpper = segmentDistance(p, shoulder, elbow)
        val toLower = segmentDistance(p, elbow, wrist)
        val bend = smooth(-18f, 18f, toUpper - toLower)
        val upperPoint = rotate(p, elbow, upperTurn)
        val lowerPoint = rotate(p, elbow, lowerTurn)
        return Point(upperPoint.x + (lowerPoint.x - upperPoint.x) * bend,
            upperPoint.y + (lowerPoint.y - upperPoint.y) * bend).shift(elbowPos.x - elbow.x, elbowPos.y - elbow.y)
    }
}

private val leftMarch = CastArm(Point(411f, 405f), Point(428f, 521f), Point(531f, 392f), true)
private val rightMarch = CastArm(Point(573f, 370f), Point(579f, 464f), Point(654f, 481f), false)

fun marchLimb(role: String, p: Point, t: Float, returning: Boolean): Point =
    (if (role.endsWith("L")) leftMarch else rightMarch).pose(role, p, t, returning)

fun marchBody(role: String, p: Point, amount: Float, marks: Landmarks): Point {
    val upper = 1f-smooth(marks.hips.y-10f, marks.feet.y-90f, p.y)
    val extent = smooth(.54f, .98f, amount)
    val bow = smooth(.05f, .50f, amount)*(1f-smooth(.57f, .92f, amount))
    val s = (p.x-marks.hips.x)
    val isHead = role == "Head" || role == "FrontHair" || role in marchFace || role.startsWith("Lid")
    val tilt = if (isHead || role == "BackHair") 1f-smooth(marks.neck.y-10f, marks.neck.y+135f, p.y) else 0f
    val fold = (marks.neck.y-p.y)*.12f
    val down = upper*(99f*bow-17f*extent) + tilt*((31f+fold)*bow-7f*extent)
    val loose = if (role == "BackHair") smooth(marks.neck.y-95f, marks.hips.y+55f, p.y) else 0f
    val skirt = if (role == "Dress" || role == "Cape") smooth(marks.hips.y-15f, marks.feet.y-140f, p.y) else 0f
    val toe = smooth(marks.feet.y-155f, marks.feet.y-65f, p.y)
    val spread = extent*(loose*.34f + skirt*(1f-toe)*.12f)
    return p.shift(s*(spread - .026f*bow*upper) - 8f*bow*upper + if (role == "Dress") extent*toe*14f * (s/9f).coerceIn(-1f, 1f) else 0f,
        down - abs(s)*loose*extent*.12f - skirt*(1f-toe)*extent*7f)
}
