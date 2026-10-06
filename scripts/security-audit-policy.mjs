const severityLevels = ["info", "low", "moderate", "high", "critical"];

function validAudit(report) {
  if (!report || report.error || !report.vulnerabilities ||
      typeof report.vulnerabilities !== "object" || Array.isArray(report.vulnerabilities) ||
      !report.metadata?.vulnerabilities) return false;

  const totals = report.metadata.vulnerabilities;
  const counts = Object.fromEntries(severityLevels.map(level => [level, 0]));
  for (const item of Object.values(report.vulnerabilities)) {
    if (!item || !Object.hasOwn(counts, item.severity) ||
        !Array.isArray(item.via) || !Array.isArray(item.nodes)) return false;
    counts[item.severity]++;
  }
  return Object.entries(counts).every(([key, count]) => totals[key] === count) &&
    totals.total === Object.keys(report.vulnerabilities).length;
}

// Resolve dependency-derived findings back to the advisory. A package name
// alone must never exempt a new vulnerability, production usage, or Critical.
export function evaluateAudits({ full, production, lock, exception, now = new Date() }) {
  if (!validAudit(full) || !validAudit(production)) {
    return { ok: false, blocked: ["Invalid or unavailable npm audit response"], excepted: [] };
  }

  const blocked = Object.keys(production.vulnerabilities).map(name => `production: ${name}`);
  const excepted = [];
  const expiration = Date.parse(exception?.expires);
  const exceptionActive = Number.isFinite(expiration) && now.getTime() < expiration &&
    exception?.packages && typeof exception.packages === "object" &&
    !Array.isArray(exception.packages) && typeof exception.advisory === "string" &&
    exception.advisory.length > 0;

  function allowed(name, seen = new Set()) {
    const item = full.vulnerabilities[name];
    if (!exceptionActive || !item || seen.has(name) ||
        !Object.hasOwn(exception.packages, name) || item.severity === "critical" ||
        item.nodes.length === 0 || item.via.length === 0) return false;

    if (!item.nodes.every(path => path === `node_modules/${name}` &&
        lock?.packages?.[path]?.dev === true &&
        lock.packages[path].version === exception.packages[name])) return false;

    const visited = new Set(seen).add(name);
    return item.via.every(cause => typeof cause === "string"
      ? allowed(cause, visited)
      : cause && cause.url === exception.advisory &&
        severityLevels.includes(cause.severity) && cause.severity !== "critical");
  }

  for (const name of Object.keys(full.vulnerabilities)) {
    if (allowed(name)) excepted.push(name);
    else blocked.push(`full: ${name}`);
  }
  return { ok: blocked.length === 0, blocked, excepted };
}
