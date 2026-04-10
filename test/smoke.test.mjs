/**
 * Smoke tests for @wanadev/mcp-gitlab MCP server.
 *
 * Validates the server structure (tool names, schemas, defaults) WITHOUT
 * making any real GitLab API calls. A fake GITLAB_TOKEN is injected so
 * the server starts normally.
 *
 * Run: node --test test/smoke.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(PROJECT_ROOT, "package.json"), "utf8"));

// ---------------------------------------------------------------------------
// Expected tool names
// ---------------------------------------------------------------------------

const EXPECTED_TOOLS = [
  // Epics
  "list_epics",
  "get_epic",
  "create_epic",
  "update_epic",
  "close_epic",
  "list_epic_issues",
  "add_issue_to_epic",
  "list_epic_notes",
  "add_epic_note",
  "get_epic_widgets",
  "set_epic_milestone",
  "set_epic_health_status",
  "set_issue_health_status",
  "set_epic_iteration",
  "add_linked_item",
  // Issues
  "list_issues",
  "get_issue",
  "create_issue",
  "update_issue",
  "close_issue",
  "list_issue_notes",
  "add_issue_note",
  // Milestones
  "list_milestones",
  "get_milestone",
  "create_milestone",
  "update_milestone",
  "close_milestone",
  // Merge Requests
  "list_merge_requests",
  "get_merge_request",
  // Utils
  "list_groups",
  "list_projects",
  "list_group_members",
  "list_labels",
  "list_boards",
  "list_iterations",
  "get_current_user",
];

const WRITE_TOOLS = [
  "create_epic",
  "update_epic",
  "close_epic",
  "add_issue_to_epic",
  "add_epic_note",
  "set_epic_milestone",
  "set_epic_health_status",
  "set_issue_health_status",
  "set_epic_iteration",
  "add_linked_item",
  "create_issue",
  "update_issue",
  "close_issue",
  "add_issue_note",
  "create_milestone",
  "update_milestone",
  "close_milestone",
];

const GROUP_SCOPED_TOOLS = [
  "list_epics",
  "get_epic",
  "create_epic",
  "update_epic",
  "close_epic",
  "list_epic_issues",
  "add_issue_to_epic",
  "list_epic_notes",
  "add_epic_note",
  "set_epic_milestone",
  "set_epic_health_status",
  "set_epic_iteration",
  "list_issues",
  "list_milestones",
  "get_milestone",
  "create_milestone",
  "update_milestone",
  "close_milestone",
  "list_merge_requests",
  "list_projects",
  "list_group_members",
  "list_labels",
  "list_boards",
  "list_iterations",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a map of tool name -> tool definition for quick lookup. */
function toolMap(tools) {
  const map = new Map();
  for (const t of tools) {
    map.set(t.name, t);
  }
  return map;
}

/** Return the property names declared in a tool's inputSchema. */
function schemaProps(tool) {
  return Object.keys(tool.inputSchema?.properties ?? {});
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("MCP server smoke tests", () => {
  /** @type {Client} */
  let client;
  /** @type {StdioClientTransport} */
  let transport;
  /** @type {Map<string, object>} */
  let tools;

  before(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [resolve(PROJECT_ROOT, "dist", "index.js")],
      env: {
        ...process.env,
        GITLAB_TOKEN: "fake-token-for-smoke-tests",
      },
      stderr: "pipe",
    });

    client = new Client(
      { name: "smoke-test-client", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);

    const result = await client.listTools();
    tools = toolMap(result.tools);
  });

  after(async () => {
    try {
      await client.close();
    } catch {
      // Ignore close errors during cleanup.
    }
  });

  // -----------------------------------------------------------------------
  // 1. Server starts & responds
  // -----------------------------------------------------------------------

  it("should connect and report server info", () => {
    const info = client.getServerVersion();
    assert.ok(info, "server version info should be available after connect");
    assert.equal(info.name, "@wanadev/mcp-gitlab");
    assert.equal(info.version, pkg.version);
  });

  // -----------------------------------------------------------------------
  // 2. Exactly 29 tools registered
  // -----------------------------------------------------------------------

  it(`should expose exactly ${EXPECTED_TOOLS.length} tools`, () => {
    assert.equal(
      tools.size,
      EXPECTED_TOOLS.length,
      `Expected ${EXPECTED_TOOLS.length} tools, got ${tools.size}: ${[...tools.keys()].join(", ")}`,
    );
  });

  // -----------------------------------------------------------------------
  // 3. Every expected tool name exists
  // -----------------------------------------------------------------------

  it("should contain every expected tool name", () => {
    for (const name of EXPECTED_TOOLS) {
      assert.ok(tools.has(name), `Missing tool: ${name}`);
    }
  });

  it("should not contain unexpected tools", () => {
    const expectedSet = new Set(EXPECTED_TOOLS);
    for (const name of tools.keys()) {
      assert.ok(expectedSet.has(name), `Unexpected tool: ${name}`);
    }
  });

  // -----------------------------------------------------------------------
  // 4. Group-scoped tools have group_id in their schema
  // -----------------------------------------------------------------------

  it("should have group_id parameter on every group-scoped tool", () => {
    for (const name of GROUP_SCOPED_TOOLS) {
      const tool = tools.get(name);
      assert.ok(tool, `Tool ${name} not found`);
      const props = schemaProps(tool);
      assert.ok(
        props.includes("group_id"),
        `Tool ${name} is missing group_id in its inputSchema (has: ${props.join(", ")})`,
      );
    }
  });

  // -----------------------------------------------------------------------
  // 5. Write tools have dry_run in their schema
  // -----------------------------------------------------------------------

  it("should have dry_run parameter on every write tool", () => {
    for (const name of WRITE_TOOLS) {
      const tool = tools.get(name);
      assert.ok(tool, `Tool ${name} not found`);
      const props = schemaProps(tool);
      assert.ok(
        props.includes("dry_run"),
        `Tool ${name} is missing dry_run in its inputSchema (has: ${props.join(", ")})`,
      );
    }
  });

  it("should default dry_run to true on every write tool", () => {
    for (const name of WRITE_TOOLS) {
      const tool = tools.get(name);
      const dryRunProp = tool.inputSchema?.properties?.dry_run;
      assert.ok(dryRunProp, `Tool ${name} has no dry_run property definition`);
      assert.equal(
        dryRunProp.default,
        true,
        `Tool ${name} dry_run default should be true, got ${dryRunProp.default}`,
      );
    }
  });

  // -----------------------------------------------------------------------
  // 6. Read-only tools should NOT have dry_run
  // -----------------------------------------------------------------------

  it("should not have dry_run on read-only tools", () => {
    const writeSet = new Set(WRITE_TOOLS);
    for (const [name, tool] of tools) {
      if (writeSet.has(name)) continue;
      const props = schemaProps(tool);
      assert.ok(
        !props.includes("dry_run"),
        `Read-only tool ${name} should not have dry_run (has: ${props.join(", ")})`,
      );
    }
  });
});
