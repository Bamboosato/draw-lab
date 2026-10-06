import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { evaluateAudits } from "./security-audit-policy.mjs";

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this check with npm run audit:security");
mkdirSync(".security-audit", { recursive: true });

function audit(name, args) {
  const result = spawnSync(process.execPath, [npmCli, "audit", "--json", ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  });
  // Keep the registry response even when audit or policy evaluation fails.
  writeFileSync(`.security-audit/${name}.json`, result.stdout || "{}\n");
  if (result.error || ![0, 1].includes(result.status)) {
    throw new Error(`npm audit (${name}) did not complete: ${result.error?.message || result.status}`);
  }
  return JSON.parse(result.stdout);
}

// Collect both reports even if the first request fails; an unavailable audit
// must fail CI, while retaining as much diagnostic evidence as possible.
const reports = {};
let failed = false;
for (const [name, args] of [["production", ["--omit=dev"]], ["full", ["--include=dev"]]]) {
  try {
    reports[name] = audit(name, args);
  } catch (error) {
    console.error("Security audit failed:", error.message);
    failed = true;
  }
}

try {
  const exception = JSON.parse(readFileSync("security-audit-exception.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const result = evaluateAudits({ ...reports, lock, exception });
  console.log("Production vulnerabilities:", reports.production?.metadata?.vulnerabilities);
  console.log("All dependency vulnerabilities:", reports.full?.metadata?.vulnerabilities);
  if (result.excepted.length) {
    console.log(`Temporary dev exception until ${exception.expires}: ${exception.advisory}`);
    console.log(result.excepted.join(", "));
  }
  if (!result.ok) {
    console.error("Blocking audit findings:", result.blocked.join(", "));
    failed = true;
  }
} catch (error) {
  console.error("Security audit failed:", error.message);
  failed = true;
}

if (failed) process.exitCode = 1;
