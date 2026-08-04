export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export type Suit = (typeof SUITS)[number];
export const RANKS = [9, 10, 11, 12, 13, 14] as const;

export interface Card {
  id: string;
  suit: Suit;
  rank: number;
}

export type Team = 0 | 1;
export type RoomPhase = "lobby" | "bidding" | "playing" | "hand-end" | "gameover";

export interface PublicPlayer {
  id: string;
  name: string;
  seat: number;
  team: Team;
  color: string;
  connected: boolean;
  host: boolean;
  isBot: boolean;
  handCount: number;
  tricks: number;
}

export interface PlayedCard {
  seat: number;
  card: Card;
}

export interface CompletedTrick {
  leaderSeat: number;
  winnerSeat: number;
  cards: PlayedCard[];
}

export interface HistoryEntry {
  id: number;
  text: string;
  tone: "neutral" | "bid" | "trick" | "score";
}

export interface RoomView {
  code: string;
  phase: RoomPhase;
  players: PublicPlayer[];
  hand: Card[];
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
  legalCardIds: string[];
  canPass: boolean;
  callableSuits: Suit[];
  history: HistoryEntry[];
  eventNumber: number;
  createdAt: number;
}

export type GameEvent =
  | { kind: "hand-dealt"; eventNumber: number; handNumber: number; dealerSeat: number; upcard: Card }
  | { kind: "player-passed"; eventNumber: number; playerId: string; playerName: string; round: 1 | 2 }
  | { kind: "trump-called"; eventNumber: number; playerId: string; playerName: string; trump: Suit; alone: boolean; orderedUp: boolean }
  | { kind: "card-played"; eventNumber: number; playerId: string; playerName: string; seat: number; card: Card }
  | { kind: "trick-won"; eventNumber: number; winnerSeat: number; winnerName: string; team: Team; trickNumber: number }
  | { kind: "hand-scored"; eventNumber: number; scoringTeam: Team; points: number; makersTeam: Team; makerTricks: number; euchred: boolean; march: boolean; alone: boolean }
  | { kind: "match-won"; eventNumber: number; team: Team }
  | { kind: "player-joined" | "player-left"; eventNumber: number; playerId: string; playerName: string; seat: number };

export type ClientMessage =
  | { type: "create"; name: string; sessionId?: string }
  | { type: "join"; code: string; name: string; sessionId?: string }
  | { type: "start" }
  | { type: "bid"; action: "pass" | "order-up" | "call"; suit?: Suit; alone?: boolean }
  | { type: "play-card"; cardId: string }
  | { type: "restart" }
  | { type: "ping"; at: number };

export type ServerMessage =
  | { type: "welcome"; clientId: string; sessionId: string; roomCode: string; state: RoomView }
  | { type: "state"; state: RoomView }
  | { type: "event"; event: GameEvent }
  | { type: "error"; message: string; code?: string }
  | { type: "pong"; at: number };
