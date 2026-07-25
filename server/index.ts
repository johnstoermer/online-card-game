import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import {
  bossForRound,
  createDeck,
  RELICS,
  roundTarget,
  scoreHand,
  shuffled
} from "../shared/game.js";
import type {
  Card,
  ClientMessage,
  GameEvent,
  HandKey,
  PublicPlayer,
  RoomPhase,
  RoomView,
  ServerMessage
} from "../shared/types.js";

const PORT = Number(process.env.PORT || 8080);
const DIST = resolve(process.cwd(), "dist");
const MAX_PLAYERS = 4;
const ROOM_ALPHABET = "BCDFGHJKLMNPQRSTVWXYZ";
const PLAYER_COLORS = ["#ecb457", "#d9654f", "#73a696", "#7595c8"];

interface Player {
  id: string;
  sessionId: string;
  name: string;
  color: string;
  connected: boolean;
  host: boolean;
  isBot: boolean;
  hand: Card[];
  deck: Card[];
  handsLeft: number;
  discardsLeft: number;
  roundScore: number;
  totalScore: number;
  relics: string[];
  relicChoices: string[];
  pickedRelic: boolean;
  ready: boolean;
  ws?: WebSocket;
  disconnectedAt?: number;
}

interface Room {
  code: string;
  phase: RoomPhase;
  round: number;
  target: number;
  teamScore: number;
  chain: number;
  lastHand: HandKey | null;
  players: Player[];
  eventNumber: number;
  createdAt: number;
  botTimers: Map<string, NodeJS.Timeout>;
  transitionTimer?: NodeJS.Timeout;
}

interface ConnectionContext {
  player?: Player;
  room?: Room;
}

type UnnumberedEvent<T> = T extends unknown ? Omit<T, "eventNumber"> : never;

const rooms = new Map<string, Room>();
const connections = new WeakMap<WebSocket, ConnectionContext>();

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json"
};

const httpServer = createServer((request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/health") {
    response.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store"
    });
    response.end(
      JSON.stringify({
        ok: true,
        rooms: rooms.size,
        players: [...rooms.values()].reduce(
          (sum, room) => sum + room.players.filter((player) => player.connected).length,
          0
        )
      })
    );
    return;
  }

  let relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
  if (!relativePath || relativePath.endsWith("/")) relativePath += "index.html";
  const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(DIST, safePath);

  if (!filePath.startsWith(DIST) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(DIST, "index.html");
  }

  if (!existsSync(filePath)) {
    response.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    response.end("Client build is not available.");
    return;
  }

  const extension = extname(filePath).toLowerCase();
  const immutable = filePath.includes(`${join(DIST, "assets")}`);
  response.writeHead(200, {
    "content-type": mimeTypes[extension] || "application/octet-stream",
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin"
  });
  createReadStream(filePath).pipe(response);
});

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: 16 * 1024,
  perMessageDeflate: false
});

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function makeRoomCode(): string {
  let code = "";
  do {
    code = Array.from(
      { length: 4 },
      () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]
    ).join("");
  } while (rooms.has(code));
  return code;
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "Player";
  const cleaned = value.replace(/[^\p{L}\p{N}\s.'_-]/gu, "").trim().slice(0, 18);
  return cleaned || "Player";
}

function cleanCode(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) : "";
}

function createRoom(): Room {
  const code = makeRoomCode();
  const room: Room = {
    code,
    phase: "lobby",
    round: 1,
    target: 0,
    teamScore: 0,
    chain: 0,
    lastHand: null,
    players: [],
    eventNumber: 0,
    createdAt: Date.now(),
    botTimers: new Map()
  };
  rooms.set(code, room);
  return room;
}

function createPlayer(name: string, sessionId?: string, isBot = false): Player {
  return {
    id: randomId(isBot ? "house" : "player"),
    sessionId: sessionId || randomId("session"),
    name,
    color: PLAYER_COLORS[0],
    connected: true,
    host: false,
    isBot,
    hand: [],
    deck: [],
    handsLeft: 0,
    discardsLeft: 0,
    roundScore: 0,
    totalScore: 0,
    relics: [],
    relicChoices: [],
    pickedRelic: false,
    ready: false
  };
}

