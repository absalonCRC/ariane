from datetime import date
import importlib.util
from pathlib import Path
import unittest


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

    def test_native_report_fails_on_a_finding(self):
        self.assertEqual(load('audit-native.py').findings([{'name': 'engine', 'vulns': [{'id': 'TEST'}]}]), [('engine', 'TEST')])
