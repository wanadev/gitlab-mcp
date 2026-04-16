/**
 * Integration tests for @wanadev/mcp-gitlab against a REAL GitLab instance.
 *
 * Requires:
 *   GITLAB_TOKEN  — PAT with api scope
 *   GITLAB_BASE_URL — e.g. https://git.wanadev.org
 *   GITLAB_TEST_GROUP — group path to test against (e.g. "kp1")
 *   GITLAB_TEST_PROJECT_ID — numeric project ID for issue/MR tests
 *
 * Run: GITLAB_TOKEN=xxx GITLAB_BASE_URL=xxx GITLAB_TEST_GROUP=kp1 GITLAB_TEST_PROJECT_ID=1436 node --test test/integration.test.mjs
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

// Dynamic import of built client
const { GitLabClient } = await import(resolve(PROJECT_ROOT, "dist", "client.js"));

const TOKEN = process.env.GITLAB_TOKEN;
const BASE_URL = process.env.GITLAB_BASE_URL;
const GROUP = process.env.GITLAB_TEST_GROUP ?? "kp1";
const PROJECT_ID = parseInt(process.env.GITLAB_TEST_PROJECT_ID ?? "1436", 10);

if (!TOKEN || !BASE_URL) {
  console.error("Skipping integration tests: GITLAB_TOKEN and GITLAB_BASE_URL required");
  process.exit(0);
}

const client = new GitLabClient({ baseUrl: BASE_URL, token: TOKEN, readOnly: false });

// Track resources to clean up
const cleanup = { epics: [], issues: [], milestones: [], labels: [] };

describe("Integration tests against real GitLab", () => {
  after(async () => {
    // Best-effort cleanup
    for (const epicIid of cleanup.epics) {
      try { await client.closeEpic(GROUP, epicIid); } catch {}
    }
    for (const { projectId, iid } of cleanup.issues) {
      try { await client.closeIssue(projectId, iid); } catch {}
    }
    for (const msId of cleanup.milestones) {
      try { await client.closeMilestone(GROUP, msId); } catch {}
    }
  });

  // -----------------------------------------------------------------------
  // Reads
  // -----------------------------------------------------------------------

  describe("reads", () => {
    it("getCurrentUser", async () => {
      const user = await client.getCurrentUser();
      assert.ok(user.username, "should have username");
      assert.ok(user.id, "should have id");
    });

    it("listGroups", async () => {
      const groups = await client.listGroups({ search: GROUP });
      assert.ok(groups.length > 0, "should find at least one group");
    });

    it("listProjects", async () => {
      const projects = await client.listProjects(GROUP, {});
      assert.ok(Array.isArray(projects), "should return array");
    });

    it("listGroupMembers", async () => {
      const members = await client.listGroupMembers(GROUP, {});
      assert.ok(Array.isArray(members), "should return array");
    });

    it("listGroupLabels", async () => {
      const labels = await client.listGroupLabels(GROUP, {});
      assert.ok(Array.isArray(labels), "should return array");
    });

    it("listGroupBoards", async () => {
      const boards = await client.listGroupBoards(GROUP);
      assert.ok(Array.isArray(boards), "should return array");
    });

    it("listGroupMilestones", async () => {
      const ms = await client.listGroupMilestones(GROUP, {});
      assert.ok(Array.isArray(ms), "should return array");
    });

    it("listGroupIterations", async () => {
      const its = await client.listGroupIterations(GROUP, {});
      assert.ok(Array.isArray(its), "should return array");
    });

    it("listEpics", async () => {
      const epics = await client.listEpics(GROUP, {});
      assert.ok(Array.isArray(epics), "should return array");
    });

    it("listGroupIssues", async () => {
      const issues = await client.listGroupIssues(GROUP, {});
      assert.ok(Array.isArray(issues), "should return array");
    });

    it("listGroupMergeRequests", async () => {
      const mrs = await client.listGroupMergeRequests(GROUP, {});
      assert.ok(Array.isArray(mrs), "should return array");
    });
  });

  // -----------------------------------------------------------------------
  // Epic lifecycle
  // -----------------------------------------------------------------------

  describe("epic lifecycle", () => {
    let epicIid;

    it("createEpic", async () => {
      const epic = await client.createEpic(GROUP, { title: "Integration Test Epic" });
      assert.ok(epic.iid, "should have iid");
      assert.equal(epic.title, "Integration Test Epic");
      epicIid = epic.iid;
      cleanup.epics.push(epicIid);
    });

    it("getEpic", async () => {
      const epic = await client.getEpic(GROUP, epicIid);
      assert.equal(epic.iid, epicIid);
    });

    it("updateEpic", async () => {
      const epic = await client.updateEpic(GROUP, epicIid, { title: "Integration Test Epic v2" });
      assert.equal(epic.title, "Integration Test Epic v2");
    });

    it("addEpicNote", async () => {
      const note = await client.addEpicNote(GROUP, epicIid, "Integration test comment");
      assert.ok(note.id, "should have note id");
      assert.equal(note.body, "Integration test comment");
    });

    it("listEpicNotes", async () => {
      const notes = await client.listEpicNotes(GROUP, epicIid);
      assert.ok(notes.length > 0, "should have at least one note");
    });

    it("getEpicWidgets", async () => {
      const wi = await client.getEpicWidgets(GROUP, epicIid);
      assert.ok(wi.id, "should have workitem id");
      assert.ok(wi.widgets, "should have widgets");
    });

    it("closeEpic", async () => {
      const epic = await client.closeEpic(GROUP, epicIid);
      assert.equal(epic.state, "closed");
    });
  });

  // -----------------------------------------------------------------------
  // Issue lifecycle
  // -----------------------------------------------------------------------

  describe("issue lifecycle", () => {
    let issueIid;

    it("createIssue", async () => {
      const issue = await client.createIssue(PROJECT_ID, { title: "Integration Test Issue" });
      assert.ok(issue.iid, "should have iid");
      issueIid = issue.iid;
      cleanup.issues.push({ projectId: PROJECT_ID, iid: issueIid });
    });

    it("getIssue", async () => {
      const issue = await client.getIssue(PROJECT_ID, issueIid);
      assert.equal(issue.iid, issueIid);
    });

    it("updateIssue", async () => {
      const issue = await client.updateIssue(PROJECT_ID, issueIid, { title: "Integration Test Issue v2" });
      assert.equal(issue.title, "Integration Test Issue v2");
    });

    it("addIssueNote", async () => {
      const note = await client.addIssueNote(PROJECT_ID, issueIid, "Integration test comment");
      assert.ok(note.id);
    });

    it("listIssueNotes", async () => {
      const notes = await client.listIssueNotes(PROJECT_ID, issueIid);
      assert.ok(notes.length > 0);
    });

    it("closeIssue", async () => {
      const issue = await client.closeIssue(PROJECT_ID, issueIid);
      assert.equal(issue.state, "closed");
    });
  });

  // -----------------------------------------------------------------------
  // Milestone lifecycle (REST fallback)
  // -----------------------------------------------------------------------

  describe("milestone lifecycle", () => {
    let msId;

    it("createMilestone", async () => {
      const ms = await client.createMilestone(GROUP, { title: `Integration Test MS ${Date.now()}` });
      assert.ok(ms.id, "should have id");
      msId = ms.id;
      cleanup.milestones.push(msId);
    });

    it("getMilestone", async () => {
      const ms = await client.getMilestone(GROUP, msId);
      assert.equal(ms.id, msId);
    });

    it("updateMilestone", async () => {
      const newTitle = `Integration Test MS v2 ${Date.now()}`;
      const ms = await client.updateMilestone(GROUP, msId, { title: newTitle });
      assert.equal(ms.title, newTitle);
    });

    it("closeMilestone", async () => {
      const ms = await client.closeMilestone(GROUP, msId);
      assert.equal(ms.state, "closed");
    });
  });

  // -----------------------------------------------------------------------
  // Cross-resource operations
  // -----------------------------------------------------------------------

  describe("cross-resource", () => {
    let epicIid;
    let issueIid;

    before(async () => {
      const epic = await client.createEpic(GROUP, { title: "Cross-test Epic" });
      epicIid = epic.iid;
      cleanup.epics.push(epicIid);

      const issue = await client.createIssue(PROJECT_ID, { title: "Cross-test Issue" });
      issueIid = issue.iid;
      cleanup.issues.push({ projectId: PROJECT_ID, iid: issueIid });
    });

    it("addIssueToEpic", async () => {
      await client.addIssueToEpic(GROUP, epicIid, PROJECT_ID, issueIid);
      const issues = await client.listEpicIssues(GROUP, epicIid);
      assert.ok(issues.length > 0, "epic should have linked issues");
    });

    it("setEpicMilestone", async () => {
      const milestones = await client.listGroupMilestones(GROUP, {});
      if (milestones.length > 0) {
        await client.setEpicMilestone(GROUP, epicIid, milestones[0].id);
        // Verify via widgets
        const wi = await client.getEpicWidgets(GROUP, epicIid);
        const msWidget = wi.widgets?.find(w => w.type === "MILESTONE");
        assert.ok(msWidget, "should have milestone widget");
      }
    });
  });
});
