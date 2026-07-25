import type {
  BossDefinition,
  Card,
  HandKey,
  RelicDefinition,
  ScoreBreakdown,
  Suit
} from "./types.js";
import { SUITS } from "./types.js";

export const HANDS: Record<
  HandKey,
  { label: string; chips: number; multiplier: number; order: number }
> = {
  "high-card": { label: "High Card", chips: 5, multiplier: 1, order: 0 },
  pair: { label: "Pair", chips: 10, multiplier: 2, order: 1 },
  "two-pair": { label: "Two Pair", chips: 20, multiplier: 2, order: 2 },
  "three-kind": { label: "Three of a Kind", chips: 30, multiplier: 3, order: 3 },
  straight: { label: "Straight", chips: 30, multiplier: 4, order: 4 },
  flush: { label: "Flush", chips: 35, multiplier: 4, order: 5 },
  "full-house": { label: "Full House", chips: 40, multiplier: 4, order: 6 },
  "four-kind": { label: "Four of a Kind", chips: 60, multiplier: 7, order: 7 },
  "straight-flush": { label: "Straight Flush", chips: 100, multiplier: 8, order: 8 },
  "royal-flush": { label: "Royal Flush", chips: 120, multiplier: 10, order: 9 }
};

export const RELICS: RelicDefinition[] = [
  {
    id: "brass-knuckle",
    name: "Brass Knuckle",
    description: "Pairs and stronger hands gain +2 multiplier.",
    short: "PAIR +2 MULT",
    tone: "copper"
  },
  {
    id: "red-lens",
    name: "Red Lens",
    description: "Every heart in a played hand adds 8 chips.",
    short: "HEART +8",
    tone: "red"
  },
  {
    id: "stone-index",
    name: "Stone Index",
    description: "Hands made with exactly four cards gain +3 multiplier.",
    short: "FOUR +3 MULT",
    tone: "ivory"
  },
  {
    id: "echo-coil",
    name: "Echo Coil",
    description: "Changing the team's last hand type adds +2 multiplier.",
    short: "ECHO +2 MULT",
    tone: "blue"
  },
  {
    id: "crown-wire",
    name: "Crown Wire",
    description: "Kings, queens, and jacks add 7 chips each.",
    short: "FACE +7",
    tone: "copper"
  },
  {
    id: "black-key",
    name: "Black Key",
    description: "Every two spades in a played hand add +1 multiplier.",
    short: "2 SPADES +1",
    tone: "black"
  },
  {
    id: "green-felt",
    name: "Green Felt",
    description: "Flushes and straight flushes gain 45 chips.",
    short: "FLUSH +45",
    tone: "green"
  },
  {
    id: "ace-bearing",
    name: "Ace Bearing",
    description: "Each ace adds 18 chips and the first adds +1 multiplier.",
    short: "ACE POWER",
    tone: "ivory"
  },
  {
    id: "short-circuit",
    name: "Short Circuit",
    description: "Hands using three or fewer cards gain +4 multiplier.",
    short: "SHORT +4 MULT",
    tone: "red"
  },
  {
    id: "double-clutch",
    name: "Double Clutch",
    description: "Two Pair and Full House hands gain 60 chips.",
    short: "PAIRWORK +60",
    tone: "blue"
  },
  {
    id: "odd-gear",
    name: "Odd Gear",
    description: "Odd-ranked cards add 6 chips each.",
    short: "ODD +6",
    tone: "green"
  },
  {
    id: "last-call",
    name: "Last Call",
    description: "Your final hand each round gains +5 multiplier.",
    short: "LAST +5 MULT",
    tone: "black"
  }
];

export const BOSSES: BossDefinition[] = [
  {
    id: "counterfeit",
    name: "The Counterfeit",
    rule: "Face cards contribute no card chips."
  },
  {
    id: "house-light",
    name: "The House Light",
    rule: "Repeating the team's last hand loses half its multiplier."
  },
  {
    id: "red-knife",
    name: "The Red Knife",
    rule: "Hearts are worth 2 chips, but black suits gain 5."
  }
];

export function createDeck(seedPrefix = ""): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank += 1) {
      cards.push({ id: `${seedPrefix}${suit[0]}-${rank}`, suit, rank });
    }
  }
  return cards;
}

export function shuffled<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function isStraight(ranks: number[]): boolean {
  const unique = [...new Set(ranks)].sort((a, b) => a - b);
  if (unique.length !== 5) return false;
  if (unique.join(",") === "2,3,4,5,14") return true;
  return unique[4] - unique[0] === 4;
}

export function evaluateHand(cards: Card[]): HandKey {
  if (!cards.length) return "high-card";
  const counts = new Map<number, number>();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flush = cards.length === 5 && cards.every((card) => card.suit === cards[0].suit);
  const straight = cards.length === 5 && isStraight(cards.map((card) => card.rank));
  const ranks = cards.map((card) => card.rank).sort((a, b) => a - b);

  if (straight && flush && ranks.includes(14) && ranks.includes(10)) return "royal-flush";
  if (straight && flush) return "straight-flush";
  if (groups[0] === 4) return "four-kind";
  if (groups[0] === 3 && groups[1] === 2) return "full-house";
  if (flush) return "flush";
  if (straight) return "straight";
  if (groups[0] === 3) return "three-kind";
  if (groups[0] === 2 && groups[1] === 2) return "two-pair";
  if (groups[0] === 2) return "pair";
  return "high-card";
}

function baseCardChips(card: Card): number {
  if (card.rank === 14) return 11;
  return Math.min(card.rank, 10);
}

