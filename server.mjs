#!/usr/bin/env node
import http from "http";
import { parse } from "url";
import { fetchOrders } from "./lib/fetchOrders.mjs";
import { processOrder } from "./patchOrdersCTT.mjs";
const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  const { pathname } = parse(req.url, true);
  const method = req.method.toUpperCase();

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (method === "OPTIONS") return res.end();

  if (method === "PATCH" && pathname === "/api/orders") {
    try {
      // Parse JSON body
      const body = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => (data += chunk));
        req.on('end', () => {
          try { resolve(data ? JSON.parse(data) : {}); }
          catch (err) { reject(err); }
        });
        req.on('error', reject);
      });

      const { tracking, orderId } = body || {};
      const orders = await fetchOrders();
      if (!orders?.length) throw new Error("No orders found");

      const filtered = orders.filter(o => {
        if (orderId && (o.id === orderId || o.order_id === orderId)) return true;
        if (tracking) {
          const codes = [
            o.tracking_code, o.tracking, o.ctt_code,
            o.shipping?.tracking_code, o.meta?.tracking_code,
          ].filter(Boolean).map(x => String(x).toUpperCase());
          return codes.includes(String(tracking).toUpperCase());
        }
        return true;
      });

      const results = [];
      for (const order of filtered) {
        const outcome = await processOrder(order);
        results.push({ id: order.id, changes: { status: outcome?.status || "unknown", ...outcome } });
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(results, null, 2));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => console.log(`✅ Server running on https://localhost:${PORT}`));
