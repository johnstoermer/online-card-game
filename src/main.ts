import "./style.css";
import {
  HANDS,
  MAX_ENGINE_SLOTS,
  RELICS,
  scoreHand,
  VERSUS_WINS_TO_MATCH
} from "../shared/game";
import { moveCard, sortHand, type HandSortMode } from "../shared/sort";
import type {
  ClientMessage,
  GameEvent,
  RelicDefinition,
  RoomView,
  ServerMessage
} from "../shared/types";
import { TableAudio } from "./audio";
import { TableScene } from "./scene";

const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing interface element: ${id}`);
  return found as T;
};

const canvas = element<HTMLCanvasElement>("table-canvas");
const homeScreen = element<HTMLElement>("home-screen");
const gameScreen = element<HTMLElement>("game-screen");
const playerNameInput = element<HTMLInputElement>("player-name");
const roomCodeInput = element<HTMLInputElement>("room-code");
const createButton = element<HTMLButtonElement>("create-button");
const joinButton = element<HTMLButtonElement>("join-button");
const entryStatus = element<HTMLElement>("entry-status");
const howButton = element<HTMLButtonElement>("how-button");
const soundButton = element<HTMLButtonElement>("sound-button");
const guideLayer = element<HTMLElement>("guide-layer");
const guideClose = element<HTMLButtonElement>("guide-close");
const modalLayer = element<HTMLElement>("modal-layer");
const lobbyModal = element<HTMLElement>("lobby-modal");
const relicModal = element<HTMLElement>("relic-modal");
const gameoverModal = element<HTMLElement>("gameover-modal");
const lobbyCode = element<HTMLElement>("lobby-code");
const seatList = element<HTMLElement>("seat-list");
const copyButton = element<HTMLButtonElement>("copy-button");
const addBotButton = element<HTMLButtonElement>("add-bot-button");
const startButton = element<HTMLButtonElement>("start-button");
const lobbyFootnote = element<HTMLElement>("lobby-footnote");
const readyButton = element<HTMLButtonElement>("ready-button");
const readyStatus = element<HTMLElement>("ready-status");
const relicChoices = element<HTMLElement>("relic-choices");
const engineBench = element<HTMLElement>("engine-bench");
const clearStamp = element<HTMLElement>("clear-stamp");
const restartButton = element<HTMLButtonElement>("restart-button");
const restartFootnote = element<HTMLElement>("restart-footnote");
const gameoverCopy = element<HTMLElement>("gameover-copy");
const roundsCleared = element<HTMLElement>("rounds-cleared");
const roundsLabel = element<HTMLElement>("rounds-label");
const runScore = element<HTMLElement>("run-score");
const scoreLabel = element<HTMLElement>("score-label");
const gameoverTitle = element<HTMLElement>("gameover-title");
const gameoverEyebrow = element<HTMLElement>("gameover-eyebrow");
const failureSealTop = element<HTMLElement>("failure-seal-top");
const failureSealBottom = element<HTMLElement>("failure-seal-bottom");
const roundKicker = element<HTMLElement>("round-kicker");
const roundLabel = element<HTMLElement>("round-label");
const roundType = element<HTMLElement>("round-type");
const scoreInstrument = element<HTMLElement>("score-instrument");
const teamScore = element<HTMLElement>("team-score");
const targetScore = element<HTMLElement>("target-score");
const targetWrap = element<HTMLElement>("target-wrap");
const instrumentTitle = element<HTMLElement>("instrument-title");
const scorePercent = element<HTMLElement>("score-percent");
const scoreFill = element<HTMLElement>("score-fill");
const chainReadout = element<HTMLElement>("chain-readout");
const chainValue = element<HTMLElement>("chain-value");
const playerLedger = element<HTMLElement>("player-ledger");
const bossNotice = element<HTMLElement>("boss-notice");
const bossName = element<HTMLElement>("boss-name");
const bossRule = element<HTMLElement>("boss-rule");
const selectionLabel = element<HTMLElement>("selection-label");
const previewHand = element<HTMLElement>("preview-hand");
const previewScore = element<HTMLElement>("preview-score");
const discardButton = element<HTMLButtonElement>("discard-button");
const playButton = element<HTMLButtonElement>("play-button");
const discardCount = element<HTMLElement>("discard-count");
const handsCount = element<HTMLElement>("hands-count");
const relicRack = element<HTMLElement>("relic-rack");
const tableMessage = element<HTMLElement>("table-message");
const messagePlayer = element<HTMLElement>("message-player");
const messageHand = element<HTMLElement>("message-hand");
const messageChips = element<HTMLElement>("message-chips");
const messageMult = element<HTMLElement>("message-mult");
const messageTotal = element<HTMLElement>("message-total");
const messageEngine = element<HTMLElement>("message-engine");
const modeSelector = element<HTMLElement>("mode-selector");
const modeCooperative = element<HTMLButtonElement>("mode-cooperative");
const modeVersus = element<HTMLButtonElement>("mode-versus");
const sortLabel = element<HTMLElement>("sort-label");
const sortRank = element<HTMLButtonElement>("sort-rank");
const sortSuit = element<HTMLButtonElement>("sort-suit");
const toastStack = element<HTMLElement>("toast-stack");
const connectionFlag = element<HTMLElement>("connection-flag");

const audio = new TableAudio();
const scene = new TableScene(canvas);
const numberFormat = new Intl.NumberFormat("en-US");
const selected = new Set<string>();

let socket: WebSocket | null = null;
let room: RoomView | null = null;
let clientId = "";
let sessionId = "";
let roomCode = "";
let playerName = localStorage.getItem("ocg-name") || "";
let reconnectAttempts = 0;
let reconnectTimer: number | undefined;
let heartbeatTimer: number | undefined;
let manualClose = false;
let connecting = false;
let calloutTimer: number | undefined;
let lastEventNumber = 0;
let sortMode: HandSortMode =
  localStorage.getItem("ocg-hand-sort") === "suit" ? "suit" : "rank";
let manualHandOrder: string[] = [];
let replacementId: string | null = null;

playerNameInput.value = playerName;

const queryCode = new URLSearchParams(location.search).get("room");
if (queryCode) {
  roomCodeInput.value = queryCode.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  setTimeout(() => playerNameInput.focus(), 80);
}

function websocketUrl(): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) return configured;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    if (location.port === "8080") return `ws://${location.host}`;
    return "ws://localhost:8080";
  }
  if (location.hostname === "herm.cool" || location.hostname.endsWith(".herm.cool")) {
    return "wss://online-card-game.fly.dev";
  }
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
}

