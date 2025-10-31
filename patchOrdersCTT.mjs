import { buildCttUrl } from "./lib/buildCttUrl.mjs";
import { fetchOrders } from "./lib/fetchOrders.mjs";
import { getLeftDatedWords } from "./lib/getLeftDatedWords.mjs";
import transformLeftRowsToStatus from "./lib/transformLeftRowsToStatus.mjs";

const BASE = "https://api-backend-mesodose-2.onrender.com";
const CONCURRENCY = 3; // how many run in parallel

function getHeaders(extra = {}) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...extra,
  };
}

async function httpPatch(orderId, body) {
  const url = `${BASE}/api/orders/${encodeURIComponent(orderId)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`PATCH ${url} -> ${res.status} ${txt}`);
  try {
    return JSON.parse(txt);
  } catch {
    return { raw: txt };
  }
}

function extractRT(order) {
  if (!order) return null;

  // Accept RT / RU, allow spaces or dashes between chunks, case-insensitive
  // e.g., "rt 123-456-789 pt" -> "RT123456789PT"
  const CODE_RE = /\bR[UT][\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{3}[\s-]?PT\b/i;

  const normalize = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, ""); // strip spaces/dashes
  const findInString = (s) => {
    if (typeof s !== "string") return null;
    const m = s.match(CODE_RE);
    return m ? normalize(m[0]) : null;
  };

  // 1) Fast-path known fields
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

  for (const c of candidates) {
    const code = findInString(c);
    if (code) return code;
  }

  // 2) Deep scan all values (strings anywhere)
  const seen = new Set();
  function deepScan(val, depth = 0) {
    if (depth > 5 || val == null) return null;
    if (typeof val === "string") return findInString(val);
    if (typeof val !== "object") return null;
    if (seen.has(val)) return null;
    seen.add(val);

    if (Array.isArray(val)) {
      for (const v of val) {
        const code = deepScan(v, depth + 1);
        if (code) return code;
      }
      return null;
    }

    for (const v of Object.values(val)) {
      const code = deepScan(v, depth + 1);
      if (code) return code;
    }
    return null;
  }

  return deepScan(order);
}

export async function processOrder(order) {
  const rt = extractRT(order);
  if (!rt) {
    console.log(`Order ${order.id} -> no RT code, skip`);
    return { orderId: order.id, status: "skipped", reason: "missing-rt" };
  }

  console.log(`Order ${order.id} -> tracking ${rt}`);
  const url = buildCttUrl(rt);
  const rows = await getLeftDatedWords(url);
  console.log("CTT rows", rows);
  const status = transformLeftRowsToStatus(rows);

  const changes = { changes: { status } };
  const patched = await httpPatch(order.id, changes);
  console.log(`Patched order ${order.id}:`, patched);
  return { orderId: order.id, status: "patched", payload: patched };
}

export async function run() {
  const startedAt = new Date();
  const orders = await fetchOrders();
  console.log(`Fetched ${orders.length} orders.`);

  const queue = [...orders];
  const results = [];
  const failures = [];

  async function worker() {
    while (queue.length) {
      const order = queue.shift();
      try {
        const outcome = await processOrder(order);
        results.push(outcome);
      } catch (e) {
        const failure = { orderId: order.id, message: e.message };
        failures.push(failure);
        console.error(`Failed order ${order.id}:`, e.message);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log("All done.");
  const finishedAt = new Date();

  const patchedCount = results.filter(
    (item) => item?.status === "patched"
  ).length;
  const skippedCount = results.filter(
    (item) => item?.status === "skipped"
  ).length;

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    totalOrders: orders.length,
    processed: results.length,
    patched: patchedCount,
    skipped: skippedCount,
    failures,
    results,
  };
}

let activeRunPromise = null;
let activeRunMeta = null;
let lastRunSummary = null;

export function isRunInProgress() {
  return Boolean(activeRunPromise);
}

export function getLastRunSummary() {
  return lastRunSummary;
}

export function triggerRun({ wait = false } = {}) {
  if (activeRunPromise) {
    return wait
      ? activeRunPromise
      : {
          started: false,
          status: "already-running",
          startedAt:
            activeRunMeta?.startedAt || lastRunSummary?.startedAt || null,
        };
  }

  const startedAt = new Date().toISOString();
  activeRunMeta = { startedAt };

  const runPromise = (async () => {
    try {
      const summary = await run();
      lastRunSummary = { ok: true, ...summary };
      return lastRunSummary;
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const failureSummary = {
        ok: false,
        error: error.message || String(error),
        startedAt,
        finishedAt,
      };
      lastRunSummary = failureSummary;
      throw error;
    } finally {
      activeRunPromise = null;
      activeRunMeta = null;
    }
  })();

  activeRunPromise = runPromise;

  runPromise.catch((err) => {
    console.error("Trigger run failed:", err && err.stack ? err.stack : err);
  });

  if (wait) return activeRunPromise;

  return { started: true, status: "in-progress", startedAt };
}

export default run;
