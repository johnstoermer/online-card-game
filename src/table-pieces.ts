import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const SLOT_LAYOUT = [
  { x: -3.55, y: 1.25, rotation: -0.12 },
  { x: -3.65, y: -0.78, rotation: 0.08 },
  { x: -2.28, y: 2.48, rotation: -0.06 },
  { x: 2.28, y: 2.48, rotation: 0.06 },
  { x: 3.55, y: -0.78, rotation: -0.08 }
];

function material(
  color: string,
  options: {
    roughness?: number;
    metalness?: number;
    emissive?: string;
    emissiveIntensity?: number;
  } = {}
): THREE.MeshStandardMaterial {
  const result = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.62,
    metalness: options.metalness ?? 0.12,
    emissive: options.emissive ?? "#000000",
    emissiveIntensity: options.emissiveIntensity ?? 0
  });
  result.userData.baseEmissiveIntensity = result.emissiveIntensity;
  return result;
}

function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  surface: THREE.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0]
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addPuck(
  parent: THREE.Object3D,
  radius: number,
  height: number,
  color: string,
  accent: string,
  position: [number, number, number] = [0, 0, 0]
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(...position);
  parent.add(group);
  addMesh(
    group,
    new THREE.CylinderGeometry(radius, radius, height, 28),
    material(color, { roughness: 0.46, metalness: 0.22 }),
    [0, 0, height / 2],
    [Math.PI / 2, 0, 0]
  );
  addMesh(
    group,
    new THREE.TorusGeometry(radius * 0.72, Math.max(0.012, radius * 0.055), 6, 28),
    material(accent, { roughness: 0.35, metalness: 0.58 }),
    [0, 0, height + 0.008]
  );
  return group;
}

function addChipStack(
  parent: THREE.Object3D,
  options: {
    x?: number;
    y?: number;
    radius?: number;
    layers?: number;
    color: string;
    stripe: string;
    layerOffset?: number;
  }
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(options.x ?? 0, options.y ?? 0, 0);
  parent.add(group);
  const layers = options.layers ?? 10;
  const radius = options.radius ?? 0.26;
  const layerOffset = options.layerOffset ?? 0;
  for (let index = 0; index < layers; index += 1) {
    const layer = new THREE.Group();
    layer.userData.tableLayer = layerOffset + index;
    layer.position.z = index * 0.068;
    group.add(layer);
    addMesh(
      layer,
      new THREE.CylinderGeometry(radius, radius, 0.075, 24),
      material(options.color, {
        roughness: 0.5,
        metalness: 0.14,
        emissive: options.color,
        emissiveIntensity: 0.025
      }),
      [0, 0, 0.05],
      [Math.PI / 2, 0, 0]
    );
    addMesh(
      layer,
      new THREE.TorusGeometry(radius * 0.77, radius * 0.07, 5, 24),
      material(options.stripe, { roughness: 0.42, metalness: 0.25 }),
      [0, 0, 0.091]
    );
  }
  return group;
}

function addDiamond(
  parent: THREE.Object3D,
  size: number,
  color: string,
  position: [number, number, number]
): THREE.Mesh {
  return addMesh(
    parent,
    new THREE.BoxGeometry(size, size, Math.max(0.025, size * 0.14)),
    material(color, {
      roughness: 0.4,
      metalness: 0.28,
      emissive: color,
      emissiveIntensity: 0.08
    }),
    position,
    [0, 0, Math.PI / 4]
  );
}

function buildTwinPlaques(root: THREE.Group): void {
  const brass = material("#c5964c", { roughness: 0.38, metalness: 0.62 });
  const dark = material("#26332e", { roughness: 0.52, metalness: 0.35 });
  [-0.24, 0.24].forEach((x, index) => {
    const plaque = new THREE.Group();
    plaque.position.set(x, 0, index ? 0.025 : 0);
    plaque.rotation.z = index ? 0.09 : -0.09;
    root.add(plaque);
    addMesh(
      plaque,
      new RoundedBoxGeometry(0.38, 0.7, 0.09, 3, 0.045),
      brass,
      [0, 0, 0.075]
    );
    addMesh(plaque, new THREE.BoxGeometry(0.2, 0.045, 0.035), dark, [0, -0.14, 0.132]);
    addMesh(plaque, new THREE.BoxGeometry(0.2, 0.045, 0.035), dark, [0, 0.14, 0.132]);
  });
}

