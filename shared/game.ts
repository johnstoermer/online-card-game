import type {
  BossDefinition,
  Card,
  HandKey,
  ScoreBreakdown,
  Suit,
  TablePieceDefinition,
  TablePulse
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

export const TABLE_PIECES: TablePieceDefinition[] = [
  {
    id: "brass-knuckle",
    name: "Twin Plaques",
    description: "Pair-or-better hands gain +2 mult, then permanently raise the value of the twin betting plaques by +0.5 mult.",
    short: "PAIR PLAQUES",
    tone: "copper",
    category: "marker",
    tableEffect: "Sets two brass betting plaques beside the pot"
  },
  {
    id: "red-lens",
    name: "Heart Stack",
    description: "Hearts add 8 chips each. Every 10 hearts counted adds another tier worth 2 more chips per heart.",
    short: "HEART CHIPS",
    tone: "red",
    category: "counter",
    tableEffect: "Builds a heart-red chip tower on the rail"
  },
  {
    id: "stone-index",
    name: "Four Corners",
    description: "Exactly four cards gain +3 mult. Every trigger permanently raises the four ivory corner markers by another +1 mult.",
    short: "FOUR MARKERS",
    tone: "ivory",
    category: "marker",
    tableEffect: "Places four ivory markers around a private betting square"
  },
  {
    id: "echo-coil",
    name: "Call Bell",
    description: "Changing the table's last hand rings the bell. Every third ring pays ×2.",
    short: "THIRD RING",
    tone: "blue",
    category: "payout",
    tableEffect: "Adds a brass call bell that visibly winds toward its third ring"
  },
  {
    id: "crown-wire",
    name: "Face Guard",
    description: "Face cards add 7 chips each. Every 6 faces tucked beneath the guard raises their value by 2 chips.",
    short: "FACE CARDS",
    tone: "copper",
    category: "counter",
    tableEffect: "Fans three gold-edged card guards beside the community line"
  },
  {
    id: "black-key",
    name: "Black Stack",
    description: "Every 5 spades counted adds a permanent black chip worth +1 mult to every future hand.",
    short: "SPADE CHIPS",
    tone: "black",
    category: "ritual",
    tableEffect: "Grows a physical tower of black chips as spades arrive"
  },
  {
    id: "green-felt",
    name: "Red Felt",
    description: "Relines the table in red. Flushes gain 45 chips, then the felt permanently gains another 15 chips.",
    short: "FLUSH FELT",
    tone: "red",
    category: "marker",
    tableEffect: "Changes the entire table surface from green felt to deep red"
  },
  {
    id: "ace-bearing",
    name: "Ace Guard",
    description: "Aces light the card guard across hands. Every third ace pays ×2.25.",
    short: "THIRD ACE",
    tone: "ivory",
    category: "payout",
    tableEffect: "Sets an ivory ace card guard in the center ring"
  },
  {
    id: "short-circuit",
    name: "Short Stack",
    description: "Three-card-or-smaller hands gain +4 mult and add to a growing short-hand streak.",
    short: "SMALL HANDS",
    tone: "red",
    category: "ritual",
    tableEffect: "Adds a compact chip stack that rises with the streak"
  },
  {
    id: "double-clutch",
    name: "Split Pot",
    description: "Two Pair and Full House gain 60 chips. Every trigger adds 20 chips to both sides of the split pot.",
    short: "PAIR POTS",
    tone: "blue",
    category: "marker",
    tableEffect: "Builds two rival chip pots on opposite sides of the line"
  },
  {
    id: "odd-gear",
    name: "Odd Chips",
    description: "Odd ranks add 6 chips each. Every 8 odd cards counted raises the striped chips' value by 2.",
    short: "ODD VALUES",
    tone: "green",
    category: "counter",
    tableEffect: "Scatters striped odd-value chips along the table edge"
  },
  {
    id: "last-call",
    name: "Dealer Button",
    description: "Your final hand each round turns the dealer button and multiplies the finished score by ×1.75.",
    short: "FINAL HAND",
    tone: "black",
    category: "payout",
    tableEffect: "Adds a heavy ivory dealer button beside your hand"
  }
];

export const MAX_TABLE_PIECES = 5;
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
  pieceIds: string[];
  tableState?: Record<string, number>;
  previousHand: HandKey | null;
  chain: number;
  boss: BossDefinition | null;
  handsLeftBeforePlay: number;
}

