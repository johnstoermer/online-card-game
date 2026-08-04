import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import WebSocket from "ws";
import type { ClientMessage, RoomView, ServerMessage } from "../shared/types";

const port = 18193;
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

beforeAll(async () => {
  server = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/index.ts"], {
    cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: "pipe"
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
