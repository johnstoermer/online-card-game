import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import {
  bestTrump,
  bidStrength,
  chooseBotCard,
  chooseDealerDiscard,
  createDeck,
  effectiveSuit,
  leftOf,
  legalCards,
  nextActiveSeat,
  partnerSeat,
  scoreHand,
  shuffled,
  teamForSeat,
  trickSize,
  trickWinner,
  WINNING_SCORE
} from "../shared/game.js";
import { SUITS } from "../shared/types.js";
import type {
  Card,
  ClientMessage,
  CompletedTrick,
  GameEvent,
  HistoryEntry,
  PlayedCard,
  PublicPlayer,
  RoomPhase,
  RoomView,
  ServerMessage,
  Suit,
  Team
} from "../shared/types.js";

const PORT = Number(process.env.PORT || 8080);
const DIST = resolve(process.cwd(), "dist");
const ROOM_ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ";
const PLAYER_COLORS = ["#e5aa58", "#7fa998", "#d86b58", "#7f91bd"];
const BOT_NAMES = ["Mabel", "Walt", "June", "Otis"];

interface Player {
  id: string;
  sessionId: string;
  name: string;
  seat: number;
  color: string;
  connected: boolean;
  host: boolean;
  isBot: boolean;
  hand: Card[];
  tricks: number;
  ws?: WebSocket;
  disconnectedAt?: number;
}

interface Room {
  code: string;
  phase: RoomPhase;
  players: Player[];
  handNumber: number;
  dealerSeat: number;
  turnSeat: number | null;
  bidRound: 1 | 2 | null;
  upcard: Card | null;
  turnedDownSuit: Suit | null;
  trump: Suit | null;
  makerSeat: number | null;
  alone: boolean;
  sittingOutSeat: number | null;
  leaderSeat: number | null;
  currentTrick: PlayedCard[];
  completedTricks: CompletedTrick[];
  teamScores: [number, number];
  teamTricks: [number, number];
  winningTeam: Team | null;
  history: HistoryEntry[];
  eventNumber: number;
  createdAt: number;
  actionTimer?: NodeJS.Timeout;
  nextHandTimer?: NodeJS.Timeout;
}

interface ConnectionContext { player?: Player; room?: Room }
type UnnumberedEvent<T> = T extends unknown ? Omit<T, "eventNumber"> : never;

const rooms = new Map<string, Room>();
const connections = new WeakMap<WebSocket, ConnectionContext>();

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2"
};