function buildHeartStack(root: THREE.Group): void {
  addChipStack(root, {
    radius: 0.3,
    layers: 11,
    color: "#a93632",
    stripe: "#e2b55f"
  });
  const heart = new THREE.Group();
  heart.position.z = 0.82;
  heart.userData.tableLayer = 10;
  root.add(heart);
  const red = material("#dc513f", {
    roughness: 0.34,
    metalness: 0.2,
    emissive: "#8e1c18",
    emissiveIntensity: 0.2
  });
  addMesh(heart, new THREE.SphereGeometry(0.105, 12, 8), red, [-0.075, 0.045, 0]);
  addMesh(heart, new THREE.SphereGeometry(0.105, 12, 8), red, [0.075, 0.045, 0]);
  addMesh(
    heart,
    new THREE.BoxGeometry(0.19, 0.19, 0.13),
    red,
    [0, -0.04, -0.005],
    [0, 0, Math.PI / 4]
  );
}

function buildFourCorners(root: THREE.Group): void {
  addMesh(
    root,
    new RoundedBoxGeometry(0.78, 0.78, 0.04, 3, 0.05),
    material("#183a31", { roughness: 0.9 }),
    [0, 0, 0.035]
  );
  const ivory = material("#ddcfad", { roughness: 0.58, metalness: 0.1 });
  [
    [-0.29, -0.29],
    [0.29, -0.29],
    [-0.29, 0.29],
    [0.29, 0.29]
  ].forEach(([x, y], index) => {
    const marker = addMesh(
      root,
      new RoundedBoxGeometry(0.19, 0.19, 0.15, 2, 0.025),
      ivory,
      [x, y, 0.12]
    );
    marker.userData.stateMarker = true;
    marker.userData.markerIndex = index;
  });
  addDiamond(root, 0.18, "#b8873f", [0, 0, 0.1]);
}

function buildCallBell(root: THREE.Group): void {
  const brass = material("#c79548", {
    roughness: 0.28,
    metalness: 0.76,
    emissive: "#70430e",
    emissiveIntensity: 0.08
  });
  const dark = material("#28332f", { roughness: 0.4, metalness: 0.6 });
  addMesh(
    root,
    new THREE.CylinderGeometry(0.44, 0.48, 0.09, 28),
    dark,
    [0, 0, 0.055],
    [Math.PI / 2, 0, 0]
  );
  const dome = addMesh(root, new THREE.SphereGeometry(0.37, 24, 12), brass, [0, 0, 0.2]);
  dome.scale.z = 0.58;
  dome.userData.bellDome = true;
  addMesh(
    root,
    new THREE.CylinderGeometry(0.07, 0.09, 0.18, 16),
    brass,
    [0, 0, 0.5],
    [Math.PI / 2, 0, 0]
  );
  addMesh(root, new THREE.SphereGeometry(0.1, 14, 8), dark, [0, 0, 0.61]);
}

function buildFaceGuard(root: THREE.Group): void {
  const ivory = material("#e0d2b1", { roughness: 0.68 });
  const gold = material("#c39547", { roughness: 0.36, metalness: 0.66 });
  [-0.24, 0, 0.24].forEach((x, index) => {
    const card = addMesh(
      root,
      new RoundedBoxGeometry(0.38, 0.56, 0.055, 2, 0.028),
      ivory,
      [x, 0.02 + Math.abs(index - 1) * 0.04, 0.07 + index * 0.012],
      [0, 0, (index - 1) * -0.16]
    );
    card.userData.faceCard = true;
    addDiamond(root, 0.095, index === 1 ? "#b64035" : "#26332f", [
      x,
      0.02 + Math.abs(index - 1) * 0.04,
      0.112 + index * 0.012
    ]);
  });
  addMesh(root, new THREE.BoxGeometry(0.72, 0.09, 0.12), gold, [0, -0.25, 0.12]);
}

function buildBlackStack(root: THREE.Group): void {
  addChipStack(root, {
    radius: 0.31,
    layers: 11,
    color: "#202927",
    stripe: "#d4bd8e"
  });
}

function buildRedFelt(root: THREE.Group): void {
  const felt = material("#772b2d", {
    roughness: 0.98,
    emissive: "#2b0809",
    emissiveIntensity: 0.05
  });
  const brass = material("#b98a45", { roughness: 0.38, metalness: 0.64 });
  addMesh(
    root,
    new RoundedBoxGeometry(0.9, 0.58, 0.035, 3, 0.04),
    felt,
    [0.08, 0, 0.04],
    [0, 0, -0.04]
  );
  addMesh(
    root,
    new THREE.CylinderGeometry(0.13, 0.13, 0.78, 18),
    felt,
    [-0.36, 0, 0.14],
    [0, 0, Math.PI / 2]
  );
  addMesh(
    root,
    new THREE.CylinderGeometry(0.035, 0.035, 0.86, 12),
    brass,
    [-0.36, 0, 0.14],
    [0, 0, Math.PI / 2]
  );
}

