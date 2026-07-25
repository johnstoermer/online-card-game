import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Card, GameEvent, PublicPlayer } from "../shared/types";
import { labelForRank, symbolForSuit } from "../shared/game";

interface CardObject {
  card: Card;
  group: THREE.Group;
  targetPosition: THREE.Vector3;
  targetRotation: THREE.Euler;
  selected: boolean;
  hovered: boolean;
  outgoing: boolean;
  bornAt: number;
  index: number;
}

interface BurstCube {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  bornAt: number;
  life: number;
}

type SceneMode = "home" | "lobby" | "playing" | "intermission" | "gameover";

const SUIT_COLORS: Record<Card["suit"], string> = {
  hearts: "#c94335",
  diamonds: "#c94335",
  clubs: "#182823",
  spades: "#182823"
};

const CARD_WIDTH = 1.26;
const CARD_HEIGHT = 1.78;

export class TableScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(31, 1, 0.1, 50);
  private table = new THREE.Group();
  private world = new THREE.Group();
  private handObjects = new Map<string, CardObject>();
  private pickTargets: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private mode: SceneMode = "home";
  private hoveredId: string | null = null;
  private burstCubes: BurstCube[] = [];
  private ambientBlocks: THREE.Mesh[] = [];
  private opponentGroup = new THREE.Group();
  private centerAssembly = new THREE.Group();
  private clock = new THREE.Clock();
  private cameraShake = 0;
  private scorePulse = 0;
  private reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private onCardClick?: (cardId: string) => void;
  private onCardHover?: (cardId: string | null) => void;
  private onCardReorder?: (cardId: string, toIndex: number, finished: boolean) => void;
  private dragCandidate?: { cardId: string; pointerId: number; x: number; y: number };
  private draggingId: string | null = null;
  private dragIndex = -1;
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.8);
  private homeCards: Card[] = [
    { id: "demo-h-14", suit: "hearts", rank: 14 },
    { id: "demo-s-13", suit: "spades", rank: 13 },
    { id: "demo-d-12", suit: "diamonds", rank: 12 },
    { id: "demo-c-11", suit: "clubs", rank: 11 },
    { id: "demo-h-10", suit: "hearts", rank: 10 }
  ];

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color("#06110e");
    this.scene.fog = new THREE.FogExp2("#06110e", 0.055);
    this.camera.position.set(0, -0.05, 15);
    this.world.rotation.x = -0.035;
    this.scene.add(this.world);
    this.world.add(this.table, this.opponentGroup);
    this.buildLights();
    this.buildTable();
    this.buildAmbient();
    this.setHand(this.homeCards, new Set());
    this.bind();
    this.resize();
    this.animate();
  }

  setCallbacks(
    onClick: (cardId: string) => void,
    onHover: (cardId: string | null) => void,
    onReorder: (cardId: string, toIndex: number, finished: boolean) => void
  ): void {
    this.onCardClick = onClick;
    this.onCardHover = onHover;
    this.onCardReorder = onReorder;
  }

  setMode(mode: SceneMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === "home") {
      this.setHand(this.homeCards, new Set());
    }
  }

  setHand(cards: Card[], selected: Set<string>): void {
    const desiredIds = new Set(cards.map((card) => card.id));
    for (const [id, object] of this.handObjects) {
      if (!desiredIds.has(id) && !object.outgoing) {
        object.outgoing = true;
        object.targetPosition.set(4.65, 0.7, 0.5);
        object.targetRotation.set(0, 0, -0.55);
        setTimeout(() => this.removeCard(id), this.reduceMotion ? 80 : 450);
      }
    }

    cards.forEach((card, index) => {
      let object = this.handObjects.get(card.id);
      if (!object) {
        object = this.createCardObject(card, index);
        this.handObjects.set(card.id, object);
        this.table.add(object.group);
      }
      object.index = index;
      object.selected = selected.has(card.id);
      object.outgoing = false;
      object.group.visible = true;
    });
    this.layoutHand(cards.length);
  }

  setSelected(selected: Set<string>): void {
    for (const object of this.handObjects.values()) object.selected = selected.has(object.card.id);
    this.layoutHand(
      [...this.handObjects.values()].filter((object) => !object.outgoing && !object.card.id.startsWith("demo-"))
        .length || this.handObjects.size
    );
  }

  setPlayers(players: PublicPlayer[], ownId: string): void {
    while (this.opponentGroup.children.length) {
      const child = this.opponentGroup.children.pop();
      if (child) this.disposeObject(child);
    }
    const others = players.filter((player) => player.id !== ownId);
    const spacing = 3.2;
    others.forEach((player, index) => {
      const group = new THREE.Group();
      group.userData.playerId = player.id;
      const startX = -((others.length - 1) * spacing) / 2;
      group.position.set(startX + index * spacing, 3.2, -0.25);

      const rail = new THREE.Mesh(
        new RoundedBoxGeometry(2.25, 0.72, 0.28, 3, 0.08),
        new THREE.MeshStandardMaterial({
          color: player.connected ? "#172c25" : "#111a17",
          roughness: 0.75,
          metalness: 0.08
        })
      );
      rail.castShadow = true;
      group.add(rail);

      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.46, 0.38),
        new THREE.MeshStandardMaterial({
          color: player.color,
          emissive: player.color,
          emissiveIntensity: player.connected ? 0.22 : 0
        })
      );
      marker.position.set(-0.92, 0, 0.07);
      group.add(marker);

      for (let cardIndex = 0; cardIndex < Math.min(5, player.handCount); cardIndex += 1) {
        const card = new THREE.Mesh(
          new RoundedBoxGeometry(0.34, 0.48, 0.07, 2, 0.025),
          new THREE.MeshStandardMaterial({
            color: "#d8c6a2",
            roughness: 0.76
          })
        );
        card.position.set(-0.5 + cardIndex * 0.23, -0.02, 0.23 + cardIndex * 0.012);
        card.rotation.z = (cardIndex - 2) * 0.035;
        card.castShadow = true;
        group.add(card);
      }
      this.opponentGroup.add(group);
    });
  }

  playEvent(event: GameEvent, ownId: string): void {
    if (event.kind === "hand-played") {
      const ownPlay = event.playerId === ownId;
      if (ownPlay) {
        event.cards.forEach((card, index) => {
          const object = this.handObjects.get(card.id);
          if (!object) return;
          object.outgoing = true;
          object.targetPosition.set((index - (event.cards.length - 1) / 2) * 0.6, 0.22, 2.25 + index * 0.03);
          object.targetRotation.set(0.08, 0, (index - (event.cards.length - 1) / 2) * 0.055);
          setTimeout(() => this.removeCard(card.id), this.reduceMotion ? 100 : 900);
        });
      } else {
        this.spawnGhostHand(event.cards, event.playerId);
      }
      const fires = event.score.enginePulses.filter((pulse) => pulse.kind === "fire").length;
      const growth = event.score.enginePulses.filter((pulse) => pulse.kind === "grow").length;
      const power = Math.min(3.2, 0.65 + event.score.total / 500 + fires * 0.7 + growth * 0.2);
      setTimeout(() => this.burst(power, event.playerId === ownId ? "#e8b057" : "#7aa79a"), ownPlay ? 350 : 100);
      event.score.enginePulses.slice(0, 3).forEach((pulse, index) => {
        const color =
          pulse.kind === "fire" ? "#e45f45" : pulse.kind === "grow" ? "#d8a746" : "#66a696";
        const pulsePower = pulse.kind === "fire" ? 2.6 : pulse.kind === "grow" ? 1.45 : 0.85;
        setTimeout(() => this.burst(pulsePower, color), (ownPlay ? 430 : 170) + index * 125);
      });
      this.cameraShake = Math.max(this.cameraShake, power * (fires ? 0.115 : 0.08));
      this.scorePulse = fires ? 1.65 : growth ? 1.25 : 1;
    }
    if (event.kind === "cards-discarded" && event.playerId === ownId) {
      event.cards.forEach((card) => {
        const object = this.handObjects.get(card.id);
        if (!object) return;
        object.outgoing = true;
        object.targetPosition.set(-5.1, 1.2, 0.4);
        object.targetRotation.set(0.2, 0.5, 1.1);
        setTimeout(() => this.removeCard(card.id), this.reduceMotion ? 80 : 520);
      });
    }
    if (event.kind === "round-won") {
      this.burst(3.2, "#e8b057");
      setTimeout(() => this.burst(2.4, "#d76049"), 180);
      setTimeout(() => this.burst(2.1, "#75a998"), 330);
      this.cameraShake = 0.22;
    }
    if (event.kind === "round-lost") {
      this.cameraShake = 0.16;
    }
    if (event.kind === "round-started") {
      this.centerAssembly.rotation.z = 0;
      this.scorePulse = 1;
    }
  }

  pulseSelection(): void {
    this.scorePulse = Math.max(this.scorePulse, 0.35);
  }

  resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const landscape = width / height;
    this.camera.fov = landscape < 0.8 ? 43 : landscape < 1.25 ? 36 : 31;
    this.camera.updateProjectionMatrix();
  }

  private bind(): void {
    window.addEventListener("resize", () => this.resize());
    this.canvas.addEventListener("pointermove", (event) => this.handlePointer(event));
    this.canvas.addEventListener("pointerdown", (event) => {
      const id = this.cardAtPointer(event);
      if (!id || id.startsWith("demo-") || this.mode !== "playing") return;
      this.dragCandidate = {
        cardId: id,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY
      };
      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    this.canvas.addEventListener("pointerup", (event) => this.finishPointer(event));
    this.canvas.addEventListener("pointercancel", (event) => this.finishPointer(event, true));
    this.canvas.addEventListener("pointerleave", () => {
      if (!this.dragCandidate) this.setHovered(null);
    });
  }

  private buildLights(): void {
    const ambient = new THREE.HemisphereLight("#d8e4d8", "#08110e", 1.45);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight("#ffe0a4", 3.3);
    key.position.set(-4, 7, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    const rim = new THREE.PointLight("#c84c38", 6, 18, 2);
    rim.position.set(7, -3, 4);
    this.scene.add(rim);

    const cool = new THREE.PointLight("#4f9285", 5, 16, 2);
    cool.position.set(-7, 1, 3);
    this.scene.add(cool);
  }

  private buildTable(): void {
    const deepWood = new THREE.MeshStandardMaterial({
      color: "#352116",
      roughness: 0.64,
      metalness: 0.02
    });
    const warmWood = new THREE.MeshStandardMaterial({
      color: "#65432a",
      roughness: 0.62,
      metalness: 0.03
    });
    const felt = new THREE.MeshStandardMaterial({
      color: "#123b30",
      roughness: 0.94,
      metalness: 0,
      bumpScale: 0.02
    });
    const brass = new THREE.MeshStandardMaterial({
      color: "#b6843c",
      roughness: 0.38,
      metalness: 0.68
    });

    const underbody = new THREE.Mesh(new RoundedBoxGeometry(14.8, 9.3, 0.72, 5, 0.38), deepWood);
    underbody.position.z = -0.78;
    underbody.castShadow = true;
    underbody.receiveShadow = true;
    this.table.add(underbody);

    const edge = new THREE.Mesh(new RoundedBoxGeometry(14.35, 8.9, 0.58, 5, 0.32), warmWood);
    edge.position.z = -0.38;
    edge.castShadow = true;
    edge.receiveShadow = true;
    this.table.add(edge);

    const surface = new THREE.Mesh(new RoundedBoxGeometry(13.35, 7.9, 0.22, 5, 0.3), felt);
    surface.position.z = -0.03;
    surface.receiveShadow = true;
    this.table.add(surface);

    const inlayGeometry = new THREE.TorusGeometry(2.05, 0.025, 6, 96);
    const inlay = new THREE.Mesh(inlayGeometry, brass);
    inlay.position.z = 0.105;
    this.table.add(inlay);

    const innerInlay = new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.012, 5, 96), brass);
    innerInlay.position.z = 0.106;
    this.table.add(innerInlay);

    const cornerPositions = [
      [-6.45, -3.7],
      [6.45, -3.7],
      [-6.45, 3.7],
      [6.45, 3.7]
    ];
    for (const [x, y] of cornerPositions) {
      const cap = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.52, 0.3, 3, 0.06), brass);
      cap.position.set(x, y, 0);
      cap.rotation.z = Math.PI / 4;
      cap.castShadow = true;
      this.table.add(cap);
    }

    this.buildDeck();
    this.buildCenterAssembly(brass);
  }

  private buildDeck(): void {
    const backTexture = this.makeCardBackTexture();
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: "#d6c59f",
      roughness: 0.75
    });
    const backMaterial = new THREE.MeshStandardMaterial({
      map: backTexture,
      roughness: 0.66,
      metalness: 0.03
    });
    for (let index = 0; index < 9; index += 1) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new RoundedBoxGeometry(1.02, 1.43, 0.07, 2, 0.05), edgeMaterial);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 1.35), backMaterial);
      back.position.z = 0.038;
      group.add(body, back);
      group.position.set(4.92 + index * 0.006, 0.65 + index * 0.004, 0.18 + index * 0.052);
      group.rotation.z = -0.08 + index * 0.002;
      body.castShadow = true;
      this.table.add(group);
    }
  }

  private buildCenterAssembly(brass: THREE.Material): void {
    const darkMetal = new THREE.MeshStandardMaterial({
      color: "#18211d",
      roughness: 0.4,
      metalness: 0.65
    });
    const copper = new THREE.MeshStandardMaterial({
      color: "#c3543e",
      emissive: "#5a120d",
      emissiveIntensity: 0.2,
      roughness: 0.42,
      metalness: 0.55
    });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.18, 12), darkMetal);
    hub.rotation.x = Math.PI / 2;
    this.centerAssembly.add(hub);
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.12), index % 2 ? brass : copper);
      arm.position.set(Math.cos(angle) * 0.83, Math.sin(angle) * 0.83, 0);
      arm.rotation.z = angle;
      arm.castShadow = true;
      this.centerAssembly.add(arm);
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.2), darkMetal);
      tooth.position.set(Math.cos(angle) * 1.13, Math.sin(angle) * 1.13, 0);
      tooth.rotation.z = angle;
      tooth.castShadow = true;
      this.centerAssembly.add(tooth);
    }
    this.centerAssembly.position.z = 0.2;
    this.table.add(this.centerAssembly);
  }

  private buildAmbient(): void {
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    for (let index = 0; index < 38; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: index % 3 === 0 ? "#bf573e" : index % 3 === 1 ? "#d0a452" : "#4e8175",
        transparent: true,
        opacity: 0.18 + Math.random() * 0.25
      });
      const block = new THREE.Mesh(geometry, material);
      block.position.set(
        (Math.random() - 0.5) * 21,
        (Math.random() - 0.5) * 13,
        -1 + Math.random() * 5
      );
      block.scale.setScalar(0.5 + Math.random() * 1.5);
      block.userData.speed = 0.08 + Math.random() * 0.18;
      block.userData.phase = Math.random() * Math.PI * 2;
      this.scene.add(block);
      this.ambientBlocks.push(block);
    }
  }

  private createCardObject(card: Card, index: number): CardObject {
    const group = new THREE.Group();
    group.userData.cardId = card.id;
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: "#c8b58f",
      roughness: 0.7,
      metalness: 0.02
    });
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(CARD_WIDTH, CARD_HEIGHT, 0.12, 4, 0.07),
      edgeMaterial
    );
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.cardId = card.id;

    const texture = this.makeCardTexture(card);
    const front = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_WIDTH - 0.07, CARD_HEIGHT - 0.07),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.82,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -1
      })
    );
    front.position.z = 0.064;
    front.userData.cardId = card.id;
    group.add(body, front);
    this.pickTargets.push(front, body);

    const startPosition =
      this.mode === "home"
        ? new THREE.Vector3(4.8, 0.6, 0.5)
        : new THREE.Vector3(4.9, 0.7, 0.62 + index * 0.04);
    group.position.copy(startPosition);
    group.rotation.z = -0.2;
    group.scale.setScalar(this.reduceMotion ? 1 : 0.72);

    return {
      card,
      group,
      targetPosition: startPosition.clone(),
      targetRotation: new THREE.Euler(),
      selected: false,
      hovered: false,
      outgoing: false,
      bornAt: performance.now(),
      index
    };
  }

  private layoutHand(count: number): void {
    const active = [...this.handObjects.values()]
      .filter((object) => !object.outgoing)
      .sort((a, b) => a.index - b.index);
    const home = this.mode === "home";
    const usableWidth = home ? 5.4 : Math.min(8.7, Math.max(5.8, window.innerWidth / 145));
    const spacing = Math.min(home ? 0.82 : 1.05, usableWidth / Math.max(1, count - 1));
    active.forEach((object, index) => {
      if (object.card.id === this.draggingId) {
        object.targetPosition.z = 2.4;
        object.targetRotation.set(-0.08, 0, 0);
        return;
      }
      const centered = index - (active.length - 1) / 2;
      const arc = Math.abs(centered) * 0.035;
      const lift = object.selected ? 0.54 : object.hovered ? 0.2 : 0;
      const baseY = home ? -2.05 : -2.95;
      object.targetPosition.set(centered * spacing, baseY + lift - arc, 0.55 + (active.length - index) * 0.018 + lift * 0.5);
      object.targetRotation.set(
        object.selected ? -0.06 : 0,
        centered * -0.018,
        centered * (home ? -0.055 : -0.025)
      );
    });
  }

  private makeCardTexture(card: Card): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 720;
    const context = canvas.getContext("2d")!;
    const color = SUIT_COLORS[card.suit];
    context.fillStyle = "#f2e7ce";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "#e9dac0";
    for (let y = 0; y < canvas.height; y += 12) {
      for (let x = (y / 12) % 2 ? 6 : 0; x < canvas.width; x += 12) {
        if ((x * 13 + y * 7) % 41 < 4) context.fillRect(x, y, 2, 2);
      }
    }

    context.strokeStyle = "#24342e";
    context.lineWidth = 10;
    context.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
    context.strokeStyle = "#aa7d37";
    context.lineWidth = 3;
    context.strokeRect(38, 38, canvas.width - 76, canvas.height - 76);

    const rank = labelForRank(card.rank);
    const suit = symbolForSuit(card.suit);
    context.fillStyle = color;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = '700 96px "Fraunces Variable", Georgia, serif';
    context.fillText(rank, 88, 103);
    context.font = '700 54px "Fraunces Variable", Georgia, serif';
    context.fillText(suit, 88, 177);

    context.save();
    context.translate(canvas.width, canvas.height);
    context.rotate(Math.PI);
    context.font = '700 96px "Fraunces Variable", Georgia, serif';
    context.fillText(rank, 88, 103);
    context.font = '700 54px "Fraunces Variable", Georgia, serif';
    context.fillText(suit, 88, 177);
    context.restore();

    context.fillStyle = color;
    context.font = '700 184px "Fraunces Variable", Georgia, serif';
    context.globalAlpha = 0.95;
    context.fillText(suit, canvas.width / 2, canvas.height / 2 + 8);

    context.globalAlpha = 0.09;
    context.fillStyle = color;
    for (let index = 0; index < 8; index += 1) {
      context.fillRect(142 + index * 31, 262 + (index % 2) * 54, 18, 18);
    }

    context.globalAlpha = 1;
    context.fillStyle = "#8b6a38";
    context.font = '650 19px "Manrope Variable", Arial, sans-serif';
    context.letterSpacing = "4px";
    context.fillText(card.suit.toUpperCase(), canvas.width / 2, canvas.height - 59);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  private makeCardBackTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 360;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#b94d38";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#e1b35d";
    context.lineWidth = 8;
    context.strokeRect(13, 13, canvas.width - 26, canvas.height - 26);
    context.lineWidth = 2;
    context.strokeRect(26, 26, canvas.width - 52, canvas.height - 52);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(Math.PI / 4);
    for (let x = -180; x < 180; x += 22) {
      for (let y = -180; y < 180; y += 22) {
        context.fillStyle = (x + y) % 44 === 0 ? "#e2b35a" : "#6e2a25";
        context.fillRect(x, y, 10, 10);
      }
    }
    context.restore();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private spawnGhostHand(cards: Card[], playerId: string): void {
    const opponents = [...this.opponentGroup.children];
    const seatIndex = Math.max(
      0,
      opponents.findIndex((group) => group.userData.playerId === playerId)
    );
    cards.forEach((card, index) => {
      const object = this.createCardObject({ ...card, id: `ghost-${Date.now()}-${index}` }, index);
      this.pickTargets = this.pickTargets.filter((target) => target.parent !== object.group);
      object.outgoing = true;
      object.group.position.set((seatIndex - 1) * 2.2, 3.1, 0.5);
      object.targetPosition.set((index - (cards.length - 1) / 2) * 0.58, 0.35, 1.5 + index * 0.03);
      object.targetRotation.set(0.08, 0, (index - 2) * 0.05);
      this.table.add(object.group);
      setTimeout(() => {
        this.disposeObject(object.group);
        object.group.removeFromParent();
      }, this.reduceMotion ? 180 : 1050);
    });
  }

  private burst(power: number, color: string): void {
    const count = this.reduceMotion ? 8 : Math.round(18 + power * 12);
    for (let index = 0; index < count; index += 1) {
      const size = 0.045 + Math.random() * 0.12;
      const material = new THREE.MeshStandardMaterial({
        color: index % 4 === 0 ? "#f5dfac" : color,
        emissive: color,
        emissiveIntensity: 0.28,
        transparent: true,
        opacity: 1,
        roughness: 0.45,
        metalness: 0.15
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material);
      mesh.position.set((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.55, 2.1);
      this.table.add(mesh);
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.8 * power;
      this.burstCubes.push({
        mesh,
        velocity: new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, 1 + Math.random() * 2),
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        bornAt: performance.now(),
        life: 650 + Math.random() * 550
      });
    }
  }

  private handlePointer(event: PointerEvent): void {
    if (this.dragCandidate && this.dragCandidate.pointerId === event.pointerId) {
      const distance = Math.hypot(
        event.clientX - this.dragCandidate.x,
        event.clientY - this.dragCandidate.y
      );
      if (!this.draggingId && distance > 7) {
        this.draggingId = this.dragCandidate.cardId;
        this.dragIndex = this.handObjects.get(this.draggingId)?.index ?? 0;
        this.canvas.classList.add("is-dragging-card");
        this.setHovered(null);
        this.onCardReorder?.(this.draggingId, this.dragIndex, false);
      }
      if (this.draggingId) {
        const object = this.handObjects.get(this.draggingId);
        const point = this.tablePointAtPointer(event);
        if (object && point) {
          object.targetPosition.x = THREE.MathUtils.clamp(point.x, -4.8, 4.8);
          object.targetPosition.y = THREE.MathUtils.clamp(point.y, -3.35, -1.65);
          object.targetPosition.z = 2.4;
          const others = [...this.handObjects.values()]
            .filter((candidate) => !candidate.outgoing && candidate.card.id !== this.draggingId)
            .sort((left, right) => left.index - right.index);
          const nextIndex = others.filter(
            (candidate) => candidate.targetPosition.x < object.targetPosition.x
          ).length;
          if (nextIndex !== this.dragIndex) {
            this.dragIndex = nextIndex;
            this.onCardReorder?.(this.draggingId, nextIndex, false);
          }
        }
        event.preventDefault();
        return;
      }
    }
    const id = this.cardAtPointer(event);
    this.setHovered(id?.startsWith("demo-") ? null : id);
  }

  private finishPointer(event: PointerEvent, cancelled = false): void {
    const candidate = this.dragCandidate;
    if (!candidate || candidate.pointerId !== event.pointerId) return;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    if (this.draggingId) {
      const draggedId = this.draggingId;
      const finalIndex = this.dragIndex;
      this.draggingId = null;
      this.dragIndex = -1;
      this.canvas.classList.remove("is-dragging-card");
      this.layoutHand([...this.handObjects.values()].filter((object) => !object.outgoing).length);
      if (!cancelled) this.onCardReorder?.(draggedId, finalIndex, true);
    } else if (!cancelled) {
      this.onCardClick?.(candidate.cardId);
    }
    this.dragCandidate = undefined;
  }

  private tablePointAtPointer(event: PointerEvent): THREE.Vector3 | null {
    this.updateRaycaster(event);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, point)) return null;
    return this.table.worldToLocal(point);
  }

  private updateRaycaster(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private cardAtPointer(event: PointerEvent): string | null {
    this.updateRaycaster(event);
    const intersections = this.raycaster.intersectObjects(this.pickTargets, false);
    for (const intersection of intersections) {
      const id = intersection.object.userData.cardId as string | undefined;
      const object = id ? this.handObjects.get(id) : undefined;
      if (id && object && !object.outgoing) return id;
    }
    return null;
  }

  private setHovered(id: string | null): void {
    if (id === this.hoveredId) return;
    this.hoveredId = id;
    for (const object of this.handObjects.values()) object.hovered = object.card.id === id;
    this.layoutHand([...this.handObjects.values()].filter((object) => !object.outgoing).length);
    this.onCardHover?.(id);
    this.canvas.style.cursor = id ? "pointer" : "default";
  }

  private removeCard(id: string): void {
    const object = this.handObjects.get(id);
    if (!object) return;
    this.pickTargets = this.pickTargets.filter((target) => target.parent !== object.group);
    this.disposeObject(object.group);
    object.group.removeFromParent();
    this.handObjects.delete(id);
  }

  private disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial && material.map) material.map.dispose();
        material.dispose();
      });
    });
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const delta = Math.min(0.033, this.clock.getDelta());
    const now = performance.now();
    const time = now / 1000;
    const ease = this.reduceMotion ? 1 : 1 - Math.pow(0.001, delta);

    for (const object of this.handObjects.values()) {
      const age = (now - object.bornAt) / 1000;
      object.group.position.lerp(object.targetPosition, ease);
      object.group.rotation.x = THREE.MathUtils.lerp(object.group.rotation.x, object.targetRotation.x, ease);
      object.group.rotation.y = THREE.MathUtils.lerp(object.group.rotation.y, object.targetRotation.y, ease);
      object.group.rotation.z = THREE.MathUtils.lerp(object.group.rotation.z, object.targetRotation.z, ease);
      const desiredScale = object.outgoing
        ? 0.96
        : object.card.id === this.draggingId
          ? 1.06
          : 1;
      object.group.scale.lerp(new THREE.Vector3(desiredScale, desiredScale, desiredScale), ease);
      if (!this.reduceMotion && this.mode === "home") {
        object.group.position.y += Math.sin(time * 1.2 + object.index * 0.7) * 0.0018;
        object.group.rotation.y += Math.sin(time * 0.8 + object.index) * 0.0005;
      }
      if (!this.reduceMotion && age < 0.5) {
        object.group.rotation.z += Math.sin(age * Math.PI * 5) * 0.003;
      }
    }

    for (const block of this.ambientBlocks) {
      block.position.y += Math.sin(time * block.userData.speed + block.userData.phase) * delta * 0.025;
      block.rotation.x += delta * block.userData.speed;
      block.rotation.y += delta * block.userData.speed * 0.7;
    }

    this.centerAssembly.rotation.z += delta * (0.08 + this.scorePulse * 1.6);
    this.centerAssembly.position.z = 0.2 + Math.sin(time * 1.4) * 0.025 + this.scorePulse * 0.08;
    this.scorePulse = Math.max(0, this.scorePulse - delta * 1.4);

    this.burstCubes = this.burstCubes.filter((cube) => {
      const age = now - cube.bornAt;
      if (age >= cube.life) {
        cube.mesh.geometry.dispose();
        (cube.mesh.material as THREE.Material).dispose();
        cube.mesh.removeFromParent();
        return false;
      }
      cube.velocity.z -= delta * 5;
      cube.mesh.position.addScaledVector(cube.velocity, delta);
      cube.mesh.rotation.x += cube.spin.x * delta;
      cube.mesh.rotation.y += cube.spin.y * delta;
      cube.mesh.rotation.z += cube.spin.z * delta;
      const progress = age / cube.life;
      (cube.mesh.material as THREE.MeshStandardMaterial).opacity = 1 - progress;
      cube.mesh.scale.setScalar(1 - progress * 0.65);
      return true;
    });

    const homeDrift = this.mode === "home" && !this.reduceMotion ? Math.sin(time * 0.18) * 0.06 : 0;
    this.table.rotation.z = THREE.MathUtils.lerp(
      this.table.rotation.z,
      this.mode === "home" ? -0.025 + homeDrift : 0,
      delta * 1.5
    );
    this.table.position.y = THREE.MathUtils.lerp(
      this.table.position.y,
      this.mode === "home" ? -0.15 : 0,
      delta * 1.8
    );

    if (this.cameraShake > 0.001 && !this.reduceMotion) {
      this.camera.position.x = (Math.random() - 0.5) * this.cameraShake;
      this.camera.position.y = -0.05 + (Math.random() - 0.5) * this.cameraShake;
      this.cameraShake *= Math.pow(0.02, delta);
    } else {
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, 0, delta * 8);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, -0.05, delta * 8);
    }

    this.renderer.render(this.scene, this.camera);
  };
}
