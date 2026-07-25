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
const versusHostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const versusGuestContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const host = await hostContext.newPage();
const guest = await guestContext.newPage();
const mobile = await mobileContext.newPage();
const versusHost = await versusHostContext.newPage();
const versusGuest = await versusGuestContext.newPage();
const failures = [];

for (const [label, page] of [
  ["host", host],
  ["guest", guest],
  ["mobile", mobile],
  ["versus host", versusHost],
  ["versus guest", versusGuest]
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
  const clicked = await page.evaluate(() => {
    const modal = document.querySelector("#modal-layer");
    const button = document.querySelector("#play-button");
    if (
      !(button instanceof HTMLButtonElement) ||
      button.disabled ||
      !modal?.classList.contains("is-hidden")
    ) {
      return false;
    }
    button.click();
    return true;
  });
  if (!clicked) return false;
  try {
    await page.waitForFunction(
      (previous) =>
        document.querySelector("#hands-count")?.textContent !== previous ||
        !document.querySelector("#modal-layer")?.classList.contains("is-hidden"),
      before,
      { timeout: 8000 }
    );
  } catch {
    const diagnostics = await page.evaluate(() => ({
      hands: document.querySelector("#hands-count")?.textContent,
      selection: document.querySelector("#selection-label")?.textContent,
      preview: document.querySelector("#preview-hand")?.textContent,
      playDisabled: document.querySelector("#play-button")?.hasAttribute("disabled"),
      modalHidden: document.querySelector("#modal-layer")?.classList.contains("is-hidden"),
      toasts: [...document.querySelectorAll(".toast")].map((toast) => toast.textContent)
    }));
    throw new Error(`A played hand did not resolve: ${JSON.stringify(diagnostics)}`);
  }
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

  await host.keyboard.press("1");
  await host.locator("#play-button:not([disabled])").waitFor();
  await host.locator("#sort-suit").click();
  await host.locator("#sort-suit.is-active").waitFor();
  await host.locator("#play-button:not([disabled])").waitFor();
  await host.locator("#sort-rank").click();
  await host.locator("#sort-rank.is-active").waitFor();
  await host.keyboard.press("1");
  await host.locator("#play-button[disabled]").waitFor();

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
  await host.locator("#table-bench:not(.is-hidden) .bench-part").waitFor();
  await host.locator(".rack-relic:not(.is-empty)").waitFor();
  await host.screenshot({ path: "test-results/qa-table-workshop.png", fullPage: true });
  await host.locator("#ready-button").click();
  await guest.locator("#ready-button").click();
  await host.locator("#modal-layer").waitFor({ state: "hidden", timeout: 5000 });
  await host.locator("#round-label").filter({ hasText: "Round 2" }).waitFor();
  await host.locator(".rack-relic:not(.is-empty)").waitFor();
  await host.waitForTimeout(1100);
  await host.screenshot({ path: "test-results/qa-dressed-table.png", fullPage: true });

  await versusHost.goto(baseUrl, { waitUntil: "networkidle" });
  await versusHost.locator("#player-name").fill("Iris");
  await versusHost.locator("#create-button").click();
  await waitForTable(versusHost);
  await versusHost.locator("#mode-versus").click();
  await versusHost.locator("#mode-versus.is-active").waitFor();
  await versusHost.locator("#start-button[disabled]").waitFor();
  const versusCode = (await versusHost.locator("#lobby-code").textContent())?.trim();
  if (!versusCode || versusCode.length !== 4) throw new Error("Versus room code was not issued.");

  await versusGuest.goto(`${baseUrl}/?room=${versusCode}`, { waitUntil: "networkidle" });
  await versusGuest.locator("#player-name").fill("Nico");
  await versusGuest.locator("#join-button").click();
  await waitForTable(versusGuest);
  await versusHost.locator("#seat-list").getByText("Nico", { exact: false }).waitFor();
  await versusHost.locator("#start-button:not([disabled])").waitFor();
  await versusHost.screenshot({ path: "test-results/qa-versus-lobby.png", fullPage: true });
  await versusHost.locator("#start-button").click();
  await versusHost.locator("#modal-layer").waitFor({ state: "hidden" });
  await versusGuest.locator("#modal-layer").waitFor({ state: "hidden" });
  await versusHost.locator("#instrument-title").filter({ hasText: "Round leader" }).waitFor();
  await versusHost.locator("#round-kicker").filter({ hasText: "Match" }).waitFor();
  await versusHost.locator("#round-type").filter({ hasText: "Table versus" }).waitFor();
  await versusHost.locator("#target-score").filter({ hasText: "TOP SCORE" }).waitFor();
  await versusHost.screenshot({ path: "test-results/qa-versus-table.png", fullPage: true });

  for (let hand = 0; hand < 3; hand += 1) {
    if (!(await playOne(versusHost))) {
      throw new Error(`Versus host could not play hand ${hand + 1}.`);
    }
    if (!(await playOne(versusGuest)) && hand < 2) {
      throw new Error(`Versus guest could not play hand ${hand + 1}.`);
    }
  }

  await versusHost.locator("#relic-modal:not(.is-hidden)").waitFor({ timeout: 5000 });
  await versusHost.locator("#clear-stamp").filter({ hasText: "won round 1" }).waitFor();
  if ((await versusHost.locator(".player-row.is-round-winner").count()) < 1) {
    throw new Error("The versus round did not mark a winner in the table ledger.");
  }
  if (!(await versusHost.locator("#player-ledger").textContent())?.includes("1/3 wins")) {
    throw new Error("The versus round win was not added to the match tally.");
  }
  await versusHost.screenshot({ path: "test-results/qa-versus-result.png", fullPage: true });

  if (failures.length) throw new Error(failures.join("\n"));
  console.log(
    `QA passed: cooperative room ${roomCode}, versus room ${versusCode}, sorting, table-piece placement, scoring, and round resolution.`
  );
} finally {
  await browser.close();
}