function safe(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function format(value: number): string {
  return numberFormat.format(Math.round(value));
}

function currentPlayer() {
  return room?.players.find((player) => player.id === clientId);
}

function relicById(id: string): RelicDefinition | undefined {
  return RELICS.find((relic) => relic.id === id);
}

function relicColor(relic: RelicDefinition): string {
  return {
    copper: "#c28b49",
    red: "#c45541",
    ivory: "#d8c7a2",
    black: "#28332f",
    green: "#5f9182",
    blue: "#6e8eab"
  }[relic.tone];
}

function orderedHand() {
  if (!room) return [];
  const ordered = sortHand(room.hand, sortMode, manualHandOrder);
  manualHandOrder = ordered.map((card) => card.id);
  return ordered;
}

function applyHandSort(mode: Exclude<HandSortMode, "manual">): void {
  if (!room) return;
  sortMode = mode;
  localStorage.setItem("ocg-hand-sort", mode);
  manualHandOrder = sortHand(room.hand, mode).map((card) => card.id);
  audio.play("deal");
  scene.setHand(orderedHand(), selected);
  renderSortControls();
  updateSelectionPreview();
}

function reorderHand(cardId: string, toIndex: number, finished: boolean): void {
  if (!room || room.phase !== "playing") return;
  const current = orderedHand().map((card) => card.id);
  sortMode = "manual";
  manualHandOrder = moveCard(current, cardId, toIndex);
  scene.setHand(orderedHand(), selected);
  renderSortControls();
  if (finished) {
    audio.play("select");
    showToast("Custom hand order set.");
  }
}

function engineReadout(id: string, value: number): { label: string; progress: number } {
  if (id === "brass-knuckle") {
    return { label: `${value} calibration${value === 1 ? "" : "s"} · +${(2 + value * 0.5).toFixed(1)} mult`, progress: Math.min(1, value / 6) };
  }
  if (id === "red-lens") {
    return { label: `${value % 10}/10 hearts · +${8 + Math.floor(value / 10) * 2} each`, progress: (value % 10) / 10 };
  }
  if (id === "stone-index") {
    return { label: `${value} trigger${value === 1 ? "" : "s"} · +${3 + value} mult`, progress: Math.min(1, value / 5) };
  }
  if (id === "echo-coil") {
    return { label: `${value}/3 charge to ×2`, progress: value / 3 };
  }
  if (id === "crown-wire") {
    return { label: `${value % 6}/6 faces · +${7 + Math.floor(value / 6) * 2} each`, progress: (value % 6) / 6 };
  }
  if (id === "black-key") {
    return { label: `+${Math.floor(value / 5)} mult · ${value % 5}/5 spades`, progress: (value % 5) / 5 };
  }
  if (id === "green-felt") {
    return { label: `${value} flush${value === 1 ? "" : "es"} · +${45 + value * 15} chips`, progress: Math.min(1, value / 4) };
  }
  if (id === "ace-bearing") {
    return { label: `${value}/3 aces to ×2.25`, progress: value / 3 };
  }
  if (id === "short-circuit") {
    return { label: `${value} short-hand streak · next +${4 + value} mult`, progress: Math.min(1, value / 4) };
  }
  if (id === "double-clutch") {
    return { label: `${value} trigger${value === 1 ? "" : "s"} · +${60 + value * 20} chips`, progress: Math.min(1, value / 4) };
  }
  if (id === "odd-gear") {
    return { label: `${value % 8}/8 odds · +${6 + Math.floor(value / 8) * 2} each`, progress: (value % 8) / 8 };
  }
  return { label: "Armed for your final hand · ×1.75", progress: 1 };
}

function showToast(message: string, error = false): void {
  const toast = document.createElement("div");
  toast.className = `toast${error ? " is-error" : ""}`;
  toast.textContent = message;
  toastStack.append(toast);
  setTimeout(() => toast.remove(), 3100);
}

function setEntryStatus(message: string): void {
  entryStatus.textContent = message;
}

function setConnecting(value: boolean): void {
  connecting = value;
  createButton.disabled = value;
  joinButton.disabled = value;
  if (value) setEntryStatus("Contacting the table room…");
}

function saveSession(): void {
  localStorage.setItem("ocg-name", playerName);
  localStorage.setItem(
    "ocg-session",
    JSON.stringify({
      roomCode,
      sessionId,
      playerName
    })
  );
}

function readSession(code: string): string | undefined {
  try {
    const stored = JSON.parse(localStorage.getItem("ocg-session") || "{}") as {
      roomCode?: string;
      sessionId?: string;
    };
    return stored.roomCode === code ? stored.sessionId : undefined;
  } catch {
    return undefined;
  }
}

function connect(
  intent: "create" | "join",
  name: string,
  code = "",
  reconnect = false
): void {
  if (connecting) return;
  manualClose = false;
  setConnecting(!reconnect);
  if (socket && socket.readyState <= WebSocket.OPEN) socket.close(4000, "Opening another table");

  const ws = new WebSocket(websocketUrl());
  socket = ws;

  ws.addEventListener("open", () => {
    reconnectAttempts = 0;
    connectionFlag.classList.add("is-hidden");
    setConnecting(false);
    playerName = name;
    const message: ClientMessage =
      intent === "create"
        ? { type: "create", name }
        : {
            type: "join",
            code,
            name,
            sessionId: reconnect ? sessionId : readSession(code)
          };
    ws.send(JSON.stringify(message));
    startHeartbeat();
  });

  ws.addEventListener("message", (event) => {
    let message: ServerMessage;
    try {
      message = JSON.parse(event.data as string) as ServerMessage;
    } catch {
      return;
    }
    handleServerMessage(message);
  });

  ws.addEventListener("close", (event) => {
    stopHeartbeat();
    connecting = false;
    createButton.disabled = false;
    joinButton.disabled = false;
    if (socket === ws) socket = null;
    if (manualClose || event.code === 4000 || event.code === 4001) return;
    if (roomCode && sessionId) {
      scheduleReconnect();
    } else if (!room) {
      setEntryStatus("The table service did not answer. Try again.");
    }
  });

  ws.addEventListener("error", () => {
    if (!room) setEntryStatus("The table service could not be reached.");
  });
}

function scheduleReconnect(): void {
  window.clearTimeout(reconnectTimer);
  reconnectAttempts += 1;
  connectionFlag.classList.remove("is-hidden");
  const delay = Math.min(7000, 600 * Math.pow(1.55, reconnectAttempts - 1));
  reconnectTimer = window.setTimeout(
    () => connect("join", playerName, roomCode, true),
    delay
  );
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatTimer = window.setInterval(() => {
    send({ type: "ping", at: Date.now() });
  }, 20_000);
}

function stopHeartbeat(): void {
  window.clearInterval(heartbeatTimer);
  heartbeatTimer = undefined;
}

function send(message: ClientMessage): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    showToast("The table is reconnecting.", true);
    return;
  }
  socket.send(JSON.stringify(message));
}

