import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const runner = fileURLToPath(new URL("./security-audit.mjs", import.meta.url));
const clean = JSON.stringify({
  vulnerabilities: {},
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
});
const finding = JSON.stringify({
  vulnerabilities: { unsafe: { severity: "low", via: [], nodes: ["node_modules/unsafe"] } },
  metadata: { vulnerabilities: { info: 0, low: 1, moderate: 0, high: 0, critical: 0, total: 1 } },
});

function run(t, { production = clean, full = clean, productionStatus = 0, fullStatus = 0,
                  exception = '{"packages":{}}' } = {}) {
  // Isolated fixture: no registry access, shared state, or real lockfile changes.
  const cwd = mkdtempSync(join(tmpdir(), "draw-lab-audit-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const npmCli = join(cwd, "fake-npm.mjs");
  writeFileSync(npmCli, `
    import { appendFileSync } from "node:fs";
    const args = process.argv.slice(2);
    appendFileSync("calls.jsonl", JSON.stringify(args) + "\\n");
    const production = args.includes("--omit=dev");
    process.stdout.write(production ? ${JSON.stringify(production)} : ${JSON.stringify(full)});
    process.exitCode = production ? ${productionStatus} : ${fullStatus};
  `);
  writeFileSync(join(cwd, "security-audit-exception.json"), exception);
  writeFileSync(join(cwd, "package-lock.json"), '{"packages":{}}');
  const result = spawnSync(process.execPath, [runner], {
    cwd, encoding: "utf8", timeout: 10_000,
    env: { ...process.env, npm_execpath: npmCli, NODE_ENV: "production" },
  });
  assert.equal(result.error, undefined, "The audit runner must complete");
  const calls = readFileSync(join(cwd, "calls.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(calls, [["audit", "--json", "--omit=dev"], ["audit", "--json", "--include=dev"]],
    "Collect both scopes and explicitly include dev dependencies even in production environments");
  assert.equal(readFileSync(join(cwd, ".security-audit/production.json"), "utf8"), production || "{}\n");
  assert.equal(readFileSync(join(cwd, ".security-audit/full.json"), "utf8"), full || "{}\n");
  return result;
}

test("clean audits exit successfully and preserve both reports", t => {
  assert.equal(run(t).status, 0);
});

for (const [label, options] of [
  ["production command failure still collects the full report", { production: '{"error":{"code":"E503"}}', productionStatus: 2 }],
  ["full command failure blocks CI", { fullStatus: 2 }],
  ["malformed production JSON still collects the full report", { production: "not json" }],
  ["empty audit response blocks CI", { full: "" }],
  ["audit metadata without findings blocks CI", { full: '{}' }],
  ["npm status 1 with a finding blocks CI", { full: finding, fullStatus: 1 }],
  ["a production finding blocks CI", { production: finding, full: finding, productionStatus: 1, fullStatus: 1 }],
  ["malformed exception configuration blocks CI after retaining reports", { exception: "not json" }],
]) {
  test(label, t => {
    const result = run(t, options);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Security audit failed|Blocking audit findings/);
  });
}
