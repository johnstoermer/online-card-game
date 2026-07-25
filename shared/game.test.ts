import { describe, expect, it } from "vitest";
import { evaluateHand, roundTarget, scoreHand } from "./game";
import type { Card, Suit } from "./types";

const cards = (ranks: number[], suit: Suit = "clubs"): Card[] =>
  ranks.map((rank, index) => ({ id: `${suit}-${rank}-${index}`, suit, rank }));

describe("poker evaluation", () => {
  it("recognizes all major five-card hands", () => {
    expect(evaluateHand(cards([10, 11, 12, 13, 14], "hearts"))).toBe("royal-flush");
    expect(evaluateHand(cards([2, 3, 4, 5, 14], "spades"))).toBe("straight-flush");
    expect(evaluateHand(cards([9, 9, 9, 9, 2]))).toBe("four-kind");
    expect(evaluateHand([...cards([7, 7, 7]), ...cards([3, 3], "hearts")])).toBe("full-house");
    expect(
      evaluateHand([
        { id: "1", rank: 2, suit: "clubs" },
        { id: "2", rank: 5, suit: "clubs" },
        { id: "3", rank: 8, suit: "clubs" },
        { id: "4", rank: 10, suit: "clubs" },
        { id: "5", rank: 13, suit: "clubs" }
      ])
    ).toBe("flush");
  });

  it("scores relics and chain bonuses", () => {
    const result = scoreHand(cards([8, 8]), {
      relicIds: ["brass-knuckle"],
      previousHand: "high-card",
      chain: 1,
      boss: null,
      handsLeftBeforePlay: 3
    });
    expect(result.hand).toBe("pair");
    expect(result.bonusMultiplier).toBe(2);
    expect(result.chain).toBe(2);
    expect(result.total).toBeGreaterThan(80);
  });

  it("scales targets by round and seats", () => {
    expect(roundTarget(2, 1)).toBeGreaterThan(roundTarget(1, 1));
    expect(roundTarget(1, 4)).toBeGreaterThan(roundTarget(1, 1));
  });
});
