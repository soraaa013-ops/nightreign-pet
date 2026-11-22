import io.github.psd2live.format.model.*
import kotlinx.serialization.json.*
import java.awt.AlphaComposite
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.nio.file.Files
import java.nio.file.Path
import javax.imageio.ImageIO
import kotlin.math.*

data class Point(val x: Float, val y: Float)
data class Artwork(val width: Int, val height: Int, val layers: List<Layer>)
data class Layer(val id: String, val x: Int, val y: Int, val z: Int, val image: BufferedImage) {
    val w = image.width
    val h = image.height
    val meshId = "Art$id"
    val tileId = "Tile$id"
}

fun loadArtwork(file: Path): Artwork {
    val data = Json.parseToJsonElement(Files.readString(file)).jsonObject
    val size = data.getValue("canvas").jsonArray.map { it.jsonPrimitive.int }
    val layers = data.getValue("layers").jsonArray.map { item ->
        val fields = item.jsonObject
        fun num(key: String) = fields.getValue(key).jsonPrimitive.int
        fun str(key: String) = fields.getValue(key).jsonPrimitive.content
        val img = requireNotNull(ImageIO.read(file.resolveSibling(str("file")).toFile()))
        require(img.width == num("width") && img.height == num("height")) { "Check size of ${str("id")}" }
        Layer(str("id"), num("x"), num("y"), num("z"), img)
    }.sortedBy { it.z }
    require(layers.map { it.id }.toSet().size == layers.size)
    require(layers.map { it.z }.toSet().size == layers.size)
    return Artwork(size[0], size[1], layers)
}

/** The atlas uses the original raster size so skin, eyelashes and gold filigree keep their detail. */
class Atlas(layers: List<Layer>) {
    val width = 2048
    val height: Int
    val origin = mutableMapOf<String, Pair<Int, Int>>()
    val textures: Textures

    init {
        val gutter = 4
        val skyline = IntArray(width)
        val edges = mutableSetOf(0)
        for (layer in layers.sortedByDescending { it.h }) {
            val w = layer.w + gutter * 2
            val h = layer.h + gutter * 2
            val best = edges.asSequence().filter { it + w <= width }.map { x ->
                x to (x until x + w).maxOf { skyline[it] }
            }.minWith(compareBy({ it.second }, { it.first }))
            val (x, y) = best
            origin[layer.id] = (x + gutter) to (y + gutter)
            skyline.fill(y + h, x, x + w)
            edges += x + w
        }
        height = generateSequence(256) { it * 2 }.first { it >= skyline.max() }
        require(height <= 4096) { "Artwork exceeds the desktop texture budget" }
        val image = BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB)
        val graphics = image.createGraphics()
        graphics.composite = AlphaComposite.Src
        for (layer in layers) {
            val (x, y) = origin.getValue(layer.id)
            graphics.drawImage(layer.image, x, y, null)
        }
        graphics.dispose()
        val png = ByteArrayOutputStream().also { ImageIO.write(image, "PNG", it) }.toByteArray()
        textures = Textures(
            pages = listOf(TexturePage(width, height, Bytes.wrap(png))),
            bindings = layers.associate { it.meshId to 0 }, tilePages = listOf(PageSize(width, height)),
            tiles = layers.map { layer ->
                val (x, y) = origin.getValue(layer.id)
                TextureTile(layer.tileId, layer.id, layer.w, layer.h,
                    TilePlacement(0, x.toFloat(), y.toFloat(), 1f, 1f, 0f),
                    SourceRef("Sheet", layer.id, true))
            },
            tileArt = layers.map { layer ->
                val pixels = layer.image.getRGB(0, 0, layer.w, layer.h, null, 0, layer.w)
                val bytes = ByteArray(pixels.size * 4)
                for ((index, argb) in pixels.withIndex()) {
                    bytes[4 * index] = (argb ushr 16).toByte()
                    bytes[4 * index + 1] = (argb ushr 8).toByte()
                    bytes[4 * index + 2] = argb.toByte()
                    bytes[4 * index + 3] = (argb ushr 24).toByte()
                }
                TileArt(layer.tileId, layer.w, layer.h, Bytes.wrap(bytes))
            },
        )
    }
}

data class Surface(val points: List<Point>, val geometry: MeshGeometry)

/** Keep triangles covering the silhouette. Extra samples around the eyes allow the curved lid to close. */
fun makeSurface(layer: Layer, atlas: Atlas): Surface {
    val detail = when (layer.id) {
        "Head" -> 16
        "Lyre", "PluckArm", "HoldArm" -> 12
        "LidLeft", "LidRight" -> 5
        else -> 25
    }
    fun axis(start: Int, size: Int, fine: IntProgression): List<Int> {
        val samples = (0..size step detail).toMutableSet()
        samples += size
        if (layer.id == "Head") for (v in fine) if (v - start in 1 until size) samples += v - start
        return samples.sorted()
    }
    val xs = axis(layer.x, layer.w, 438..610 step 4)
    val ys = axis(layer.y, layer.h, 211..302 step 3)
    val alpha = layer.image.getRGB(0, 0, layer.w, layer.h, null, 0, layer.w)
    fun hasInk(x0: Int, y0: Int, x1: Int, y1: Int): Boolean {
        for (y in max(0, y0 - 1) until min(layer.h, y1 + 1)) {
            for (x in max(0, x0 - 1) until min(layer.w, x1 + 1)) {
                if ((alpha[y * layer.w + x] ushr 24) > 1) return true
            }
        }
        return false
    }
    val points = mutableListOf<Point>()
    val uvs = mutableListOf<Float>()
    val (atlasX, atlasY) = atlas.origin.getValue(layer.id)
    val vertexIds = IntArray(xs.size * ys.size) { -1 }
    fun vertex(col: Int, row: Int): Int {
        val gridIndex = row * xs.size + col
        if (vertexIds[gridIndex] >= 0) return vertexIds[gridIndex]
        val x = xs[col]
        val y = ys[row]
        val id = points.size
        points += Point((layer.x + x).toFloat(), (layer.y + y).toFloat())
        uvs += (atlasX + x) / atlas.width.toFloat()
        uvs += (atlasY + y) / atlas.height.toFloat()
        vertexIds[gridIndex] = id
        return id
    }
    val triangles = mutableListOf<Int>()
    for (row in 0 until ys.lastIndex) for (col in 0 until xs.lastIndex) {
        if (!hasInk(xs[col], ys[row], xs[col + 1], ys[row + 1])) continue
        val a = vertex(col, row)
        val b = vertex(col + 1, row)
        val c = vertex(col, row + 1)
        val d = vertex(col + 1, row + 1)
        triangles.addAll(listOf(a, b, c, c, b, d))
    }
    require(triangles.isNotEmpty()) { "${layer.id} has no visible pixels" }
    val positions = points.flatMap { listOf(it.x, it.y) }.toFloatArray()
    return Surface(points, MeshGeometry(Floats.wrap(positions), Floats.wrap(uvs.toFloatArray()), Ints.wrap(triangles.toIntArray())))
}
