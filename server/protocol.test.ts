import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHmac } from "node:crypto";
import WebSocket from "ws";
import type { ClientMessage, RoomView, ServerMessage } from "../shared/types";

const port = 18193;
const identitySecret = "test-game-identity-key-longer-than-thirty-two-bytes";
let server: ChildProcessWithoutNullStreams;

class TestClient {
  ws: WebSocket;
  messages: ServerMessage[] = [];

  constructor() {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}`);
    this.ws.on("message", (data) => this.messages.push(JSON.parse(data.toString()) as ServerMessage));
  }

  async open(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
  }

  send(message: ClientMessage): void { this.ws.send(JSON.stringify(message)); }

  async waitFor<T extends ServerMessage>(predicate: (message: ServerMessage) => message is T): Promise<T> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const index = this.messages.findIndex(predicate);
      if (index >= 0) return this.messages.splice(index, 1)[0] as T;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for server message: ${JSON.stringify(this.messages)}`);
  }

  close(): void { this.ws.close(); }
}

const isWelcome = (message: ServerMessage): message is Extract<ServerMessage, { type: "welcome" }> => message.type === "welcome";
const isBiddingState = (message: ServerMessage): message is Extract<ServerMessage, { type: "state" }> => message.type === "state" && message.state.phase === "bidding";
const isQueueStatus = (message: ServerMessage): message is Extract<ServerMessage, { type: "queue-status" }> => message.type === "queue-status";

function identityToken(name: string, subject = "discord-player", expiresIn = 300): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: "herm-feedback", aud: "online-card-game", kind: "game-identity",
    sub: subject, name, iat: now, nbf: now - 5, exp: now + expiresIn
  })).toString("base64url");
  const signature = createHmac("sha256", identitySecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

beforeAll(async () => {
  server = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/index.ts"], {
    cwd: process.cwd(), env: {
      ...process.env, PORT: String(port), HERM_IDENTITY_SIGNING_KEY: identitySecret,
      QUEUE_DISCONNECT_GRACE_MS: "300"
    }, stdio: "pipe"
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Test server did not start.")), 5000);
    server.stdout.on("data", (data) => {
      if (data.toString().includes("Euchre Table listening")) { clearTimeout(timer); resolve(); }
    });
    server.once("exit", (code) => reject(new Error(`Test server exited with ${code}: ${server.stderr.read() || ""}`)));
  });
});

afterAll(() => { if (server && !server.killed) server.kill(); });

