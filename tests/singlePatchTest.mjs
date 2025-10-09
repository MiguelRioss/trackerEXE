#!/usr/bin/env node
import { fetchOrders } from "../lib/fetchOrders.mjs";
import { processOrder } from "../patchOrdersCTT.mjs";

function usage() {
  console.log(
    [
      "Usage: node tests/singlePatchTest.mjs [--order-id <id>] [--tracking <RT000000000PT>]",
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

  const matcher = (order) => {
    if (!order) return false;
    const idMatch =
      args.orderId &&
      [order.id, order.order_id, order.orderId]
        .filter((value) => value !== undefined && value !== null)
        .map(String)
        .includes(String(args.orderId));

    if (idMatch) return true;

    if (!args.tracking) return false;

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

    return candidates.map((value) => String(value).toUpperCase()).includes(args.tracking.toUpperCase());
  };

  const selectedOrder = orders.find(matcher) ?? orders[0];
  if (!selectedOrder) {
    throw new Error("Failed to select an order to patch.");
  }

  if (!selectedOrder.id) {
    throw new Error("Selected order does not contain an 'id' field required for PATCH.");
  }

  console.log("Selected order:", {
    id: selectedOrder.id,
    tracking: selectedOrder.tracking_code || selectedOrder.trackingCode || null,
  });

  const outcome = await processOrder(selectedOrder);
  console.log("Patch outcome:");
  console.log(JSON.stringify(outcome, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
