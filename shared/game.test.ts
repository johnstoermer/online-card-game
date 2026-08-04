import { describe, expect, it } from "vitest";
import {
  bestTrump,
  cardStrength,
  chooseDealerDiscard,
  createDeck,
  effectiveSuit,
  legalCards,
  nextActiveSeat,
  scoreHand,
  teamForSeat,
  trickWinner
} from "./game";
import type { Card, PlayedCard, Suit } from "./types";

const card = (rank: number, suit: Suit, id = `${suit}-${rank}`): Card => ({ rank, suit, id });

describe("euchre deck and partnerships", () => {
  it("builds exactly the 24 cards from nine through ace", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(24);
    expect(new Set(deck.map((item) => item.id))).toHaveLength(24);
    expect([...new Set(deck.map((item) => item.rank))]).toEqual([9, 10, 11, 12, 13, 14]);
  });

  it("fixes partnerships across the table", () => {
    expect([0, 1, 2, 3].map(teamForSeat)).toEqual([0, 1, 0, 1]);
    expect(nextActiveSeat(0, 1)).toBe(2);
  });
});

describe("bowers, following suit, and trick resolution", () => {
  it("treats the left bower as trump and ranks it below the right", () => {
    const right = card(11, "hearts", "right");
    const left = card(11, "diamonds", "left");
    expect(effectiveSuit(left, "hearts")).toBe("hearts");
    expect(cardStrength(right, "hearts", "clubs")).toBeGreaterThan(cardStrength(left, "hearts", "clubs"));
    expect(cardStrength(left, "hearts", "clubs")).toBeGreaterThan(cardStrength(card(14, "hearts"), "hearts", "clubs"));
  });

  it("requires the left bower when trump is led", () => {
    const hand = [card(11, "diamonds", "left"), card(14, "diamonds", "diamond-ace"), card(9, "clubs")];
    const trick: PlayedCard[] = [{ seat: 0, card: card(9, "hearts") }];
    expect(legalCards(hand, trick, "hearts").map((item) => item.id)).toEqual(["left"]);
  });

  it("does not let the left bower follow its printed suit", () => {
    const hand = [card(11, "diamonds", "left"), card(9, "clubs")];
    const trick: PlayedCard[] = [{ seat: 0, card: card(14, "diamonds") }];
    expect(legalCards(hand, trick, "hearts")).toEqual(hand);
  });

  it("awards trump over led suit and led suit over off-suit", () => {
    const trick: PlayedCard[] = [
      { seat: 0, card: card(14, "clubs") },
      { seat: 1, card: card(9, "hearts") },
      { seat: 2, card: card(13, "clubs") },
      { seat: 3, card: card(14, "spades") }
    ];
    expect(trickWinner(trick, "hearts")).toBe(1);
  });
});

describe("calling support and scoring", () => {
  it("excludes the turned-down suit when choosing best second-round trump", () => {
    const hand = [card(11, "hearts"), card(14, "hearts"), card(11, "diamonds"), card(9, "clubs"), card(10, "clubs")];
    expect(bestTrump(hand, "hearts").suit).not.toBe("hearts");
  });

  it("discards a weak off-suit card after dealer pickup", () => {
    const hand = [card(11, "hearts"), card(11, "diamonds"), card(14, "hearts"), card(9, "clubs"), card(10, "spades"), card(13, "hearts")];
    expect(chooseDealerDiscard(hand, "hearts").id).toBe("clubs-9");
  });

  it("scores makers, marches, euchres, and lone marches", () => {
    expect(scoreHand(0, [3, 2], false)).toMatchObject({ scoringTeam: 0, points: 1, euchred: false });
    expect(scoreHand(1, [0, 5], false)).toMatchObject({ scoringTeam: 1, points: 2, march: true });
    expect(scoreHand(0, [2, 3], false)).toMatchObject({ scoringTeam: 1, points: 2, euchred: true });
    expect(scoreHand(2, [5, 0], true)).toMatchObject({ scoringTeam: 0, points: 4, march: true });
  });

  it("gives a loner one point for three or four tricks", () => {
    expect(scoreHand(3, [1, 4], true).points).toBe(1);
  });
});
