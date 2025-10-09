const http = require("http");
const path = require("path");
const { URL } = require("url");
require("dotenv").config({ path: path.join(process.cwd(), ".env") });

const PORT = Number(process.env.PORT || process.env.APP_PORT || 3000);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

function jsonHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extra,
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, jsonHeaders());
  res.end(JSON.stringify(payload ?? {}));
}

function sendNoContent(res, statusCode = 204) {
  res.writeHead(statusCode, jsonHeaders());
  res.end();
}

async function bootstrap() {
  console.log("=== Tracker started ===");
  console.log("CWD:", process.cwd());
  console.log("BASE_URL:", process.env.BASE_URL || "(undefined)");
  console.log("Listening port:", PORT);

  const mod = await import("./patchOrdersCTT.mjs");
  const triggerRun = mod.triggerRun || (async () => ({ started: false, status: "missing-trigger" }));
  const isRunInProgress = mod.isRunInProgress || (() => false);
  const getLastRunSummary = mod.getLastRunSummary || (() => null);

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        sendJson(res, 400, { ok: false, error: "Missing URL" });
        return;
      }

      const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
      const pathname = requestUrl.pathname;
      const method = req.method?.toUpperCase() || "GET";

      if (method === "OPTIONS") {
        sendNoContent(res);
        return;
      }

      if (method === "GET" && pathname === "/") {
        sendJson(res, 200, { ok: true, message: "Tracker API ready" });
        return;
      }

      if (method === "POST" && pathname === "/api/ctt/run") {
        const waitForCompletion = requestUrl.searchParams.get("wait") === "true";
        try {
          const result = triggerRun({ wait: waitForCompletion });
          if (waitForCompletion) {
            const summary = await result;
            sendJson(res, 200, { ok: true, status: "completed", summary });
            return;
          }

          const started = result?.started !== false;
          const statusCode = started ? 202 : 409;
          sendJson(res, statusCode, { ok: started, ...result });
          return;
        } catch (error) {
          console.error("Manual trigger failed:", error && error.stack ? error.stack : error);
          sendJson(res, 500, { ok: false, error: error.message || String(error) });
          return;
        }
      }

      if (method === "GET" && pathname === "/api/ctt/status") {
        sendJson(res, 200, {
          ok: true,
          running: isRunInProgress(),
          lastRun: getLastRunSummary(),
        });
        return;
      }

      sendJson(res, 404, { ok: false, error: "Not found" });
    } catch (err) {
      console.error("Unhandled request error:", err && err.stack ? err.stack : err);
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: "Internal error" });
      } else {
        res.end();
      }
    }
  });

  server.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Fatal error:", err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
