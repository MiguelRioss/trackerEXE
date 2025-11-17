// tests/testExtractRT.mjs
function extractRT(order) {
  if (!order) return null;
  const SIMPLE_RE = /\bR[UT][A-Z0-9\-\s]*PT\b/i;
  const normalize = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");

  const candidates = [
    order.tracking_code,
    order.trackingCode,
    order.tracking,
    order.ctt_code,
    order.cttCode,
    order.shipping?.tracking_code,
    order.shipping?.trackingCode,
    order.meta?.tracking_code,
    order.meta?.ctt_code,
  ].filter(Boolean);

  for (const v of candidates) {
    const m = String(v).match(SIMPLE_RE);
    if (m) return normalize(m[0]);
  }

  for (const v of Object.values(order)) {
    if (typeof v !== "string") continue;
    const m = v.match(SIMPLE_RE);
    if (m) return normalize(m[0]);
  }

  return null;
}

// --- Test cases
const cases = [
  { name: "Simple RT", order: { tracking_code: "RT123456789PT" }, expect: "RT123456789PT" },
  { name: "Simple RU", order: { tracking_code: "RU784434691PT" }, expect: "RU784434691PT" },
  { name: "Spaces/dashes", order: { tracking_code: "ru 784-434-691 pt" }, expect: "RU784434691PT" },
  { name: "In shipping nested", order: { shipping: { tracking_code: "Rt-999 888 777-pt" } }, expect: "RT999888777PT" },
  { name: "In meta alt key", order: { meta: { ctt_code: "ru123 123 123pt" } }, expect: "RU123123123PT" },
  { name: "Buried in string field", order: { note: "customer sent code: RU 111-222-333 PT yesterday" }, expect: "RU111222333PT" },
  { name: "No code", order: { tracking_code: "", note: "nothing here" }, expect: null },
  { name: "Non-string in candidates", order: { tracking_code: 12345 }, expect: null },
];

let passed = 0;
for (const t of cases) {
  const got = extractRT(t.order);
  const ok = got === t.expect;
  console.log(`${ok ? "✅" : "❌"} ${t.name}:`, { expect: t.expect, got });
  if (ok) passed++;
}

console.log(`\n${passed}/${cases.length} tests passed`);
