import * as THREE from "three";
import type { Card, RoomView, Suit } from "../shared/types";
import { effectiveSuit, isLeftBower, isRightBower } from "../shared/game";

const SUIT_SYMBOL: Record<Suit, string> = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const SUIT_COLOR: Record<Suit, string> = { clubs: "#17201d", diamonds: "#b74739", hearts: "#b74739", spades: "#17201d" };
const SEAT_POSITIONS = [new THREE.Vector3(0, .12, 3.4), new THREE.Vector3(-5.1, .12, 0), new THREE.Vector3(0, .12, -3.4), new THREE.Vector3(5.1, .12, 0)];

interface CardObject { group: THREE.Group; card: Card; target: THREE.Vector3; legal: boolean; }

export class TableScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  private table = new THREE.Group();
  private handGroup = new THREE.Group();
  private trickGroup = new THREE.Group();
  private seatGroup = new THREE.Group();
  private cards = new Map<string, CardObject>();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private onCardClick?: (cardId: string) => void;
  private hoveredId: string | null = null;
  private reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private lastTime = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.fog = new THREE.FogExp2(0x07120e, .033);
    this.camera.position.set(0, 10.8, 10.8);
    this.camera.lookAt(0, 0, .25);
    this.buildWorld();
    this.canvas.addEventListener("pointermove", (event) => this.pick(event, false));
    this.canvas.addEventListener("pointerleave", () => { this.hoveredId = null; });
    this.canvas.addEventListener("pointerup", (event) => this.pick(event, true));
    addEventListener("resize", () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop((time) => this.animate(time));
  }

  setCardHandler(handler: (cardId: string) => void): void { this.onCardClick = handler; }

  setState(room: RoomView | null, ownSeat = 0): void {
    if (!room) return;
    this.setHand(room.hand, new Set(room.legalCardIds), room.trump);
    this.setTrick(room, ownSeat);
    this.setSeats(room, ownSeat);
    const trumpToken = this.table.getObjectByName("trump-token") as THREE.Group | undefined;
    if (trumpToken) {
      trumpToken.visible = Boolean(room.trump);
      const face = trumpToken.getObjectByName("trump-face") as THREE.Mesh | undefined;
      if (face && room.trump) (face.material as THREE.MeshStandardMaterial).map = this.makeTextTexture(SUIT_SYMBOL[room.trump], room.trump === "hearts" || room.trump === "diamonds" ? "#c75745" : "#19231f", "#efe3c5", 112);
    }
    const dealer = this.table.getObjectByName("dealer-puck");
    if (dealer) dealer.position.copy(this.rotatedSeatPosition(room.dealerSeat, ownSeat)).multiplyScalar(.82).setY(.24);
  }

  private buildWorld(): void {
    const ambient = new THREE.HemisphereLight(0xe7d7b4, 0x08110d, 1.7);
    const key = new THREE.SpotLight(0xffd99d, 95, 30, Math.PI / 5, .6, 1.5);
    key.position.set(-4, 11, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    const rim = new THREE.PointLight(0x4b806b, 24, 18); rim.position.set(6, 4, -5);
    this.scene.add(ambient, key, rim);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(18, 64), new THREE.MeshStandardMaterial({ color: 0x08120e, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.72; floor.receiveShadow = true; this.scene.add(floor);

    const base = new THREE.Mesh(new THREE.BoxGeometry(11.9, .68, 7.7, 6, 2, 6), new THREE.MeshStandardMaterial({ color: 0x301f16, roughness: .72 }));
    base.position.y = -.28; base.castShadow = base.receiveShadow = true;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(11.45, .32, 7.25, 6, 2, 6), new THREE.MeshStandardMaterial({ color: 0x80512e, roughness: .52, metalness: .05 }));
    rail.position.y = .15; rail.castShadow = true;
    const felt = new THREE.Mesh(new THREE.BoxGeometry(10.45, .22, 6.25, 6, 1, 6), new THREE.MeshStandardMaterial({ color: 0x174737, roughness: .94 }));
    felt.position.y = .34; felt.receiveShadow = true;
    const line = new THREE.Mesh(new THREE.TorusGeometry(2.15, .025, 6, 64), new THREE.MeshStandardMaterial({ color: 0xc89d59, roughness: .5, metalness: .5 }));
    line.rotation.x = Math.PI / 2; line.position.y = .48;
    this.table.add(base, rail, felt, line, this.handGroup, this.trickGroup, this.seatGroup);

    const dealer = new THREE.Mesh(new THREE.CylinderGeometry(.27, .27, .11, 32), new THREE.MeshStandardMaterial({ color: 0xeee2c6, roughness: .35 }));
    dealer.name = "dealer-puck"; dealer.userData.baseY = .24; dealer.castShadow = true;
    const dealerTexture = this.makeTextTexture("D", "#1a211d", "#eee2c6", 60);
    const cap = new THREE.Mesh(new THREE.CircleGeometry(.2, 32), new THREE.MeshBasicMaterial({ map: dealerTexture, transparent: true }));
    cap.rotation.x = -Math.PI / 2; cap.position.y = .061; dealer.add(cap); this.table.add(dealer);

    const trump = new THREE.Group(); trump.name = "trump-token"; trump.position.set(0, .62, -.15); trump.visible = false;
    const trumpBody = new THREE.Mesh(new THREE.BoxGeometry(1.15, .1, 1.15), new THREE.MeshStandardMaterial({ color: 0xb98c4d, roughness: .45, metalness: .4 }));
    const trumpFace = new THREE.Mesh(new THREE.PlaneGeometry(.88, .88), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    trumpFace.name = "trump-face"; trumpFace.rotation.x = -Math.PI / 2; trumpFace.position.y = .061; trump.add(trumpBody, trumpFace); this.table.add(trump);
    this.scene.add(this.table);

    for (let x = -13; x <= 13; x += 2.6) {
      const dust = new THREE.Mesh(new THREE.IcosahedronGeometry(.018, 0), new THREE.MeshBasicMaterial({ color: 0xd9bc82, transparent: true, opacity: .26 }));
      dust.position.set(x, 2 + Math.random() * 6, -6 + Math.random() * 10); dust.userData.float = Math.random() * 10; this.scene.add(dust);
    }
  }

  private setHand(hand: Card[], legalIds: Set<string>, trump: Suit | null): void {
    const desired = new Set(hand.map((card) => card.id));
    for (const [id, object] of this.cards) if (!desired.has(id)) { this.handGroup.remove(object.group); this.cards.delete(id); }
    hand.forEach((card, index) => {
      let object = this.cards.get(card.id);
      if (!object) {
        object = { group: this.createCard(card, trump), card, target: new THREE.Vector3(), legal: false };
        this.cards.set(card.id, object); this.handGroup.add(object.group);
      }
      object.legal = legalIds.has(card.id);
      object.group.userData.legal = object.legal;
      const spread = Math.min(1.02, 4.2 / Math.max(hand.length - 1, 1));
      object.target.set((index - (hand.length - 1) / 2) * spread, object.legal ? .91 : .72, 2.15 + Math.abs(index - 2) * .045);
      object.group.rotation.set(.3, 0, (index - 2) * -.035);
    });
  }

  private setTrick(room: RoomView, ownSeat: number): void {
    while (this.trickGroup.children.length) this.trickGroup.remove(this.trickGroup.children[0]);
    if (room.phase === "bidding" && room.upcard) {
      const upcard = this.createCard(room.upcard, room.bidRound === 1 ? room.upcard.suit : null);
      upcard.position.set(0, .64, 0);
      upcard.rotation.set(0, 0, -.07);
      upcard.scale.setScalar(.82);
      this.trickGroup.add(upcard);
    }
    for (const play of room.currentTrick) {
      const card = this.createCard(play.card, room.trump);
      const relative = (play.seat - ownSeat + 4) % 4;
      const positions = [new THREE.Vector3(0, .62, 1.22), new THREE.Vector3(-1.28, .62, 0), new THREE.Vector3(0, .62, -1.22), new THREE.Vector3(1.28, .62, 0)];
      card.position.copy(positions[relative]); card.rotation.set(0, 0, relative % 2 ? Math.PI / 2 : 0); card.scale.setScalar(.76); this.trickGroup.add(card);
    }
  }

  private setSeats(room: RoomView, ownSeat: number): void {
    while (this.seatGroup.children.length) this.seatGroup.remove(this.seatGroup.children[0]);
    for (const player of room.players) {
      if (player.seat === ownSeat) continue;
      const relative = (player.seat - ownSeat + 4) % 4;
      const group = new THREE.Group(); group.position.copy(SEAT_POSITIONS[relative]).multiplyScalar(.88);
      const count = room.sittingOutSeat === player.seat ? 0 : player.handCount;
      for (let index = 0; index < count; index += 1) {
        const card = new THREE.Mesh(new THREE.BoxGeometry(.72, .05, 1.02), [new THREE.MeshStandardMaterial({ color: 0xe8dec5 }), new THREE.MeshStandardMaterial({ color: 0x172c25 }), new THREE.MeshStandardMaterial({ color: 0x244e41 }), new THREE.MeshStandardMaterial({ color: 0x244e41 }), new THREE.MeshStandardMaterial({ color: 0x244e41 }), new THREE.MeshStandardMaterial({ color: 0x244e41 })]);
        card.position.set((index - (count - 1) / 2) * .18, .15 + index * .012, 0); card.rotation.z = (index - 2) * .045; card.castShadow = true; group.add(card);
      }
      this.seatGroup.add(group);
    }
  }

  private createCard(card: Card, trump: Suit | null): THREE.Group {
    const group = new THREE.Group(); group.userData.cardId = card.id;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.18, .075, 1.7), new THREE.MeshStandardMaterial({ color: 0xe9dfc7, roughness: .6 }));
    body.castShadow = true; body.userData.cardId = card.id;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.6), new THREE.MeshStandardMaterial({ map: this.makeCardTexture(card, trump), roughness: .72 }));
    face.rotation.x = -Math.PI / 2; face.position.y = .041; face.userData.cardId = card.id;
    group.add(body, face); return group;
  }

  private makeCardTexture(card: Card, trump: Suit | null): THREE.CanvasTexture {
    const canvas = document.createElement("canvas"); canvas.width = 384; canvas.height = 560;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#eee4ca"; ctx.fillRect(0, 0, 384, 560);
    ctx.strokeStyle = "#b99e72"; ctx.lineWidth = 10; ctx.strokeRect(18, 18, 348, 524);
    const rank = card.rank === 14 ? "A" : card.rank === 13 ? "K" : card.rank === 12 ? "Q" : card.rank === 11 ? "J" : String(card.rank);
    ctx.fillStyle = SUIT_COLOR[card.suit]; ctx.font = "700 86px Georgia"; ctx.textAlign = "left"; ctx.fillText(rank, 40, 105);
    ctx.font = "72px Georgia"; ctx.fillText(SUIT_SYMBOL[card.suit], 40, 180);
    ctx.textAlign = "center"; ctx.font = "160px Georgia"; ctx.fillText(SUIT_SYMBOL[card.suit], 192, 365);
    if (trump && (isRightBower(card, trump) || isLeftBower(card, trump))) {
      ctx.fillStyle = "#b88b45"; ctx.font = "700 24px Arial"; ctx.fillText(isRightBower(card, trump) ? "RIGHT BOWER" : `LEFT BOWER · ${SUIT_SYMBOL[effectiveSuit(card, trump)]}`, 192, 500);
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
  }

  private makeTextTexture(text: string, color: string, background: string, fontSize: number): THREE.CanvasTexture {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256; const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = background; ctx.fillRect(0, 0, 256, 256); ctx.fillStyle = color; ctx.font = `700 ${fontSize}px Georgia`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 128, 135);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }

  private rotatedSeatPosition(seat: number, ownSeat: number): THREE.Vector3 { return SEAT_POSITIONS[(seat - ownSeat + 4) % 4].clone(); }

  private pick(event: PointerEvent, click: boolean): void {
    const bounds = this.canvas.getBoundingClientRect(); this.pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.cards.values()].map((object) => object.group), true);
    const id = hits.map((hit) => hit.object.userData.cardId || hit.object.parent?.userData.cardId).find(Boolean) as string | undefined;
    this.hoveredId = id || null; this.canvas.style.cursor = id && this.cards.get(id)?.legal ? "pointer" : "default";
    if (click && id && this.cards.get(id)?.legal) this.onCardClick?.(id);
  }

  private resize(): void {
    const width = this.canvas.clientWidth || innerWidth, height = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }

  private animate(time: number): void {
    const delta = Math.min((time - this.lastTime) / 1000 || 0, .05); this.lastTime = time;
    for (const object of this.cards.values()) {
      const hover = object.group.userData.cardId === this.hoveredId && object.legal ? .18 : 0;
      object.group.position.lerp(new THREE.Vector3(object.target.x, object.target.y + hover, object.target.z), this.reduceMotion ? 1 : 1 - Math.pow(.002, delta));
      object.group.scale.setScalar(object.legal ? 1 : .96);
    }
    for (const child of this.scene.children) if (child.userData.float !== undefined) child.position.y += Math.sin(time * .0004 + child.userData.float) * .0008;
    this.table.rotation.z = Math.sin(time * .00013) * .0025;
    this.renderer.render(this.scene, this.camera);
  }
}
