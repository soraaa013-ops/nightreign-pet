import io.github.psd2live.format.compile.Compiler
import io.github.psd2live.format.compile.ExportOptions
import io.github.psd2live.format.compile.ExportTarget
import io.github.psd2live.format.compile.Handling
import io.github.psd2live.format.model.Clip
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
    check(report.losses.none { it.handling == Handling.DROPPED }) { report.toJson() }
    println("${target.id}: ${report.files.joinToString()}")
}

private fun manifest(clips: List<Clip>) = buildJsonObject {
    put("version", 1)
    put("status", "available")
    put("model", "revenant.model3.json")
    putJsonObject("actions") {
        for (clip in clips) putJsonObject(clip.id) {
            putJsonObject("motion") {
                put("group", clip.group)
                put("index", 0)
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
    Files.writeString(runtime.resolve("manifest.json"), json.encodeToString(JsonObject.serializer(), manifest(rig.clips)) + "\n")
}
