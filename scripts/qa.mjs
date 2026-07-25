import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.QA_URL || "http://localhost:8080";
const chromePath =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

await mkdir("test-results", { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"]
});

const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const guestContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const mobileContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1
});
const host = await hostContext.newPage();
const guest = await guestContext.newPage();
const mobile = await mobileContext.newPage();
const failures = [];

for (const [label, page] of [
  ["host", host],
  ["guest", guest],
  ["mobile", mobile]
]) {
  page.on("pageerror", (error) => failures.push(`${label} page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`${label} console: ${message.text()}`);
  });
}

async function waitForTable(page) {
  await page.locator("#game-screen").waitFor({ state: "visible" });
  await page.locator("#lobby-modal").waitFor({ state: "visible" });
}

async function selectFive(page) {
  for (const key of ["1", "2", "3", "4", "5"]) await page.keyboard.press(key);
  await page.locator("#play-button:not([disabled])").waitFor({ state: "visible" });
}

async function playOne(page) {
  if (await page.locator("#modal-layer:not(.is-hidden)").count()) return false;
  const counter = page.locator("#hands-count");
  const before = await counter.textContent();
  for (const key of ["1", "2", "3", "4", "5"]) await page.keyboard.press(key);
  await page.waitForFunction(
    () =>
      !document.querySelector("#play-button")?.hasAttribute("disabled") ||
      !document.querySelector("#modal-layer")?.classList.contains("is-hidden")
  );
  if (await page.locator("#modal-layer:not(.is-hidden)").count()) return false;
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (previous) =>
      document.querySelector("#hands-count")?.textContent !== previous ||
      !document.querySelector("#modal-layer")?.classList.contains("is-hidden"),
    before,
    { timeout: 5000 }
  );
  return true;
}

try {
  await host.goto(baseUrl, { waitUntil: "networkidle" });
  await host.screenshot({ path: "test-results/qa-home.png", fullPage: true });
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  const mobileOverflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  if (mobileOverflow) throw new Error("The mobile home screen overflows horizontally.");
  await mobile.screenshot({ path: "test-results/qa-mobile.png", fullPage: true });
  await host.locator("#player-name").fill("Mara");
  await host.locator("#create-button").click();
  await waitForTable(host);
  const roomCode = (await host.locator("#lobby-code").textContent())?.trim();
  if (!roomCode || roomCode.length !== 4) throw new Error("Room code was not issued.");

  await guest.goto(`${baseUrl}/?room=${roomCode}`, { waitUntil: "networkidle" });
  await guest.locator("#player-name").fill("Theo");
  await guest.locator("#join-button").click();
  await waitForTable(guest);
  await host.locator("#seat-list").getByText("Theo", { exact: false }).waitFor({ state: "visible" });

  await host.locator("#add-bot-button").click();
  await host.locator("#seat-list").getByText("House player").waitFor({ state: "visible" });
  await host.locator("#start-button").click();
  await host.locator("#modal-layer").waitFor({ state: "hidden" });
  await guest.locator("#modal-layer").waitFor({ state: "hidden" });
  await host.locator("#hands-count").filter({ hasText: "3 left" }).waitFor();
  await guest.locator("#hands-count").filter({ hasText: "3 left" }).waitFor();

  await selectFive(host);
  await host.waitForTimeout(1100);
  await host.screenshot({ path: "test-results/qa-table.png", fullPage: true });
  await host.keyboard.press("Enter");
  await host.locator("#hands-count").filter({ hasText: "2 left" }).waitFor();

  await playOne(guest);
  for (let index = 0; index < 2; index += 1) {
    const phaseEnded = await host.locator("#modal-layer:not(.is-hidden)").count();
    if (phaseEnded) break;
    if (!(await playOne(host))) break;
    if (await guest.locator("#modal-layer:not(.is-hidden)").count()) break;
    if (!(await playOne(guest))) break;
  }

  await host.waitForFunction(
    () =>
      !document.querySelector("#relic-modal")?.classList.contains("is-hidden") ||
      !document.querySelector("#gameover-modal")?.classList.contains("is-hidden"),
    undefined,
    { timeout: 15_000 }
  );

  const cleared = await host.locator("#relic-modal:not(.is-hidden)").count();
  if (!cleared) throw new Error("The multiplayer test run did not clear the first balanced contract.");

  await host.locator(".relic-choice").first().click();
  await guest.locator(".relic-choice").first().click();
  await host.locator("#ready-button").click();
  await guest.locator("#ready-button").click();
  await host.locator("#modal-layer").waitFor({ state: "hidden", timeout: 5000 });
  await host.locator("#round-label").filter({ hasText: "Round 2" }).waitFor();

  if (failures.length) throw new Error(failures.join("\n"));
  console.log(`QA passed: room ${roomCode}, multiplayer, scoring, relic choice, and round advance.`);
} finally {
  await browser.close();
}
