// printLeftDatedWords.mjs
const URL_IN = process.argv[2] || "https://appserver.ctt.pt/CustomerArea/PublicArea_Detail?ObjectCodeInput=RT160260734PT&SearchInput=RT160260734PT&IsFromPublicArea=true";

const puppeteer = await (async () => {
  try { return (await import("puppeteer")).default; } catch {}
  try { return (await import("puppeteer-core")).default; } catch {}
  throw new Error("Install puppeteer or puppeteer-core");
})();

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox","--disable-setuid-sandbox"]
});
const page = await browser.newPage();
await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

await page.goto(URL_IN, { waitUntil: "networkidle0", timeout: 60000 });

const rows = await page.evaluate(() => {
  // Portuguese month abbreviations on CTT
  const MONTH = /(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)/i;
  const DAY_MONTH = new RegExp(`\\b\\d{1,2}\\s*${MONTH.source}\\b`, "i");
  const TIME = /\b(\d{1,2})[:h](\d{2})\b/i;

  const text = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();

  // Title candidates = shortish text, bold-ish
  const titles = [];
  for (const el of document.querySelectorAll("*")) {
    const t = text(el);
    if (!t || t.length > 120) continue;
    const r = el.getBoundingClientRect?.();
    if (!r || r.width === 0 || r.height === 0) continue;

    const cs = window.getComputedStyle(el);
    const weight = parseInt(cs.fontWeight, 10);
    const boldish = (isNaN(weight) ? cs.fontWeight === "bold" : weight >= 600);
    if (!boldish) continue;

    titles.push({ el, r, label: t });
  }

  function parseDatePiece(s) {
    const m = s.match(DAY_MONTH);
    if (!m) return null;
    return m[0];
  }
  function parseTimePiece(s) {
    const m = s.match(TIME);
    if (!m) return null;
    return `${m[1].padStart(2,"0")}:${m[2]}`;
  }

  // Look for a small text node left of the title, vertically overlapping, that contains a date or time
  function leftDateFor(rect, scopeRoot) {
    const nodes = (scopeRoot || document).querySelectorAll("*");
    for (const n of nodes) {
      const t = text(n);
      if (!t || t.length > 40) continue;
      const r = n.getBoundingClientRect?.();
      if (!r) continue;
      const left = r.right <= rect.left + 6;
      const overlap = !(r.bottom < rect.top || r.top > rect.bottom);
      if (!left || !overlap) continue;

      const d = parseDatePiece(t);
      const tm = parseTimePiece(t);
      if (d || tm) return { date: d || undefined, time: tm || undefined };
    }
    return null;
  }

  const out = [];
  for (const { el, r, label } of titles) {
    // check within a nearby ancestor first
    let a = el; for (let i=0; i<4 && a?.parentElement; i++) a = a.parentElement;
    const lt = leftDateFor(r, a) || leftDateFor(r, document);
    if (lt) out.push({ label, date: lt.date || null, time: lt.time || null, y: r.top });
  }

  out.sort((a,b) => a.y - b.y);
  return out.map(({label,date,time}) => ({ label, date, time }));
});

await browser.close();

// Print ONLY the results
console.log(JSON.stringify(rows, null, 2));
