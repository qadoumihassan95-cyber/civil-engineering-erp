// Mobile/RTL/browser audit — runs real Chromium at multiple viewports,
// collects console errors and horizontal-overflow violations per page.
import { chromium } from "playwright";

const BASE = "http://localhost:3100";
const VIEWPORTS = [
  { name: "mobile-320", width: 320, height: 640 },
  { name: "mobile-375", width: 375, height: 667 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

const results = [];

async function run() {
  const browser = await chromium.launch();

  // ---------- login (EN) ----------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "admin@civilerp.io");
  await page.fill('input[type="password"]', "Password123!");
  await Promise.all([
    page.waitForURL((u) => u.pathname === "/", { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  results.push({ page: "/login→/ (EN login flow)", consoleErrors: [...consoleErrors] });

  // page list for sweep
  const pages = await page.evaluate(async () => {
    const res = await fetch("/api/projects");
    const projects = await res.json();
    const abj = projects.find((p) => p.code === "ABJ-01");
    const wirRes = await fetch(`/api/projects/${abj.id}/wir`);
    const wirs = await wirRes.json();
    const drRes = await fetch(`/api/projects/${abj.id}/daily-reports`);
    const drs = await drRes.json();
    return { abj: abj.id, wir: wirs[0]?.id, dr: drs[0]?.id };
  });
  const sweep = [
    "/",
    "/projects",
    `/projects/${pages.abj}`,
    `/projects/${pages.abj}/boq`,
    `/projects/${pages.abj}/wir`,
    `/projects/${pages.abj}/daily-reports`,
    `/projects/${pages.abj}/daily-reports/new`,
    `/projects/${pages.abj}/inventory`,
    `/projects/${pages.abj}/expenses`,
    `/projects/${pages.abj}/documents`,
    `/projects/${pages.abj}/controls`,
    `/projects/${pages.abj}/settings`,
    `/wir/${pages.wir}`,
    `/daily-reports/${pages.dr}`,
    "/inventory/stock",
    "/inventory/receipts",
    "/inventory/issues",
    "/inventory/transfers",
    "/inventory/returns",
    "/inventory/adjustments",
    "/inventory/materials",
    "/inventory/suppliers",
    "/inventory/warehouses",
    "/expenses",
    "/documents",
    "/reports",
    "/search?q=concrete",
    "/admin/users",
    "/admin/audit",
    `/print/wir/${pages.wir}`,
  ];

  // ---------- overflow + console sweep (EN) ----------
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const path of sweep) {
      const errs = [];
      const onErr = (m) => { if (m.type() === "error") errs.push(m.text()); };
      const onPageErr = (e) => errs.push("pageerror: " + e.message);
      page.on("console", onErr);
      page.on("pageerror", onPageErr);
      let status = 200;
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      if (resp) status = resp.status();
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        const w = Math.max(doc.scrollWidth, body.scrollWidth);
        const vw = window.innerWidth;
        return w - vw;
      });
      page.off("console", onErr);
      page.off("pageerror", onPageErr);
      if (status !== 200 || overflow > 8 || errs.length) {
        results.push({ page: `${path} @${vp.name}`, status, overflowPx: overflow, consoleErrors: errs });
      }
    }
  }

  // ---------- switch to Arabic, repeat ----------
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const res = await fetch("/api/auth/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": document.cookie.match(/erp_csrf=([^;]+)/)?.[1] ?? "" },
      body: JSON.stringify({ locale: "ar" }),
    });
    return res.ok;
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  const dirAr = await page.evaluate(() => document.documentElement.dir);
  results.push({ page: "AR locale", dir: dirAr });

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const path of sweep.slice(0, 14)) {
      const errs = [];
      const onErr = (m) => { if (m.type() === "error") errs.push(m.text()); };
      const onPageErr = (e) => errs.push("pageerror: " + e.message);
      page.on("console", onErr);
      page.on("pageerror", onPageErr);
      let status = 200;
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      if (resp) status = resp.status();
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        return Math.max(doc.scrollWidth, body.scrollWidth) - window.innerWidth;
      });
      page.off("console", onErr);
      page.off("pageerror", onPageErr);
      if (status !== 200 || overflow > 8 || errs.length) {
        results.push({ page: `AR ${path} @${vp.name}`, status, overflowPx: overflow, consoleErrors: errs });
      }
    }
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  if (results.some((r) => r.consoleErrors?.length || (r.overflowPx ?? 0) > 8 || (r.status ?? 200) !== 200)) {
    process.exit(2);
  }
  console.log("BROWSER AUDIT CLEAN");
}

run().catch((e) => { console.error(e); process.exit(1); });