function handleServerMessage(message: ServerMessage): void {
  if (message.type === "welcome") {
    clientId = message.clientId;
    sessionId = message.sessionId;
    roomCode = message.roomCode;
    room = message.state;
    manualHandOrder = [];
    replacementId = null;
    manualHandOrder = orderedHand().map((card) => card.id);
    lastEventNumber = room.eventNumber;
    saveSession();
    setEntryStatus("");
    enterTable();
    render();
    audio.play("join");
    return;
  }

  if (message.type === "state") {
    const previousRound = room?.round;
    const previousPhase = room?.phase;
    room = message.state;
    if (previousRound && previousRound !== room.round) {
      sortMode = localStorage.getItem("ocg-hand-sort") === "suit" ? "suit" : "rank";
      manualHandOrder = [];
      replacementId = null;
    }
    if (previousPhase !== room.phase && room.phase === "intermission") replacementId = null;
    manualHandOrder = orderedHand().map((card) => card.id);
    for (const id of [...selected]) {
      if (!room.hand.some((card) => card.id === id)) selected.delete(id);
    }
    render();
    return;
  }

  if (message.type === "event") {
    if (message.event.eventNumber <= lastEventNumber) return;
    lastEventNumber = message.event.eventNumber;
    handleGameEvent(message.event);
    return;
  }

  if (message.type === "error") {
    setConnecting(false);
    if (!room) setEntryStatus(message.message);
    showToast(message.message, true);
    if (message.code === "ROOM_NOT_FOUND" || message.code === "ROOM_FULL" || message.code === "GAME_STARTED") {
      manualClose = true;
      socket?.close(4000, "Join rejected");
    }
  }
}

