import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAudits } from "./security-audit-policy.mjs";

const advisory = "https://github.com/advisories/GHSA-aaaa-bbbb-cccc";

function audit(vulnerabilities = {}) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  for (const item of Object.values(vulnerabilities)) {
    counts[item.severity]++;
    counts.total++;
  }
  return { vulnerabilities, metadata: { vulnerabilities: counts } };
}

function fixture() {
  return {
    full: audit({
      helper: { severity: "high", nodes: ["node_modules/helper"], via: [{ url: advisory, severity: "high" }] },
      parent: { severity: "high", nodes: ["node_modules/parent"], via: ["helper"] },
    }),
    production: audit(),
    lock: { packages: {
      "node_modules/helper": { version: "1.0.0", dev: true },
      "node_modules/parent": { version: "2.0.0", dev: true },
    } },
    exception: { advisory, expires: "2026-11-05T00:00:00Z", packages: { helper: "1.0.0", parent: "2.0.0" } },
    now: new Date("2026-10-06T00:00:00Z"),
  };
}

test("accepts clean reports without an active exception", () => {
  const input = fixture();
  input.full = audit();
  input.exception = { advisory: null, expires: null, packages: {} };
  assert.deepEqual(evaluateAudits(input), { ok: true, blocked: [], excepted: [] });
});

test("allows only the recorded dev advisory and dependency-derived parents", () => {
  assert.deepEqual(evaluateAudits(fixture()), { ok: true, blocked: [], excepted: ["helper", "parent"] });
});

for (const severity of ["info", "low", "moderate", "high", "critical"]) {
  test(`blocks a new ${severity} finding without an exception`, () => {
    const input = fixture();
    input.full = audit({ unrelated: { severity, nodes: ["node_modules/unrelated"], via: [{ url: "new-advisory", severity }] } });
    assert.deepEqual(evaluateAudits(input).blocked, ["full: unrelated"]);
  });
}

test("blocks any production finding even when its dev advisory is excepted", () => {
  const input = fixture();
  input.production = audit({ helper: input.full.vulnerabilities.helper });
  assert.equal(evaluateAudits(input).ok, false);
  assert.ok(evaluateAudits(input).blocked.includes("production: helper"));
});

for (const [label, offset, ok] of [["before expiry", -1, true], ["at expiry", 0, false], ["after expiry", 1, false]]) {
  test(`${ok ? "allows" : "blocks"} the dev exception ${label}`, () => {
    const input = fixture();
    input.now = new Date(Date.parse(input.exception.expires) + offset);
    assert.equal(evaluateAudits(input).ok, ok);
  });
}

test("blocks an invalid exception expiry", () => {
  const input = fixture();
  input.exception.expires = "not-a-date";
  assert.equal(evaluateAudits(input).ok, false);
});

test("blocks a new advisory in an excepted package", () => {
  const input = fixture();
  input.full.vulnerabilities.helper.via.push({ url: "new-advisory", severity: "low" });
  assert.equal(evaluateAudits(input).ok, false);
});

test("blocks a Critical advisory despite a matching advisory URL", () => {
  const input = fixture();
  input.full.vulnerabilities.helper.via[0].severity = "critical";
  assert.equal(evaluateAudits(input).ok, false);
});

test("blocks a package classified Critical despite a matching advisory URL", () => {
  const input = fixture();
  input.full.vulnerabilities.helper.severity = "critical";
  input.full = audit(input.full.vulnerabilities);
  assert.equal(evaluateAudits(input).ok, false);
});

test("blocks an excepted package after it becomes a runtime dependency", () => {
  const input = fixture();
  input.lock.packages["node_modules/helper"].dev = false;
  assert.equal(evaluateAudits(input).ok, false);
});

test("blocks an installed version that differs from the approved version", () => {
  const input = fixture();
  input.lock.packages["node_modules/helper"].version = "1.0.1";
  assert.equal(evaluateAudits(input).ok, false);
});

test("blocks a nested installed path outside the approved package instance", () => {
  const input = fixture();
  input.full.vulnerabilities.helper.nodes.push("node_modules/other/node_modules/helper");
  assert.equal(evaluateAudits(input).ok, false);
});

test("blocks circular dependency-derived findings", () => {
  const input = fixture();
  input.full.vulnerabilities.helper.via = ["parent"];
  assert.equal(evaluateAudits(input).ok, false);
});

test("does not infer an exception from missing advisory information", () => {
  const input = fixture();
  input.full.vulnerabilities.helper.via = [];
  assert.equal(evaluateAudits(input).ok, false);
});

for (const [label, report] of [
  ["missing report", undefined],
  ["registry error", { error: { code: "NETWORK_ERROR" } }],
  ["missing counts", { vulnerabilities: {} }],
  ["array instead of findings", { vulnerabilities: [], metadata: audit().metadata }],
  ["inconsistent totals", { ...audit(), metadata: { vulnerabilities: { ...audit().metadata.vulnerabilities, total: 1 } } }],
  ["malformed finding", audit({ broken: { severity: "high" } })],
]) {
  test(`fails closed on ${label}`, () => {
    const input = fixture();
    input.full = report;
    assert.deepEqual(evaluateAudits(input), { ok: false, blocked: ["Invalid or unavailable npm audit response"], excepted: [] });
  });
}

test("fails closed when only the production report is unavailable", () => {
  const input = fixture();
  input.production = undefined;
  assert.equal(evaluateAudits(input).ok, false);
});