export function scoreHand(cards: Card[], context: ScoreContext): ScoreBreakdown {
  const hand = evaluateHand(cards);
  const definition = HANDS[hand];
  const notes: string[] = [];
  const tablePulses: TablePulse[] = [];
  const tableStateAfter = { ...(context.tableState ?? {}) };
  let cardChips = cards.reduce((sum, card) => sum + baseCardChips(card), 0);
  let bonusChips = 0;
  let bonusMultiplier = 0;
  let bossMultiplier = 1;
  let tableMultiplier = 1;
  const has = (id: string) => context.pieceIds.includes(id);
  const state = (id: string) => tableStateAfter[id] ?? 0;
  const setState = (id: string, value: number) => {
    tableStateAfter[id] = value;
  };
  const pulse = (
    pieceId: string,
    label: string,
    detail: string,
    kind: TablePulse["kind"]
  ) => tablePulses.push({ pieceId, label, detail, kind });

  if (has("brass-knuckle") && HANDS[hand].order >= HANDS.pair.order) {
    const calibration = state("brass-knuckle");
    const bonus = 2 + calibration * 0.5;
    bonusMultiplier += bonus;
    setState("brass-knuckle", calibration + 1);
    notes.push(`Twin Plaques +${bonus.toFixed(bonus % 1 ? 1 : 0)} mult`);
    pulse("brass-knuckle", "Twin Plaques", `Raised to +${(2 + (calibration + 1) * 0.5).toFixed(1)} mult`, "grow");
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
      notes.push(`Heart Stack +${bonus} chips`);
      const grew = Math.floor(next / 10) > Math.floor(logged / 10);
      pulse("red-lens", "Heart Stack", grew ? `New tier: hearts now +${value + 2}` : `${next % 10}/10 hearts counted`, grew ? "grow" : "charge");
    }
  }
  if (has("stone-index") && cards.length === 4) {
    const triggers = state("stone-index");
    const bonus = 3 + triggers;
    bonusMultiplier += bonus;
    setState("stone-index", triggers + 1);
    notes.push(`Four Corners +${bonus} mult`);
    pulse("stone-index", "Four Corners", `Markers raised to +${bonus + 1} mult`, "grow");
  }
  if (has("echo-coil") && context.previousHand && context.previousHand !== hand) {
    let charge = state("echo-coil") + 1;
    if (charge >= 3) {
      tableMultiplier *= 2;
      charge -= 3;
      notes.push("Call Bell ×2");
      pulse("echo-coil", "Call Bell", "Third ring paid ×2", "fire");
    } else {
      pulse("echo-coil", "Call Bell", `${charge}/3 rings`, "charge");
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
      notes.push(`Face Guard +${bonus} chips`);
      const grew = Math.floor(next / 6) > Math.floor(logged / 6);
      pulse("crown-wire", "Face Guard", grew ? `Guard raised: faces now +${value + 2}` : `${next % 6}/6 faces tucked`, grew ? "grow" : "charge");
    }
  }
  if (has("black-key")) {
    const spades = cards.filter((card) => card.suit === "spades").length;
    const logged = state("black-key");
    const next = logged + spades;
    const tier = Math.floor(next / 5);
    bonusMultiplier += tier;
    setState("black-key", next);
    if (tier) notes.push(`Black Stack +${tier} mult`);
    if (spades) {
      const grew = Math.floor(next / 5) > Math.floor(logged / 5);
      pulse("black-key", "Black Stack", grew ? `Stack raised to +${tier} mult` : `${next % 5}/5 spades to next chip`, grew ? "grow" : "charge");
    }
  }
  if (has("green-felt") && (hand === "flush" || hand === "straight-flush" || hand === "royal-flush")) {
    const triggers = state("green-felt");
    const bonus = 45 + triggers * 15;
    bonusChips += bonus;
    setState("green-felt", triggers + 1);
    notes.push(`Red Felt +${bonus} chips`);
    pulse("green-felt", "Red Felt", `Flush value raised to +${bonus + 15} chips`, "grow");
  }
  if (has("ace-bearing")) {
    const aces = cards.filter((card) => card.rank === 14).length;
    if (aces) {
      let charge = state("ace-bearing") + aces;
      const fires = Math.floor(charge / 3);
      if (fires) {
        const payoff = Math.pow(2.25, fires);
        tableMultiplier *= payoff;
        charge %= 3;
        notes.push(`Ace Guard ×${payoff.toFixed(2)}`);
        pulse(
          "ace-bearing",
          "Ace Guard",
          fires > 1 ? `Guard paid ${fires} times · ×${payoff.toFixed(2)}` : "Third ace paid ×2.25",
          "fire"
        );
      } else {
        pulse("ace-bearing", "Ace Guard", `${charge}/3 aces lit`, "charge");
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
      notes.push(`Short Stack +${bonus} mult`);
      pulse("short-circuit", "Short Stack", `${streak} hand streak; next +${bonus + 1} mult`, "grow");
    } else if (state("short-circuit")) {
      setState("short-circuit", 0);
      pulse("short-circuit", "Short Stack", "Stack returned to base", "charge");
    }
  }
  if (has("double-clutch") && (hand === "two-pair" || hand === "full-house")) {
    const triggers = state("double-clutch");
    const bonus = 60 + triggers * 20;
    bonusChips += bonus;
    setState("double-clutch", triggers + 1);
    notes.push(`Split Pot +${bonus} chips`);
    pulse("double-clutch", "Split Pot", `Both pots raised to +${bonus + 20} chips`, "grow");
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
      notes.push(`Odd Chips +${bonus} chips`);
      const grew = Math.floor(next / 8) > Math.floor(logged / 8);
      pulse("odd-gear", "Odd Chips", grew ? `New stripe: odd ranks now +${value + 2}` : `${next % 8}/8 odd cards counted`, grew ? "grow" : "charge");
    }
  }
  if (has("last-call") && context.handsLeftBeforePlay === 1) {
    tableMultiplier *= 1.75;
    notes.push("Dealer Button ×1.75");
    pulse("last-call", "Dealer Button", "Final hand turned ×1.75", "fire");
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
  const finalMultiplier = rawMultiplier * chainMultiplier * bossMultiplier * tableMultiplier;
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
    tableMultiplier,
    finalChips,
    finalMultiplier,
    total,
    chain,
    notes,
    tableStateAfter,
    tablePulses
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
