import WebSocket from "ws";

const socketUrl = process.env.QA_WS_URL || "ws://localhost:8080";

class TestSeat {
  constructor(name) {
    this.name = name;
    this.socket = new WebSocket(socketUrl);
    this.state = null;
    this.clientId = "";
    this.roomCode = "";
    this.events = [];
    this.messageWaiters = [];
    this.stateWaiters = [];

    this.socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === "welcome") {
        this.clientId = message.clientId;
        this.roomCode = message.roomCode;
        this.state = message.state;
      } else if (message.type === "state") {
        this.state = message.state;
      } else if (message.type === "event") {
        this.events.push(message.event);
      } else if (message.type === "error") {
        throw new Error(`${this.name} received a server error: ${message.message}`);
      }

      this.messageWaiters = this.messageWaiters.filter((waiter) => {
        if (!waiter.predicate(message)) return true;
        clearTimeout(waiter.timer);
        waiter.resolve(message);
        return false;
      });
      this.flushStateWaiters();
    });
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
  }

  send(message) {
    this.socket.send(JSON.stringify(message));
  }

  waitForMessage(predicate, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${this.name} timed out waiting for a server message.`)),
        timeout
      );
      this.messageWaiters.push({ predicate, resolve, timer });
    });
  }

  waitForState(predicate, timeout = 5000) {
    if (this.state && predicate(this.state)) return Promise.resolve(this.state);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${this.name} timed out waiting for room state.`)),
        timeout
      );
      this.stateWaiters.push({ predicate, resolve, timer });
    });
  }

  flushStateWaiters() {
    if (!this.state) return;
    this.stateWaiters = this.stateWaiters.filter((waiter) => {
      if (!waiter.predicate(this.state)) return true;
      clearTimeout(waiter.timer);
      waiter.resolve(this.state);
      return false;
    });
  }

  ownPlayer() {
    return this.state?.players.find((player) => player.id === this.clientId);
  }

  close() {
    this.socket.close();
  }
}

async function createTable(host) {
  await host.open();
  const welcome = host.waitForMessage((message) => message.type === "welcome");
  host.send({ type: "create", name: host.name });
  await welcome;
}

async function joinTable(guest, roomCode) {
  await guest.open();
  const welcome = guest.waitForMessage((message) => message.type === "welcome");
  guest.send({ type: "join", code: roomCode, name: guest.name });
  await welcome;
}

async function playRemainingHands(seat) {
  while (seat.state?.phase === "playing" && (seat.ownPlayer()?.handsLeft ?? 0) > 0) {
    const before = seat.ownPlayer().handsLeft;
    const resolved = seat.waitForState(
      (state) =>
        state.phase !== "playing" ||
        state.players.find((player) => player.id === seat.clientId)?.handsLeft < before
    );
    seat.send({
      type: "play",
      cardIds: seat.state.hand.slice(0, 5).map((card) => card.id)
    });
    await resolved;
  }
}

async function installAndReady(seat) {
  const choice = seat.state?.relicChoices[0];
  if (!choice) throw new Error(`${seat.name} was not offered a table piece.`);
  const picked = seat.waitForState(
    (state) => state.players.find((player) => player.id === seat.clientId)?.pickedRelic
  );
  seat.send({ type: "pick-relic", relicId: choice });
  await picked;

  const ready = seat.waitForState(
    (state) =>
      state.phase !== "intermission" ||
      Boolean(state.players.find((player) => player.id === seat.clientId)?.ready)
  );
  seat.send({ type: "ready" });
  await ready;
}

const host = new TestSeat("Iris");
const guest = new TestSeat("Nico");

try {
  await createTable(host);
  await joinTable(guest, host.roomCode);

  const versusSet = host.waitForState((state) => state.mode === "versus");
  host.send({ type: "set-mode", mode: "versus" });
  await versusSet;

  const started = host.waitForState((state) => state.phase === "playing");
  host.send({ type: "start" });
  await started;
  await guest.waitForState((state) => state.phase === "playing");

  for (let roundGuard = 0; roundGuard < 8 && host.state.phase !== "gameover"; roundGuard += 1) {
    const round = host.state.round;
    await playRemainingHands(host);
    await playRemainingHands(guest);
    await host.waitForState((state) => state.phase !== "playing");
    await guest.waitForState((state) => state.phase !== "playing");

    if (host.state.phase === "gameover") break;
    if (host.state.phase !== "intermission") {
      throw new Error(`Round ${round} ended in the unexpected phase ${host.state.phase}.`);
    }

    await installAndReady(host);
    await installAndReady(guest);
    await host.waitForState(
      (state) => state.phase === "gameover" || (state.phase === "playing" && state.round > round),
      4000
    );
    await guest.waitForState(
      (state) => state.phase === "gameover" || (state.phase === "playing" && state.round > round),
      4000
    );
  }

  if (host.state?.phase !== "gameover") {
    throw new Error("The versus match did not finish within eight rounds.");
  }
  if (!host.state.matchWinnerIds.length) {
    throw new Error("The completed versus match has no winner.");
  }
  const winner = host.state.players.find((player) =>
    host.state.matchWinnerIds.includes(player.id)
  );
  if (!winner || winner.roundWins < 3) {
    throw new Error("The match winner did not reach three round wins.");
  }
  if (!host.events.some((event) => event.kind === "match-won")) {
    throw new Error("The server did not emit the match-won event.");
  }

  console.log(
    `Versus protocol QA passed: ${winner.name} won room ${host.roomCode} in ${host.state.round} rounds with ${winner.relics.length} table pieces.`
  );
} finally {
  host.close();
  guest.close();
}
