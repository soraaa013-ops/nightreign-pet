import io.github.psd2live.format.compile.Compiler
import io.github.psd2live.format.compile.ExportOptions
import io.github.psd2live.format.compile.ExportTarget
import io.github.psd2live.format.compile.Feature
import io.github.psd2live.format.compile.Handling
import io.github.psd2live.format.model.RigIR
import io.github.psd2live.targets.cubism.Cmo3Target
import io.github.psd2live.targets.cubism.Moc3Target
import java.nio.file.Files
import java.nio.file.Path
import kotlinx.serialization.json.*

private fun export(target: ExportTarget, rig: RigIR, folder: Path) {
    val report = Compiler.export(target, rig, ExportOptions("revenant")) { relative, bytes ->
        val path = folder.resolve(relative)
        Files.createDirectories(path.parent)
        Files.write(path, bytes)
    }
    for (loss in report.losses) println("${target.id} ${loss.objectId}: ${loss.note}")
    check(report.losses.none { it.handling == Handling.DROPPED || it.feature == Feature.PARAMETER_GRID }) {
        report.toJson()
    }
    println("${target.id}: ${report.files.joinToString()}")
}

private fun manifest(rig: RigIR) = buildJsonObject {
    put("version", 1)
    put("status", "available")
    put("model", "revenant.model3.json")
    put("scale", .94)
    put("offsetY", -.025)
    val decoration = rig.meshes.filter { it.name in marchParticles }
    if (decoration.isNotEmpty()) putJsonArray("decorativeDrawables") { decoration.forEach { add(it.id) } }
    putJsonObject("actions") {
        for (action in Action.entries) putJsonObject(action.id) {
            require(rig.clips.count { it.group == action.group } > 1)
            putJsonObject("motion") {
                put("group", action.group)
                put("index", 0)
                put("variants", true)
            }
        }
    }
}

fun main(args: Array<String>) {
    require(args.size == 3) { "Expected artwork layout, runtime folder, editable project folder" }
    val art = loadArtwork(Path.of(args[0]))
    val rig = makeRig(art)
    val runtime = Path.of(args[1])
    val editor = Path.of(args[2])
    export(Moc3Target, rig, runtime)
    export(Cmo3Target(), rig, editor)
    verifyEditorProjects(editor, rig)
    val json = Json { prettyPrint = true; prettyPrintIndent = "  " }
    Files.writeString(runtime.resolve("manifest.json"), json.encodeToString(JsonObject.serializer(), manifest(rig)) + "\n")
}
