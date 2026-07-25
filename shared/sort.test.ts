import { describe, expect, it } from "vitest";
import { moveCard, sortHand } from "./sort";
import type { Card } from "./types";

const hand: Card[] = [
  { id: "h-9", suit: "hearts", rank: 9 },
  { id: "s-14", suit: "spades", rank: 14 },
  { id: "d-14", suit: "diamonds", rank: 14 },
  { id: "c-4", suit: "clubs", rank: 4 },
  { id: "s-7", suit: "spades", rank: 7 },
  { id: "h-12", suit: "hearts", rank: 12 }
];

describe("hand sorting", () => {
  it("sorts descending by rank with deterministic suit ties", () => {
    expect(sortHand(hand, "rank").map((card) => card.id)).toEqual([
      "s-14",
      "d-14",
      "h-12",
      "h-9",
      "s-7",
      "c-4"
    ]);
  });

  it("groups suits and keeps ranks descending inside each suit", () => {
    expect(sortHand(hand, "suit").map((card) => card.id)).toEqual([
      "s-14",
      "s-7",
      "h-12",
      "h-9",
      "c-4",
      "d-14"
    ]);
  });

  it("preserves manual positions and appends newly dealt cards by rank", () => {
    expect(sortHand(hand, "manual", ["c-4", "h-9", "s-14"]).map((card) => card.id)).toEqual([
      "c-4",
      "h-9",
      "s-14",
      "d-14",
      "h-12",
      "s-7"
    ]);
  });

  it("moves a dragged card to the requested position", () => {
    expect(moveCard(["a", "b", "c", "d"], "d", 1)).toEqual(["a", "d", "b", "c"]);
    expect(moveCard(["a", "b", "c"], "a", 99)).toEqual(["b", "c", "a"]);
  });
});