function rebalanceSeats(room: Room): void {
  room.players.forEach((player, index) => {
    player.color = PLAYER_COLORS[index % PLAYER_COLORS.length];
  });
  if (!room.players.some((player) => player.host && !player.isBot)) {
    const nextHost = room.players.find((player) => !player.isBot);
    if (nextHost) nextHost.host = true;
  }
}

function publicPlayer(player: Player): PublicPlayer {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    connected: player.connected,
    host: player.host,
    isBot: player.isBot,
    handCount: player.hand.length,
    handsLeft: player.handsLeft,
    discardsLeft: player.discardsLeft,
    roundScore: player.roundScore,
    totalScore: player.totalScore,
    relics: [...player.relics],
    pickedRelic: player.pickedRelic,
    ready: player.ready
  };
}

function roomView(room: Room, viewer: Player): RoomView {
  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    target: room.target,
    teamScore: room.teamScore,
    chain: room.chain,
    lastHand: room.lastHand,
    boss: bossForRound(room.round),
    players: room.players.map(publicPlayer),
    hand: [...viewer.hand],
    deckRemaining: viewer.deck.length,
    relicChoices: [...viewer.relicChoices],
    ownRelics: [...viewer.relics],
    eventNumber: room.eventNumber,
    createdAt: room.createdAt
  };
}

function send(ws: WebSocket | undefined, message: ServerMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(message));
}

function sendError(ws: WebSocket, message: string, code?: string): void {
  send(ws, { type: "error", message, code });
}

function broadcastState(room: Room): void {
  for (const player of room.players) {
    if (!player.isBot) send(player.ws, { type: "state", state: roomView(room, player) });
  }
}

function emit(room: Room, event: UnnumberedEvent<GameEvent>): void {
  room.eventNumber += 1;
  const numbered = { ...event, eventNumber: room.eventNumber } as GameEvent;
  for (const player of room.players) {
    if (!player.isBot) send(player.ws, { type: "event", event: numbered });
  }
}

function drawCards(player: Player, count: number): void {
  while (count > 0 && player.deck.length > 0) {
    const card = player.deck.pop();
    if (card) player.hand.push(card);
    count -= 1;
  }
}

function beginRound(room: Room): void {
  room.phase = "playing";
  room.teamScore = 0;
  room.chain = 0;
  room.lastHand = null;
  room.target = roundTarget(room.round, room.players.length);

  for (const player of room.players) {
    player.deck = shuffled(createDeck(`${room.round}-${player.id}-`));
    player.hand = [];
    player.handsLeft = 3;
    player.discardsLeft = 2;
    player.roundScore = 0;
    player.ready = false;
    player.pickedRelic = false;
    player.relicChoices = [];
    drawCards(player, 8);
  }

  emit(room, {
    kind: "round-started",
    round: room.round,
    target: room.target,
    boss: bossForRound(room.round)
  });
  broadcastState(room);
  scheduleBots(room);
}

function resetRun(room: Room): void {
  if (room.transitionTimer) clearTimeout(room.transitionTimer);
  for (const timer of room.botTimers.values()) clearTimeout(timer);
  room.botTimers.clear();
  room.round = 1;
  room.target = 0;
  room.teamScore = 0;
  room.chain = 0;
  room.lastHand = null;
  for (const player of room.players) {
    player.totalScore = 0;
    player.roundScore = 0;
    player.relics = [];
    player.relicChoices = [];
    player.pickedRelic = false;
    player.ready = false;
  }
  beginRound(room);
}

function pickRelicChoices(player: Player): string[] {
  const remaining = RELICS.filter((relic) => !player.relics.includes(relic.id));
  return shuffled(remaining)
    .slice(0, Math.min(3, remaining.length))
    .map((relic) => relic.id);
}