function enterTable(): void {
  homeScreen.classList.add("is-hidden");
  gameScreen.classList.remove("is-hidden");
  scene.setMode(room?.phase || "lobby");
  history.replaceState(null, "", `?room=${roomCode}`);
}

function handleGameEvent(event: GameEvent): void {
  scene.playEvent(event, clientId);

  if (event.kind === "hand-played") {
    if (event.playerId === clientId) selected.clear();
    const engineFired = event.score.enginePulses.some((pulse) => pulse.kind === "fire");
    audio.play(event.score.total >= 450 || engineFired ? "big-score" : "score");
    showScoreCallout(event);
    if (event.playerId !== clientId) {
      showToast(`${event.playerName} played ${event.score.handLabel} for ${format(event.score.total)}.`);
    }
  }

  if (event.kind === "cards-discarded") {
    if (event.playerId === clientId) {
      selected.clear();
      audio.play("discard");
    }
  }

  if (event.kind === "round-started") {
    audio.play("deal");
    showToast(
      event.boss
        ? `${room?.mode === "versus" ? "Boss showdown" : "Boss contract"}: ${event.boss.name}. ${event.boss.rule}`
        : room?.mode === "versus"
          ? `Versus round ${event.round} is live. Highest score takes the win.`
          : `Contract ${event.round} is live. Target ${format(event.target)}.`
    );
  }

  if (event.kind === "round-won") {
    audio.play("win");
    if (event.mode === "versus") {
      const names = event.winnerIds
        .map((id) => room?.players.find((player) => player.id === id)?.name)
        .filter(Boolean)
        .join(" and ");
      showToast(`${names || "The leader"} won round ${event.round} with ${format(event.score)}.`);
    } else {
      showToast(`Contract ${event.round} cleared at ${format(event.score)}.`);
    }
  }

  if (event.kind === "match-won") {
    audio.play("win");
    showToast(`${event.winnerNames.join(" and ")} won the versus match.`);
  }

  if (event.kind === "round-lost") {
    audio.play("lose");
  }

  if (event.kind === "player-joined") {
    audio.play("join");
    showToast(`${event.playerName} took a seat.`);
  }

  if (event.kind === "player-left") {
    showToast(`${event.playerName} left the table.`);
  }

  if (event.kind === "relic-picked") {
    if (event.playerId === clientId) audio.play("relic");
    if (event.replacedRelicId && event.playerId === clientId) {
      const removed = relicById(event.replacedRelicId)?.name || "Old part";
      const installed = relicById(event.relicId)?.name || "New part";
      showToast(`${removed} retired. ${installed} installed.`);
    }
  }
}

function showScoreCallout(event: Extract<GameEvent, { kind: "hand-played" }>): void {
  window.clearTimeout(calloutTimer);
  tableMessage.classList.remove("is-showing");
  void tableMessage.offsetWidth;
  messagePlayer.textContent = `${event.playerName} winds the machine`;
  messageHand.textContent = event.score.handLabel;
  messageChips.textContent = format(event.score.finalChips);
  messageMult.textContent =
    event.score.finalMultiplier % 1 === 0
      ? format(event.score.finalMultiplier)
      : event.score.finalMultiplier.toFixed(2);
  messageTotal.textContent = format(event.score.total);
  messageEngine.innerHTML = event.score.enginePulses
    .slice(0, 3)
    .map(
      (pulse) =>
        `<span class="engine-pulse is-${pulse.kind}"><b>${safe(pulse.label)}</b> ${safe(pulse.detail)}</span>`
    )
    .join("");
  messageEngine.classList.toggle("is-hidden", event.score.enginePulses.length === 0);
  tableMessage.classList.add("is-showing");
  calloutTimer = window.setTimeout(() => tableMessage.classList.remove("is-showing"), 2400);
}

function render(): void {
  if (!room) return;
  scene.setMode(room.phase);
  scene.setHand(orderedHand(), selected);
  scene.setPlayers(room.players, clientId);
  renderHud();
  renderLedger();
  renderRelics();
  renderSortControls();
  renderModal();
  updateSelectionPreview();
}