const httpServer = createServer((request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (requestUrl.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ ok: true, game: "euchre", rooms: rooms.size }));
    return;
  }
  let relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
  if (!relativePath || relativePath.endsWith("/")) relativePath += "index.html";
  const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(DIST, safePath);
  if (!filePath.startsWith(DIST) || !existsSync(filePath) || !statSync(filePath).isFile()) filePath = join(DIST, "index.html");
  if (!existsSync(filePath)) {
    response.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    response.end("Client build is not available.");
    return;
  }
  const extension = extname(filePath).toLowerCase();
  response.writeHead(200, {
    "content-type": mimeTypes[extension] || "application/octet-stream",
    "cache-control": filePath.includes(join(DIST, "assets")) ? "public, max-age=31536000, immutable" : "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin"
  });
  createReadStream(filePath).pipe(response);
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024, perMessageDeflate: false });

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function makeRoomCode(): string {
  let code = "";
  do code = Array.from({ length: 4 }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join("");
  while (rooms.has(code));
  return code;
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "Player";
  return value.replace(/[^\p{L}\p{N}\s.'_-]/gu, "").trim().slice(0, 18) || "Player";
}

function cleanCode(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) : "";
}

function playerAt(room: Room, seat: number): Player {
  const player = room.players.find((candidate) => candidate.seat === seat);
  if (!player) throw new Error(`Seat ${seat} is missing.`);
  return player;
}

function createPlayer(name: string, seat: number, sessionId?: string, isBot = false): Player {
  return {
    id: randomId(isBot ? "bot" : "player"), sessionId: sessionId || randomId("session"),
    name, seat, color: PLAYER_COLORS[seat], connected: true, host: false, isBot, hand: [], tricks: 0
  };
}

function createRoom(name: string, sessionId?: string): { room: Room; player: Player } {
  const player = createPlayer(name, 0, sessionId);
  player.host = true;
  const room: Room = {
    code: makeRoomCode(), phase: "lobby", players: [player], handNumber: 0, dealerSeat: 3,
    turnSeat: null, bidRound: null, upcard: null, turnedDownSuit: null, trump: null,
    makerSeat: null, alone: false, sittingOutSeat: null, leaderSeat: null,
    currentTrick: [], completedTricks: [], teamScores: [0, 0], teamTricks: [0, 0],
    winningTeam: null, history: [], eventNumber: 0, createdAt: Date.now()
  };
  for (let seat = 1; seat < 4; seat += 1) room.players.push(createPlayer(BOT_NAMES[seat - 1], seat, undefined, true));
  rooms.set(room.code, room);
  return { room, player };
}

function publicPlayer(player: Player): PublicPlayer {
  return {
    id: player.id, name: player.name, seat: player.seat, team: teamForSeat(player.seat),
    color: player.color, connected: player.connected, host: player.host, isBot: player.isBot,
    handCount: player.hand.length, tricks: player.tricks
  };
}

function roomView(room: Room, viewer: Player): RoomView {
  const legal = room.phase === "playing" && room.turnSeat === viewer.seat && room.trump
    ? legalCards(viewer.hand, room.currentTrick, room.trump).map((card) => card.id) : [];
  const callableSuits = room.phase === "bidding" && room.bidRound === 2
    ? SUITS.filter((suit) => suit !== room.turnedDownSuit) : [];
  return {
    code: room.code, phase: room.phase, players: [...room.players].sort((a, b) => a.seat - b.seat).map(publicPlayer),
    hand: [...viewer.hand], handNumber: room.handNumber, dealerSeat: room.dealerSeat,
    turnSeat: room.turnSeat, bidRound: room.bidRound, upcard: room.upcard,
    turnedDownSuit: room.turnedDownSuit, trump: room.trump, makerSeat: room.makerSeat,
    alone: room.alone, sittingOutSeat: room.sittingOutSeat, leaderSeat: room.leaderSeat,
    currentTrick: [...room.currentTrick], completedTricks: [...room.completedTricks],
    teamScores: [...room.teamScores] as [number, number], teamTricks: [...room.teamTricks] as [number, number],
    winningTeam: room.winningTeam, legalCardIds: legal,
    canPass: room.phase === "bidding" && room.turnSeat === viewer.seat && !(room.bidRound === 2 && viewer.seat === room.dealerSeat),
    callableSuits, history: [...room.history], eventNumber: room.eventNumber, createdAt: room.createdAt
  };
}

function send(ws: WebSocket | undefined, message: ServerMessage): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}
function sendError(ws: WebSocket | undefined, message: string, code?: string): void { send(ws, { type: "error", message, code }); }
function broadcastState(room: Room): void {
  for (const player of room.players) if (!player.isBot) send(player.ws, { type: "state", state: roomView(room, player) });
}
function emit(room: Room, event: UnnumberedEvent<GameEvent>): void {
  room.eventNumber += 1;
  const numbered = { ...event, eventNumber: room.eventNumber } as GameEvent;
  for (const player of room.players) if (!player.isBot) send(player.ws, { type: "event", event: numbered });
}
function history(room: Room, text: string, tone: HistoryEntry["tone"] = "neutral"): void {
  room.history.unshift({ id: room.eventNumber + 1, text, tone });
  room.history = room.history.slice(0, 10);
}

function clearRoomTimers(room: Room): void {
  if (room.actionTimer) clearTimeout(room.actionTimer);
  if (room.nextHandTimer) clearTimeout(room.nextHandTimer);
  room.actionTimer = undefined;
  room.nextHandTimer = undefined;
}

function dealHand(room: Room): void {
  if (room.actionTimer) clearTimeout(room.actionTimer);
  room.actionTimer = undefined;
  room.handNumber += 1;
  room.dealerSeat = leftOf(room.dealerSeat);
  room.phase = "bidding";
  room.bidRound = 1;
  room.turnSeat = leftOf(room.dealerSeat);
  room.trump = null;
  room.makerSeat = null;
  room.alone = false;
  room.sittingOutSeat = null;
  room.leaderSeat = null;
  room.currentTrick = [];
  room.completedTricks = [];
  room.teamTricks = [0, 0];
  const deck = shuffled(createDeck(`h${room.handNumber}-`));
  for (const player of room.players) {
    player.hand = [];
    player.tricks = 0;
  }
  for (let card = 0; card < 5; card += 1) {
    for (let offset = 1; offset <= 4; offset += 1) playerAt(room, (room.dealerSeat + offset) % 4).hand.push(deck.pop()!);
  }
  room.upcard = deck.pop()!;
  room.turnedDownSuit = null;
  history(room, `${playerAt(room, room.dealerSeat).name} deals hand ${room.handNumber}.`, "neutral");
  emit(room, { kind: "hand-dealt", handNumber: room.handNumber, dealerSeat: room.dealerSeat, upcard: room.upcard });
  broadcastState(room);
  scheduleAction(room);
}

function resetMatch(room: Room): void {
  clearRoomTimers(room);
  room.handNumber = 0;
  room.dealerSeat = 3;
  room.teamScores = [0, 0];
  room.winningTeam = null;
  room.history = [];
  dealHand(room);
}

function beginPlay(room: Room, makerSeat: number, trump: Suit, alone: boolean, orderedUp: boolean): void {
  room.phase = "playing";
  room.bidRound = null;
  room.makerSeat = makerSeat;
  room.trump = trump;
  room.alone = alone;
  room.sittingOutSeat = alone ? partnerSeat(makerSeat) : null;
  room.leaderSeat = leftOf(room.dealerSeat);
  if (room.leaderSeat === room.sittingOutSeat) room.leaderSeat = leftOf(room.leaderSeat);
  room.turnSeat = room.leaderSeat;
  if (orderedUp && room.upcard) {
    const dealer = playerAt(room, room.dealerSeat);
    dealer.hand.push(room.upcard);
    const discard = chooseDealerDiscard(dealer.hand, trump);
    dealer.hand = dealer.hand.filter((card) => card.id !== discard.id);
  }
  const maker = playerAt(room, makerSeat);
  history(room, `${maker.name} ${orderedUp ? "orders" : "calls"} ${trump}${alone ? " alone" : ""}.`, "bid");
  emit(room, { kind: "trump-called", playerId: maker.id, playerName: maker.name, trump, alone, orderedUp });
  broadcastState(room);
  scheduleAction(room);
}

function bid(room: Room, player: Player, action: "pass" | "order-up" | "call", suit?: Suit, alone = false): void {
  if (room.phase !== "bidding" || room.turnSeat !== player.seat || !room.bidRound || !room.upcard) {
    return sendError(player.ws, "It is not your turn to bid.");
  }
  if (action === "order-up") {
    if (room.bidRound !== 1) return sendError(player.ws, "The upcard can only be ordered in the first round.");
    beginPlay(room, player.seat, room.upcard.suit, alone, true);
    return;
  }
  if (action === "call") {
    if (room.bidRound !== 2 || !suit || !SUITS.includes(suit) || suit === room.turnedDownSuit) {
      return sendError(player.ws, "Choose an available suit in the second round.");
    }
    beginPlay(room, player.seat, suit, alone, false);
    return;
  }
  if (action !== "pass") return sendError(player.ws, "That bid is not available.");
  if (room.bidRound === 2 && player.seat === room.dealerSeat) return sendError(player.ws, "Stick the dealer: choose a suit.");
  history(room, `${player.name} passes.`, "neutral");
  emit(room, { kind: "player-passed", playerId: player.id, playerName: player.name, round: room.bidRound });
  if (player.seat === room.dealerSeat) {
    room.bidRound = 2;
    room.turnedDownSuit = room.upcard.suit;
    room.turnSeat = leftOf(room.dealerSeat);
  } else room.turnSeat = leftOf(player.seat);
  broadcastState(room);
  scheduleAction(room);
}

function finishHand(room: Room): void {
  if (room.makerSeat === null) return;
  const result = scoreHand(room.makerSeat, room.teamTricks, room.alone);
  room.teamScores[result.scoringTeam] += result.points;
  room.phase = "hand-end";
  room.turnSeat = null;
  const outcome = result.euchred ? "Makers euchred" : result.march ? (room.alone ? "Loner march" : "March") : "Makers take the hand";
  history(room, `${outcome}. Team ${result.scoringTeam + 1} scores ${result.points}.`, "score");
  emit(room, { kind: "hand-scored", ...result, alone: room.alone });
  if (room.teamScores[result.scoringTeam] >= WINNING_SCORE) {
    room.phase = "gameover";
    room.winningTeam = result.scoringTeam;
    emit(room, { kind: "match-won", team: result.scoringTeam });
  } else {
    room.nextHandTimer = setTimeout(() => {
      room.nextHandTimer = undefined;
      if (room.phase === "hand-end") dealHand(room);
    }, 2800);
  }
  broadcastState(room);
}

function playCard(room: Room, player: Player, cardId: string): void {
  if (room.phase !== "playing" || room.turnSeat !== player.seat || !room.trump) return sendError(player.ws, "It is not your turn to play.");
  const card = player.hand.find((candidate) => candidate.id === cardId);
  if (!card) return sendError(player.ws, "That card is not in your hand.");
  const legal = legalCards(player.hand, room.currentTrick, room.trump);
  if (!legal.some((candidate) => candidate.id === card.id)) return sendError(player.ws, "You must follow the led suit.", "MUST_FOLLOW_SUIT");
  player.hand = player.hand.filter((candidate) => candidate.id !== card.id);
  room.currentTrick.push({ seat: player.seat, card });
  history(room, `${player.name} plays ${rankLabel(card.rank)} of ${card.suit}.`, "trick");
  emit(room, { kind: "card-played", playerId: player.id, playerName: player.name, seat: player.seat, card });
  if (room.currentTrick.length === trickSize(room.sittingOutSeat)) {
    const winnerSeat = trickWinner(room.currentTrick, room.trump);
    const winner = playerAt(room, winnerSeat);
    winner.tricks += 1;
    room.teamTricks[teamForSeat(winnerSeat)] += 1;
    room.completedTricks.push({ leaderSeat: room.leaderSeat!, winnerSeat, cards: [...room.currentTrick] });
    room.currentTrick = [];
    room.leaderSeat = winnerSeat;
    room.turnSeat = winnerSeat;
    history(room, `${winner.name} takes trick ${room.completedTricks.length}.`, "trick");
    emit(room, { kind: "trick-won", winnerSeat, winnerName: winner.name, team: teamForSeat(winnerSeat), trickNumber: room.completedTricks.length });
    if (room.completedTricks.length === 5) {
      finishHand(room);
      return;
    }
  } else room.turnSeat = nextActiveSeat(player.seat, room.sittingOutSeat);
  broadcastState(room);
  scheduleAction(room);
}

function rankLabel(rank: number): string { return rank === 14 ? "ace" : rank === 13 ? "king" : rank === 12 ? "queen" : rank === 11 ? "jack" : String(rank); }

function botBid(room: Room, player: Player): void {
  if (!room.upcard || !room.bidRound) return;
  if (room.bidRound === 1) {
    const strength = bidStrength(player.hand, room.upcard.suit) + (player.seat === room.dealerSeat ? 1.8 : 0);
    if (strength >= 9) bid(room, player, "order-up", undefined, strength >= 14);
    else bid(room, player, "pass");
    return;
  }
  const best = bestTrump(player.hand, room.turnedDownSuit || undefined);
  const forced = player.seat === room.dealerSeat;
  if (forced || best.strength >= 8) bid(room, player, "call", best.suit, best.strength >= 14);
  else bid(room, player, "pass");
}

function scheduleAction(room: Room): void {
  if (room.actionTimer) clearTimeout(room.actionTimer);
  room.actionTimer = undefined;
  if ((room.phase !== "bidding" && room.phase !== "playing") || room.turnSeat === null) return;
  const player = playerAt(room, room.turnSeat);
  if (!player.isBot && player.connected) return;
  const delay = player.isBot ? 700 + Math.floor(Math.random() * 500) : 7000;
  room.actionTimer = setTimeout(() => {
    room.actionTimer = undefined;
    if (room.turnSeat !== player.seat || (!player.isBot && player.connected)) return;
    if (room.phase === "bidding") botBid(room, player);
    else if (room.phase === "playing" && room.trump) playCard(room, player, chooseBotCard(player.hand, room.currentTrick, room.trump).id);
  }, delay);
}

function rebalanceHost(room: Room): void {
  for (const player of room.players) player.host = false;
  const host = [...room.players].sort((a, b) => a.seat - b.seat).find((player) => !player.isBot && player.connected);
  if (host) host.host = true;
}

function attachPlayer(ws: WebSocket, room: Room, player: Player): void {
  if (player.ws && player.ws !== ws) player.ws.close(4001, "Reconnected elsewhere");
  player.ws = ws;
  player.connected = true;
  player.disconnectedAt = undefined;
  connections.set(ws, { player, room });
  rebalanceHost(room);
  send(ws, { type: "welcome", clientId: player.id, sessionId: player.sessionId, roomCode: room.code, state: roomView(room, player) });
  broadcastState(room);
  scheduleAction(room);
}

function handleCreate(ws: WebSocket, message: Extract<ClientMessage, { type: "create" }>): void {
  const { room, player } = createRoom(cleanName(message.name), message.sessionId);
  attachPlayer(ws, room, player);
}

function handleJoin(ws: WebSocket, message: Extract<ClientMessage, { type: "join" }>): void {
  const room = rooms.get(cleanCode(message.code));
  if (!room) return sendError(ws, "That table could not be found. Check the four-letter code.", "ROOM_NOT_FOUND");
  if (message.sessionId) {
    const returning = room.players.find((player) => !player.isBot && player.sessionId === message.sessionId);
    if (returning) {
      returning.name = cleanName(message.name) || returning.name;
      attachPlayer(ws, room, returning);
      return;
    }
  }
  if (room.phase !== "lobby") return sendError(ws, "That table has already started.", "GAME_STARTED");
  const bot = [...room.players].sort((a, b) => a.seat - b.seat).find((player) => player.isBot);
  if (!bot) return sendError(ws, "That table has four human players.", "ROOM_FULL");
  const player = createPlayer(cleanName(message.name), bot.seat, message.sessionId);
  room.players = room.players.filter((candidate) => candidate.id !== bot.id).concat(player);
  attachPlayer(ws, room, player);
  history(room, `${player.name} takes seat ${player.seat + 1}.`);
  emit(room, { kind: "player-joined", playerId: player.id, playerName: player.name, seat: player.seat });
  broadcastState(room);
}

function handleAction(ws: WebSocket, message: ClientMessage): void {
  const context = connections.get(ws);
  if (!context?.room || !context.player) return sendError(ws, "Join a table before sending actions.");
  const { room, player } = context;
  if (message.type === "start") {
    if (!player.host) return sendError(ws, "Only the table host can deal.");
    if (room.phase !== "lobby") return;
    resetMatch(room);
  } else if (message.type === "bid") bid(room, player, message.action, message.suit, Boolean(message.alone));
  else if (message.type === "play-card") playCard(room, player, message.cardId);
  else if (message.type === "restart") {
    if (room.phase !== "gameover" || !player.host) return sendError(ws, "Only the host can start the next match.");
    resetMatch(room);
  }
}

wss.on("connection", (ws) => {
  connections.set(ws, {});
  ws.on("message", (data) => {
    let message: ClientMessage;
    try { message = JSON.parse(data.toString()) as ClientMessage; }
    catch { return sendError(ws, "Message could not be read."); }
    if (!message || typeof message.type !== "string") return;
    if (message.type === "ping") return send(ws, { type: "pong", at: message.at });
    const context = connections.get(ws);
    if (!context?.player) {
      if (message.type === "create") return handleCreate(ws, message);
      if (message.type === "join") return handleJoin(ws, message);
      return sendError(ws, "Create or join a table first.");
    }
    handleAction(ws, message);
  });
  ws.on("close", () => {
    const context = connections.get(ws);
    if (!context?.player || !context.room || context.player.ws !== ws) return;
    const { player, room } = context;
    player.connected = false;
    player.ws = undefined;
    player.disconnectedAt = Date.now();
    rebalanceHost(room);
    history(room, `${player.name} disconnected; table pilot is standing in.`);
    emit(room, { kind: "player-left", playerId: player.id, playerName: player.name, seat: player.seat });
    broadcastState(room);
    scheduleAction(room);
  });
  ws.on("error", () => {});
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const connectedHuman = room.players.some((player) => !player.isBot && player.connected);
    if (!connectedHuman && now - room.createdAt > 15 * 60 * 1000) {
      clearRoomTimers(room);
      rooms.delete(code);
    }
  }
}, 30_000).unref();

httpServer.listen(PORT, "0.0.0.0", () => console.log(`Euchre Table listening on :${PORT}`));