function enterIntermission(room: Room): void {
  room.phase = "intermission";
  for (const player of room.players) {
    player.relicChoices = pickRelicChoices(player);
    player.pickedRelic = player.relicChoices.length === 0;
    player.ready = false;
    if (player.isBot && player.relicChoices.length) {
      player.relics.push(player.relicChoices[0]);
      player.pickedRelic = true;
    }
    if (player.isBot) player.ready = true;
  }
  broadcastState(room);
}

function finishRound(room: Room, won: boolean): void {
  for (const timer of room.botTimers.values()) clearTimeout(timer);
  room.botTimers.clear();
  if (won) {
    emit(room, {
      kind: "round-won",
      round: room.round,
      score: room.teamScore,
      target: room.target
    });
    enterIntermission(room);
    return;
  }

  room.phase = "gameover";
  emit(room, {
    kind: "round-lost",
    round: room.round,
    score: room.teamScore,
    target: room.target
  });
  broadcastState(room);
}

function checkRoundEnd(room: Room): void {
  if (room.phase !== "playing") return;
  if (room.teamScore >= room.target) {
    finishRound(room, true);
    return;
  }
  if (room.players.every((player) => player.handsLeft <= 0)) {
    finishRound(room, false);
  }
}

function resolveCards(player: Player, cardIds: string[]): Card[] | null {
  const uniqueIds = [...new Set(cardIds)];
  if (uniqueIds.length < 1 || uniqueIds.length > 5) return null;
  const selected = uniqueIds.map((id) => player.hand.find((card) => card.id === id));
  if (selected.some((card) => !card)) return null;
  return selected as Card[];
}

function removeAndRefill(player: Player, selected: Card[]): void {
  const selectedIds = new Set(selected.map((card) => card.id));
  player.hand = player.hand.filter((card) => !selectedIds.has(card.id));
  drawCards(player, 8 - player.hand.length);
}

function playCards(room: Room, player: Player, cardIds: string[]): void {
  if (room.phase !== "playing" || player.handsLeft <= 0) return;
  const selected = resolveCards(player, cardIds);
  if (!selected) {
    if (player.ws) sendError(player.ws, "Choose between one and five cards.");
    return;
  }

  const breakdown = scoreHand(selected, {
    relicIds: player.relics,
    previousHand: room.lastHand,
    chain: room.chain,
    boss: bossForRound(room.round),
    handsLeftBeforePlay: player.handsLeft
  });

  player.handsLeft -= 1;
  player.roundScore += breakdown.total;
  player.totalScore += breakdown.total;
  room.teamScore += breakdown.total;
  room.chain = breakdown.chain;
  room.lastHand = breakdown.hand;
  removeAndRefill(player, selected);

  emit(room, {
    kind: "hand-played",
    playerId: player.id,
    playerName: player.name,
    cards: selected,
    score: breakdown
  });
  checkRoundEnd(room);
  broadcastState(room);
  scheduleBots(room);
}

function discardCards(room: Room, player: Player, cardIds: string[]): void {
  if (room.phase !== "playing" || player.discardsLeft <= 0 || player.handsLeft <= 0) return;
  const selected = resolveCards(player, cardIds);
  if (!selected) {
    if (player.ws) sendError(player.ws, "Choose between one and five cards to discard.");
    return;
  }
  player.discardsLeft -= 1;
  removeAndRefill(player, selected);
  emit(room, {
    kind: "cards-discarded",
    playerId: player.id,
    playerName: player.name,
    cards: selected
  });
  broadcastState(room);
}

function combinations<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  const build = (start: number, picked: T[]) => {
    if (picked.length === size) {
      result.push([...picked]);
      return;
    }
    for (let index = start; index <= items.length - (size - picked.length); index += 1) {
      picked.push(items[index]);
      build(index + 1, picked);
      picked.pop();
    }
  };
  build(0, []);
  return result;
}