function renderHud(): void {
  if (!room) return;
  const self = currentPlayer();
  const versusLeader = Math.max(0, ...room.players.map((player) => player.roundScore));
  const percent =
    room.mode === "versus"
      ? versusLeader
        ? Math.min(100, ((self?.roundScore ?? 0) / versusLeader) * 100)
        : 0
      : room.target
        ? Math.min(100, (room.teamScore / room.target) * 100)
        : 0;
  roundLabel.textContent = `Round ${room.round}`;
  roundKicker.textContent = room.mode === "versus" ? "Match" : "Contract";
  roundType.textContent =
    room.mode === "versus"
      ? room.boss
        ? "Boss showdown"
        : "Table versus"
      : room.boss
        ? "Boss contract"
        : "Open table";
  instrumentTitle.textContent = room.mode === "versus" ? "Round leader" : "Shared score";
  scoreInstrument.setAttribute(
    "aria-label",
    room.mode === "versus" ? "Versus round leader" : "Shared contract score"
  );
  teamScore.textContent = format(room.mode === "versus" ? versusLeader : room.teamScore);
  if (targetWrap.firstChild) targetWrap.firstChild.textContent = room.mode === "versus" ? "" : "/ ";
  targetScore.textContent = room.mode === "versus" ? "TOP SCORE" : format(room.target);
  scorePercent.textContent =
    room.mode === "versus"
      ? versusLeader === 0
        ? "RACE"
        : (self?.roundScore ?? 0) === versusLeader
          ? "LEAD"
          : `−${format(versusLeader - (self?.roundScore ?? 0))}`
      : `${Math.round(percent)}%`;
  scoreFill.style.width = `${percent}%`;
  chainValue.textContent = room.chain ? `×${(1 + room.chain * 0.15).toFixed(2)}` : "Quiet";
  chainReadout.querySelectorAll(".chain-cells i").forEach((cell, index) => {
    cell.classList.toggle("is-live", index < room!.chain);
  });
  chainReadout.querySelector(".chain-cells")?.setAttribute("aria-label", `${room.chain} echo chain`);

  bossNotice.classList.toggle("is-hidden", !room.boss);
  if (room.boss) {
    bossName.textContent = room.boss.name;
    bossRule.textContent = room.boss.rule;
  }

  handsCount.textContent = `${self?.handsLeft ?? 0} left`;
  discardCount.textContent = `${self?.discardsLeft ?? 0} left`;
}

function renderLedger(): void {
  if (!room) return;
  playerLedger.innerHTML = `
    <div class="ledger-heading"><span>${room.mode === "versus" ? "Versus ledger" : "Table ledger"}</span><span>${room.players.length}/4</span></div>
    ${room.players
      .map((player) => {
        const status = !player.connected
          ? "Reconnecting"
          : player.isBot
            ? `${player.handsLeft} hand${player.handsLeft === 1 ? "" : "s"} · house`
            : `${player.handsLeft} hand${player.handsLeft === 1 ? "" : "s"} left`;
        return `
          <div class="player-row${player.id === clientId ? " is-self" : ""}${room!.roundWinnerIds.includes(player.id) ? " is-round-winner" : ""}" style="--seat-color:${player.color}">
            <i class="player-color"></i>
            <div class="player-info">
              <strong>${safe(player.name)}${player.id === clientId ? " · you" : ""}</strong>
              <span>${status}</span>
            </div>
            <div class="player-tally">
              <b>${format(player.roundScore)}</b>
              <span>${room!.mode === "versus" ? `${player.roundWins}/${VERSUS_WINS_TO_MATCH} wins` : "this round"}</span>
            </div>
          </div>
        `;
      })
      .join("")}
  `;
}

function renderRelics(): void {
  if (!room) return;
  relicRack.innerHTML = Array.from({ length: MAX_ENGINE_SLOTS }, (_, index) => {
      const id = room!.ownRelics[index];
      if (!id) {
        return `<div class="rack-relic is-empty" aria-label="Empty engine slot ${index + 1}"><span>0${index + 1}</span></div>`;
      }
      const relic = relicById(id);
      if (!relic) return "";
      const ink = relic.tone === "black" ? "#d7c79e" : "#18241f";
      const state = engineReadout(id, room!.ownEngineState[id] ?? 0);
      return `
        <div
          class="rack-relic"
          tabindex="0"
          style="--relic-tone:${relicColor(relic)};--relic-ink:${ink}"
          data-label="${safe(`${relic.name}: ${state.label}. ${relic.description}`)}"
          aria-label="${safe(`${relic.name}. ${state.label}. ${relic.description}`)}"
        >
          <span class="rack-category">${safe(relic.category.slice(0, 1).toUpperCase())}</span>
          <span class="rack-progress"><i style="width:${Math.max(4, state.progress * 100)}%"></i></span>
        </div>
      `;
    })
    .join("");
}

function renderSortControls(): void {
  const rankActive = sortMode === "rank";
  const suitActive = sortMode === "suit";
  sortRank.classList.toggle("is-active", rankActive);
  sortSuit.classList.toggle("is-active", suitActive);
  sortRank.setAttribute("aria-pressed", String(rankActive));
  sortSuit.setAttribute("aria-pressed", String(suitActive));
  sortLabel.textContent = sortMode === "manual" ? "Custom order" : "Sort hand";
}

function renderModal(): void {
  if (!room) return;
  lobbyModal.classList.add("is-hidden");
  relicModal.classList.add("is-hidden");
  gameoverModal.classList.add("is-hidden");

  if (room.phase === "lobby") {
    renderLobby();
    lobbyModal.classList.remove("is-hidden");
  } else if (room.phase === "intermission") {
    renderIntermission();
    relicModal.classList.remove("is-hidden");
  } else if (room.phase === "gameover") {
    renderGameOver();
    gameoverModal.classList.remove("is-hidden");
  }

  modalLayer.classList.toggle("is-hidden", room.phase === "playing");
}

