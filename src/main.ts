import "@fontsource-variable/fraunces";
import "@fontsource-variable/manrope";
import "./style.css";
import { TableAudio } from "./audio";
import { TableScene } from "./scene";
import { effectiveSuit, isLeftBower } from "../shared/game";
import { SUITS } from "../shared/types";
import type { ClientMessage, GameEvent, RoomView, ServerMessage, Suit } from "../shared/types";

const el = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
};

const canvas = el<HTMLCanvasElement>("table-canvas");
const scene = new TableScene(canvas);
const audio = new TableAudio();
const homeScreen = el("home-screen");
const gameScreen = el("game-screen");
const entryMenu = el("entry-menu");
const privateEntry = el("private-entry");
const queueEntry = el("queue-entry");
const fallbackProfile = el("fallback-profile");
const identityNote = el("identity-note");
const playerNameInput = el<HTMLInputElement>("player-name");
const roomCodeInput = el<HTMLInputElement>("room-code");
const playNowButton = el<HTMLButtonElement>("play-now-button");
const privateButton = el<HTMLButtonElement>("private-button");
const privateBackButton = el<HTMLButtonElement>("private-back-button");
const createButton = el<HTMLButtonElement>("create-button");
const joinButton = el<HTMLButtonElement>("join-button");
const cancelQueueButton = el<HTMLButtonElement>("cancel-queue-button");
const queuePlayerCount = el("queue-player-count");
const queueSeats = el("queue-seats");
const queueCopy = el("queue-copy");
const entryStatus = el("entry-status");
const modalLayer = el("modal-layer");
const lobbyModal = el("lobby-modal");
const resultModal = el("result-modal");
const gameoverModal = el("gameover-modal");
const lobbyCode = el("lobby-code");
const inGameCode = el<HTMLButtonElement>("in-game-code");
const copyButton = el<HTMLButtonElement>("copy-button");
const seatList = el("seat-list");
const startButton = el<HTMLButtonElement>("start-button");
const lobbyFootnote = el("lobby-footnote");
const restartButton = el<HTMLButtonElement>("restart-button");
const restartFootnote = el("restart-footnote");
const guideLayer = el("guide-layer");
const soundButton = el<HTMLButtonElement>("sound-button");
const connectionFlag = el("connection-flag");
const toastStack = el("toast-stack");

const scoreZero = el("score-zero");
const scoreOne = el("score-one");
const teamZeroNames = el("team-zero-names");
const teamOneNames = el("team-one-names");
const handNumber = el("hand-number");
const phaseKicker = el("phase-kicker");
const phaseTitle = el("phase-title");
const turnCopy = el("turn-copy");
const trumpPanel = el("trump-panel");
const trumpSymbol = el("trump-symbol");
const trumpName = el("trump-name");
const makerCopy = el("maker-copy");
const seatLedger = el("seat-ledger");
const tricksZero = el("tricks-zero");
const tricksOne = el("tricks-one");
const trickProgress = el("trick-progress");
const historyList = el("history-list");
const actionEyebrow = el("action-eyebrow");
const actionTitle = el("action-title");
const actionHint = el("action-hint");
const bidActions = el("bid-actions");
const playActions = el("play-actions");
const suitActions = el("suit-actions");
const orderButton = el<HTMLButtonElement>("order-button");
const passButton = el<HTMLButtonElement>("pass-button");
const aloneToggle = el<HTMLInputElement>("alone-toggle");

let socket: WebSocket | null = null;
let room: RoomView | null = null;
let clientId = "";
let sessionId = "";
let roomCode = "";
let playerName = localStorage.getItem("euchre-name") || "Card Player";
let identityToken = "";
let identitySource: "discord" | "local" = "local";
let identityReady = false;
let queueSessionId = "";
let inQueue = false;
let activeIntent: ConnectionIntent | null = null;
let reconnectAttempts = 0;
let reconnectTimer: number | undefined;
let heartbeatTimer: number | undefined;
let manualClose = false;
let connecting = false;
let lastResult: Extract<GameEvent, { kind: "hand-scored" }> | null = null;
let winningSeat: number | null = null;
let endModalReady = true;
let endModalTimer: number | undefined;
const queryCode = new URLSearchParams(location.search).get("room")?.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "";

