"""Bundle the standalone Cubism model and editable character project."""
import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "resources/character/revenant"
EDITOR = ROOT / "scripts/character-rig/editor"


def main():
    version = json.loads((ROOT / "package.json").read_text())["version"]
    output = ROOT / "release" / f"小蜗-Revenant-Live2D-{version}.zip"
    output.parent.mkdir(exist_ok=True)
    with NamedTemporaryFile(dir=output.parent, delete=False) as temp:
        stage = Path(temp.name)
    try:
        with ZipFile(stage, "w", compression=ZIP_DEFLATED) as archive:
            for path in sorted(MODEL.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(MODEL))
            for name in ("revenant.cmo3", "revenant.can3"):
                archive.write(EDITOR / name, "editor/" + name)
        stage.chmod(0o644)
        stage.replace(output)
    finally:
        stage.unlink(missing_ok=True)
    print(output)


if __name__ == "__main__":
    main()