function renderLobby(): void {
  if (!room) return;
  const self = currentPlayer();
  const isHost = Boolean(self?.host);
  lobbyCode.textContent = room.code;
  modeCooperative.classList.toggle("is-active", room.mode === "cooperative");
  modeVersus.classList.toggle("is-active", room.mode === "versus");
  modeCooperative.disabled = !isHost;
  modeVersus.disabled = !isHost;
  seatList.innerHTML = Array.from({ length: 4 }, (_, index) => {
    const player = room!.players[index];
    if (!player) {
      return `
        <div class="seat-row is-empty">
          <span class="seat-number">0${index + 1}</span>
          <div class="seat-name"><strong>Open chair</strong><span>Waiting for a player</span></div>
        </div>
      `;
    }
    return `
      <div class="seat-row">
        <span class="seat-number">0${index + 1}</span>
        <div class="seat-name">
          <strong>${safe(player.name)}${player.id === clientId ? " · you" : ""}</strong>
          <span>${player.isBot ? "House player" : player.connected ? "Connected" : "Away"}</span>
        </div>
        ${player.host ? '<span class="host-stamp">Host</span>' : ""}
        ${
          isHost && player.isBot
            ? `<button class="remove-seat" type="button" data-remove-bot="${player.id}">Remove</button>`
            : ""
        }
      </div>
    `;
  }).join("");
  addBotButton.classList.toggle("is-hidden", !isHost);
  addBotButton.disabled = room.players.length >= 4;
  startButton.classList.toggle("is-hidden", !isHost);
  startButton.disabled = room.mode === "versus" && room.players.length < 2;
  startButton.textContent =
    room.mode === "versus" ? "Start versus match" : "Deal the first contract";
  lobbyFootnote.textContent = isHost
    ? room.mode === "versus"
      ? room.players.length < 2
        ? "Versus needs another player or a house seat."
        : `You are the host. First to ${VERSUS_WINS_TO_MATCH} round wins takes the match.`
      : "You are the host. The crew can begin with any number of occupied chairs."
    : `Waiting for the host to start ${room.mode === "versus" ? "the versus match" : "the first contract"}.`;
}

function renderIntermission(): void {
  if (!room) return;
  const self = currentPlayer();
  if (!self) return;
  clearStamp.textContent =
    room.mode === "versus"
      ? `${room.roundWinnerIds
          .map((id) => room!.players.find((player) => player.id === id)?.name)
          .filter(Boolean)
          .join(" & ")} won round ${room.round}`
      : `Round ${room.round} cleared`;
  const chosen = room.relicChoices.find((id) => room!.ownRelics.includes(id));
  const needsReplacement = room.ownRelics.length >= MAX_ENGINE_SLOTS && !self.pickedRelic;
  if (self.pickedRelic) replacementId = null;
  engineBench.classList.toggle("is-hidden", room.ownRelics.length === 0);
  engineBench.innerHTML = room.ownRelics.length
    ? `
      <div class="bench-heading">
        <span>Your engine · ${room.ownRelics.length}/${MAX_ENGINE_SLOTS} parts</span>
        <b>${needsReplacement ? "Select one part to retire" : "Stored state carries forward"}</b>
      </div>
      <div class="bench-parts">
        ${room.ownRelics
          .map((id, index) => {
            const relic = relicById(id);
            if (!relic) return "";
            const state = engineReadout(id, room!.ownEngineState[id] ?? 0);
            return `
              <button
                class="bench-part${replacementId === id ? " is-replacing" : ""}"
                type="button"
                ${needsReplacement ? `data-replace="${id}"` : "disabled"}
                style="--relic-tone:${relicColor(relic)}"
              >
                <small>Slot 0${index + 1} · ${safe(relic.category)}</small>
                <strong>${safe(relic.name)}</strong>
                <span>${safe(state.label)}</span>
              </button>
            `;
          })
          .join("")}
      </div>
    `
    : "";
  relicChoices.innerHTML = room.relicChoices
    .map((id) => {
      const relic = relicById(id);
      if (!relic) return "";
      return `
        <button
          class="relic-choice${chosen === id ? " is-picked" : ""}"
          type="button"
          data-relic="${id}"
          ${self.pickedRelic ? "disabled" : ""}
          style="--relic-tone:${relicColor(relic)}"
        >
          <span class="relic-art" aria-hidden="true"></span>
          <span class="relic-copy">
            <small>${safe(relic.category)} · ${safe(relic.short)}</small>
            <strong>${safe(relic.name)}</strong>
            <span>${safe(relic.description)}</span>
            <em>${safe(relic.build)}</em>
          </span>
        </button>
      `;
    })
    .join("");

  const readyPlayers = room.players.filter((player) => player.ready).length;
  if (!self.pickedRelic) {
    readyStatus.textContent = needsReplacement
      ? replacementId
        ? "Outgoing slot selected. Choose its replacement."
        : "The engine is full. Select a part above to retire."
      : "Choose one part to install.";
  } else if (self.ready) {
    readyStatus.textContent =
      readyPlayers === room.players.length
        ? `The next ${room.mode === "versus" ? "showdown" : "contract"} is being dealt.`
        : `Ready. Waiting for ${room.players.length - readyPlayers} more.`;
  } else {
    readyStatus.textContent = `${room.players.filter((player) => player.pickedRelic).length}/${room.players.length} players have chosen.`;
  }
  readyButton.disabled = !self.pickedRelic;
  readyButton.textContent = self.ready
    ? "Stand down"
    : `Ready for next ${room.mode === "versus" ? "round" : "deal"}`;
}