type ConnectionIntent = { type: "create" } | { type: "join"; code: string } | { type: "queue"; resume?: boolean };

playerNameInput.value = playerName;
roomCodeInput.value = queryCode;
soundButton.setAttribute("aria-pressed", String(!audio.isMuted));
soundButton.classList.toggle("is-muted", audio.isMuted);
playNowButton.disabled = true;
privateButton.disabled = true;

async function loadIdentity(): Promise<void> {
  if (location.hostname.endsWith("herm.cool")) {
    try {
      const response = await fetch("https://feedback.herm.cool/api/game-identity?game_id=card", {
        credentials: "include", headers: { Accept: "application/json" }
      });
      const result = await response.json() as {
        authenticated?: boolean;
        identityToken?: string;
        user?: { displayName?: string };
      };
      if (response.ok && result.authenticated && typeof result.identityToken === "string" && typeof result.user?.displayName === "string") {
        identityToken = result.identityToken;
        playerName = result.user.displayName;
        identitySource = "discord";
      }
    } catch {
      // A local profile remains available when the trusted identity service cannot be reached.
    }
  }
  identityReady = true;
  playerNameInput.value = playerName;
  fallbackProfile.classList.toggle("is-hidden", identitySource === "discord");
  identityNote.innerHTML = identitySource === "discord"
    ? `Playing as <strong>${safe(playerName)}</strong> · Discord`
    : "Using a local profile saved on this device.";
  playNowButton.disabled = false;
  privateButton.disabled = false;
  if (queryCode) {
    showPrivateEntry();
    if (localStorage.getItem(sessionKey(queryCode))) connect({ type: "join", code: queryCode });
  }
  const storedQueue = localStorage.getItem("euchre-queue-session");
  if (!queryCode && storedQueue) {
    queueSessionId = storedQueue;
    beginQueue(true);
  }
}

function websocketUrl(): string {
  const configured = new URLSearchParams(location.search).get("ws");
  if (configured) return configured;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return `ws://${location.hostname}:8080`;
  if (location.hostname.endsWith("herm.cool")) return "wss://online-card-game.fly.dev";
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
}

function safe(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
}