function buildAceGuard(root: THREE.Group): void {
  addPuck(root, 0.43, 0.12, "#e1d4b4", "#b78a46");
  const pip = addDiamond(root, 0.2, "#b83f35", [0, 0, 0.16]);
  pip.userData.acePip = true;
  [
    [-0.26, 0],
    [0.26, 0],
    [0, -0.26],
    [0, 0.26]
  ].forEach(([x, y], index) => {
    const light = addMesh(
      root,
      new THREE.SphereGeometry(0.045, 10, 6),
      material("#d9b45f", {
        roughness: 0.25,
        metalness: 0.4,
        emissive: "#d9b45f",
        emissiveIntensity: 0.12
      }),
      [x, y, 0.16]
    );
    light.userData.aceLight = index;
  });
}

function buildShortStack(root: THREE.Group): void {
  addChipStack(root, {
    radius: 0.32,
    layers: 10,
    color: "#bc4a3c",
    stripe: "#ead19c"
  });
  addMesh(
    root,
    new THREE.BoxGeometry(0.58, 0.08, 0.07),
    material("#d8ad59", { roughness: 0.34, metalness: 0.5 }),
    [0, -0.38, 0.075]
  );
}

function buildSplitPot(root: THREE.Group): void {
  addChipStack(root, {
    x: -0.28,
    radius: 0.22,
    layers: 9,
    color: "#557f9f",
    stripe: "#e0c38d"
  });
  addChipStack(root, {
    x: 0.28,
    radius: 0.22,
    layers: 9,
    color: "#557f9f",
    stripe: "#e0c38d"
  });
  addMesh(
    root,
    new THREE.BoxGeometry(0.06, 0.72, 0.08),
    material("#b98942", { roughness: 0.38, metalness: 0.6 }),
    [0, 0, 0.08]
  );
}

function buildOddChips(root: THREE.Group): void {
  const colors = ["#d4aa54", "#4f8679", "#b54b3d", "#d4aa54", "#4f8679"];
  const positions = [
    [-0.38, -0.16],
    [-0.18, 0.13],
    [0.05, -0.1],
    [0.25, 0.16],
    [0.42, -0.12]
  ];
  positions.forEach(([x, y], index) => {
    const chip = addPuck(
      root,
      0.16 + (index % 2) * 0.025,
      0.07,
      colors[index],
      index % 2 ? "#e2c995" : "#26332f",
      [x, y, index * 0.015]
    );
    chip.userData.tableLayer = index;
    chip.rotation.z = index * 0.3;
  });
}

function buildDealerButton(root: THREE.Group): void {
  addPuck(root, 0.48, 0.13, "#e4d7b7", "#28342f");
  addPuck(root, 0.21, 0.035, "#2a3531", "#be8e45", [0, 0, 0.145]);
  const pointer = addMesh(
    root,
    new THREE.BoxGeometry(0.24, 0.065, 0.055),
    material("#be493b", {
      roughness: 0.38,
      metalness: 0.25,
      emissive: "#711c18",
      emissiveIntensity: 0.08
    }),
    [0.04, 0, 0.22]
  );
  pointer.userData.dealerPointer = true;
}

const BUILDERS: Record<string, (root: THREE.Group) => void> = {
  "brass-knuckle": buildTwinPlaques,
  "red-lens": buildHeartStack,
  "stone-index": buildFourCorners,
  "echo-coil": buildCallBell,
  "crown-wire": buildFaceGuard,
  "black-key": buildBlackStack,
  "green-felt": buildRedFelt,
  "ace-bearing": buildAceGuard,
  "short-circuit": buildShortStack,
  "double-clutch": buildSplitPot,
  "odd-gear": buildOddChips,
  "last-call": buildDealerButton
};

export function feltColorForPieces(pieceIds: string[]): string {
  return pieceIds.includes("green-felt") ? "#742a2d" : "#123b30";
}

