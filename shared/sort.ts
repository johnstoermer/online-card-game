import type { Card, Suit } from "./types.js";

export type HandSortMode = "rank" | "suit" | "manual";

const SUIT_PRIORITY: Record<Suit, number> = {
  spades: 0,
  hearts: 1,
  clubs: 2,
  diamonds: 3
};

function byRank(left: Card, right: Card): number {
  return right.rank - left.rank || SUIT_PRIORITY[left.suit] - SUIT_PRIORITY[right.suit];
}

function bySuit(left: Card, right: Card): number {
  return SUIT_PRIORITY[left.suit] - SUIT_PRIORITY[right.suit] || right.rank - left.rank;
}

export function sortHand(
  cards: Card[],
  mode: HandSortMode,
  manualOrder: string[] = []
): Card[] {
  if (mode === "rank") return [...cards].sort(byRank);
  if (mode === "suit") return [...cards].sort(bySuit);

  const cardById = new Map(cards.map((card) => [card.id, card]));
  const ordered = manualOrder
    .map((id) => cardById.get(id))
    .filter((card): card is Card => Boolean(card));
  const known = new Set(ordered.map((card) => card.id));
  const newlyDealt = cards.filter((card) => !known.has(card.id)).sort(byRank);
  return [...ordered, ...newlyDealt];
}

export function moveCard(order: string[], cardId: string, toIndex: number): string[] {
  const next = order.filter((id) => id !== cardId);
  next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, cardId);
  return next;
}
