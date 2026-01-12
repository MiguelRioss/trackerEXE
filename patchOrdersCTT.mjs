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

function extractTracking(order) {
  if (!order) return null;

  // Match RT/RU/LA/LL/RL...PT (tolerate spaces/dashes in between)
  const SIMPLE_RE = /\b(?:RT|RU|LA|LL|RL)[A-Z0-9\-\s]*PT\b/i;
  const normalize = (s) =>
    String(s)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, ""); // strip spaces/dashes

  // Quick known fields first
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

  // Shallow scan of top-level string values (keep it simple)
  for (const v of Object.values(order)) {
    if (typeof v !== "string") continue;
    const m = v.match(SIMPLE_RE);
    if (m) return normalize(m[0]);
  }

  return null;
}

export async function processOrder(order) {
  const tracking = extractTracking(order);
  if (!tracking) {
    console.log(`Order ${order.id} -> no tracking code, skip`);
    return { orderId: order.id, status: "skipped", reason: "missing-tracking" };
  }

  console.log(`Order ${order.id} -> tracking ${tracking}`);
  const url = buildCttUrl(tracking);
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
