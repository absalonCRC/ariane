"""Local DMG packaging must reject invalid bundles and never replace output."""

import importlib.util
import plistlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "package-local.py"
spec = importlib.util.spec_from_file_location("package_local", SCRIPT)
package_local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package_local)


class LocalPackage(unittest.TestCase):
    def bundle(self, directory: Path) -> Path:
        app = directory / "Ariane.app"
        binary = app / "Contents" / "MacOS" / "ariane"
        binary.parent.mkdir(parents=True)
        binary.write_bytes(b"test executable")
        binary.chmod(0o755)
        with (app / "Contents" / "Info.plist").open("wb") as handle:
            plistlib.dump({
                "CFBundleIdentifier": "fr.ariane.writer",
                "CFBundleShortVersionString": "0.1.0-alpha.1",
                "CFBundleExecutable": "ariane",
            }, handle)
        return app

    def test_inspection_requires_arm64_and_ad_hoc_signature(self):
        with tempfile.TemporaryDirectory() as directory:
            app = self.bundle(Path(directory))
            with patch.object(package_local, "run", side_effect=[
                "arm64\n", "valid on disk", "Signature=adhoc\n",
            ]):
                self.assertEqual(package_local.inspect_app(app), "0.1.0-alpha.1")
            with patch.object(package_local, "run", return_value="x86_64\n"):
                with self.assertRaisesRegex(ValueError, "Architecture inattendue"):
                    package_local.inspect_app(app)
            with patch.object(package_local, "run", side_effect=[
                "arm64\n", "valid on disk", "Signature=Developer ID\n",
            ]):
                with self.assertRaisesRegex(ValueError, "signature ad hoc"):
                    package_local.inspect_app(app)

    def test_existing_output_is_never_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            app = self.bundle(root)
            output = root / "out"
            output.mkdir()
            dmg = output / "Ariane-0.1.0-alpha.1-macOS-arm64-local-adhoc.dmg"
            dmg.write_bytes(b"keep this existing package")
            with self.assertRaises(FileExistsError):
                package_local.package(app, output, "0.1.0-alpha.1")
            self.assertEqual(dmg.read_bytes(), b"keep this existing package")


if __name__ == "__main__":
    unittest.main()
