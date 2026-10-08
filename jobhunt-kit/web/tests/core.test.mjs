import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "../js/core/rules.js";
import * as J from "../js/core/jobs.js";
import * as P from "../js/core/prompts.js";
import * as S from "../js/core/store.js";

// the same example person as the Python workspace template, converted to JSON by the test runner (see run-tests)
const RESUME = JSON.parse(readFileSync(new URL("./fixtures/resume.json", import.meta.url), "utf8"));
const TARGET = JSON.parse(readFileSync(new URL("./fixtures/target.json", import.meta.url), "utf8"));

test("resume validates and resolves per variant", () => {
  assert.deepEqual(R.validateResume(RESUME), []);
  const swe = R.resolve(RESUME, "swe");
  const projects = swe.sections.find((s) => s.kind === "projects");
  assert.deepEqual(projects.items.map((p) => p.name), ["Drone racing policy", "Team task tracker"]);
  assert.match(R.plainText(swe), /^Alex Chen\n/);
});

test("target overlay matches the Python engine", () => {
  const doc = R.resolve(R.tailor(RESUME, TARGET), "robotics");
  const exp = doc.sections.find((s) => s.kind === "experience");
  assert.equal(exp.items[0].bullets.length, 2);
  assert.match(exp.items[1].bullets[0], /^Trained a YOLO pallet detector/);
  assert.deepEqual(doc.sections.find((s) => s.kind === "skills").lines[0], { label: "Robotics", items: ["ROS 2, Gazebo, motion planning, state estimation"] });
  assert.deepEqual(R.checkTarget(RESUME, TARGET), []);
});

test("checkTarget catches invented numbers, AI voice, wrong ids", () => {
  const bad = { ...TARGET, summary: "Leveraged robust skills; flew 14 drones.", bullet_order: { x: ["nope"] } };
  const codes = R.checkTarget(RESUME, bad).map((e) => e.code).sort();
  assert.deepEqual(codes, ["numbers", "tailor", "voice"]);
  const text = P.fixPrompt(R.checkTarget(RESUME, bad));
  assert.match(text, /14/); assert.match(text, /Leveraged/); assert.match(text, /unknown bullet id 'nope'/);
});

test("prompts carry the rules and parse answers", () => {
  const p = P.tailorPrompt({ resume: RESUME, target: { id: "acme-perception", base_variant: "robotics" },
    job: { company: "Acme", title: "Perception Intern", link: "https://x" }, lang: "zh-TW" });
  assert.match(p, /Never invent experience/);
  const menu = p.match(/You may only use these bullet ids: ([^\n]*)/)[1];
  assert.match(menu, /acme_planner/); assert.doesNotMatch(menu, /tasks_api/);
  assert.match(p, /Traditional Chinese/);
  assert.deepEqual(P.extractJson('Sure!\n```json\n{"a": 1}\n```\nDone'), { a: 1 });
  assert.deepEqual(P.extractJson('here {"b": [2]} ok'), { b: [2] });
  assert.throws(() => P.extractJson("no json"));
  assert.match(P.reviewPrompt({ resume: RESUME, target: TARGET, job: { company: "Acme", title: "X" } }), /YOLO pallet/);
});

test("classification and filters", () => {
  const settings = { tracks: [J.trackFromPreset(J.PRESETS[0]), J.trackFromPreset(J.PRESETS[2])], needsSponsorship: true,
    exclude: { companies: J.DEFENSE_COMPANIES, titles: J.SPONSOR_EXCLUDE_TITLES } };
  const jobs = [
    { id: "1", company: "Acme", title: "Software Engineer Intern", posted: "2026-10-01" },
    { id: "2", company: "Lockheed Martin", title: "Software Intern", posted: "2026-10-02" },
    { id: "3", company: "Bolt", title: "Robotics Intern", posted: "2026-10-03", sponsor: "no" },
    { id: "4", company: "Zed", title: "Marketing Intern" },
    { id: "5", company: "Gov", title: "Embedded Intern", sponsor: "citizen" },
  ];
  const { jobs: out, excluded } = J.filterJobs(jobs, settings);
  assert.deepEqual(out.map((j) => [j.id, j.track]), [["3", "robotics"], ["1", "swe"]]);
  assert.equal(excluded, 2);
  assert.deepEqual(J.filterJobs(jobs, settings, { sponsorOk: true }).jobs.map((j) => j.id), ["1"]);
  assert.deepEqual(J.filterJobs(jobs, settings, { newOnly: true, seen: new Set(["1"]) }).jobs.map((j) => j.id), ["3"]);
});

test("versions, follow-ups, variants, backup", async () => {
  const st = S.emptyState();
  assert.equal(await S.assignVersion(st, "targets/a", 1, "text one"), "V1.1.0");
  assert.equal(await S.assignVersion(st, "targets/a", 1, "text one"), "V1.1.0");
  assert.equal(await S.assignVersion(st, "targets/a", 1, "text two"), "V1.2.0");
  st.applications = [
    { company: "A", role: "r", status: "applied", applied_date: "2026-09-20", last_update: "2026-09-20", contact: "Pat" },
    { company: "B", role: "r", status: "applied", last_update: "2026-09-01" },
    { company: "C", role: "r", status: "interview", next_action_date: "2026-10-08" },
  ];
  const f = S.followups(st, new Date("2026-10-08T12:00:00Z"));
  assert.deepEqual(f.todo.map((x) => [x.app.company, x.kind]), [["A", "nudge"], ["C", "due"]]);
  assert.deepEqual(f.ghost.map((x) => x.app.company), ["B"]);
  const synced = S.syncVariants(RESUME, [{ id: "robotics", label: "Robotics" }]);
  assert.deepEqual(Object.keys(synced.variants), ["robotics"]);
  assert.deepEqual(synced.experience[0].bullets[2].variants, ["robotics"]);           // acme_ros: [robotics]
  assert.equal(synced.projects[1].variants, undefined);                                  // swe-only → tag dropped
  assert.throws(() => S.parseBackup('{"a":1}'));
  assert.equal(S.parseBackup(JSON.stringify(st)).versions.length, 2);
  assert.equal(S.targetIdFor({ company: "Acme Robotics", title: "Perception Intern (Summer 2027)" }), "acme-robotics-perception");
});
