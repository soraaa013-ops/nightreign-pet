import java.awt.image.BufferedImage
import kotlin.math.*
import kotlin.random.Random

/** The ground wave is painted at its largest size; its mesh unfolds from the feet on release. */
fun marchEffects(marks: Landmarks): List<Layer> {
    val wave = BufferedImage(912, 158, BufferedImage.TYPE_INT_ARGB)
    for (y in 0 until wave.height) for (x in 0 until wave.width) {
        val dx = (x - 456.0) / 440.0
        val dy = (y - 79.0) / 66.0
        val angle = atan2(dy, dx)
        val radius = hypot(dx, dy)
        val irregular = .023 * sin(7 * angle) + .015 * sin(13 * angle + .4) + .010 * sin(29 * angle)
        val rim = radius - .96 - irregular
        val core = exp(-((rim / .035).pow(2)))
        val glow = exp(-((rim / .13).pow(2)))
        val echo = exp(-(((rim + .15 + .025 * sin(5 * angle)) / .026).pow(2))) *
            (.35 + .65 * max(0.0, sin(8 * angle + .6)))
        val alpha = ((core * .77 + glow * .31 + echo * .55) * 250).toInt().coerceIn(0, 248)
        val red = 248
        val green = (56 + 98 * core + 75 * echo).toInt().coerceIn(0, 255)
        val blue = (46 + 44 * core + 28 * echo).toInt()
        wave.setRGB(x, y, (alpha shl 24) or (red shl 16) or (green shl 8) or blue)
    }
    // Detached embers beside the face leave the faceplate and the eye sockets legible.
    val sparks = BufferedImage(660, 515, BufferedImage.TYPE_INT_ARGB)
    val random = Random(3123)
    repeat(33) { i ->
        val side = if (i % 2 == 0) 1 else -1
        val cy = random.nextDouble(33.0, 467.0)
        val cx = 330 + side * random.nextDouble(100.0, 270.0)
        val w = random.nextDouble(3.5, 9.0)
        val h = random.nextDouble(10.0, 28.0)
        val sweep = side * random.nextDouble(.13, .60)
        for (y in max(0, (cy - 2*h).toInt()) until min(sparks.height, (cy + 2*h).toInt()))
            for (x in max(0, (cx - 5*w).toInt()) until min(sparks.width, (cx + 5*w).toInt())) {
                val dy = (y - cy) / h
                val dx = (x - cx + sweep * (y - cy)) / w
                val distance = abs(dx) + abs(dy)
                val core = (1.0 - distance).coerceAtLeast(0.0)
                val haze = exp(-2.2 * (dx * dx + dy * dy))
                val alpha = ((core * 1.7 + haze * .38) * 220).toInt().coerceAtMost(249)
                if (alpha <= sparks.getRGB(x, y).ushr(24)) continue
                val red = (72 + 179 * core).toInt()
                val green = (198 + 57 * core).toInt()
                sparks.setRGB(x, y, (alpha shl 24) or (red shl 16) or (green shl 8) or 255)
            }
    }
    return listOf(
        Layer("MarchWave", "MarchWave", marks.feet.x.toInt() - 456, marks.feet.y.toInt() - 84, -1, wave),
        Layer("MarchSparks", "MarchSparks", marks.neck.x.toInt() - 330, marks.neck.y.toInt() - 225, 99, sparks),
    )
}
