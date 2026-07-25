export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export type Suit = (typeof SUITS)[number];

export interface Card {
  id: string;
  suit: Suit;
  rank: number;
}

export type HandKey =
  | "high-card"
  | "pair"
  | "two-pair"
  | "three-kind"
  | "straight"
  | "flush"
  | "full-house"
  | "four-kind"
  | "straight-flush"
  | "royal-flush";

export type RoomPhase = "lobby" | "playing" | "intermission" | "gameover";
export type GameMode = "cooperative" | "versus";

export interface RelicDefinition {
  id: string;
  name: string;
  description: string;
  short: string;
  tone: "copper" | "red" | "ivory" | "black" | "green" | "blue";
  category: "feeder" | "pattern" | "rhythm" | "payoff";
  build: string;
}

export interface BossDefinition {
  id: string;
  name: string;
  rule: string;
}

export interface PublicPlayer {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  host: boolean;
  isBot: boolean;
  handCount: number;
  handsLeft: number;
  discardsLeft: number;
  roundScore: number;
  totalScore: number;
  roundWins: number;
  relics: string[];
  pickedRelic: boolean;
  ready: boolean;
}

export interface RoomView {
  code: string;
  phase: RoomPhase;
  mode: GameMode;
  round: number;
  target: number;
  teamScore: number;
  chain: number;
  lastHand: HandKey | null;
  boss: BossDefinition | null;
  players: PublicPlayer[];
  hand: Card[];
  deckRemaining: number;
  relicChoices: string[];
  ownRelics: string[];
  ownEngineState: Record<string, number>;
  roundWinnerIds: string[];
  matchWinnerIds: string[];
  eventNumber: number;
  createdAt: number;
}

export interface ScoreBreakdown {
  hand: HandKey;
  handLabel: string;
  baseChips: number;
  cardChips: number;
  bonusChips: number;
  baseMultiplier: number;
  bonusMultiplier: number;
  chainMultiplier: number;
  bossMultiplier: number;
  engineMultiplier: number;
  finalChips: number;
  finalMultiplier: number;
  total: number;
  chain: number;
  notes: string[];
  engineStateAfter: Record<string, number>;
  enginePulses: EnginePulse[];
}

export interface EnginePulse {
  relicId: string;
  label: string;
  detail: string;
  kind: "charge" | "grow" | "fire";
}

export type GameEvent =
  | {
      kind: "hand-played";
      eventNumber: number;
      playerId: string;
      playerName: string;
      cards: Card[];
      score: ScoreBreakdown;
    }
  | {
      kind: "cards-discarded";
      eventNumber: number;
      playerId: string;
      playerName: string;
      cards: Card[];
    }
  | {
      kind: "round-won";
      eventNumber: number;
      round: number;
      score: number;
      target: number;
      mode: GameMode;
      winnerIds: string[];
    }
  | {
      kind: "round-lost";
      eventNumber: number;
      round: number;
      score: number;
      target: number;
    }
  | {
      kind: "round-started";
      eventNumber: number;
      round: number;
      target: number;
      boss: BossDefinition | null;
    }
  | {
      kind: "match-won";
      eventNumber: number;
      winnerIds: string[];
      winnerNames: string[];
      round: number;
    }
  | {
      kind: "player-joined" | "player-left";
      eventNumber: number;
      playerId: string;
      playerName: string;
    }
  | {
      kind: "relic-picked";
      eventNumber: number;
      playerId: string;
      playerName: string;
      relicId: string;
      replacedRelicId?: string;
    };

export type ClientMessage =
  | { type: "create"; name: string; sessionId?: string }
  | { type: "join"; code: string; name: string; sessionId?: string }
  | { type: "start" }
  | { type: "set-mode"; mode: GameMode }
  | { type: "play"; cardIds: string[] }
  | { type: "discard"; cardIds: string[] }
  | { type: "pick-relic"; relicId: string; replaceId?: string }
  | { type: "ready" }
  | { type: "add-bot" }
  | { type: "remove-bot"; playerId: string }
  | { type: "restart" }
  | { type: "ping"; at: number };

export type ServerMessage =
  | {
      type: "welcome";
      clientId: string;
      sessionId: string;
      roomCode: string;
      state: RoomView;
    }
  | { type: "state"; state: RoomView }
  | { type: "event"; event: GameEvent }
  | { type: "error"; message: string; code?: string }
  | { type: "pong"; at: number };