function ownPlayer() { return room?.players.find((player) => player.id === clientId); }
function seatName(seat: number | null): string { return seat === null ? "" : room?.players.find((player) => player.seat === seat)?.name || `Seat ${seat + 1}`; }
function suitSymbol(suit: Suit | null): string { return suit ? ({ clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" } as const)[suit] : "—"; }
function titleSuit(suit: Suit): string { return suit[0].toUpperCase() + suit.slice(1); }

function showToast(message: string, error = false): void {
  const toast = document.createElement("div"); toast.className = `toast${error ? " is-error" : ""}`; toast.textContent = message;
  toastStack.append(toast); setTimeout(() => toast.remove(), 3200);
}

function sessionKey(code: string): string { return `euchre-session-${code}`; }
function saveSession(): void {
  if (!roomCode || !sessionId) return;
  localStorage.setItem(sessionKey(roomCode), sessionId);
  localStorage.setItem("euchre-last-room", roomCode);
  if (identitySource === "local") localStorage.setItem("euchre-name", playerName);
}

function setConnecting(value: boolean): void {
  connecting = value;
  createButton.disabled = value;
  joinButton.disabled = value;
  playNowButton.disabled = value || !identityReady;
  privateButton.disabled = value || !identityReady;
  if (value && !inQueue) entryStatus.textContent = "Finding the table…";
}

function connect(intent: ConnectionIntent, reconnect = false): void {
  if (connecting || socket?.readyState === WebSocket.OPEN) return;
  activeIntent = intent;
  setConnecting(true); manualClose = false;
  const ws = new WebSocket(websocketUrl()); socket = ws;
  ws.addEventListener("open", () => {
    setConnecting(false); reconnectAttempts = 0; connectionFlag.classList.add("is-hidden");
    const stored = intent.type === "join" ? localStorage.getItem(sessionKey(intent.code)) || undefined : undefined;
    if (intent.type === "create") sendRaw({ type: "create", name: playerName, identityToken: identityToken || undefined });
    else if (intent.type === "join") sendRaw({
      type: "join", code: intent.code, name: playerName,
      sessionId: reconnect ? sessionId : stored, identityToken: identityToken || undefined
    });
    else sendRaw({
      type: "queue-join", name: playerName,
      queueSessionId: reconnect || intent.resume ? queueSessionId || undefined : undefined,
      identityToken: identityToken || undefined
    });
    startHeartbeat();
  });
  ws.addEventListener("message", (event) => {
    try { handleMessage(JSON.parse(event.data) as ServerMessage); }
    catch { showToast("The table sent an unreadable update.", true); }
  });
  ws.addEventListener("close", () => {
    stopHeartbeat(); setConnecting(false);
    if (!manualClose && (inQueue || (roomCode && room))) scheduleReconnect();
  });
  ws.addEventListener("error", () => {
    if (!room) entryStatus.textContent = "Could not reach the room server. Try again.";
  });
}

function scheduleReconnect(): void {
  clearTimeout(reconnectTimer); connectionFlag.classList.remove("is-hidden");
  const delay = Math.min(1000 * 2 ** reconnectAttempts, 10000); reconnectAttempts += 1;
  reconnectTimer = window.setTimeout(() => {
    socket = null;
    connect(inQueue ? { type: "queue", resume: true } : { type: "join", code: roomCode }, true);
  }, delay);
}
function startHeartbeat(): void { stopHeartbeat(); heartbeatTimer = window.setInterval(() => send({ type: "ping", at: Date.now() }), 20000); }
function stopHeartbeat(): void { if (heartbeatTimer) clearInterval(heartbeatTimer); heartbeatTimer = undefined; }
function sendRaw(message: ClientMessage): void { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
function send(message: ClientMessage): void { sendRaw(message); }

function closeIdleConnection(reason: string): void {
  manualClose = true;
  stopHeartbeat();
  socket?.close(1000, reason);
  socket = null;
  activeIntent = null;
}

function handleMessage(message: ServerMessage): void {
  if (message.type === "welcome") {
    inQueue = false; queueSessionId = ""; localStorage.removeItem("euchre-queue-session");
    clientId = message.clientId; sessionId = message.sessionId; roomCode = message.roomCode; room = message.state;
    saveSession(); history.replaceState(null, "", `${location.pathname}?room=${roomCode}`); enterTable(); audio.play("join"); render(); return;
  }
  if (message.type === "queue-status") {
    inQueue = true;
    queueSessionId = message.queueSessionId;
    localStorage.setItem("euchre-queue-session", queueSessionId);
    playerName = message.name;
    identitySource = message.identitySource;
    showQueueEntry();
    renderQueue(message.playerCount, message.needed);
    return;
  }
  if (message.type === "queue-cancelled") {
    finishQueueCancellation();
    return;
  }
  if (message.type === "state") {
    const finalTrickJustCompleted = (message.state.phase === "hand-end" || message.state.phase === "gameover")
      && room?.phase === "playing"
      && message.state.completedTricks.length > room.completedTricks.length;
    room = message.state;
    if (finalTrickJustCompleted) {
      endModalReady = false;
      clearTimeout(endModalTimer);
      endModalTimer = window.setTimeout(() => {
        endModalReady = true;
        render();
      }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 560 : 1450);
    }
    render(); return;
  }
  if (message.type === "event") { handleEvent(message.event); return; }
  if (message.type === "error") {
    showToast(message.message, true); entryStatus.textContent = message.message;
    if (message.code === "QUEUE_SESSION_EXPIRED" || message.code === "ALREADY_QUEUED" || message.code === "QUEUE_SESSION_MISMATCH") {
      inQueue = false; queueSessionId = ""; localStorage.removeItem("euchre-queue-session");
      closeIdleConnection("Matchmaking ended");
      showEntryMenu();
    }
    if (message.code === "ROOM_NOT_FOUND" || message.code === "ROOM_FULL" || message.code === "GAME_STARTED") {
      room = null; roomCode = ""; closeIdleConnection("Private table unavailable");
      homeScreen.classList.remove("is-hidden"); gameScreen.classList.add("is-hidden");
    }
  }
}

function handleEvent(event: GameEvent): void {
  if (event.kind === "hand-dealt") audio.play("deal");
  if (event.kind === "trump-called") { audio.play(event.alone ? "big-score" : "select"); showToast(`${event.playerName} calls ${titleSuit(event.trump)}${event.alone ? " alone" : ""}.`); }
  if (event.kind === "trick-won") {
    winningSeat = event.winnerSeat;
    renderSeats();
    window.setTimeout(() => {
      if (winningSeat === event.winnerSeat) { winningSeat = null; renderSeats(); }
    }, 1250);
  }
  if (event.kind === "hand-scored") { lastResult = event; audio.play(event.points >= 4 ? "big-score" : "score"); }
  if (event.kind === "match-won") audio.play("win");
}

function enterTable(): void { homeScreen.classList.add("is-hidden"); gameScreen.classList.remove("is-hidden"); }

function showEntryMenu(): void {
  identityNote.classList.remove("is-hidden");
  fallbackProfile.classList.toggle("is-hidden", identitySource === "discord");
  entryMenu.classList.remove("is-hidden");
  privateEntry.classList.add("is-hidden");
  queueEntry.classList.add("is-hidden");
}

function showPrivateEntry(): void {
  identityNote.classList.remove("is-hidden");
  fallbackProfile.classList.toggle("is-hidden", identitySource === "discord");
  entryMenu.classList.add("is-hidden");
  privateEntry.classList.remove("is-hidden");
  queueEntry.classList.add("is-hidden");
  entryStatus.textContent = queryCode ? `Table ${queryCode} is ready to join.` : "";
}

function showQueueEntry(): void {
  identityNote.classList.add("is-hidden");
  fallbackProfile.classList.add("is-hidden");
  entryMenu.classList.add("is-hidden");
  privateEntry.classList.add("is-hidden");
  queueEntry.classList.remove("is-hidden");
}

function renderQueue(playerCount: number, needed: number): void {
  queuePlayerCount.textContent = String(playerCount);
  [...queueSeats.children].forEach((seat, index) => seat.classList.toggle("is-ready", index < playerCount));
  queueCopy.textContent = needed > 0
    ? `Waiting for ${needed} more ${needed === 1 ? "player" : "players"}. Your place is held if you briefly reconnect.`
    : "Four players found. Dealing a fresh table…";
}

function useCurrentName(): string {
  if (identitySource === "discord") return playerName;
  playerName = playerNameInput.value.trim() || "Card Player";
  playerNameInput.value = playerName;
  localStorage.setItem("euchre-name", playerName);
  return playerName;
}

function beginQueue(resume = false): void {
  if (!identityReady || connecting) return;
  useCurrentName();
  inQueue = true;
  entryStatus.textContent = "";
  showQueueEntry();
  renderQueue(resume ? 0 : 1, resume ? 4 : 3);
  connect({ type: "queue", resume });
}

function finishQueueCancellation(): void {
  inQueue = false;
  queueSessionId = "";
  localStorage.removeItem("euchre-queue-session");
  clearTimeout(reconnectTimer);
  closeIdleConnection("Matchmaking cancelled");
  connectionFlag.classList.add("is-hidden");
  entryStatus.textContent = "Matchmaking cancelled.";
  showEntryMenu();
}

function render(): void {
  if (!room) return;
  const own = ownPlayer(); const ownSeat = own?.seat || 0;
  scene.setState(room, ownSeat);
  inGameCode.textContent = room.code; lobbyCode.textContent = room.code;
  scoreZero.textContent = String(room.teamScores[0]); scoreOne.textContent = String(room.teamScores[1]);
  teamZeroNames.textContent = room.players.filter((p) => p.team === 0).map((p) => p.name).join(" & ");
  teamOneNames.textContent = room.players.filter((p) => p.team === 1).map((p) => p.name).join(" & ");
  handNumber.textContent = room.handNumber ? `HAND ${room.handNumber}` : "READY";
  tricksZero.textContent = String(room.teamTricks[0]); tricksOne.textContent = String(room.teamTricks[1]);
  trickProgress.textContent = `${room.completedTricks.length} of 5 tricks played`;
  renderPhase(); renderTrump(); renderSeats(); renderHistory(); renderActions(); renderModals();
}

function renderPhase(): void {
  if (!room) return;
  if (room.phase === "lobby") { phaseKicker.textContent = "TABLE OPEN"; phaseTitle.textContent = "Waiting for players"; turnCopy.textContent = "Share the four-letter room code"; return; }
  if (room.phase === "bidding") {
    phaseKicker.textContent = room.bidRound === 1 ? "FIRST ROUND" : "SECOND ROUND";
    phaseTitle.textContent = room.bidRound === 1 ? "Order or pass" : "Name another suit";
  } else if (room.phase === "playing") { phaseKicker.textContent = `TRICK ${Math.min(5, room.completedTricks.length + 1)}`; phaseTitle.textContent = room.currentTrick.length ? `Led ${titleSuit(effectiveSuit(room.currentTrick[0].card, room.trump!))}` : "Lead the trick"; }
  else if (room.phase === "hand-end") { phaseKicker.textContent = "HAND COMPLETE"; phaseTitle.textContent = "Counting points"; }
  else { phaseKicker.textContent = "GAME COMPLETE"; phaseTitle.textContent = `Team ${(room.winningTeam ?? 0) + 1} wins`; }
  turnCopy.textContent = room.turnSeat === null ? "" : `${seatName(room.turnSeat)} to ${room.phase === "bidding" ? "call" : "play"}`;
}

function renderTrump(): void {
  if (!room) return;
  const shownSuit = room.trump || (room.bidRound === 1 ? room.upcard?.suit || null : null);
  trumpSymbol.textContent = suitSymbol(shownSuit);
  trumpSymbol.classList.toggle("is-red", shownSuit === "hearts" || shownSuit === "diamonds");
  trumpName.textContent = room.trump ? titleSuit(room.trump) : room.bidRound === 1 ? "Up for order" : "Turned down";
  makerCopy.textContent = room.makerSeat === null ? (room.upcard ? `${rankLabel(room.upcard.rank)} of ${titleSuit(room.upcard.suit)}` : "Waiting for the deal") : `${seatName(room.makerSeat)} made it${room.alone ? " · going alone" : ""}`;
  trumpPanel.classList.toggle("has-trump", Boolean(room.trump));
}

function renderSeats(): void {
  if (!room) return;
  const view = room;
  const ownSeat = ownPlayer()?.seat || 0;
  seatLedger.innerHTML = view.players.map((player) => {
    const relative = (player.seat - ownSeat + 4) % 4;
    const place = ["YOU", "LEFT", "PARTNER", "RIGHT"][relative];
    const badges = [player.seat === view.dealerSeat ? "DEALER" : "", player.seat === view.makerSeat ? (view.alone ? "LONER" : "MAKER") : "", player.seat === view.sittingOutSeat ? "SITTING OUT" : ""].filter(Boolean).join(" · ");
    return `<div class="seat-row team-${player.team}${player.seat === view.turnSeat ? " is-turn" : ""}${player.seat === ownSeat ? " is-self" : ""}${player.seat === winningSeat ? " is-trick-winner" : ""}">
      <i style="--seat-color:${player.color}"></i><div><span>SEAT ${player.seat + 1} · ${place}</span><strong>${safe(player.name)}</strong><small>${player.isBot ? "TABLE REGULAR" : player.connected ? "CONNECTED" : "AUTOPILOT"}${badges ? ` · ${badges}` : ""}</small></div><b>${player.tricks}</b>
    </div>`;
  }).join("");
}

function renderHistory(): void {
  if (!room) return;
  historyList.innerHTML = room.history.slice(0, 6).map((entry) => `<li class="tone-${entry.tone}">${safe(entry.text)}</li>`).join("");
}

function renderActions(): void {
  if (!room) return;
  const own = ownPlayer(); const isTurn = own?.seat === room.turnSeat;
  bidActions.classList.toggle("is-hidden", room.phase !== "bidding" || !isTurn);
  playActions.classList.toggle("is-hidden", room.phase !== "playing");
  if (!isTurn) { actionEyebrow.textContent = room.phase === "playing" ? "AT THE TABLE" : "THE CALL"; actionTitle.textContent = room.turnSeat === null ? "Waiting for the next deal" : `${seatName(room.turnSeat)} is thinking`; actionHint.textContent = own?.seat === room.sittingOutSeat ? "You called alone with your partner; enjoy the view." : "Your turn is marked around the table."; return; }
  actionEyebrow.textContent = "YOUR TURN";
  if (room.phase === "bidding") {
    actionTitle.textContent = room.bidRound === 1 ? `Order ${titleSuit(room.upcard!.suit)}?` : "Choose trump";
    actionHint.textContent = room.bidRound === 2 && !room.canPass ? "Stick the dealer—you must call a suit." : "Go alone before making your call.";
    orderButton.classList.toggle("is-hidden", room.bidRound !== 1);
    passButton.classList.toggle("is-hidden", !room.canPass);
    suitActions.innerHTML = room.callableSuits.map((suit) => `<button type="button" data-suit="${suit}" class="suit-button ${suit === "hearts" || suit === "diamonds" ? "is-red" : ""}"><b>${suitSymbol(suit)}</b><span>${titleSuit(suit)}</span></button>`).join("");
  } else if (room.phase === "playing") {
    actionTitle.textContent = room.currentTrick.length ? `Follow ${titleSuit(effectiveSuit(room.currentTrick[0].card, room.trump!))}` : "Lead a card";
    actionHint.textContent = `${room.legalCardIds.length} legal ${room.legalCardIds.length === 1 ? "card" : "cards"} raised on the table.`;
  }
}

function renderModals(): void {
  if (!room) return;
  const showLobby = room.phase === "lobby", showResult = room.phase === "hand-end" && endModalReady, showGameover = room.phase === "gameover" && endModalReady;
  modalLayer.classList.toggle("is-hidden", !showLobby && !showResult && !showGameover);
  lobbyModal.classList.toggle("is-hidden", !showLobby); resultModal.classList.toggle("is-hidden", !showResult); gameoverModal.classList.toggle("is-hidden", !showGameover);
  if (showLobby) renderLobby();
  if (showResult && lastResult) {
    el("result-stamp").textContent = `+${lastResult.points}`; el("result-title").textContent = `Team ${lastResult.scoringTeam + 1} scores.`;
    el("result-eyebrow").textContent = lastResult.euchred ? "Euchred" : lastResult.march ? (lastResult.alone ? "Loner march" : "March") : "Makers made it";
    el("result-copy").textContent = lastResult.euchred ? `The makers took ${lastResult.makerTricks}; the defenders earn 2 points.` : `The makers took ${lastResult.makerTricks} tricks and earn ${lastResult.points} point${lastResult.points === 1 ? "" : "s"}.`;
  }
  if (showGameover) {
    el("gameover-title").textContent = `Team ${(room.winningTeam ?? 0) + 1} takes the table.`;
    el("gameover-copy").textContent = `${room.teamScores[0]}–${room.teamScores[1]} after ${room.handNumber} hands.`;
    const host = ownPlayer()?.host; restartButton.classList.toggle("is-hidden", !host); restartFootnote.textContent = host ? "You are the host." : `Waiting for ${room.players.find((p) => p.host)?.name || "the host"}.`;
  }
}

function renderLobby(): void {
  if (!room) return;
  seatList.innerHTML = room.players.map((player) => `<div class="lobby-seat team-${player.team}"><span>${player.seat + 1}</span><div><b>${safe(player.name)}</b><small>TEAM ${player.team + 1} · ${player.isBot ? "BOT SEAT" : player.host ? "HOST" : "PLAYER"}</small></div><i>${player.seat % 2 === 0 ? "N–S" : "E–W"}</i></div>`).join("");
  const host = ownPlayer()?.host; startButton.classList.toggle("is-hidden", !host); lobbyFootnote.textContent = host ? "Bots are ready. Deal whenever you are." : `Waiting for ${room.players.find((p) => p.host)?.name || "the host"} to deal.`;
}

function rankLabel(rank: number): string { return rank === 14 ? "Ace" : rank === 13 ? "King" : rank === 12 ? "Queen" : rank === 11 ? "Jack" : String(rank); }

async function copyInvitation(): Promise<void> {
  if (!roomCode) return; const url = `${location.origin}${location.pathname}?room=${roomCode}`;
  try { await navigator.clipboard.writeText(url); showToast("Invitation copied."); }
  catch { showToast(`Room code: ${roomCode}`); }
}

playNowButton.addEventListener("click", () => beginQueue());
privateButton.addEventListener("click", showPrivateEntry);
privateBackButton.addEventListener("click", () => {
  history.replaceState(null, "", location.pathname);
  entryStatus.textContent = "";
  showEntryMenu();
});
createButton.addEventListener("click", () => { useCurrentName(); connect({ type: "create" }); });
joinButton.addEventListener("click", () => { useCurrentName(); const code = roomCodeInput.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4); if (code.length !== 4) { entryStatus.textContent = "Enter the four-letter room code."; return; } connect({ type: "join", code }); });
cancelQueueButton.addEventListener("click", () => {
  if (socket?.readyState === WebSocket.OPEN) send({ type: "queue-cancel" });
  else finishQueueCancellation();
});
roomCodeInput.addEventListener("input", () => { roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4); });
roomCodeInput.addEventListener("keydown", (event) => { if (event.key === "Enter") joinButton.click(); });
playerNameInput.addEventListener("change", useCurrentName);
playerNameInput.addEventListener("keydown", (event) => { if (event.key === "Enter") useCurrentName(); });
copyButton.addEventListener("click", copyInvitation); inGameCode.addEventListener("click", copyInvitation);
startButton.addEventListener("click", () => send({ type: "start" })); restartButton.addEventListener("click", () => send({ type: "restart" }));
orderButton.addEventListener("click", () => send({ type: "bid", action: "order-up", alone: aloneToggle.checked }));
passButton.addEventListener("click", () => send({ type: "bid", action: "pass" }));
suitActions.addEventListener("click", (event) => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-suit]"); if (button) send({ type: "bid", action: "call", suit: button.dataset.suit as Suit, alone: aloneToggle.checked }); });
scene.setCardHandler((cardId) => { if (room?.legalCardIds.includes(cardId)) send({ type: "play-card", cardId }); });
scene.setEffectHandler((effect) => audio.play(effect === "card-land" ? "play" : "score"));
el("how-button").addEventListener("click", () => guideLayer.classList.remove("is-hidden"));
el("guide-close").addEventListener("click", () => guideLayer.classList.add("is-hidden"));
guideLayer.addEventListener("click", (event) => { if (event.target === guideLayer) guideLayer.classList.add("is-hidden"); });
soundButton.addEventListener("click", () => { audio.setMuted(!audio.isMuted); soundButton.setAttribute("aria-pressed", String(!audio.isMuted)); soundButton.classList.toggle("is-muted", audio.isMuted); if (!audio.isMuted) audio.play("select"); });
addEventListener("keydown", (event) => {
  if (event.key === "Escape") guideLayer.classList.add("is-hidden");
  const index = Number(event.key) - 1;
  if (room && index >= 0 && index < room.hand.length && room.legalCardIds.includes(room.hand[index].id) && !event.repeat) send({ type: "play-card", cardId: room.hand[index].id });
  if (room?.phase === "bidding" && ownPlayer()?.seat === room.turnSeat && event.key.toLowerCase() === "p" && room.canPass) send({ type: "bid", action: "pass" });
});

void loadIdentity();
