import WebSocket from "ws";

const url = process.env.QA_WS_URL || "ws://127.0.0.1:8080";
const ws = new WebSocket(url);
const messages = [];
ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
const send = (message) => ws.send(JSON.stringify(message));
async function waitFor(predicate, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const index = messages.findIndex(predicate);
    if (index >= 0) return messages.splice(index, 1)[0];
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Protocol timeout. Recent messages: ${JSON.stringify(messages.slice(-4))}`);
}

try {
  send({ type: "create", name: "Protocol QA" });
  const welcome = await waitFor((message) => message.type === "welcome");
  if (welcome.state.players.length !== 4 || welcome.state.players.filter((player) => player.isBot).length !== 3) throw new Error("Room did not contain one human and three bots.");
  send({ type: "start" });
  let state = await waitFor((message) => message.type === "state" && message.state.phase === "bidding").then((message) => message.state);
  const clientSeat = state.players.find((player) => player.id === welcome.clientId).seat;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && state.phase !== "hand-end" && state.phase !== "gameover") {
    if (state.turnSeat === clientSeat) {
      if (state.phase === "bidding") {
        if (state.bidRound === 1) send({ type: "bid", action: "order-up" });
        else send({ type: "bid", action: "call", suit: state.callableSuits[0] });
      } else if (state.phase === "playing") send({ type: "play-card", cardId: state.legalCardIds[0] });
    }
    state = await waitFor((message) => message.type === "state" && message.state.eventNumber >= state.eventNumber, 10000).then((message) => message.state);
  }
  if (state.completedTricks.length !== 5) throw new Error(`Expected five tricks, received ${state.completedTricks.length}.`);
  if (state.teamScores[0] + state.teamScores[1] < 1) throw new Error("Completed hand did not award points.");
  console.log(`Protocol QA passed for ${welcome.roomCode}: complete bid/play/score cycle with ${state.teamScores.join("–")} score.`);
} finally { ws.close(); }
