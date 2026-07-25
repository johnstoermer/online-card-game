import type {
  BossDefinition,
  Card,
  EnginePulse,
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
    description: "Pair-or-better hands gain +2 mult, then permanently calibrate this part by +0.5 mult.",
    short: "PAIR SCALER",
    tone: "copper",
    category: "pattern",
    build: "Pairs grow multiplier"
  },
  {
    id: "red-lens",
    name: "Red Lens",
    description: "Hearts add 8 chips each. Every 10 hearts logged raises their value by 2 chips.",
    short: "HEART FEEDER",
    tone: "red",
    category: "feeder",
    build: "Hearts become chips"
  },
  {
    id: "stone-index",
    name: "Stone Index",
    description: "Exactly four cards gain +3 mult. Every trigger permanently adds another +1 mult.",
    short: "FOUR SCALER",
    tone: "ivory",
    category: "pattern",
    build: "Four-card hands scale"
  },
  {
    id: "echo-coil",
    name: "Echo Coil",
    description: "Changing the table's last hand charges the coil. Three charges fire a ×2 payoff.",
    short: "CHAIN PAYOFF",
    tone: "blue",
    category: "payoff",
    build: "Variety fires ×2"
  },
  {
    id: "crown-wire",
    name: "Crown Wire",
    description: "Face cards add 7 chips each. Every 6 faces logged raises their value by 2 chips.",
    short: "FACE FEEDER",
    tone: "copper",
    category: "feeder",
    build: "Faces become chips"
  },
  {
    id: "black-key",
    name: "Black Key",
    description: "Every 5 spades logged permanently adds +1 mult to every future hand.",
    short: "SPADE BANK",
    tone: "black",
    category: "rhythm",
    build: "Spades bank multiplier"
  },
  {
    id: "green-felt",
    name: "Green Felt",
    description: "Flushes gain 45 chips, then this part permanently grows by 15 chips.",
    short: "FLUSH SCALER",
    tone: "green",
    category: "pattern",
    build: "Flushes grow chips"
  },
  {
    id: "ace-bearing",
    name: "Ace Bearing",
    description: "Aces charge the bearing across hands. Every third ace fires a ×2.25 payoff.",
    short: "ACE PAYOFF",
    tone: "ivory",
    category: "payoff",
    build: "Three aces fire ×2.25"
  },
  {
    id: "short-circuit",
    name: "Short Circuit",
    description: "Three-card-or-smaller hands gain +4 mult and build a growing short-hand streak.",
    short: "SHORT RHYTHM",
    tone: "red",
    category: "rhythm",
    build: "Small hands chain mult"
  },
  {
    id: "double-clutch",
    name: "Double Clutch",
    description: "Two Pair and Full House gain 60 chips. Every trigger permanently adds 20 chips.",
    short: "PAIRWORK",
    tone: "blue",
    category: "pattern",
    build: "Pair patterns scale"
  },
  {
    id: "odd-gear",
    name: "Odd Gear",
    description: "Odd ranks add 6 chips each. Every 8 odd cards logged raises their value by 2 chips.",
    short: "ODD FEEDER",
    tone: "green",
    category: "feeder",
    build: "Odd ranks become chips"
  },
  {
    id: "last-call",
    name: "Last Call",
    description: "Your final hand each round multiplies the finished engine by ×1.75.",
    short: "FINAL PAYOFF",
    tone: "black",
    category: "payoff",
    build: "Last hand fires ×1.75"
  }
];

export const MAX_ENGINE_SLOTS = 5;
export const VERSUS_WINS_TO_MATCH = 3;

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
  engineState?: Record<string, number>;
  previousHand: HandKey | null;
  chain: number;
  boss: BossDefinition | null;
  handsLeftBeforePlay: number;
}

