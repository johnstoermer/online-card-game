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

  it("scores table pieces and chain bonuses", () => {
    const result = scoreHand(cards([8, 8]), {
      pieceIds: ["brass-knuckle"],
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

  it("rings a charged Call Bell and carries its remainder state", () => {
    const result = scoreHand(cards([2, 3, 4, 5, 6]), {
      pieceIds: ["echo-coil"],
      tableState: { "echo-coil": 2 },
      previousHand: "pair",
      chain: 1,
      boss: null,
      handsLeftBeforePlay: 2
    });

    expect(result.tableMultiplier).toBe(2);
    expect(result.tableStateAfter["echo-coil"]).toBe(0);
    expect(result.tablePulses).toContainEqual(
      expect.objectContaining({ pieceId: "echo-coil", kind: "fire" })
    );
  });

  it("grows feeder values only after their calibration threshold", () => {
    const thresholdHand = scoreHand(cards([4, 9], "hearts"), {
      pieceIds: ["red-lens"],
      tableState: { "red-lens": 9 },
      previousHand: null,
      chain: 0,
      boss: null,
      handsLeftBeforePlay: 3
    });
    const calibratedHand = scoreHand(cards([7], "hearts"), {
      pieceIds: ["red-lens"],
      tableState: thresholdHand.tableStateAfter,
      previousHand: thresholdHand.hand,
      chain: thresholdHand.chain,
      boss: null,
      handsLeftBeforePlay: 2
    });

    expect(thresholdHand.bonusChips).toBe(16);
    expect(thresholdHand.tableStateAfter["red-lens"]).toBe(11);
    expect(thresholdHand.tablePulses[0]).toMatchObject({ kind: "grow" });
    expect(calibratedHand.bonusChips).toBe(10);
  });

  it("banks permanent multiplier from spades across later hands", () => {
    const banked = scoreHand(cards([10], "spades"), {
      pieceIds: ["black-key"],
      tableState: { "black-key": 4 },
      previousHand: null,
      chain: 0,
      boss: null,
      handsLeftBeforePlay: 3
    });
    const later = scoreHand(cards([2, 6], "clubs"), {
      pieceIds: ["black-key"],
      tableState: banked.tableStateAfter,
      previousHand: banked.hand,
      chain: banked.chain,
      boss: null,
      handsLeftBeforePlay: 2
    });

    expect(banked.bonusMultiplier).toBe(1);
    expect(banked.tableStateAfter["black-key"]).toBe(5);
    expect(later.bonusMultiplier).toBe(1);
  });

  it("resolves every full Ace Guard charge in one hand", () => {
    const result = scoreHand(cards([14, 14, 14, 14]), {
      pieceIds: ["ace-bearing"],
      tableState: { "ace-bearing": 2 },
      previousHand: null,
      chain: 0,
      boss: null,
      handsLeftBeforePlay: 1
    });

    expect(result.tableMultiplier).toBeCloseTo(5.0625);
    expect(result.tableStateAfter["ace-bearing"]).toBe(0);
  });

  it("scales targets by round and seats", () => {
    expect(roundTarget(2, 1)).toBeGreaterThan(roundTarget(1, 1));
    expect(roundTarget(1, 4)).toBeGreaterThan(roundTarget(1, 1));
  });
});