function bestBotCards(room: Room, player: Player): Card[] {
  let candidates: Card[][] = [];
  for (let size = 1; size <= Math.min(5, player.hand.length); size += 1) {
    candidates = candidates.concat(combinations(player.hand, size));
  }
  let best = candidates[0] || [];
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = scoreHand(candidate, {
      relicIds: player.relics,
      previousHand: room.lastHand,
      chain: room.chain,
      boss: bossForRound(room.round),
      handsLeftBeforePlay: player.handsLeft
    }).total;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function scheduleBots(room: Room): void {
  if (room.phase !== "playing") return;
  for (const player of room.players) {
    const needsAutopilot = !player.isBot && !player.connected;
    if ((!player.isBot && !needsAutopilot) || player.handsLeft <= 0 || room.botTimers.has(player.id)) {
      continue;
    }
    const delay = needsAutopilot ? 8000 : 1500 + Math.floor(Math.random() * 1700);
    const timer = setTimeout(() => {
      room.botTimers.delete(player.id);
      if (
        room.phase !== "playing" ||
        player.handsLeft <= 0 ||
        (!player.isBot && player.connected)
      ) {
        return;
      }
      const cards = bestBotCards(room, player);
      playCards(
        room,
        player,
        cards.map((card) => card.id)
      );
    }, delay);
    room.botTimers.set(player.id, timer);
  }
}

function allReady(room: Room): boolean {
  return room.players.length > 0 && room.players.every((player) => player.pickedRelic && player.ready);
}

function maybeAdvance(room: Room): void {
  if (room.phase !== "intermission" || !allReady(room) || room.transitionTimer) return;
  room.transitionTimer = setTimeout(() => {
    room.transitionTimer = undefined;
    if (room.phase !== "intermission" || !allReady(room)) return;
    room.round += 1;
    beginRound(room);
  }, 1000);
}

function attachPlayer(ws: WebSocket, room: Room, player: Player): void {
  const autopilotTimer = room.botTimers.get(player.id);
  if (autopilotTimer) clearTimeout(autopilotTimer);
  room.botTimers.delete(player.id);
  player.ws = ws;
  player.connected = true;
  player.disconnectedAt = undefined;
  connections.set(ws, { player, room });
  send(ws, {
    type: "welcome",
    clientId: player.id,
    sessionId: player.sessionId,
    roomCode: room.code,
    state: roomView(room, player)
  });
  broadcastState(room);
}

function handleCreate(ws: WebSocket, message: Extract<ClientMessage, { type: "create" }>): void {
  const room = createRoom();
  const player = createPlayer(cleanName(message.name), message.sessionId);
  player.host = true;
  room.players.push(player);
  rebalanceSeats(room);
  attachPlayer(ws, room, player);
}

function handleJoin(ws: WebSocket, message: Extract<ClientMessage, { type: "join" }>): void {
  const code = cleanCode(message.code);
  const room = rooms.get(code);
  if (!room) {
    sendError(ws, "That table could not be found. Check the four-letter code.", "ROOM_NOT_FOUND");
    return;
  }

  if (message.sessionId) {
    const returning = room.players.find(
      (player) => !player.isBot && player.sessionId === message.sessionId
    );
    if (returning) {
      if (returning.ws && returning.ws !== ws) returning.ws.close(4001, "Reconnected elsewhere");
      returning.name = cleanName(message.name) || returning.name;
      attachPlayer(ws, room, returning);
      return;
    }
  }

  if (room.phase !== "lobby") {
    sendError(ws, "That table has already started.", "GAME_STARTED");
    return;
  }
  if (room.players.length >= MAX_PLAYERS) {
    sendError(ws, "That table is full.", "ROOM_FULL");
    return;
  }

  const player = createPlayer(cleanName(message.name), message.sessionId);
  room.players.push(player);
  rebalanceSeats(room);
  attachPlayer(ws, room, player);
  emit(room, {
    kind: "player-joined",
    playerId: player.id,
    playerName: player.name
  });
}

function handleAction(ws: WebSocket, message: ClientMessage): void {
  const context = connections.get(ws);
  if (!context?.room || !context.player) {
    sendError(ws, "Join a table before sending game actions.");
    return;
  }
  const { room, player } = context;

  if (message.type === "start") {
    if (!player.host) return sendError(ws, "Only the table host can start.");
    if (room.phase !== "lobby") return;
    resetRun(room);
    return;
  }

  if (message.type === "play") {
    playCards(room, player, message.cardIds);
    return;
  }

  if (message.type === "discard") {
    discardCards(room, player, message.cardIds);
    return;
  }

  if (message.type === "pick-relic") {
    if (room.phase !== "intermission" || player.pickedRelic) return;
    if (!player.relicChoices.includes(message.relicId)) {
      return sendError(ws, "That relic is not available.");
    }
    player.relics.push(message.relicId);
    player.pickedRelic = true;
    emit(room, {
      kind: "relic-picked",
      playerId: player.id,
      playerName: player.name,
      relicId: message.relicId
    });
    broadcastState(room);
    return;
  }

  if (message.type === "ready") {
    if (room.phase !== "intermission" || !player.pickedRelic) return;
    player.ready = !player.ready;
    broadcastState(room);
    maybeAdvance(room);
    return;
  }

  if (message.type === "add-bot") {
    if (room.phase !== "lobby" || !player.host) return;
    if (room.players.length >= MAX_PLAYERS) return sendError(ws, "The table already has four seats.");
    const botNumber = room.players.filter((seat) => seat.isBot).length + 1;
    const botNames = ["Marlowe", "June", "Otis"];
    const bot = createPlayer(botNames[(botNumber - 1) % botNames.length], undefined, true);
    room.players.push(bot);
    rebalanceSeats(room);
    emit(room, {
      kind: "player-joined",
      playerId: bot.id,
      playerName: bot.name
    });
    broadcastState(room);
    return;
  }

  if (message.type === "remove-bot") {
    if (room.phase !== "lobby" || !player.host) return;
    const target = room.players.find((seat) => seat.id === message.playerId && seat.isBot);
    if (!target) return;
    room.players = room.players.filter((seat) => seat.id !== target.id);
    rebalanceSeats(room);
    emit(room, {
      kind: "player-left",
      playerId: target.id,
      playerName: target.name
    });
    broadcastState(room);
    return;
  }

  if (message.type === "restart") {
    if (room.phase !== "gameover" || !player.host) return;
    resetRun(room);
  }
}

wss.on("connection", (ws) => {
  connections.set(ws, {});

  ws.on("message", (data) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      return sendError(ws, "Message could not be read.");
    }

    if (!message || typeof message.type !== "string") return;
    if (message.type === "ping") {
      send(ws, { type: "pong", at: message.at });
      return;
    }

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
    const player = context?.player;
    const room = context?.room;
    if (!player || !room || player.ws !== ws) return;
    player.connected = false;
    player.ws = undefined;
    player.disconnectedAt = Date.now();
    player.host = false;
    rebalanceSeats(room);
    if (room.phase === "intermission") {
      if (!player.pickedRelic && player.relicChoices.length) {
        player.relics.push(player.relicChoices[0]);
        player.pickedRelic = true;
      }
      player.ready = true;
      maybeAdvance(room);
    }
    emit(room, {
      kind: "player-left",
      playerId: player.id,
      playerName: player.name
    });
    broadcastState(room);
    scheduleBots(room);
  });

  ws.on("error", () => {
    // The close handler performs the room bookkeeping.
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const hasConnectedHuman = room.players.some((player) => !player.isBot && player.connected);
    if (!hasConnectedHuman && now - room.createdAt > 15 * 60 * 1000) {
      if (room.transitionTimer) clearTimeout(room.transitionTimer);
      for (const timer of room.botTimers.values()) clearTimeout(timer);
      rooms.delete(code);
      continue;
    }

    if (room.phase === "lobby") {
      const stalePlayers = room.players.filter(
        (player) => !player.isBot && !player.connected && now - (player.disconnectedAt || now) > 2 * 60 * 1000
      );
      if (stalePlayers.length) {
        room.players = room.players.filter((player) => !stalePlayers.includes(player));
        rebalanceSeats(room);
        broadcastState(room);
      }
    }
  }
}, 30_000).unref();

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Online Card Game listening on :${PORT}`);
});