export interface ScoreContext {
  relicIds: string[];
  previousHand: HandKey | null;
  chain: number;
  boss: BossDefinition | null;
  handsLeftBeforePlay: number;
}

export function scoreHand(cards: Card[], context: ScoreContext): ScoreBreakdown {
  const hand = evaluateHand(cards);
  const definition = HANDS[hand];
  const notes: string[] = [];
  let cardChips = cards.reduce((sum, card) => sum + baseCardChips(card), 0);
  let bonusChips = 0;
  let bonusMultiplier = 0;
  let bossMultiplier = 1;
  const has = (id: string) => context.relicIds.includes(id);

  if (has("brass-knuckle") && HANDS[hand].order >= HANDS.pair.order) {
    bonusMultiplier += 2;
    notes.push("Brass Knuckle +2 mult");
  }
  if (has("red-lens")) {
    const bonus = cards.filter((card) => card.suit === "hearts").length * 8;
    bonusChips += bonus;
    if (bonus) notes.push(`Red Lens +${bonus} chips`);
  }
  if (has("stone-index") && cards.length === 4) {
    bonusMultiplier += 3;
    notes.push("Stone Index +3 mult");
  }
  if (has("echo-coil") && context.previousHand && context.previousHand !== hand) {
    bonusMultiplier += 2;
    notes.push("Echo Coil +2 mult");
  }
  if (has("crown-wire")) {
    const bonus = cards.filter((card) => card.rank >= 11 && card.rank <= 13).length * 7;
    bonusChips += bonus;
    if (bonus) notes.push(`Crown Wire +${bonus} chips`);
  }
  if (has("black-key")) {
    const bonus = Math.floor(cards.filter((card) => card.suit === "spades").length / 2);
    bonusMultiplier += bonus;
    if (bonus) notes.push(`Black Key +${bonus} mult`);
  }
  if (has("green-felt") && (hand === "flush" || hand === "straight-flush" || hand === "royal-flush")) {
    bonusChips += 45;
    notes.push("Green Felt +45 chips");
  }
  if (has("ace-bearing")) {
    const aces = cards.filter((card) => card.rank === 14).length;
    bonusChips += aces * 18;
    bonusMultiplier += aces ? 1 : 0;
    if (aces) notes.push(`Ace Bearing +${aces * 18} chips, +1 mult`);
  }
  if (has("short-circuit") && cards.length <= 3) {
    bonusMultiplier += 4;
    notes.push("Short Circuit +4 mult");
  }
  if (has("double-clutch") && (hand === "two-pair" || hand === "full-house")) {
    bonusChips += 60;
    notes.push("Double Clutch +60 chips");
  }
  if (has("odd-gear")) {
    const bonus = cards.filter((card) => card.rank % 2 === 1).length * 6;
    bonusChips += bonus;
    if (bonus) notes.push(`Odd Gear +${bonus} chips`);
  }
  if (has("last-call") && context.handsLeftBeforePlay === 1) {
    bonusMultiplier += 5;
    notes.push("Last Call +5 mult");
  }

  if (context.boss?.id === "counterfeit") {
    const removed = cards
      .filter((card) => card.rank >= 11 && card.rank <= 13)
      .reduce((sum, card) => sum + baseCardChips(card), 0);
    cardChips -= removed;
    if (removed) notes.push(`Counterfeit −${removed} face chips`);
  }
  if (context.boss?.id === "house-light" && context.previousHand === hand) {
    bossMultiplier = 0.5;
    notes.push("House Light halves multiplier");
  }
  if (context.boss?.id === "red-knife") {
    let adjustment = 0;
    for (const card of cards) {
      const normal = baseCardChips(card);
      adjustment += card.suit === "hearts" ? 2 - normal : card.suit === "clubs" || card.suit === "spades" ? 5 : 0;
    }
    cardChips += adjustment;
    notes.push(adjustment >= 0 ? `Red Knife +${adjustment} chips` : `Red Knife ${adjustment} chips`);
  }

  const changed = Boolean(context.previousHand && context.previousHand !== hand);
  const chain = changed ? Math.min(5, context.chain + 1) : 0;
  const chainMultiplier = 1 + chain * 0.15;
  if (chain) notes.push(`Echo chain ×${chainMultiplier.toFixed(2)}`);

  const finalChips = Math.max(0, definition.chips + cardChips + bonusChips);
  const rawMultiplier = Math.max(1, definition.multiplier + bonusMultiplier);
  const finalMultiplier = rawMultiplier * chainMultiplier * bossMultiplier;
  const total = Math.max(1, Math.round(finalChips * finalMultiplier));

  return {
    hand,
    handLabel: definition.label,
    baseChips: definition.chips,
    cardChips,
    bonusChips,
    baseMultiplier: definition.multiplier,
    bonusMultiplier,
    chainMultiplier,
    bossMultiplier,
    finalChips,
    finalMultiplier,
    total,
    chain,
    notes
  };
}

export function roundTarget(round: number, playerCount: number): number {
  const seats = Math.max(1, playerCount);
  const base = 260 + (seats - 1) * 205;
  const growth = Math.pow(1.58, round - 1);
  const bossBump = round % 3 === 0 ? 1.12 : 1;
  return Math.round((base * growth * bossBump) / 10) * 10;
}

export function bossForRound(round: number): BossDefinition | null {
  if (round % 3 !== 0) return null;
  return BOSSES[(round / 3 - 1) % BOSSES.length];
}

export function labelForRank(rank: number): string {
  if (rank === 14) return "A";
  if (rank === 13) return "K";
  if (rank === 12) return "Q";
  if (rank === 11) return "J";
  return String(rank);
}

export function symbolForSuit(suit: Suit): string {
  return { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" }[suit];
}
