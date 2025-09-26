// index.cjs
const path = require("path");
require("dotenv").config({ path: path.join(process.cwd(), ".env") });

(async () => {
  console.log("=== Tracker started ===");
  try {
    // sanity logs so you can see what the exe sees
    console.log("CWD:", process.cwd());
    console.log("BASE_URL:", process.env.BASE_URL || "(undefined)");

    const mod = await import("./patchOrdersCTT.mjs");
    if (typeof mod.default === "function") await mod.default();
    else if (typeof mod.main === "function") await mod.main();
  } catch (err) {
    console.error("Fatal error:", err && err.stack ? err.stack : err);
    process.exitCode = 1;
  } finally {
    console.log("=== Tracker finished ===");
  }
})();
