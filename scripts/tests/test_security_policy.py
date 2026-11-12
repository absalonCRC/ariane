from contextlib import redirect_stdout
from datetime import date
import io
import json
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[1] / name)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SecurityPolicyTests(unittest.TestCase):
    def test_new_python_advisory_and_expired_exception_fail(self):
        module = load('check-python-audit.py')
        policy = {'package': 'p', 'version': '1', 'expires': '2026-12-03', 'advisories': ['KNOWN']}
        report = {'dependencies': [{'name': 'p', 'version': '1', 'vulns': [{'id': 'KNOWN'}, {'id': 'NEW'}]}]}
        self.assertEqual(module.evaluate(report, policy, date(2026, 11, 3))[0], [('p', 'NEW')])
        self.assertEqual(len(module.evaluate(report, policy, date(2026, 12, 4))[0]), 2)

    def test_rust_vulnerability_fails_only_for_the_actual_target_graph(self):
        module = load('check-rust-audit.py')
        issue = {'package': {'name': 'zip', 'version': '2.6.1'}, 'advisory': {'id': 'TEST'}}
        report = {'vulnerabilities': {'list': [issue]}, 'warnings': {}}
        self.assertEqual(module.applicable(report, {('zip', '2.6.1')}), [issue])
        self.assertEqual(module.applicable(report, {('other', '1')}), [])

    def test_rust_report_prints_null_and_missing_advisories_without_hiding_findings(self):
        module = load('check-rust-audit.py')
        vulnerability = {'package': {'name': 'libsqlite3-sys', 'version': '0.30.1'}, 'advisory': {'id': 'RUSTSEC-TEST'}}
        for advisory in ({'advisory': None}, {}):
            with self.subTest(advisory=advisory):
                warning = {'package': {'name': 'zip', 'version': '9.0.0'}, 'kind': 'yanked', **advisory}
                report = {'vulnerabilities': {'list': [vulnerability]}, 'warnings': {'yanked': [warning]}}
                with tempfile.TemporaryDirectory() as directory:
                    path = Path(directory) / 'audit.json'
                    path.write_text(json.dumps(report))
                    output = io.StringIO()
                    with patch.object(module.sys, 'argv', ['check-rust-audit.py', str(path)]), patch.object(module.subprocess, 'check_output', return_value='libsqlite3-sys v0.30.1\nzip v9.0.0\n'), redirect_stdout(output):
                        self.assertTrue(module.main())
                    self.assertIn('RUSTSEC-TEST libsqlite3-sys 0.30.1', output.getvalue())
                    self.assertIn('yanked zip 9.0.0', output.getvalue())
                    self.assertIn('2 applicable findings', output.getvalue())

    def test_rust_warning_alone_remains_blocking_and_is_filtered_by_target(self):
        module = load('check-rust-audit.py')
        warning = {'package': {'name': 'zip', 'version': '9.0.0'}, 'kind': 'yanked', 'advisory': None}
        report = {'vulnerabilities': {'list': []}, 'warnings': {'yanked': [warning]}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'audit.json'
            path.write_text(json.dumps(report))
            for tree, fails in [('zip v9.0.0\n', True), ('zip v8.0.0\n', False), ('other v1.0.0\n', False)]:
                with self.subTest(tree=tree), patch.object(module.sys, 'argv', ['check-rust-audit.py', str(path)]), patch.object(module.subprocess, 'check_output', return_value=tree), redirect_stdout(io.StringIO()):
                    self.assertEqual(module.main(), fails)

    def test_native_report_fails_on_a_finding(self):
        self.assertEqual(load('audit-native.py').findings([{'name': 'engine', 'vulns': [{'id': 'TEST'}]}]), [('engine', 'TEST')])
