"""Offline tests for api_autodoc: the guard, the spec parsing, the schema. No model calls."""

import asyncio
import unittest
from pathlib import Path

import api_autodoc as ad

ROOT = Path("/repo")
SVC = "services/core"


def decide(bc: str, tool: str, **tool_input) -> str:
    guard = ad.make_guard(ad.permission_rules(bc, SVC), ROOT)
    out = asyncio.run(guard({"tool_name": tool, "tool_input": tool_input}, "id", None))
    return out.get("hookSpecificOutput", {}).get("permissionDecision", "allow")


class GuardTest(unittest.TestCase):
    def test_read_only_inside_the_three_globs(self):
        self.assertEqual(decide("finance", "Read", file_path="services/core/api/openapi.yaml"), "allow")
        self.assertEqual(decide("finance", "Read", file_path="/repo/services/core/internal/finance/domain/contract.go"), "allow")
        self.assertEqual(decide("finance", "Read", file_path="docs/api/finance.md"), "allow")
        self.assertEqual(decide("finance", "Read", file_path="services/core/internal/governance/domain/meeting.go"), "deny")
        self.assertEqual(decide("finance", "Read", file_path=".env"), "deny")
        self.assertEqual(decide("finance", "Read", file_path="docs/api/../../.env"), "deny")

    def test_edit_only_the_context_doc(self):
        self.assertEqual(decide("finance", "Edit", file_path="docs/api/finance.md"), "allow")
        self.assertEqual(decide("finance", "Edit", file_path="docs/api/governance.md"), "deny")
        self.assertEqual(decide("finance", "Edit", file_path="services/core/api/openapi.yaml"), "deny")

    def test_bash_only_git_diff_and_log_without_chaining(self):
        self.assertEqual(decide("finance", "Bash", command="git diff main -- services/core/api/openapi.yaml"), "allow")
        self.assertEqual(decide("finance", "Bash", command="git log --oneline -5"), "allow")
        self.assertEqual(decide("finance", "Bash", command="ls"), "deny")
        self.assertEqual(decide("finance", "Bash", command="cat docs/api/finance.md"), "deny")
        self.assertEqual(decide("finance", "Bash", command="git diff main; rm -rf docs"), "deny")
        self.assertEqual(decide("finance", "Bash", command="git log > docs/api/finance.md"), "deny")
        self.assertEqual(decide("finance", "Bash", command="git diff --output=docs/api/x main"), "deny")
        self.assertEqual(decide("finance", "Bash", command="git push"), "deny")

    def test_other_tools_denied(self):
        self.assertEqual(decide("finance", "Write", file_path="docs/api/finance.md"), "deny")
        self.assertEqual(decide("finance", "StructuredOutput"), "allow")


SPEC_BEFORE = {"paths": {"/finance/contracts": {
    "get": {"operationId": "listContracts", "tags": ["finance"], "responses": {"200": {}}}}}}
SPEC_NOW = {"paths": {"/finance/contracts": {
    "get": {"operationId": "listContracts", "tags": ["finance"], "responses": {"200": {}, "422": {}}},
    "post": {"operationId": "createContract", "tags": ["finance"], "responses": {"201": {}}}},
    "/system/health": {"get": {"operationId": "getHealth", "tags": ["system"], "responses": {"200": {}}}}}}


class SpecTest(unittest.TestCase):
    def test_operations_grouped_by_tag(self):
        ops = ad.operations(SPEC_NOW)
        self.assertEqual(sorted(ops), ["finance", "system"])
        self.assertEqual(ops["finance"]["listContracts"]["statuses"], [200, 422])

    def test_expected_change_relative_to_base(self):
        rows = ad.expected_endpoints("finance", ad.operations(SPEC_NOW), ad.operations(SPEC_BEFORE))
        self.assertEqual({r["operation_id"]: r["change"] for r in rows},
                         {"createContract": "added", "listContracts": "changed"})

    def test_schema_pins_the_context(self):
        schema = ad.output_schema("finance")
        self.assertEqual(schema["properties"]["context"]["enum"], ["finance"])
        path = schema["properties"]["endpoints"]["items"]["properties"]["path"]
        self.assertEqual(path["pattern"], "^/finance/")


if __name__ == "__main__":
    unittest.main()
