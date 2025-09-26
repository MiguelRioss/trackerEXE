// patchOrdersCTT.mjs
import { buildCttUrl } from "./lib/buildCttUrl.mjs";
import { fetchOrders } from "./lib/fetchOrders.mjs";
import { getLeftDatedWords } from "./lib/getLeftDatedWords.mjs";
import transformLeftRowsToStatus  from "./lib/transformLeftRowsToStatus.mjs";

const BASE = "https://api-backend-mesodose-2.onrender.com";
const CONCURRENCY = 3; // how many run in parallel

function getHeaders(extra = {}) {
  return { Accept: "application/json", "Content-Type": "application/json", ...extra };
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
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

function extractRT(order) {
  if (!order) return null;
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

  if (!candidates.length) {
    for (const v of Object.values(order)) {
      if (typeof v === "string") {
        const m = v.match(/\bRT\d{9}PT\b/);
        if (m) return m[0];
      }
    }
  }
  return candidates[0] || null;
}

async function processOrder(order) {
  const rt = extractRT(order);
  if (!rt) {
    console.log(`Order ${order.id} -> no RT code, skip`);
    return;
  }

  console.log(`Order ${order.id} -> tracking ${rt}`);
  const url = buildCttUrl(rt);
  const rows = await getLeftDatedWords(url);
  const status = transformLeftRowsToStatus(rows);

  const changes = {changes : {status}}
  const patched = await httpPatch(order.id, changes);
  console.log(`Patched order ${order.id}:`, patched);
  return patched;
}

async function run() {
  const orders = await fetchOrders();
  console.log(`Fetched ${orders.length} orders.`);

  const queue = [...orders];
  const results = [];

  async function worker() {
    while (queue.length) {
      const order = queue.shift();
      try {
        results.push(await processOrder(order));
      } catch (e) {
        console.error(`Failed order ${order.id}:`, e.message);
      }
    }
  }

  // spawn workers
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log("All done.");
}

run().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