function visibleLayers(pieceId: string, state: number): number {
  if (pieceId === "red-lens") return Math.min(10, 3 + Math.floor(state / 10));
  if (pieceId === "black-key") return Math.min(10, 3 + Math.floor(state / 5));
  if (pieceId === "short-circuit") return Math.min(9, 2 + state);
  if (pieceId === "double-clutch") return Math.min(8, 3 + state);
  if (pieceId === "odd-gear") return Math.min(4, 2 + Math.floor(state / 8));
  return 10;
}

export function createTablePiece(pieceId: string, slotIndex: number): THREE.Group {
  const root = new THREE.Group();
  const slot = SLOT_LAYOUT[slotIndex % SLOT_LAYOUT.length];
  root.position.set(slot.x, slot.y, 0.14);
  root.rotation.z = slot.rotation;
  root.scale.setScalar(0.001);
  root.userData.pieceId = pieceId;
  root.userData.baseX = slot.x;
  root.userData.baseY = slot.y;
  root.userData.baseZ = 0.14;
  root.userData.baseRotation = slot.rotation;
  root.userData.floatPhase = slotIndex * 1.37 + pieceId.length * 0.19;
  root.userData.bornAt = performance.now();
  root.userData.state = 0;
  root.userData.previousState = 0;
  root.userData.stateChangedAt = performance.now();
  root.userData.visualScale = 1;
  BUILDERS[pieceId]?.(root);
  applyTablePieceState(root, 0);
  return root;
}

export function applyTablePieceState(root: THREE.Group, state: number): void {
  const pieceId = String(root.userData.pieceId || "");
  const previous = Number(root.userData.state || 0);
  root.userData.previousState = previous;
  root.userData.state = state;
  if (state !== previous) root.userData.stateChangedAt = performance.now();
  root.userData.visualScale = 1 + Math.min(0.12, state * 0.012);

  const layerLimit = visibleLayers(pieceId, state);
  root.traverse((child) => {
    if (typeof child.userData.tableLayer === "number") {
      child.visible = child.userData.tableLayer <= layerLimit;
    }
    if (child.userData.aceLight !== undefined) {
      child.visible = child.userData.aceLight < state;
    }
    if (child.userData.stateMarker) {
      child.position.z = 0.12 + Math.min(0.16, state * 0.018);
    }
  });
}

export function animateTablePieces(
  tablePieces: THREE.Group,
  time: number,
  delta: number,
  reduceMotion: boolean
): void {
  const now = performance.now();
  for (const child of tablePieces.children) {
    if (!(child instanceof THREE.Group)) continue;
    const bornAt = Number(child.userData.bornAt || now);
    const stateChangedAt = Number(child.userData.stateChangedAt || 0);
    const state = Number(child.userData.state || 0);
    const pieceId = String(child.userData.pieceId || "");
    const phase = Number(child.userData.floatPhase || 0);
    const baseScale = Number(child.userData.visualScale || 1);
    const reveal = reduceMotion
      ? 1
      : THREE.MathUtils.smoothstep(Math.min(1, (now - bornAt) / 560), 0, 1);
    const targetScale = Math.max(0.001, reveal * baseScale);
    const ease = reduceMotion ? 1 : 1 - Math.pow(0.0008, delta);
    child.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      ease
    );

    const recentStateChange = Math.max(0, 1 - (now - stateChangedAt) / 850);
    const bob = reduceMotion ? 0 : Math.sin(time * 1.45 + phase) * 0.008;
    child.position.z = Number(child.userData.baseZ || 0.14) + bob + recentStateChange * 0.045;

    const idleTurn =
      pieceId === "last-call"
        ? time * 0.08
        : pieceId === "echo-coil"
          ? Math.sin(time * (2.2 + state * 0.5) + phase) * (0.018 + state * 0.012)
          : Math.sin(time * 0.72 + phase) * 0.006;
    child.rotation.z = Number(child.userData.baseRotation || 0) + (reduceMotion ? 0 : idleTurn);

    child.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const surfaces = Array.isArray(object.material) ? object.material : [object.material];
      surfaces.forEach((surface) => {
        if (!(surface instanceof THREE.MeshStandardMaterial)) return;
        const base = Number(surface.userData.baseEmissiveIntensity || 0);
        surface.emissiveIntensity = base + recentStateChange * 0.42;
      });
      if (object.userData.dealerPointer) {
        object.rotation.z = state > 0 ? time * 0.9 : 0;
      }
      if (object.userData.bellDome) {
        object.rotation.y = reduceMotion ? 0 : Math.sin(time * 2.5 + phase) * state * 0.025;
      }
    });
  }
}
