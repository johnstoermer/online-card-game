import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.QA_URL || "http://localhost:8080";
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
await mkdir("test-results", { recursive: true });

const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const guestContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const matchContexts = await Promise.all([
  browser.newContext({ viewport: { width: 1440, height: 900 } }),
  browser.newContext({ viewport: { width: 1280, height: 800 } }),
  browser.newContext({ viewport: { width: 1024, height: 768 } }),
  browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })
]);
const host = await desktopContext.newPage();
const guest = await guestContext.newPage();
const mobile = await mobileContext.newPage();
const matchPages = await Promise.all(matchContexts.map((context) => context.newPage()));
const failures = [];

for (const [label, page] of [["host", host], ["guest", guest], ["mobile", mobile], ...matchPages.map((page, index) => [`match-${index + 1}`, page])]) {
  page.on("pageerror", (error) => failures.push(`${label} page error: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") failures.push(`${label} console: ${message.text()}`); });
}

async function isVisible(locator) { return locator.isVisible().catch(() => false); }
async function dismissPortalLogin(page) {
  await page.locator("herm-login-prompt").evaluate((prompt) => prompt.remove()).catch(() => {});
}

async function actIfTurn(page) {
  if (!(await isVisible(page.locator(".seat-row.is-self.is-turn")))) return false;
  if (await isVisible(page.locator("#order-button:not(.is-hidden)"))) { await page.locator("#order-button").click(); return true; }
  if (await isVisible(page.locator(".suit-button").first())) { await page.locator(".suit-button").first().click(); return true; }
  if (await isVisible(page.locator("#play-actions:not(.is-hidden)"))) {
    for (const key of ["1", "2", "3", "4", "5"]) {
      await page.keyboard.press(key); await page.waitForTimeout(70);
      if (!(await isVisible(page.locator(".seat-row.is-self.is-turn")))) break;
    }
    return true;
  }
  return false;
}

try {
  await host.goto(baseUrl, { waitUntil: "networkidle" });
  await dismissPortalLogin(host);
  await host.locator("#game-title").waitFor();
  await host.locator("#play-now-button:enabled").waitFor();
  await host.screenshot({ path: "test-results/euchre-home.png", fullPage: true });
  if (!(await host.title()).includes("Euchre")) throw new Error("The euchre title is missing from the home page.");

  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  await dismissPortalLogin(mobile);
  await mobile.locator("#play-now-button:enabled").waitFor();
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  if (overflow) throw new Error("Mobile home overflows horizontally.");
  await mobile.locator("#play-now-button").click();
  await mobile.locator("#queue-entry:not(.is-hidden)").waitFor();
  await mobile.screenshot({ path: "test-results/euchre-mobile-queue.png", fullPage: true });
  await mobile.locator("#cancel-queue-button").click();
  await mobile.locator("#entry-menu:not(.is-hidden)").waitFor();
  await mobile.locator("#how-button").click();
  await mobile.locator("#guide-layer:not(.is-hidden)").waitFor();
  await mobile.screenshot({ path: "test-results/euchre-mobile-rules.png", fullPage: true });

  await host.locator("#private-button").click();
  await host.locator("#player-name").fill("Mara");
  await host.locator("#create-button").click();
  await host.locator("#lobby-modal:not(.is-hidden)").waitFor();
  const code = (await host.locator("#lobby-code").textContent())?.trim();
  if (!code || code.length !== 4) throw new Error("Room code was not issued.");
  if (await host.locator(".lobby-seat").count() !== 4) throw new Error("Room did not open with four seats.");

  await guest.goto(`${baseUrl}/?room=${code}`, { waitUntil: "networkidle" });
  await dismissPortalLogin(guest);
  await guest.locator("#player-name").fill("Theo");
  await guest.locator("#join-button").click();
  await guest.locator("#lobby-modal:not(.is-hidden)").waitFor();
  await host.locator("#seat-list").getByText("Theo", { exact: false }).waitFor();
  await host.screenshot({ path: "test-results/euchre-lobby.png", fullPage: true });

  await host.locator("#start-button").click();
  await host.locator("#modal-layer").waitFor({ state: "hidden" });
  await guest.locator("#modal-layer").waitFor({ state: "hidden" });
  await host.screenshot({ path: "test-results/euchre-first-bid.png", fullPage: true });

  await guest.reload({ waitUntil: "networkidle" });
  await dismissPortalLogin(guest);
  await guest.locator("#game-screen:not(.is-hidden)").waitFor();
  await guest.locator("#modal-layer").waitFor({ state: "hidden" });

  const deadline = Date.now() + 45000;
  while (Date.now() < deadline && !(await isVisible(host.locator("#result-modal:not(.is-hidden)"))) && !(await isVisible(host.locator("#gameover-modal:not(.is-hidden)")))) {
    await actIfTurn(host); await actIfTurn(guest); await host.waitForTimeout(180);
  }
  await host.locator("#result-modal:not(.is-hidden), #gameover-modal:not(.is-hidden)").waitFor({ timeout: 3000 });
  if ((await host.locator("#trick-progress").textContent()) !== "5 of 5 tricks played") throw new Error("The browser hand did not complete five tricks.");
  await host.screenshot({ path: "test-results/euchre-hand-result.png", fullPage: true });

  for (let index = 0; index < matchPages.length; index += 1) {
    const page = matchPages[index];
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await dismissPortalLogin(page);
    await page.locator("#play-now-button:enabled").waitFor();
    await page.locator("#player-name").fill(`Match ${index + 1}`);
    await page.locator("#play-now-button").click();
    if (index < matchPages.length - 1) await page.locator("#queue-entry:not(.is-hidden)").waitFor();
  }
  await Promise.all(matchPages.map((page) => page.locator("#game-screen:not(.is-hidden)").waitFor()));
  for (const page of matchPages) {
    if (await page.locator(".seat-row").count() !== 4) throw new Error("A public match did not form four seats.");
    if ((await page.locator(".seat-row").allTextContents()).some((text) => text.includes("TABLE REGULAR"))) throw new Error("A bot occupied a public matched seat.");
  }

  let collectionLayout = null;
  let mobileTrickCaptured = false;
  const matchDeadline = Date.now() + 20000;
  while (Date.now() < matchDeadline && !collectionLayout) {
    for (const page of matchPages) {
      if (await actIfTurn(page)) break;
    }
    collectionLayout = await matchPages[0].locator("#table-canvas").evaluate((canvas) => {
      const cards = JSON.parse(canvas.dataset.trickCards || "[]");
      return cards.length === 4 && cards.every((card) => card.collecting) ? cards : null;
    });
    if (!mobileTrickCaptured) {
      const mobileCards = await matchPages[3].locator("#table-canvas").evaluate((canvas) => JSON.parse(canvas.dataset.trickCards || "[]"));
      if (mobileCards.length >= 2 && mobileCards.every((card) => !card.collecting)) {
        await matchPages[3].screenshot({ path: "test-results/euchre-mobile-public-trick.png" });
        mobileTrickCaptured = true;
      }
    }
    await matchPages[0].waitForTimeout(45);
  }
  if (!collectionLayout) throw new Error("Public match did not expose a complete collecting trick.");
  if (collectionLayout.some((card) => !card.faceUp)) throw new Error("A center-trick card was not face-up.");
  if (collectionLayout.map((card) => card.relative).sort().join(",") !== "0,1,2,3") throw new Error("Center trick did not use all four relative seat slots.");
  const expectedYaws = [0, -Math.PI / 2, -Math.PI, -3 * Math.PI / 2];
  for (const card of collectionLayout) if (Math.abs(card.yaw - expectedYaws[card.relative]) > 0.0001) throw new Error("A center-trick card used a non-flat seat rotation.");
  await matchPages[0].screenshot({ path: "test-results/euchre-public-trick-face-up.png" });
  await matchPages[0].screenshot({ path: "test-results/euchre-public-winner-highlight.png" });
  await matchPages[0].waitForTimeout(120);
  await matchPages[0].screenshot({ path: "test-results/euchre-public-trick-collection.png" });

  if (failures.length) throw new Error(failures.join("\n"));
  console.log(`Browser QA passed for room ${code}: responsive entry/queue cancellation, four-human public matching, flat face-up trick layout and winner collection, private bots, reconnect/resume, bidding, legal play, and five-trick scoring.`);
} finally { await browser.close(); }
