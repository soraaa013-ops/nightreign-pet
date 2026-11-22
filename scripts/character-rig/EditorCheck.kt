import io.github.psd2live.format.model.RigIR
import java.nio.file.Files
import java.nio.file.Path
import javax.imageio.ImageIO
import javax.xml.parsers.DocumentBuilderFactory
import org.umamo.format.cmo3.Cmo3
import org.umamo.format.cmo3.caff.CaffArchive
import org.umamo.format.cmo3.caff.CaffCodec
import org.umamo.format.cmo3.model.custom.CModelSource
import org.umamo.interop.cmo3.Cmo3Import
import org.umamo.interop.cmo3.cmo3AtlasPages
import org.w3c.dom.Element

/** Reopen both authoring projects, including the embedded artwork and its keyforms, before publishing. */
fun verifyEditorProjects(folder: Path, rig: RigIR) {
    val document = Cmo3.read(Files.readAllBytes(folder.resolve("revenant.cmo3")))
    val root = document.root as CModelSource
    val puppet = Cmo3Import.fromModelSource(root)
    check(puppet.parameters.map { it.id.raw }.toSet() == rig.parameters.map { it.id }.toSet())
    val expected = rig.meshes.associateBy { it.id }
    check(puppet.drawables.size == expected.size)
    for (drawable in puppet.drawables) {
        val source = expected.getValue(drawable.id.raw)
        val vertexCount = requireNotNull(source.geometry).positions.size / 2
        check(drawable.mesh?.vertexCount == vertexCount) { "Mesh changed in editor project: ${source.id}" }
        val grid = requireNotNull(drawable.geometryGrid)
        val authored = requireNotNull(source.offsets)
        val axisIndices = authored.axes.map { sourceAxis ->
            grid.axes.indexOfFirst { it.parameterId.raw == sourceAxis.parameter }.also { check(it >= 0) }
        }
        val savedCoordinates = grid.cells.mapTo(mutableSetOf()) { cell ->
            check(cell.form.positionDeltas.size == vertexCount * 2)
            axisIndices.map { axis -> grid.axes[axis].keys[cell.coordinate[axis]] }
        }
        val authoredCoordinates = authored.cells.mapTo(mutableSetOf()) { cell ->
            authored.axes.mapIndexed { i, axis -> axis.keys[cell.coordinate[i]] }
        }
        check(savedCoordinates.containsAll(authoredCoordinates)) { "Keyforms missing on ${source.id}" }
    }
    val atlas = cmo3AtlasPages(root, document::extractLayerPng)
    check(atlas.atlasIndexByDrawableId.keys == expected.keys)
    check(atlas.pageBytes.size == rig.textures.pages.size)
    for ((index, bytes) in atlas.pageBytes.withIndex()) {
        val image = ImageIO.read(bytes.inputStream())
        val page = rig.textures.pages[index]
        check(image.width == page.width && image.height == page.height)
        val original = ImageIO.read(page.png.shared().inputStream())
        val expectedPixels = original.getRGB(0, 0, page.width, page.height, null, 0, page.width)
        val actualPixels = image.getRGB(0, 0, page.width, page.height, null, 0, page.width)
        check(actualPixels.contentEquals(expectedPixels)) { "Embedded atlas pixels changed on page $index" }
    }

    val animation = Files.readAllBytes(folder.resolve("revenant.can3"))
    val entry = requireNotNull(CaffCodec.readFirstEntryByTag(animation, CaffArchive.TAG_MAIN_XML))
    val xml = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(entry.content.inputStream())
    val elements = xml.getElementsByTagName("*")
    fun values(field: String) = (0 until elements.length).map { elements.item(it) as Element }
        .filter { it.getAttribute("xs.n") == field }.map { it.textContent }
    check(values("srcFile") == listOf("revenant.cmo3")) { "Animation link missing" }
    check(values("sceneName").toSet() == rig.clips.map { "revenant.${it.file}" }.toSet()) { "Animation scenes missing" }
    println("Editor read-back: ${puppet.drawables.size} meshes, ${puppet.parameters.size} controls, ${rig.clips.size} animation scenes.")
}