export function scoreHand(cards: Card[], context: ScoreContext): ScoreBreakdown {
  const hand = evaluateHand(cards);
  const definition = HANDS[hand];
  const notes: string[] = [];
  const enginePulses: EnginePulse[] = [];
  const engineStateAfter = { ...(context.engineState ?? {}) };
  let cardChips = cards.reduce((sum, card) => sum + baseCardChips(card), 0);
  let bonusChips = 0;
  let bonusMultiplier = 0;
  let bossMultiplier = 1;
  let engineMultiplier = 1;
  const has = (id: string) => context.relicIds.includes(id);
  const state = (id: string) => engineStateAfter[id] ?? 0;
  const setState = (id: string, value: number) => {
    engineStateAfter[id] = value;
  };
  const pulse = (
    relicId: string,
    label: string,
    detail: string,
    kind: EnginePulse["kind"]
  ) => enginePulses.push({ relicId, label, detail, kind });

  if (has("brass-knuckle") && HANDS[hand].order >= HANDS.pair.order) {
    const calibration = state("brass-knuckle");
    const bonus = 2 + calibration * 0.5;
    bonusMultiplier += bonus;
    setState("brass-knuckle", calibration + 1);
    notes.push(`Brass Knuckle +${bonus.toFixed(bonus % 1 ? 1 : 0)} mult`);
    pulse("brass-knuckle", "Brass Knuckle", `Calibrated to +${(2 + (calibration + 1) * 0.5).toFixed(1)} mult`, "grow");
  }
  if (has("red-lens")) {
    const hearts = cards.filter((card) => card.suit === "hearts").length;
    const logged = state("red-lens");
    const value = 8 + Math.floor(logged / 10) * 2;
    const bonus = hearts * value;
    bonusChips += bonus;
    if (hearts) {
      const next = logged + hearts;
      setState("red-lens", next);
      notes.push(`Red Lens +${bonus} chips`);
      const grew = Math.floor(next / 10) > Math.floor(logged / 10);
      pulse("red-lens", "Red Lens", grew ? `Calibrated: hearts now +${value + 2}` : `${next % 10}/10 hearts logged`, grew ? "grow" : "charge");
    }
  }
  if (has("stone-index") && cards.length === 4) {
    const triggers = state("stone-index");
    const bonus = 3 + triggers;
    bonusMultiplier += bonus;
    setState("stone-index", triggers + 1);
    notes.push(`Stone Index +${bonus} mult`);
    pulse("stone-index", "Stone Index", `Grew to +${bonus + 1} mult`, "grow");
  }
  if (has("echo-coil") && context.previousHand && context.previousHand !== hand) {
    let charge = state("echo-coil") + 1;
    if (charge >= 3) {
      engineMultiplier *= 2;
      charge -= 3;
      notes.push("Echo Coil ×2");
      pulse("echo-coil", "Echo Coil", "Discharged ×2", "fire");
    } else {
      pulse("echo-coil", "Echo Coil", `${charge}/3 charge`, "charge");
    }
    setState("echo-coil", charge);
  }
  if (has("crown-wire")) {
    const faces = cards.filter((card) => card.rank >= 11 && card.rank <= 13).length;
    const logged = state("crown-wire");
    const value = 7 + Math.floor(logged / 6) * 2;
    const bonus = faces * value;
    bonusChips += bonus;
    if (faces) {
      const next = logged + faces;
      setState("crown-wire", next);
      notes.push(`Crown Wire +${bonus} chips`);
      const grew = Math.floor(next / 6) > Math.floor(logged / 6);
      pulse("crown-wire", "Crown Wire", grew ? `Calibrated: faces now +${value + 2}` : `${next % 6}/6 faces logged`, grew ? "grow" : "charge");
    }
  }
  if (has("black-key")) {
    const spades = cards.filter((card) => card.suit === "spades").length;
    const logged = state("black-key");
    const next = logged + spades;
    const tier = Math.floor(next / 5);
    bonusMultiplier += tier;
    setState("black-key", next);
    if (tier) notes.push(`Black Key +${tier} mult`);
    if (spades) {
      const grew = Math.floor(next / 5) > Math.floor(logged / 5);
      pulse("black-key", "Black Key", grew ? `Bank raised to +${tier} mult` : `${next % 5}/5 spades to next mult`, grew ? "grow" : "charge");
    }
  }
  if (has("green-felt") && (hand === "flush" || hand === "straight-flush" || hand === "royal-flush")) {
    const triggers = state("green-felt");
    const bonus = 45 + triggers * 15;
    bonusChips += bonus;
    setState("green-felt", triggers + 1);
    notes.push(`Green Felt +${bonus} chips`);
    pulse("green-felt", "Green Felt", `Grew to +${bonus + 15} chips`, "grow");
  }
  if (has("ace-bearing")) {
    const aces = cards.filter((card) => card.rank === 14).length;
    if (aces) {
      let charge = state("ace-bearing") + aces;
      const fires = Math.floor(charge / 3);
      if (fires) {
        const payoff = Math.pow(2.25, fires);
        engineMultiplier *= payoff;
        charge %= 3;
        notes.push(`Ace Bearing ×${payoff.toFixed(2)}`);
        pulse(
          "ace-bearing",
          "Ace Bearing",
          fires > 1 ? `Bearing fired ${fires} times · ×${payoff.toFixed(2)}` : "Bearing fired ×2.25",
          "fire"
        );
      } else {
        pulse("ace-bearing", "Ace Bearing", `${charge}/3 aces charged`, "charge");
      }
      setState("ace-bearing", charge);
    }
  }
  if (has("short-circuit")) {
    if (cards.length <= 3) {
      const streak = state("short-circuit") + 1;
      const bonus = 3 + streak;
      bonusMultiplier += bonus;
      setState("short-circuit", streak);
      notes.push(`Short Circuit +${bonus} mult`);
      pulse("short-circuit", "Short Circuit", `${streak} hand streak; next +${bonus + 1} mult`, "grow");
    } else if (state("short-circuit")) {
      setState("short-circuit", 0);
      pulse("short-circuit", "Short Circuit", "Streak reset", "charge");
    }
  }
  if (has("double-clutch") && (hand === "two-pair" || hand === "full-house")) {
    const triggers = state("double-clutch");
    const bonus = 60 + triggers * 20;
    bonusChips += bonus;
    setState("double-clutch", triggers + 1);
    notes.push(`Double Clutch +${bonus} chips`);
    pulse("double-clutch", "Double Clutch", `Grew to +${bonus + 20} chips`, "grow");
  }
  if (has("odd-gear")) {
    const odds = cards.filter((card) => card.rank % 2 === 1).length;
    const logged = state("odd-gear");
    const value = 6 + Math.floor(logged / 8) * 2;
    const bonus = odds * value;
    bonusChips += bonus;
    if (odds) {
      const next = logged + odds;
      setState("odd-gear", next);
      notes.push(`Odd Gear +${bonus} chips`);
      const grew = Math.floor(next / 8) > Math.floor(logged / 8);
      pulse("odd-gear", "Odd Gear", grew ? `Calibrated: odd ranks now +${value + 2}` : `${next % 8}/8 odd cards logged`, grew ? "grow" : "charge");
    }
  }
  if (has("last-call") && context.handsLeftBeforePlay === 1) {
    engineMultiplier *= 1.75;
    notes.push("Last Call ×1.75");
    pulse("last-call", "Last Call", "Final hand fired ×1.75", "fire");
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
  const finalMultiplier = rawMultiplier * chainMultiplier * bossMultiplier * engineMultiplier;
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
    engineMultiplier,
    finalChips,
    finalMultiplier,
    total,
    chain,
    notes,
    engineStateAfter,
    enginePulses
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
