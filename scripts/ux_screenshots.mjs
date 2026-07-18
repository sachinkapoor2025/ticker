import { chromium } from "playwright";

const out = "seo-reports/ux-screenshots";

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desk.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded", timeout: 60000 });
  const deskSearch = desk.locator("nav .tp-search-trigger").first();
  await deskSearch.waitFor({ state: "visible", timeout: 15000 });
  await desk.screenshot({ path: `${out}/home-desktop.png` });

  await deskSearch.click();
  await desk.waitForSelector(".tp-search-overlay.is-open");
  await desk.fill("#tp-search-input", "stock ticker");
  await desk.waitForTimeout(700);
  await desk.screenshot({ path: `${out}/search-desktop.png` });
  await desk.keyboard.press("Escape");
  await desk.waitForTimeout(200);

  await desk.locator(".tp-faq-button").first().scrollIntoViewIfNeeded();
  await desk.locator(".tp-faq-button").first().click();
  await desk.locator(".tp-faq").screenshot({ path: `${out}/faq-accordion-desktop.png` });

  const country = desk.locator(".tp-country-input").first();
  if (await country.count()) {
    await country.scrollIntoViewIfNeeded();
    await country.click();
    await country.fill("Can");
    await desk.waitForTimeout(400);
    await desk.screenshot({ path: `${out}/country-picker-desktop.png` });
  }

  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await mobile.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded", timeout: 60000 });
  const mobSearch = mobile.locator(".bar--sm.visible-xs .tp-search-trigger, .tp-search-trigger").first();
  await mobSearch.waitFor({ state: "visible", timeout: 15000 });
  await mobile.screenshot({ path: `${out}/home-mobile.png` });
  await mobSearch.click();
  await mobile.waitForSelector(".tp-search-overlay.is-open");
  await mobile.fill("#tp-search-input", "sports");
  await mobile.waitForTimeout(700);
  await mobile.screenshot({ path: `${out}/search-mobile.png` });
  await mobile.keyboard.press("Escape");

  await mobile.goto("http://127.0.0.1:4173/contact/", { waitUntil: "domcontentloaded", timeout: 60000 });
  const c = mobile.locator(".tp-country-input").first();
  if (await c.count()) {
    await c.scrollIntoViewIfNeeded();
    await c.click();
    await c.fill("Uni");
    await mobile.waitForTimeout(400);
    await mobile.screenshot({ path: `${out}/country-picker-mobile.png` });
  }

  await browser.close();
  console.log("UX screenshots written to", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
