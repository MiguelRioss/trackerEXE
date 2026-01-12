#!/usr/bin/env node
import { fetchOrders } from "../lib/fetchOrders.mjs";
import { processOrder } from "../patchOrdersCTT.mjs";

function usage() {
  console.log(
    [
      "Usage: node tests/singlePatchTest.mjs [--order-id <id>] [--tracking <RU/RT/LA/LL/RL...PT>]",
      "If no arguments are provided, the first fetched order is used.",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const args = { orderId: null, tracking: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      break;
    }
    if ((arg === "--order-id" || arg === "-o") && argv[i + 1]) {
      args.orderId = argv[i + 1];
      i += 1;
      continue;
    }
    if ((arg === "--tracking" || arg === "-t") && argv[i + 1]) {
      args.tracking = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--order-id=")) {
      args.orderId = arg.slice("--order-id=".length);
      continue;
    }
    if (arg.startsWith("--tracking=")) {
      args.tracking = arg.slice("--tracking=".length);
      continue;
    }
  }
  return args;
}

/* ----------------- tracking helpers ----------------- */

// Accept RU/RT … PT, allow spaces/dashes in between, case-insensitive
const TRACK_RE = /\b(?:RT|RU|LA|LL|RL)[A-Z0-9\-\s]*PT\b/i;
const normalizeCode = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Return true if order contains the target tracking code in known fields or shallow strings.
 */
function orderHasTracking(order, targetNorm) {
  if (!order) return false;

  const probe = (val) => {
    if (typeof val !== "string") return false;
    const m = val.match(TRACK_RE);
    return m ? normalizeCode(m[0]) === targetNorm : false;
  };

  // Known fields first
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
    if (probe(String(c))) return true;
  }

  // Shallow scan top-level string values
  for (const v of Object.values(order)) {
    if (probe(v)) return true;
  }

  return false;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  console.log("Fetching orders...");
  const orders = await fetchOrders();
  if (!Array.isArray(orders) || orders.length === 0) {
    throw new Error("No orders returned from backend.");
  }

  const targetNorm = args.tracking ? normalizeCode(args.tracking) : null;

  const matcher = (order) => {
    if (!order) return false;

    // Prefer explicit order id
    if (args.orderId) {
      const ids = [order.id, order.order_id, order.orderId]
        .filter((v) => v != null)
        .map(String);
      return ids.includes(String(args.orderId));
    }

    // Else match by tracking (normalized)
    if (targetNorm) {
      return orderHasTracking(order, targetNorm);
    }

    // No selector provided; let caller fall back to first
    return false;
  };

  let selectedOrder = orders.find(matcher);

  // Selection rules:
  // - If user provided --order-id or --tracking and nothing matched → throw (do NOT patch a random order)
  // - If user provided neither → default to the first order
  if ((args.orderId || targetNorm) && !selectedOrder) {
    throw new Error(
      args.orderId
        ? `No order found with id '${args.orderId}'.`
        : `No order contains tracking '${args.tracking}'.`
    );
  }
  if (!selectedOrder) {
    selectedOrder = orders[0];
  }

  if (!selectedOrder) {
    throw new Error("Failed to select an order to patch.");
  }
  if (!selectedOrder.id) {
    throw new Error("Selected order does not contain an 'id' field required for PATCH.");
  }

  // Try to show the normalized tracking we matched (if any)
  let selectedTracking = null;
  if (targetNorm) selectedTracking = targetNorm;
  else {
    const known =
      selectedOrder.tracking_code ||
      selectedOrder.trackingCode ||
      selectedOrder.tracking ||
      selectedOrder.ctt_code ||
      selectedOrder.cttCode ||
      selectedOrder.shipping?.tracking_code ||
      selectedOrder.shipping?.trackingCode ||
      selectedOrder.meta?.tracking_code ||
      selectedOrder.meta?.ctt_code ||
      null;
    if (typeof known === "string") {
      const m = known.match(TRACK_RE);
      if (m) selectedTracking = normalizeCode(m[0]);
    }
  }

  console.log("Selected order:", {
    id: selectedOrder.id,
    tracking: selectedTracking,
  });

  const outcome = await processOrder(selectedOrder);
  console.log("Patch outcome:");
  console.log(JSON.stringify(outcome, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