describe("server-authoritative euchre protocol", () => {
  it("atomically matches exactly four queued humans into a started partnership game", async () => {
    const clients = [new TestClient(), new TestClient(), new TestClient(), new TestClient()];
    await Promise.all(clients.map((client) => client.open()));
    for (let index = 0; index < clients.length; index += 1) {
      clients[index].send({ type: "queue-join", name: `Human ${index + 1}` });
      if (index < 3) {
        const status = await clients[index].waitFor(isQueueStatus);
        expect(status.playerCount).toBe(index + 1);
        expect(status.needed).toBe(3 - index);
      }
    }
    const welcomes = await Promise.all(clients.map((client) => client.waitFor(isWelcome)));
    expect(new Set(welcomes.map((welcome) => welcome.roomCode)).size).toBe(1);
    expect(welcomes.map((welcome) => welcome.state.players.find((player) => player.id === welcome.clientId)?.seat).sort()).toEqual([0, 1, 2, 3]);
    for (const welcome of welcomes) {
      expect(welcome.state.matchType).toBe("public");
      expect(welcome.state.phase).toBe("bidding");
      expect(welcome.state.players).toHaveLength(4);
      expect(welcome.state.players.every((player) => !player.isBot)).toBe(true);
      expect(welcome.state.players.map((player) => player.team)).toEqual([0, 1, 0, 1]);
    }
    clients.forEach((client) => client.close());
  });

  it("cancels authoritatively and does not double-queue one connection", async () => {
    const first = new TestClient(); const second = new TestClient();
    await first.open(); await second.open();
    first.send({ type: "queue-join", name: "Cancel Me" });
    await first.waitFor(isQueueStatus);
    first.send({ type: "queue-join", name: "Cancel Me Again" });
    const duplicateStatus = await first.waitFor(isQueueStatus);
    expect(duplicateStatus.playerCount).toBe(1);
    second.send({ type: "queue-join", name: "Still Here" });
    await second.waitFor((message): message is Extract<ServerMessage, { type: "queue-status" }> => message.type === "queue-status" && message.playerCount === 2);
    first.send({ type: "queue-cancel" });
    await first.waitFor((message): message is Extract<ServerMessage, { type: "queue-cancelled" }> => message.type === "queue-cancelled");
    const remaining = await second.waitFor((message): message is Extract<ServerMessage, { type: "queue-status" }> => message.type === "queue-status" && message.playerCount === 1);
    expect(remaining.needed).toBe(3);
    second.send({ type: "queue-cancel" });
    first.close(); second.close();
  });

  it("reconnects a queued session during grace and removes it after disconnect expiry", async () => {
    const original = new TestClient(); await original.open();
    original.send({ type: "queue-join", name: "Reconnect Me" });
    const waiting = await original.waitFor(isQueueStatus);
    original.close();

    const resumed = new TestClient(); await resumed.open();
    resumed.send({ type: "queue-join", name: "Reconnect Me", queueSessionId: waiting.queueSessionId });
    const resumedStatus = await resumed.waitFor(isQueueStatus);
    expect(resumedStatus.queueSessionId).toBe(waiting.queueSessionId);
    expect(resumedStatus.playerCount).toBe(1);
    resumed.close();
    await new Promise((resolve) => setTimeout(resolve, 750));

    const observer = new TestClient(); await observer.open();
    observer.send({ type: "queue-join", name: "Observer" });
    const observerStatus = await observer.waitFor(isQueueStatus);
    expect(observerStatus.playerCount).toBe(1);
    observer.send({ type: "queue-cancel" }); observer.close();
  });

  it("trusts signed Discord identity, rejects duplicate identity, and sanitizes local fallback names", async () => {
    const trusted = new TestClient(); await trusted.open();
    const token = identityToken("Discord <Ace>", "same-discord-user");
    trusted.send({ type: "queue-join", name: "Browser Impostor", identityToken: token });
    const trustedStatus = await trusted.waitFor(isQueueStatus);
    expect(trustedStatus.name).toBe("Discord Ace");
    expect(trustedStatus.identitySource).toBe("discord");

    const duplicate = new TestClient(); await duplicate.open();
    duplicate.send({ type: "queue-join", name: "Another Claim", identityToken: token });
    const duplicateError = await duplicate.waitFor((message): message is Extract<ServerMessage, { type: "error" }> => message.type === "error");
    expect(duplicateError.code).toBe("ALREADY_QUEUED");

    const fallback = new TestClient(); await fallback.open();
    fallback.send({ type: "create", name: "  Local <Player>   With A Very Very Long Name  ", identityToken: `${token}tampered` });
    const fallbackWelcome = await fallback.waitFor(isWelcome);
    const fallbackPlayer = fallbackWelcome.state.players.find((player) => player.id === fallbackWelcome.clientId)!;
    expect(fallbackWelcome.identitySource).toBe("local");
    expect(fallbackPlayer.name).toBe("Local Player With A Very");
    expect(Array.from(fallbackPlayer.name)).toHaveLength(24);

    trusted.send({ type: "queue-cancel" });
    trusted.close(); duplicate.close(); fallback.close();
  });

  it("creates four fixed seats, lets a human take a bot seat, starts, and reconnects in-seat", async () => {
    const host = new TestClient();
    await host.open();
    host.send({ type: "create", name: "Ada" });
    const hostWelcome = await host.waitFor(isWelcome);
    expect(hostWelcome.state.players).toHaveLength(4);
    expect(hostWelcome.state.players.filter((player) => player.isBot)).toHaveLength(3);
    expect(hostWelcome.state.players.map((player) => player.team)).toEqual([0, 1, 0, 1]);

    const guest = new TestClient();
    await guest.open();
    guest.send({ type: "join", code: hostWelcome.roomCode, name: "Lin" });
    const guestWelcome = await guest.waitFor(isWelcome);
    expect(guestWelcome.state.players.filter((player) => player.isBot)).toHaveLength(2);
    expect(guestWelcome.state.players.find((player) => player.id === guestWelcome.clientId)?.seat).toBe(1);

    host.send({ type: "start" });
    const started = await host.waitFor(isBiddingState);
    expect(started.state.hand).toHaveLength(5);
    expect(started.state.upcard).not.toBeNull();
    expect(started.state.turnSeat).toBe(1);

    guest.close();
    const returning = new TestClient();
    await returning.open();
    returning.send({ type: "join", code: hostWelcome.roomCode, name: "Lin", sessionId: guestWelcome.sessionId });
    const resumed = await returning.waitFor(isWelcome);
    expect(resumed.clientId).toBe(guestWelcome.clientId);
    expect(resumed.state.phase).toBe("bidding");
    expect(resumed.state.players.find((player) => player.id === resumed.clientId)?.seat).toBe(1);

    host.close(); returning.close();
  });

  it("rejects out-of-turn bids without mutating the active seat", async () => {
    const host = new TestClient(); await host.open(); host.send({ type: "create", name: "Grace" });
    const welcome = await host.waitFor(isWelcome); host.send({ type: "start" });
    const started = await host.waitFor(isBiddingState);
    expect(started.state.turnSeat).toBe(1);
    host.send({ type: "bid", action: "order-up" });
    const error = await host.waitFor((message): message is Extract<ServerMessage, { type: "error" }> => message.type === "error");
    expect(error.message).toContain("not your turn");
    host.send({ type: "ping", at: 42 });
    const pong = await host.waitFor((message): message is Extract<ServerMessage, { type: "pong" }> => message.type === "pong");
    expect(pong.at).toBe(42);
    host.close();
  });
});
