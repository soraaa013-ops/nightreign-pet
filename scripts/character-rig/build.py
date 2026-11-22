"""Rebuild the Revenant model from its painted layers and animation curves."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

SOURCE = Path(__file__).resolve().parent
PROJECT = SOURCE.parents[1]


def publish(source, destination):
    # An interrupted export never replaces a valid model with an incomplete compiler output.
    # Publish the runtime entry points last so new files are present before the app reads them.
    def publish_order(path):
        return (path.name == "manifest.json", path.name.endswith(".model3.json"), path)

    for path in sorted(source.rglob("*"), key=publish_order):
        if not path.is_file():
            continue
        target = destination / path.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as copy:
            temp = Path(copy.name)
        try:
            shutil.copyfile(path, temp)
            temp.chmod(0o644)
            temp.replace(target)
        finally:
            temp.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--psd2live", type=Path, default=os.getenv("PSD2LIVE_HOME"), required="PSD2LIVE_HOME" not in os.environ,
                        help="Extracted PSD2Live Linux installation directory")
    parser.add_argument("--kotlinc", default=os.getenv("KOTLINC", "kotlinc"), help="Kotlin compiler executable")
    parser.add_argument("--runtime-out", type=Path, default=PROJECT / "resources/character/revenant")
    parser.add_argument("--editor-out", type=Path, default=SOURCE / "editor")
    args = parser.parse_args()
    app = args.psd2live.resolve()
    java = app / "lib/runtime/bin/java"
    jars = sorted((app / "lib/app").glob("*.jar"))
    if not java.is_file() or not jars:
        parser.error(f"Missing runtime or libraries in {app}")
    classpath = os.pathsep.join(map(str, jars))
    with tempfile.TemporaryDirectory(prefix="revenant-rig-") as temporary:
        stage = Path(temporary)
        jar = stage / "rig.jar"
        sources = sorted(SOURCE.glob("*.kt"))
        subprocess.run([args.kotlinc, "-jvm-target", "17", "-classpath", classpath, *sources, "-d", jar], check=True)
        subprocess.run([java, "-Xmx1800m", "-Djava.awt.headless=true", "-cp", str(jar) + os.pathsep + classpath,
                        "ExportKt", PROJECT / "art/revenant/layout.json", stage / "runtime", stage / "editor"], check=True)
        publish(stage / "editor", args.editor_out)
        publish(stage / "runtime", args.runtime_out)
        # The model owns its named motion files. Removing a clip from Motions.kt removes its old export.
        for motion in args.runtime_out.glob("revenant.*.motion3.json"):
            if not (stage / "runtime" / motion.name).exists():
                motion.unlink()


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode) from None
