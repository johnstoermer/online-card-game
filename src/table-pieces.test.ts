import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { TABLE_PIECES } from "../shared/game";
import {
  animateTablePieces,
  applyTablePieceState,
  createTablePiece,
  feltColorForPieces
} from "./table-pieces";

function meshCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) count += 1;
  });
  return count;
}

function visibleLayerCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((child) => {
    if (typeof child.userData.tableLayer === "number" && child.visible) count += 1;
  });
  return count;
}

describe("physical table pieces", () => {
  it("builds a distinct modeled object for every scoring piece", () => {
    expect(TABLE_PIECES).toHaveLength(12);
    for (const [index, piece] of TABLE_PIECES.entries()) {
      const model = createTablePiece(piece.id, index % 5);
      expect(model.userData.pieceId).toBe(piece.id);
      expect(meshCount(model), piece.name).toBeGreaterThan(2);
      expect(piece.tableEffect.length, piece.name).toBeGreaterThan(20);
    }
  });

  it("grows stateful chip stacks on the model itself", () => {
    const blackStack = createTablePiece("black-key", 0);
    applyTablePieceState(blackStack, 0);
    const baseLayers = visibleLayerCount(blackStack);
    applyTablePieceState(blackStack, 25);
    expect(visibleLayerCount(blackStack)).toBeGreaterThan(baseLayers);

    const group = new THREE.Group();
    group.add(blackStack);
    animateTablePieces(group, 2, 1 / 60, true);
    expect(blackStack.scale.x).toBeGreaterThan(1);
  });

  it("relines the whole table when Red Felt is present", () => {
    expect(TABLE_PIECES.find((piece) => piece.id === "green-felt")?.name).toBe("Red Felt");
    expect(feltColorForPieces([])).toBe("#123b30");
    expect(feltColorForPieces(["green-felt"])).toBe("#742a2d");
  });
});