function renderGameOver(): void {
  if (!room) return;
  const self = currentPlayer();
  const total = room.players.reduce((sum, player) => sum + player.totalScore, 0);
  if (room.mode === "versus") {
    const winners = room.matchWinnerIds
      .map((id) => room!.players.find((player) => player.id === id)?.name)
      .filter(Boolean)
      .join(" and ");
    gameoverTitle.textContent = `${winners || "The leader"} owns the table.`;
    gameoverCopy.textContent = `The match closed in round ${room.round}. Every seat built from the same hand budget; the winning engine reached ${VERSUS_WINS_TO_MATCH} round wins first.`;
    gameoverEyebrow.textContent = "The table has a winner.";
    failureSealTop.textContent = "Match";
    failureSealBottom.textContent = "Won";
    roundsLabel.textContent = "Rounds played";
    scoreLabel.textContent = "Combined score";
    restartButton.textContent = "Play another match";
  } else {
    gameoverTitle.textContent = "The machine ran dry.";
    gameoverCopy.textContent = `The table reached ${format(room.teamScore)} of ${format(room.target)} before the final hand. Your engine and room remain in the ledger.`;
    gameoverEyebrow.textContent = "The house held.";
    failureSealTop.textContent = "Contract";
    failureSealBottom.textContent = "Closed";
    roundsLabel.textContent = "Rounds cleared";
    scoreLabel.textContent = "Table score";
    restartButton.textContent = "Run the table again";
  }
  roundsCleared.textContent = String(
    room.mode === "versus" ? room.round : Math.max(0, room.round - 1)
  );
  runScore.textContent = format(total);
  restartButton.classList.toggle("is-hidden", !self?.host);
  restartFootnote.textContent = self?.host
    ? `A new ${room.mode === "versus" ? "match" : "run"} keeps every occupied chair.`
    : `Waiting for the host to reopen the ${room.mode === "versus" ? "match" : "contract"}.`;
}

function updateSelectionPreview(): void {
  if (!room) return;
  const self = currentPlayer();
  const cards = orderedHand().filter((card) => selected.has(card.id));
  selectionLabel.textContent = cards.length
    ? `${cards.length} card${cards.length === 1 ? "" : "s"} selected`
    : "Choose up to five cards";

  if (!cards.length) {
    previewHand.textContent = "No hand selected";
    previewScore.textContent = "Cards are scored when played";
  } else {
    const score = scoreHand(cards, {
      relicIds: room.ownRelics,
      engineState: room.ownEngineState,
      previousHand: room.lastHand,
      chain: room.chain,
      boss: room.boss,
      handsLeftBeforePlay: self?.handsLeft ?? 0
    });
    previewHand.textContent = score.handLabel;
    const pulse = score.enginePulses.find((item) => item.kind === "fire") ?? score.enginePulses[0];
    previewScore.textContent = `${format(score.finalChips)} chips × ${score.finalMultiplier.toFixed(score.finalMultiplier % 1 ? 2 : 0)} mult = ${format(score.total)}${pulse ? ` · ${pulse.label}: ${pulse.detail}` : ""}`;
  }

  const canAct = room.phase === "playing" && Boolean(self?.connected) && (self?.handsLeft ?? 0) > 0;
  playButton.disabled = !canAct || cards.length === 0;
  discardButton.disabled = !canAct || cards.length === 0 || (self?.discardsLeft ?? 0) <= 0;
  scene.setSelected(selected);
}

function toggleCard(cardId: string): void {
  if (!room || room.phase !== "playing") return;
  const self = currentPlayer();
  if (!self || self.handsLeft <= 0) return;
  if (selected.has(cardId)) {
    selected.delete(cardId);
  } else {
    if (selected.size >= 5) {
      showToast("A hand can use at most five cards.", true);
      return;
    }
    selected.add(cardId);
  }
  audio.play("select");
  scene.pulseSelection();
  updateSelectionPreview();
}

function playSelected(): void {
  if (playButton.disabled || !selected.size) return;
  audio.play("play");
  send({ type: "play", cardIds: [...selected] });
  playButton.disabled = true;
  discardButton.disabled = true;
}

function discardSelected(): void {
  if (discardButton.disabled || !selected.size) return;
  send({ type: "discard", cardIds: [...selected] });
  playButton.disabled = true;
  discardButton.disabled = true;
}

function openGuide(): void {
  guideLayer.classList.remove("is-hidden");
}

function closeGuide(): void {
  guideLayer.classList.add("is-hidden");
}

function cleanName(): string {
  return playerNameInput.value.trim().slice(0, 18);
}

function beginCreate(): void {
  const name = cleanName();
  if (!name) {
    setEntryStatus("Write a name for your seat.");
    playerNameInput.focus();
    return;
  }
  void audio.unlock();
  connect("create", name);
}

