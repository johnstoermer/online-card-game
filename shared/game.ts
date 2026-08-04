import { RANKS, SUITS } from "./types.js";
import type { Card, PlayedCard, Suit, Team } from "./types.js";

export const WINNING_SCORE = 10;

export function teamForSeat(seat: number): Team {
  return (seat % 2) as Team;
}

export function partnerSeat(seat: number): number {
  return (seat + 2) % 4;
}

export function leftOf(seat: number): number {
  return (seat + 1) % 4;
}

export function createDeck(prefix = ""): Card[] {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({ id: `${prefix}${suit[0]}-${rank}`, suit, rank }))
  );
}

export function shuffled<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function sameColorSuit(suit: Suit): Suit {
  if (suit === "clubs") return "spades";
  if (suit === "spades") return "clubs";
  if (suit === "diamonds") return "hearts";
  return "diamonds";
}

export function effectiveSuit(card: Card, trump: Suit): Suit {
  return card.rank === 11 && card.suit === sameColorSuit(trump) ? trump : card.suit;
}

export function isRightBower(card: Card, trump: Suit): boolean {
  return card.rank === 11 && card.suit === trump;
}

export function isLeftBower(card: Card, trump: Suit): boolean {
  return card.rank === 11 && card.suit === sameColorSuit(trump);
}

export function cardStrength(card: Card, trump: Suit, ledSuit: Suit): number {
  if (isRightBower(card, trump)) return 200;
  if (isLeftBower(card, trump)) return 199;
  const suit = effectiveSuit(card, trump);
  if (suit === trump) return 180 + card.rank;
  if (suit === ledSuit) return 100 + card.rank;
  return card.rank;
}

export function legalCards(hand: Card[], trick: PlayedCard[], trump: Suit): Card[] {
  if (!trick.length) return [...hand];
  const ledSuit = effectiveSuit(trick[0].card, trump);
  const following = hand.filter((card) => effectiveSuit(card, trump) === ledSuit);
  return following.length ? following : [...hand];
}

export function trickWinner(trick: PlayedCard[], trump: Suit): number {
  if (!trick.length) throw new Error("Cannot score an empty trick.");
  const ledSuit = effectiveSuit(trick[0].card, trump);
  return trick.reduce((best, play) =>
    cardStrength(play.card, trump, ledSuit) > cardStrength(best.card, trump, ledSuit)
      ? play
      : best
  ).seat;
}

export function nextActiveSeat(seat: number, sittingOutSeat: number | null): number {
  let next = leftOf(seat);
  if (next === sittingOutSeat) next = leftOf(next);
  return next;
}

export function trickSize(sittingOutSeat: number | null): number {
  return sittingOutSeat === null ? 4 : 3;
}

export interface HandScore {
  scoringTeam: Team;
  points: number;
  makersTeam: Team;
  makerTricks: number;
  euchred: boolean;
  march: boolean;
}

export function scoreHand(makerSeat: number, teamTricks: [number, number], alone: boolean): HandScore {
  const makersTeam = teamForSeat(makerSeat);
  const makerTricks = teamTricks[makersTeam];
  if (makerTricks < 3) {
    return {
      scoringTeam: (1 - makersTeam) as Team,
      points: 2,
      makersTeam,
      makerTricks,
      euchred: true,
      march: false
    };
  }
  const march = makerTricks === 5;
  return {
    scoringTeam: makersTeam,
    points: march ? (alone ? 4 : 2) : 1,
    makersTeam,
    makerTricks,
    euchred: false,
    march
  };
}

export function bidStrength(hand: Card[], trump: Suit): number {
  return hand.reduce((score, card) => {
    if (isRightBower(card, trump)) return score + 7;
    if (isLeftBower(card, trump)) return score + 6;
    if (effectiveSuit(card, trump) === trump) return score + Math.max(1, card.rank - 9);
    if (card.rank === 14) return score + 1.5;
    return score;
  }, 0);
}

export function bestTrump(hand: Card[], excluded?: Suit): { suit: Suit; strength: number } {
  return SUITS.filter((suit) => suit !== excluded)
    .map((suit) => ({ suit, strength: bidStrength(hand, suit) }))
    .sort((a, b) => b.strength - a.strength)[0];
}

export function chooseDealerDiscard(hand: Card[], trump: Suit): Card {
  return [...hand].sort((a, b) => {
    const aTrump = effectiveSuit(a, trump) === trump;
    const bTrump = effectiveSuit(b, trump) === trump;
    if (aTrump !== bTrump) return aTrump ? 1 : -1;
    return cardStrength(a, trump, effectiveSuit(a, trump)) - cardStrength(b, trump, effectiveSuit(b, trump));
  })[0];
}

export function chooseBotCard(hand: Card[], trick: PlayedCard[], trump: Suit): Card {
  const legal = legalCards(hand, trick, trump);
  if (!trick.length) {
    return [...legal].sort((a, b) => cardStrength(b, trump, effectiveSuit(b, trump)) - cardStrength(a, trump, effectiveSuit(a, trump)))[0];
  }
  const led = effectiveSuit(trick[0].card, trump);
  const currentWinner = trickWinner(trick, trump);
  const winningStrength = cardStrength(trick.find((play) => play.seat === currentWinner)!.card, trump, led);
  const winners = legal
    .filter((card) => cardStrength(card, trump, led) > winningStrength)
    .sort((a, b) => cardStrength(a, trump, led) - cardStrength(b, trump, led));
  if (winners.length) return winners[0];
  return [...legal].sort((a, b) => cardStrength(a, trump, led) - cardStrength(b, trump, led))[0];
}