function beginJoin(): void {
  const name = cleanName();
  const code = roomCodeInput.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  if (!name) {
    setEntryStatus("Write a name for your seat.");
    playerNameInput.focus();
    return;
  }
  if (code.length !== 4) {
    setEntryStatus("The table key has four letters.");
    roomCodeInput.focus();
    return;
  }
  void audio.unlock();
  connect("join", name, code);
}

scene.setCallbacks(
  (cardId) => toggleCard(cardId),
  (cardId) => {
    if (cardId) audio.play("hover");
  },
  (cardId, toIndex, finished) => reorderHand(cardId, toIndex, finished)
);

createButton.addEventListener("click", beginCreate);
joinButton.addEventListener("click", beginJoin);
playButton.addEventListener("click", playSelected);
discardButton.addEventListener("click", discardSelected);
sortRank.addEventListener("click", () => applyHandSort("rank"));
sortSuit.addEventListener("click", () => applyHandSort("suit"));
howButton.addEventListener("click", openGuide);
guideClose.addEventListener("click", closeGuide);
guideLayer.addEventListener("pointerdown", (event) => {
  if (event.target === guideLayer) closeGuide();
});

soundButton.addEventListener("click", () => {
  audio.setMuted(!audio.isMuted);
  soundButton.textContent = audio.isMuted ? "Sound off" : "Sound on";
  soundButton.setAttribute("aria-pressed", String(audio.isMuted));
  if (!audio.isMuted) audio.play("select");
});
soundButton.textContent = audio.isMuted ? "Sound off" : "Sound on";
soundButton.setAttribute("aria-pressed", String(audio.isMuted));

roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
});

copyButton.addEventListener("click", async () => {
  if (!room) return;
  const path = location.pathname.endsWith("/") ? location.pathname : `${location.pathname}/`;
  const invite = `${location.origin}${path}?room=${room.code}`;
  try {
    await navigator.clipboard.writeText(`Join my Online Card Game table: ${invite} — key ${room.code}`);
    copyButton.textContent = "Invitation copied";
    showToast("Invitation copied to the clipboard.");
    setTimeout(() => (copyButton.textContent = "Copy invitation"), 1800);
  } catch {
    showToast(`Share the table key ${room.code}.`);
  }
});

startButton.addEventListener("click", () => {
  audio.play("deal");
  send({ type: "start" });
});

modeSelector.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-mode]");
  if (!button?.dataset.mode || button.disabled) return;
  const mode = button.dataset.mode;
  if (mode === "cooperative" || mode === "versus") send({ type: "set-mode", mode });
});

addBotButton.addEventListener("click", () => send({ type: "add-bot" }));
seatList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-remove-bot]");
  if (button?.dataset.removeBot) send({ type: "remove-bot", playerId: button.dataset.removeBot });
});

relicChoices.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-relic]");
  if (!button?.dataset.relic || button.disabled) return;
  if ((room?.ownRelics.length ?? 0) >= MAX_ENGINE_SLOTS && !replacementId) {
    showToast("Select an installed part to retire first.", true);
    return;
  }
  send({
    type: "pick-relic",
    relicId: button.dataset.relic,
    replaceId: replacementId ?? undefined
  });
});

engineBench.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-replace]");
  if (!button?.dataset.replace || button.disabled) return;
  replacementId = button.dataset.replace;
  audio.play("select");
  renderIntermission();
});

readyButton.addEventListener("click", () => send({ type: "ready" }));
restartButton.addEventListener("click", () => send({ type: "restart" }));

document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  const inField = target.matches("input, textarea, select");
  if (event.key === "Escape" && !guideLayer.classList.contains("is-hidden")) {
    closeGuide();
    return;
  }
  if (inField) {
    if (event.key === "Enter") {
      if (target === roomCodeInput && roomCodeInput.value.length === 4) beginJoin();
      else if (target === playerNameInput && roomCodeInput.value.length === 4) beginJoin();
      else if (target === playerNameInput) beginCreate();
    }
    return;
  }
  if (!room || room.phase !== "playing") return;
  if (/^[1-8]$/.test(event.key)) {
    const card = orderedHand()[Number(event.key) - 1];
    if (card) toggleCard(card.id);
  }
  if (event.key.toLowerCase() === "r") applyHandSort("rank");
  if (event.key.toLowerCase() === "s") applyHandSort("suit");
  if (event.key.toLowerCase() === "d") discardSelected();
  if (event.key === "Enter") playSelected();
});

document.addEventListener("pointerdown", () => void audio.unlock(), { once: true });

window.addEventListener("beforeunload", () => {
  manualClose = true;
  socket?.close(1000, "Page closed");
});

if (!localStorage.getItem("ocg-seen-guide")) {
  howButton.dataset.new = "true";
  howButton.addEventListener(
    "click",
    () => {
      localStorage.setItem("ocg-seen-guide", "true");
      delete howButton.dataset.new;
    },
    { once: true }
  );
}

// Expose the hand ladder in development for quick balancing from the console.
if (import.meta.env.DEV) Object.assign(window, { OCG_HANDS: HANDS });
