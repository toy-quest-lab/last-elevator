import { loadArt, type Art } from "@/game/art";
import { Sfx } from "@/game/audio";
import {
  applyMove,
  capForHop,
  chooseAiMove,
  exactMove,
  initialBoard,
  legalMoves,
  nextTargets,
  opposite,
  posKey,
  same,
  type Board,
  type Color,
  type Move,
  type Pos,
} from "@/game/checkers";

export type Scene =
  | "menu"
  | "chase"
  | "doors"
  | "panel"
  | "operator"
  | "checkers"
  | "ride"
  | "win"
  | "lose"
  | "draw";

type HopAnim = {
  from: Pos;
  to: Pos;
  cap: Pos | null;
  u: number;
  dur: number;
  capPlayed: boolean;
  ai: boolean;
  move: Move | null;
  hopIndex: number;
  fromSel: Pos | null;
};

type Bit = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  rot: number;
  vr: number;
  c: string;
};

type Stain = { x: number; y: number; s: number; c: string; rot: number };

const OP_ASK = "Шашечки или ехать?";

const WIN_LINES = [
  "Пересадка на автобус. Билеты у водителя.",
  "Приехали. Дома.",
  "Выходи. Лето ещё не кончилось.",
  "Конечная. Можно просто постоять.",
  "Дальше только море.",
  "Садись. Чай уже стынет.",
];

const DRAW_SCRIPT: { who: "op" | "you"; text: string }[] = [
  { who: "op", text: "Ничья. Значит, ни шашечки, ни ехать." },
  { who: "you", text: "И что теперь?!" },
  { who: "op", text: "Ожидайте следующего водителя." },
];

const BANTER = [
  "Не спеши. Мы всё равно стоим.",
  "Шашечки любят тишину.",
  "Хороший ход. Для пассажира.",
  "Водитель всегда прав. Кроме случаев, когда проиграл.",
];

const CHASE_LOOK = 2.15;
const CHASE_BACK = 2.5;
const CHASE_HAND = 3.35;
const CHASE_RETURN = 4.55;
const CHASE_SPRINT = 4.92;
const CHASE_END = 6.9;

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function smooth(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function hash(a: number, b: number): number {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function srcSize(img: CanvasImageSource): { w: number; h: number } {
  if (img instanceof HTMLImageElement) return { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
  if (img instanceof HTMLCanvasElement || img instanceof ImageBitmap) return { w: img.width || 1, h: img.height || 1 };
  return { w: 1, h: 1 };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

type Rect = { x: number; y: number; w: number; h: number };

export class Game {
  readonly audio = new Sfx();
  muted = false;
  scene: Scene = "menu";
  private art: Art | null = null;
  private dead = false;
  private w = 390;
  private h = 844;
  private t = 0;
  private shake = 0;
  private taps: { x: number; y: number }[] = [];
  private flags = new Set<string>();
  private line = 0;
  private lineT = 0;
  private presses = 0;
  private riseT: number | null = null;
  private stepAcc = 0;
  private groanAcc = 0;
  private board: Board = initialBoard();
  private turn: Color = "w";
  private selected: Pos | null = null;
  private chosen: Pos[] = [];
  private hop: HopAnim | null = null;
  private noCap = 0;
  private seen = new Map<string, number>();
  private aiWait = 0;
  private result: "win" | "lose" | "draw" | null = null;
  private lastMove: Move | null = null;
  private bits: Bit[] = [];
  private stains: Stain[] = [];
  private sparks: { x: number; y: number; u: number }[] = [];
  private dents: { x: number; y: number }[] = [];
  private failT: number | null = null;
  private banter: string | null = null;
  private banterT = 0;
  private banterN = 0;
  private boardWait = false;
  private aliveCanvas: HTMLCanvasElement | null = null;
  private aliveKey = "";
  private winPick = 0;
  private epi = 0;
  private safeBottom = 0;
  private probe: HTMLDivElement | null = null;
  private goreVid: HTMLVideoElement | null = null;
  private chaseVid: HTMLVideoElement | null = null;
  private chaseBlocked = false;
  private chaseBegan = false;
  private chaseRewound = false;
  private loseBlocked = false;
  private drawVid: HTMLVideoElement | null = null;
  private drawBlocked = false;
  private drawHold: HTMLCanvasElement | null = null;
  private drawProbe: HTMLCanvasElement | null = null;
  private opVid: HTMLVideoElement | null = null;
  private opBlocked = false;
  private childVid: HTMLVideoElement | null = null;
  private dachaVid: HTMLVideoElement | null = null;
  private onScene: (s: Scene) => void;
  private pointerDown: ((e: PointerEvent) => void) | null = null;
  private pointerUp: ((e: PointerEvent) => void) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    onScene: (s: Scene) => void,
  ) {
    this.onScene = onScene;
    try {
      this.muted = localStorage.getItem("last-elevator-mute") === "1";
    } catch {
      this.muted = false;
    }
    this.audio.setMuted(this.muted);
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;left:0;bottom:0;width:0;pointer-events:none;height:env(safe-area-inset-bottom)";
    document.body.appendChild(probe);
    this.probe = probe;
    const gore = document.createElement("video");
    gore.src = "/game/lose.mp4?v=3";
    gore.muted = this.muted;
    gore.defaultMuted = this.muted;
    gore.volume = this.muted ? 0 : 1;
    gore.playsInline = true;
    gore.preload = "auto";
    gore.setAttribute("playsinline", "");
    this.goreVid = gore;
    gore.load();
    const chase = document.createElement("video");
    chase.src = "/game/chase.mp4";
    chase.muted = this.muted;
    chase.defaultMuted = this.muted;
    chase.playsInline = true;
    chase.preload = "auto";
    chase.setAttribute("playsinline", "");
    this.chaseVid = chase;
    chase.load();
    const fall = document.createElement("video");
    fall.src = "/game/draw-loop.mp4?v=4";
    fall.loop = false;
    fall.muted = this.muted;
    fall.defaultMuted = this.muted;
    fall.playsInline = true;
    fall.preload = "auto";
    fall.setAttribute("playsinline", "");
    this.drawVid = fall;
    fall.load();
    const op = document.createElement("video");
    op.src = "/game/operator.mp4";
    op.muted = this.muted;
    op.defaultMuted = this.muted;
    op.playsInline = true;
    op.preload = "auto";
    op.setAttribute("playsinline", "");
    this.opVid = op;
    op.load();
    const child = document.createElement("video");
    child.src = "/game/win-child.mp4";
    child.loop = true;
    child.muted = this.muted;
    child.defaultMuted = this.muted;
    child.playsInline = true;
    child.preload = "auto";
    child.setAttribute("playsinline", "");
    this.childVid = child;
    child.load();
    const dacha = document.createElement("video");
    dacha.src = "/game/win-dacha.mp4?v=3";
    dacha.loop = true;
    dacha.muted = this.muted;
    dacha.defaultMuted = this.muted;
    dacha.playsInline = true;
    dacha.preload = "auto";
    dacha.setAttribute("playsinline", "");
    this.dachaVid = dacha;
    dacha.load();
    this.pointerDown = (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      this.canvas.setPointerCapture?.(e.pointerId);
    };
    this.pointerUp = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.taps.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    void loadArt().then((art) => {
      if (!this.dead) this.art = art;
    });
    this.bindDebug();
  }

  destroy(): void {
    this.dead = true;
    if (this.pointerDown) this.canvas.removeEventListener("pointerdown", this.pointerDown);
    if (this.pointerUp) this.canvas.removeEventListener("pointerup", this.pointerUp);
    this.probe?.remove();
    if (this.goreVid) {
      this.goreVid.pause();
      this.goreVid.removeAttribute("src");
      this.goreVid.load();
    }
    if (this.chaseVid) {
      this.chaseVid.pause();
      this.chaseVid.removeAttribute("src");
      this.chaseVid.load();
    }
    if (this.drawVid) {
      this.drawVid.pause();
      this.drawVid.removeAttribute("src");
      this.drawVid.load();
    }
    if (this.opVid) {
      this.opVid.pause();
      this.opVid.removeAttribute("src");
      this.opVid.load();
    }
    for (const v of [this.childVid, this.dachaVid]) {
      if (!v) continue;
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    this.audio.destroy();
  }

  wake(): void {
    this.audio.wake();
  }

  toggleMute(): boolean {
    this.audio.unlock();
    this.muted = !this.muted;
    this.audio.setMuted(this.muted);
    if (this.chaseVid) this.chaseVid.muted = this.muted;
    if (this.drawVid) this.drawVid.muted = this.muted;
    if (this.opVid) this.opVid.muted = this.muted;
    for (const v of [this.childVid, this.dachaVid]) {
      if (!v) continue;
      v.muted = this.muted;
      v.volume = this.muted ? 0 : 1;
    }
    if (this.goreVid) {
      this.goreVid.muted = this.muted;
      this.goreVid.volume = this.muted ? 0 : 1;
    }
    try {
      localStorage.setItem("last-elevator-mute", this.muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!this.muted) this.audio.setBed(this.bedFor(this.scene));
    return this.muted;
  }

  start(): void {
    this.audio.unlock();
    this.audio.setMuted(this.muted);
    this.result = null;
    this.go("chase");
  }

  replay(): void {
    this.start();
  }

  frame(dt: number): void {
    this.resize();
    this.shake *= Math.exp(-3.2 * dt);
    this.update(dt);
    this.draw();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width || window.innerWidth;
    this.h = rect.height || window.innerHeight;
    this.safeBottom = this.probe?.offsetHeight ?? 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.max(1, Math.floor(this.w * dpr));
    const bh = Math.max(1, Math.floor(this.h * dpr));
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    const ctx = this.canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private ctx(): CanvasRenderingContext2D {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas недоступен");
    return ctx;
  }

  private go(scene: Scene): void {
    this.scene = scene;
    this.t = 0;
    this.line = 0;
    this.lineT = 0;
    this.flags.clear();
    this.taps = [];
    this.stepAcc = 0;
    this.groanAcc = 0;
    this.presses = 0;
    this.riseT = null;
    this.shake = 0;
    this.bits = [];
    this.stains = [];
    this.sparks = [];
    this.dents = [];
    this.failT = null;
    this.banter = null;
    this.banterT = 0;
    this.boardWait = false;
    this.epi = 0;
    if (this.goreVid) {
      this.goreVid.pause();
      try {
        this.goreVid.currentTime = 0;
      } catch {
        /* not seekable yet */
      }
      if (scene === "lose") {
        this.loseBlocked = false;
        this.goreVid.muted = this.muted;
        this.goreVid.volume = this.muted ? 0 : 1;
        void this.goreVid.play().catch(() => undefined);
      }
    }
    if (this.chaseVid) {
      this.chaseVid.pause();
      try {
        this.chaseVid.currentTime = 0;
      } catch {
        /* not seekable yet */
      }
      if (scene === "chase") {
        this.chaseBlocked = false;
        this.chaseBegan = false;
        this.chaseRewound = false;
        this.chaseVid.muted = this.muted;
        void this.chaseVid.play().catch(() => undefined);
      }
    }
    if (this.drawVid) {
      this.drawVid.pause();
      try {
        this.drawVid.currentTime = 0;
      } catch {
        /* not seekable yet */
      }
      if (scene === "draw") {
        this.drawBlocked = false;
        this.drawVid.muted = this.muted;
        void this.drawVid.play().catch(() => undefined);
      }
    }
    if (this.opVid) {
      this.opVid.pause();
      try {
        this.opVid.currentTime = 0;
      } catch {
        /* not seekable yet */
      }
      if (scene === "operator") {
        this.opBlocked = false;
        this.opVid.muted = this.muted;
        void this.opVid.play().catch(() => undefined);
      } else if (scene === "ride" && this.opVid.readyState >= 2 && Number.isFinite(this.opVid.duration)) {
        try {
          this.opVid.currentTime = Math.max(0, this.opVid.duration - 0.08);
        } catch {
          /* keep whatever frame we have */
        }
      }
    }
    for (const v of [this.childVid, this.dachaVid]) {
      if (!v) continue;
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* not seekable yet */
      }
    }
    if (scene === "checkers") this.initMatch();
    if (scene === "win") {
      const n = Math.max(1, this.art?.endings.length ?? WIN_LINES.length);
      this.winPick = Math.floor(Math.random() * n);
      const clip = this.winClip();
      if (clip) {
        clip.muted = this.muted;
        clip.volume = this.muted ? 0 : 1;
        void clip.play().catch(() => undefined);
      }
    }
    this.audio.setBed(this.bedFor(scene));
    this.onScene(scene);
  }

  private bedFor(scene: Scene): "menu" | "tension" | "ride" | "win" | "lose" | "draw" | "off" {
    if (scene === "menu") return "menu";
    if (scene === "chase" || scene === "draw" || scene === "lose") return "off";
    if (scene === "ride") return "ride";
    if (scene === "win") return this.winClip() ? "off" : "win";
    return "tension";
  }

  private initMatch(): void {
    this.board = initialBoard();
    this.turn = "w";
    this.selected = null;
    this.chosen = [];
    this.hop = null;
    this.noCap = 0;
    this.seen.clear();
    this.aiWait = 0;
    this.lastMove = null;
    this.banter = null;
    this.banterT = 0;
    this.banterN = 0;
    this.note();
    this.beginTurn();
  }

  private note(): boolean {
    const k = posKey(this.board, this.turn);
    const n = (this.seen.get(k) ?? 0) + 1;
    this.seen.set(k, n);
    return n >= 3;
  }

  private beginTurn(): void {
    if (this.result || this.scene !== "checkers") return;
    if (legalMoves(this.board, this.turn).length === 0) {
      this.finish(this.turn === "w" ? "lose" : "win");
    }
  }

  private finish(kind: "win" | "lose" | "draw"): void {
    if (this.result) return;
    this.result = kind;
    this.audio.stinger(kind);
    if (kind === "win") this.go("ride");
    else this.go(kind);
  }

  private commit(move: Move): void {
    this.board = applyMove(this.board, move);
    this.lastMove = move;
    const playerMoved = this.turn === "w";
    this.noCap = move.caps.length ? 0 : this.noCap + 1;
    this.turn = opposite(this.turn);
    this.selected = null;
    this.chosen = [];
    this.hop = null;
    if (this.note() || this.noCap >= 40) {
      this.finish("draw");
      return;
    }
    this.beginTurn();
    if (playerMoved) this.quip();
    if (this.scene === "checkers" && this.turn === "b" && !this.result) this.aiWait = 0.45;
  }

  private quip(): void {
    this.banterN += 1;
    if (this.banterN % 2 !== 0) return;
    this.banter = BANTER[(((this.banterN / 2) | 0) - 1 + BANTER.length) % BANTER.length];
    this.banterT = 2.7;
  }

  private once(name: string, fn: () => void): void {
    if (this.flags.has(name)) return;
    this.flags.add(name);
    fn();
  }

  private update(dt: number): void {
    this.t += dt;
    if (this.scene === "chase") this.updateChase(dt);
    else if (this.scene === "doors") this.updateDoors(dt);
    else if (this.scene === "panel") this.updatePanel(dt);
    else if (this.scene === "operator") this.updateOperator(dt);
    else if (this.scene === "checkers") this.updateCheckers(dt);
    else if (this.scene === "ride") this.updateRide(dt);
    else if (this.scene === "lose") this.updateLose(dt);
    else if (this.scene === "draw") this.updateDraw(dt);
    else if (this.scene === "win" && this.t > 1.15 && !this.winClip()) {
      this.once("win-open", () => this.audio.door());
    }
    this.consumeTaps();
    for (const s of this.sparks) s.u += dt;
    this.sparks = this.sparks.filter((s) => s.u < 0.35);
    for (const b of this.bits) {
      b.vy += 900 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      if (b.y > this.h - 8) {
        b.y = this.h - 8;
        b.vy *= -0.25;
        b.vx *= 0.7;
      }
    }
  }

  private updateChase(_dt: number): void {
    const v = this.chaseVid;
    if (!v || v.error) return;
    if (!this.chaseBegan) {
      if (!this.chaseRewound && v.readyState >= 1) {
        this.chaseRewound = true;
        try {
          v.currentTime = 0;
        } catch {
          this.chaseRewound = false;
        }
      }
      if (v.readyState >= 2 && (v.paused || v.ended)) void v.play().catch(() => undefined);
      if (!v.ended && v.currentTime > 0.25) this.chaseBegan = true;
      return;
    }
    if (v.paused && !v.ended && v.readyState >= 2) void v.play().catch(() => undefined);
    const dur = v.duration;
    if (v.ended || (Number.isFinite(dur) && dur > 0 && v.currentTime >= dur - 0.08)) this.go("panel");
  }

  private updateDoors(dt: number): void {
    if (this.t < 2.85) {
      this.groanAcc += dt;
      if (this.groanAcc > 0.8) {
        this.groanAcc = 0;
        this.audio.groan();
      }
    }
    if (this.t >= 1.2 && this.t < 2.7) {
      this.stepAcc += dt;
      if (this.stepAcc > 0.22) {
        this.stepAcc = 0;
        this.audio.scrape();
      }
    }
    if (this.t > 1.35) this.once("slam", () => {
      this.audio.door();
      this.shake = 14;
    });
    if (this.t > 3.2 && this.t < 4.5) {
      this.groanAcc += dt;
      if (this.groanAcc > 1.15) {
        this.groanAcc = 0;
        this.audio.breath();
      }
    }
    if (this.t > 5.05) this.go("panel");
  }

  private updatePanel(dt: number): void {
    if (this.failT !== null) {
      this.failT += dt;
      if (this.failT > 0.2) this.go("operator");
    }
  }

  private updateOperator(dt: number): void {
    const v = this.opVid;
    if (v && !v.error && !this.opBlocked) {
      if (v.paused && !v.ended && v.readyState >= 2) {
        void v.play().catch(() => undefined);
      }
      const settled = v.ended || v.currentTime > 3.05;
      if (settled) {
        this.once("stare", () => this.audio.dread());
        this.groanAcc += dt;
        if (this.groanAcc > 2.7) {
          this.groanAcc = 0;
          this.audio.dread();
        }
      }
      return;
    }
    if (this.t > 0.2) this.once("hatch2", () => this.audio.hatch());
  }

  private updateRide(dt: number): void {
    if (this.t > 1.55) this.once("retract", () => this.audio.hatch());
    if (this.t > 2.35) {
      this.shake = Math.max(this.shake, 2.4);
      this.stepAcc += dt;
      if (this.stepAcc > 0.38) {
        this.stepAcc = 0;
        this.audio.rumble();
      }
    }
    if (this.t > 5.15) this.go("win");
  }

  private updateDraw(dt: number): void {
    const v = this.drawVid;
    if (v && !v.error && !this.drawBlocked) {
      const dur = v.duration;
      if (v.readyState >= 2 && Number.isFinite(dur) && dur > 1 && v.currentTime > 0.3 && v.currentTime >= dur - 0.08) {
        try {
          v.currentTime = 0.04;
        } catch {
          /* ignore */
        }
      }
      if (v.paused && !v.ended && v.readyState >= 2) void v.play().catch(() => undefined);
    }
    if (this.line < DRAW_SCRIPT.length - 1) {
      this.lineT += dt;
      if (this.lineT > 2.6) {
        this.line += 1;
        this.lineT = 0;
      }
    } else this.lineT += dt;
  }

  private askReady(): boolean {
    if (this.opVid && !this.opBlocked && !this.opVid.error) return this.t > 2.05;
    return this.t > 1.15;
  }

  private choiceButtons(): { ride: Rect; play: Rect } {
    const bh = 54;
    const y = this.h - this.safeBottom - bh - 22;
    const gap = 10;
    const bw = (this.w - 36 - gap) / 2;
    return {
      ride: { x: 18, y, w: bw, h: bh },
      play: { x: 18 + bw + gap, y, w: bw, h: bh },
    };
  }

  private hit(rect: Rect, x: number, y: number): boolean {
    return x >= rect.x && y >= rect.y && x <= rect.x + rect.w && y <= rect.y + rect.h;
  }

  private tapChoice(x: number, y: number): void {
    if (!this.askReady()) return;
    const { play } = this.choiceButtons();
    if (this.hit(play, x, y)) this.go("checkers");
  }

  private updateCheckers(dt: number): void {
    if (this.banterT > 0) this.banterT = Math.max(0, this.banterT - dt);
    if (this.hop) {
      this.hop.u += dt / this.hop.dur;
      if (!this.hop.capPlayed && this.hop.cap && this.hop.u > 0.45) {
        this.hop.capPlayed = true;
        this.audio.capture();
        this.shake = Math.max(this.shake, 5);
      }
      if (this.hop.u >= 1) this.finishHop();
    }
    if (this.turn === "b" && !this.hop && !this.result && this.scene === "checkers") {
      this.aiWait -= dt;
      if (this.aiWait <= 0) {
        const move = chooseAiMove(this.board, "b");
        if (!move) {
          this.finish("win");
          return;
        }
        this.armHop(move.from, move.hops[0], move.caps[0] ?? null, true, move, 0, move.from);
      }
    }
  }

  private finishHop(): void {
    const done = this.hop;
    this.hop = null;
    if (!done) return;
    if (done.ai && done.move) {
      if (done.hopIndex + 1 >= done.move.hops.length) this.commit(done.move);
      else {
        const i = done.hopIndex + 1;
        this.armHop(done.move.hops[i - 1], done.move.hops[i], done.move.caps[i] ?? null, true, done.move, i, done.move.from);
      }
      return;
    }
    if (!done.fromSel) return;
    this.chosen = this.chosen.concat(done.to);
    const moves = legalMoves(this.board, "w");
    if (nextTargets(moves, done.fromSel, this.chosen).length === 0) {
      const mv = exactMove(moves, done.fromSel, this.chosen);
      if (mv) this.commit(mv);
      else {
        this.chosen = [];
        this.selected = null;
      }
    }
  }

  private armHop(
    from: Pos,
    to: Pos,
    cap: Pos | null,
    ai: boolean,
    move: Move | null,
    hopIndex: number,
    fromSel: Pos | null,
  ): void {
    const dist = Math.max(Math.abs(from.r - to.r), Math.abs(from.c - to.c));
    this.hop = {
      from,
      to,
      cap,
      u: 0,
      dur: Math.min(0.5, 0.13 + dist * 0.045),
      capPlayed: false,
      ai,
      move,
      hopIndex,
      fromSel,
    };
    this.audio.piece();
    this.aiWait = 99;
  }

  private updateLose(dt: number): void {
    const v = this.goreVid;
    if (v && !v.error && !this.loseBlocked) {
      if (Number.isFinite(v.duration) && v.duration > 8 && v.currentTime > 5 && v.currentTime >= v.duration - 0.3) {
        try {
          v.currentTime = 5.2;
        } catch {
          /* ignore */
        }
      }
      if (v.paused && !v.ended && v.readyState >= 2) {
        void v.play().catch(() => undefined);
      }
      return;
    }
    if (this.t > 2.3 && this.t < 5.1) {
      this.groanAcc += dt;
      if (this.groanAcc > 0.48) {
        this.groanAcc = 0;
        this.audio.groan();
      }
    }
    if (this.t > 2.15) this.once("lose-door", () => {
      this.audio.door();
      this.shake = 8;
    });
    if (this.t > 4.45) this.once("lunge", () => {
      this.audio.whoosh();
      this.shake = 11;
    });
    if (this.t > 5.15) this.once("gore", () => this.startGore());
    if (this.t > 5.2 && this.t < 11.4) {
      this.stepAcc += dt;
      if (this.stepAcc > 0.32) {
        this.stepAcc = 0;
        this.audio.squelch();
      }
    }
  }

  private startGore(): void {
    const v = this.goreVid;
    if (v) {
      v.muted = true;
      v.volume = 0;
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
      void v.play().catch(() => undefined);
    }
    this.audio.gore();
    this.shake = 14;
  }

  private consumeTaps(): void {
    const taps = this.taps.splice(0);
    for (const tap of taps) {
      if (this.scene === "panel") this.tapPanel(tap.x, tap.y);
      else if (this.scene === "operator") this.tapChoice(tap.x, tap.y);
      else if (this.scene === "draw") this.advanceDraw();
      else if (this.scene === "checkers") this.tapBoard(tap.x, tap.y);
    }
  }

  private placed(img: HTMLImageElement | null, mode: "cover" | "contain", zoom = 1, ox = 0, oy = 0): Rect {
    const iw = img?.naturalWidth || 9;
    const ih = img?.naturalHeight || 16;
    const s = (mode === "cover" ? Math.max(this.w / iw, this.h / ih) : Math.min(this.w / iw, this.h / ih)) * zoom;
    const dw = iw * s;
    const dh = ih * s;
    return { x: (this.w - dw) / 2 + ox, y: (this.h - dh) / 2 + oy, w: dw, h: dh };
  }

  private advanceDraw(): void {
    if (this.line < DRAW_SCRIPT.length - 1) {
      this.line += 1;
      this.lineT = 0;
    }
  }

  private tapPanel(x: number, y: number): void {
    if (this.riseT !== null || this.failT !== null) return;
    const hit = this.panelButtons().findIndex((b) => this.hit(b, x, y));
    if (hit < 0) return;
    this.presses += 1;
    this.dents.push({ x, y });
    this.sparks.push({ x, y, u: 0 });
    this.shake = Math.max(this.shake, this.presses === 1 ? 3 : 6);
    if (this.presses === 1) this.audio.spark();
    else {
      this.audio.spark();
      this.audio.crack();
      this.failT = 0;
    }
  }

  private panelButtons(): Rect[] {
    const img = this.art?.panel ?? null;
    const p = img ? this.placed(img, "cover", 1) : { x: this.w * 0.08, y: this.h * 0.06, w: this.w * 0.84, h: this.h * 0.88 };
    const spots = [
      [0.36, 0.395], [0.66, 0.41],
      [0.36, 0.47], [0.66, 0.47],
      [0.36, 0.53], [0.66, 0.53],
      [0.36, 0.605], [0.66, 0.605],
      [0.36, 0.68], [0.66, 0.68],
    ];
    const rw = p.w * 0.11;
    const rh = p.h * 0.045;
    return spots.map(([u, v]) => ({ x: p.x + u * p.w - rw / 2, y: p.y + v * p.h - rh / 2, w: rw, h: rh }));
  }

  private boardGeom(): Rect & { cell: number } {
    const bottom = Math.max(48, 28 + this.safeBottom);
    const label = 36;
    const minTop = 96;
    let cell = Math.floor((this.w - 24) / 6);
    while (cell > 26 && label + minTop + cell * 6 + bottom > this.h) cell -= 1;
    const size = cell * 6;
    const x = Math.floor((this.w - size) / 2);
    const y = Math.floor(this.h - bottom - size);
    return { x, y, w: size, h: size, cell };
  }

  private cellAt(x: number, y: number): Pos | null {
    const m = this.boardGeom();
    const c = Math.floor((x - m.x) / m.cell);
    const r = Math.floor((y - m.y) / m.cell);
    if (r < 0 || c < 0 || r >= 6 || c >= 6) return null;
    return { r, c };
  }

  private tapBoard(x: number, y: number): void {
    if (this.turn !== "w" || this.hop || this.result) return;
    const pos = this.cellAt(x, y);
    if (!pos) return;
    const moves = legalMoves(this.board, "w");
    if (this.selected) {
      const targets = nextTargets(moves, this.selected, this.chosen);
      if (targets.some((p) => same(p, pos))) {
        const from = this.chosen.length ? this.chosen[this.chosen.length - 1] : this.selected;
        const cap = capForHop(moves, this.selected, this.chosen, pos);
        this.armHop(from, pos, cap, false, null, 0, this.selected);
        return;
      }
      if (this.chosen.length) return;
    }
    const piece = this.board[pos.r][pos.c];
    if (piece?.color === "w" && moves.some((m) => same(m.from, pos))) {
      this.selected = pos;
      this.chosen = [];
      this.audio.piece();
      return;
    }
    this.shake = Math.max(this.shake, 2);
  }

  private draw(): void {
    const ctx = this.ctx();
    const { w, h } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    if (this.shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    ctx.fillStyle = "#070806";
    ctx.fillRect(-8, -8, w + 16, h + 16);
    if (this.scene === "menu") this.drawMenu(ctx);
    else if (this.scene === "chase") this.drawChase(ctx);
    else if (this.scene === "doors") this.drawCabinArrival(ctx);
    else if (this.scene === "panel") this.drawPanel(ctx);
    else if (this.scene === "operator") this.drawOperator(ctx);
    else if (this.scene === "checkers") this.drawCheckers(ctx);
    else if (this.scene === "ride") this.drawRide(ctx);
    else if (this.scene === "win") this.drawWin(ctx);
    else if (this.scene === "lose") this.drawLose(ctx);
    else if (this.scene === "draw") this.drawDraw(ctx);
    this.drawSparks(ctx);
    ctx.restore();
  }

  private blit(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, rect: Rect, smoothImg = true): void {
    if (!img) return;
    ctx.imageSmoothingEnabled = smoothImg;
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
  }

  private vignette(ctx: CanvasRenderingContext2D, amount = 0.62): void {
    const g = ctx.createRadialGradient(this.w / 2, this.h * 0.45, this.w * 0.2, this.w / 2, this.h * 0.5, this.w * 0.85);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${amount})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private flicker(ctx: CanvasRenderingContext2D): void {
    if (Math.sin(this.t * 31) > 0.93 || Math.sin(this.t * 17.3) > 0.985) {
      ctx.fillStyle = "rgba(190,255,170,0.08)";
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  private drawMenu(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#070806";
    ctx.fillRect(0, 0, this.w, this.h);
    const bob = Math.sin(this.t * 1.2) * 3;
    const rect = this.placed(this.art?.menu ?? null, "contain", 1, 0, bob);
    if (this.art?.menu) this.blit(ctx, this.art.menu, rect);
    else this.drawFakeShaft(ctx);
  }

  private drawFakeShaft(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#141810";
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.fillStyle = "#2a2418";
    ctx.fillRect(this.w * 0.18, 0, this.w * 0.64, this.h);
    ctx.fillStyle = "#e6b15a";
    ctx.beginPath();
    ctx.arc(this.w / 2, this.h * 0.22, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  private runPose(): { dist: number; look: number; yaw: number } {
    const t = this.t;
    const span = (a: number, b: number) => smooth((t - a) / Math.max(0.001, b - a));
    let look = 0;
    let yaw = 0;
    if (t < CHASE_LOOK) look = 0;
    else if (t < CHASE_BACK) {
      look = span(CHASE_LOOK, CHASE_BACK);
      yaw = Math.sin(look * Math.PI) * 78;
    } else if (t < CHASE_RETURN) look = 1;
    else if (t < CHASE_SPRINT) {
      const back = span(CHASE_RETURN, CHASE_SPRINT);
      look = 1 - back;
      yaw = -Math.sin(back * Math.PI) * 78;
    }
    let dist = 0.04;
    if (t < CHASE_LOOK) dist = 0.02 + (t / CHASE_LOOK) * 0.32;
    else if (t < CHASE_SPRINT) dist = 0.34;
    else dist = 0.34 + smooth((t - CHASE_SPRINT) / (CHASE_END - CHASE_SPRINT)) * 0.66;
    return { dist, look, yaw };
  }

  private handReach(): number {
    const t = this.t;
    if (t < CHASE_HAND || t > CHASE_RETURN + 0.12) return 0;
    if (t < CHASE_HAND + 0.48) return smooth((t - CHASE_HAND) / 0.48);
    if (t < CHASE_RETURN) return 1;
    return 1 - smooth((t - CHASE_RETURN) / 0.28);
  }

  private drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null | undefined, zoom = 1, ox = 0, oy = 0): boolean {
    if (!img || !img.naturalWidth) return false;
    this.blit(ctx, img, this.placed(img, "cover", zoom, ox, oy));
    return true;
  }

  private drawChase(ctx: CanvasRenderingContext2D): void {
    const v = this.chaseVid;
    if (v && !v.error && v.readyState >= 2 && v.videoWidth > 0) {
      const s = Math.max(this.w / v.videoWidth, this.h / v.videoHeight);
      const dw = v.videoWidth * s;
      const dh = v.videoHeight * s;
      ctx.drawImage(v, (this.w - dw) / 2, (this.h - dh) / 2, dw, dh);
      return;
    }
    ctx.fillStyle = "#070806";
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private drawSchoolPlate(ctx: CanvasRenderingContext2D, dist: number, _look: number): Rect | null {
    const img = this.art?.school;
    if (!img || !img.naturalWidth) return null;
    const zoom = 1.04 + dist * 2.45;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const s = Math.max(this.w / iw, this.h / ih) * zoom;
    const dw = iw * s;
    const dh = ih * s;
    const ix = this.w * 0.5 - 0.5 * dw;
    const iy = this.h * 0.5 - 0.48 * dh;
    ctx.fillStyle = "#1a120e";
    ctx.fillRect(-160, -80, this.w + 320, this.h + 160);
    ctx.drawImage(img, ix, iy, dw, dh);
    if (Math.sin(this.t * 21) > 0.72) {
      ctx.fillStyle = "rgba(255,214,150,0.07)";
      ctx.fillRect(-80, -40, this.w + 160, this.h * 0.45);
    }
    return {
      x: ix + 0.415 * dw,
      y: iy + 0.4 * dh,
      w: 0.17 * dw,
      h: 0.15 * dh,
    };
  }

  private drawFpsCorridor(
    ctx: CanvasRenderingContext2D,
    dist: number,
    look: number,
    yaw: number,
    bob: number,
  ): void {
    const w = this.w;
    const h = this.h;
    const bobY = bob * (11 + dist * 9);
    ctx.save();
    ctx.translate(yaw, bobY);
    const vx = w / 2;
    const vy = h * 0.36;
    const door = this.drawSchoolPlate(ctx, dist, look);
    if (!door) {
    ctx.fillStyle = "#121810";
    ctx.fillRect(-140, -60, w + 280, h + 140);
    ctx.fillStyle = "#2a3424";
    ctx.beginPath();
    ctx.moveTo(-80, -40);
    ctx.lineTo(w + 80, -40);
    ctx.lineTo(vx + 36, vy);
    ctx.lineTo(vx - 36, vy);
    ctx.fill();
    ctx.fillStyle = "#3d4a34";
    ctx.beginPath();
    ctx.moveTo(vx - 36, vy);
    ctx.lineTo(vx + 36, vy);
    ctx.lineTo(w + 80, h + 40);
    ctx.lineTo(-80, h + 40);
    ctx.fill();
    const dir = look > 0.5 ? -1 : 1;
    const speed = 2.6 + dist * 3.4;
    for (let i = 0; i < 14; i++) {
      const z = ((i * 0.07 + this.t * speed * 0.12 * dir) % 1 + 1) % 1;
      const depth = 0.04 + z * z;
      const y = vy + depth * (h - vy + 30);
      const half = 30 + depth * (w * 0.72);
      ctx.fillStyle = i % 2 === 0 ? "#2a3824" : "#526846";
      ctx.fillRect(vx - half, y, half * 2, Math.max(8, (1 - z) * 28));
    }
    ctx.strokeStyle = "#e6b15a";
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(vx, h + 10);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const wall = (side: number) => {
      ctx.fillStyle = side < 0 ? "#1c2618" : "#24301e";
      ctx.beginPath();
      ctx.moveTo(side < 0 ? -80 : w + 80, -40);
      ctx.lineTo(vx + side * 28, vy);
      ctx.lineTo(vx + side * (w * 0.62), h + 40);
      ctx.lineTo(side < 0 ? -80 : w + 80, h + 40);
      ctx.fill();
      ctx.strokeStyle = "#8a9a6a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(side < 0 ? 18 : w - 18, h * 0.12);
      ctx.lineTo(vx + side * 18, vy + 6);
      ctx.stroke();
    };
    wall(-1);
    wall(1);
    this.drawHallJunk(ctx, vx, vy, dir, dist);
    }
    if (look > 0.35) {
      ctx.save();
      ctx.globalAlpha = smooth((look - 0.35) / 0.35);
      ctx.fillStyle = "rgba(90,40,28,0.28)";
      ctx.fillRect(-40, h * 0.2, w + 80, h);
      this.drawPack(ctx, vx, h);
      ctx.restore();
    }
    if (Math.abs(yaw) > 12) {
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      for (let i = 0; i < 9; i++) ctx.fillRect(-40, (i * (h + 40)) / 9, w + 80, 5);
    }
    ctx.restore();
  }

  private drawHallJunk(
    ctx: CanvasRenderingContext2D,
    vx: number,
    vy: number,
    dir: number,
    dist: number,
  ): void {
    const w = this.w;
    const h = this.h;
    const speed = 3.1 + dist * 4.2;
    const lamp = Math.sin(this.t * 23) > -0.55;
    for (let i = 0; i < 9; i++) {
      const zRaw = ((i / 9 + this.t * speed * 0.09 * dir) % 1 + 1) % 1;
      const z = 0.05 + zRaw * zRaw;
      const y = vy + z * (h * 0.72);
      const half = 22 + z * w * 0.66;
      const sc = 0.35 + z * 1.8;
      const doorH = 42 * sc;
      const doorW = 16 * sc;
      ctx.fillStyle = hash(i, 3) > 0.5 ? "#5a3c2e" : "#3a4c34";
      ctx.fillRect(vx - half - doorW * 0.2, y - doorH, doorW, doorH);
      ctx.fillStyle = "#140e0c";
      ctx.fillRect(vx - half, y - doorH + 4 * sc, Math.max(3, doorW * 0.3), doorH * 0.22);
      ctx.fillStyle = "#8b928c";
      ctx.fillRect(vx + half - 5, y - doorH * 0.9, Math.max(3, 4 * sc * 0.4), doorH * 0.75);
      if (hash(i, 8) > 0.5) {
        ctx.fillStyle = "#6e5a38";
        ctx.fillRect(vx - half * 0.25, y + 2, 14 * sc, 6 * sc);
      }
      if (i % 2 === 0) {
        ctx.fillStyle = lamp ? "#e23b2e" : "#4a1816";
        ctx.fillRect(vx - 8, vy + z * 22, 16, 7);
        if (lamp) {
          ctx.fillStyle = "rgba(226,59,46,0.14)";
          ctx.fillRect(vx - half * 0.3, y - doorH, half * 0.6, doorH * 0.45);
        }
      }
    }
    ctx.strokeStyle = "#241e18";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.14, -10);
    ctx.quadraticCurveTo(w * 0.32, h * 0.16, w * 0.1, h * 0.34);
    ctx.moveTo(w * 0.86, -10);
    ctx.quadraticCurveTo(w * 0.68, h * 0.12, w * 0.92, h * 0.28);
    ctx.stroke();
  }

  private drawLiftMouth(ctx: CanvasRenderingContext2D, rect: Rect, open: number): void {
    const { x: left, y: top, w: dw, h: dh } = rect;
    const bottom = top + dh;
    const x = left + dw / 2;
    const jamb = Math.max(3, dw * 0.08);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, bottom + 4, dw * 0.55, Math.max(4, dh * 0.03), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1612";
    ctx.fillRect(left - jamb, top - jamb * 1.4, dw + jamb * 2, dh + jamb * 2.2);
    ctx.fillStyle = "#3a342c";
    ctx.fillRect(left - jamb * 0.3, top - jamb * 0.7, dw + jamb * 0.6, jamb * 0.7);
    ctx.fillStyle = "#e6b15a";
    ctx.fillRect(x - Math.max(6, dw * 0.06), top - jamb * 0.55, Math.max(12, dw * 0.12), Math.max(4, jamb * 0.35));
    const gap = (dw * 0.5) * clamp(open, 0.04, 0.55);
    ctx.fillStyle = "#2a2418";
    ctx.fillRect(x - gap, top, gap * 2, dh);
    ctx.fillStyle = "#5c4a2e";
    ctx.fillRect(x - gap * 0.82, top + dh * 0.08, gap * 1.64, dh * 0.7);
    ctx.fillStyle = "#f0d7a2";
    ctx.fillRect(x - gap * 0.45, top + dh * 0.08, Math.max(2, gap * 0.9), Math.max(3, dh * 0.035));
    ctx.fillStyle = "#3a3228";
    ctx.fillRect(x - gap * 0.82, top + dh * 0.78, gap * 1.64, dh * 0.2);
    const leaf = (x0: number, wide: number) => {
      if (wide < 1) return;
      ctx.fillStyle = "#8e948c";
      ctx.fillRect(x0, top, wide, dh);
      ctx.fillStyle = "#b7bdb4";
      ctx.fillRect(x0, top, wide, Math.max(2, dh * 0.012));
      const ribs = Math.max(2, Math.floor(wide / 14));
      for (let i = 1; i < ribs; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#747b74" : "#a8aea6";
        ctx.fillRect(x0 + (wide * i) / ribs, top, Math.max(1, dw * 0.012), dh);
      }
      ctx.fillStyle = "#5c6360";
      ctx.fillRect(x0 < x ? x0 + wide - Math.max(2, dw * 0.018) : x0, top, Math.max(2, dw * 0.018), dh);
    };
    leaf(left, Math.max(0, x - gap - left));
    leaf(x + gap, Math.max(0, left + dw - (x + gap)));
    ctx.fillStyle = "#6e6558";
    ctx.fillRect(left - 2, bottom - Math.max(3, dh * 0.018), dw + 4, Math.max(4, dh * 0.028));
    const panelX = left + dw + jamb * 0.15;
    ctx.fillStyle = "#2a261f";
    ctx.fillRect(panelX, top + dh * 0.42, jamb * 0.7, dh * 0.16);
    ctx.fillStyle = "#c4552a";
    ctx.beginPath();
    ctx.arc(panelX + jamb * 0.35, top + dh * 0.5, Math.max(2, jamb * 0.18), 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPack(ctx: CanvasRenderingContext2D, vx: number, h: number): void {
    const frames = this.art?.zombie ?? [];
    const spots = [
      { ox: -0.2, sc: 0.5, f: 1 },
      { ox: 0.22, sc: 0.58, f: 2 },
      { ox: 0.04, sc: 0.96, f: 0 },
    ];
    const rush = 0.82 + Math.sin(this.t * 7) * 0.04 + smooth(clamp((this.t - CHASE_BACK) / 1.3, 0, 1)) * 0.28;
    spots.forEach((s, i) => {
      const hh = h * s.sc * rush;
      const frame = frames.length ? frames[(s.f + Math.floor(this.t * 8)) % frames.length] : null;
      const x = vx + s.ox * this.w;
      const y = h * (0.96 - i * 0.02);
      this.drawSprite(ctx, frame, x, y, hh, i === 2);
      if (!frame) this.drawZedSilhouette(ctx, x, y, hh);
    });
  }

  private drawSprite(
    ctx: CanvasRenderingContext2D,
    frame: CanvasImageSource | null,
    x: number,
    foot: number,
    hh: number,
    flip: boolean,
  ): void {
    if (!frame) return;
    const { w: iw, h: ih } = srcSize(frame);
    const dw = hh * (iw / ih);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (flip) {
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(frame, -dw / 2, foot - hh, dw, hh);
    } else ctx.drawImage(frame, x - dw / 2, foot - hh, dw, hh);
    ctx.restore();
  }

  private drawZedSilhouette(ctx: CanvasRenderingContext2D, x: number, foot: number, hh: number): void {
    ctx.fillStyle = "#1c2618";
    ctx.fillRect(x - hh * 0.16, foot - hh * 0.72, hh * 0.32, hh * 0.72);
    ctx.fillStyle = "#6d7358";
    ctx.beginPath();
    ctx.arc(x, foot - hh * 0.8, hh * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a1818";
    ctx.fillRect(x - hh * 0.04, foot - hh * 0.7, hh * 0.08, hh * 0.12);
  }

  private drawGrabHand(ctx: CanvasRenderingContext2D, k: number, originX: number, originY: number): void {
    const frames = this.art?.hand ?? [];
    if (!frames.length) return;
    const stage = k < 0.32 ? 0 : k < 0.62 ? 1 : Math.floor(this.t * 7) % 2 === 0 ? 2 : Math.min(3, frames.length - 1);
    const fr = frames[Math.min(stage, frames.length - 1)];
    const { w: iw, h: ih } = srcSize(fr);
    let hh = lerp(this.h * 0.46, this.h * 1.12, smooth(k));
    let dw = hh * (iw / Math.max(1, ih));
    const maxW = lerp(this.w * 0.62, this.w * 1.35, k);
    if (dw > maxW) {
      dw = maxW;
      hh = dw * (ih / Math.max(1, iw));
    }
    const x = lerp(originX, this.w * 0.5, k);
    const y = lerp(originY, this.h * 0.46, k);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fr, x - dw / 2, y - hh * 0.46, dw, hh);
    ctx.restore();
  }

  private drawCabinArrival(ctx: CanvasRenderingContext2D): void {
    const pan = this.t > 4.05 ? smooth((this.t - 4.05) / 0.95) : 0;
    const door = this.art?.chaseDoor;
    const punched = this.art?.chasePunched;
    ctx.save();
    ctx.translate(-pan * this.w * 0.42, pan * this.h * 0.03);
    if (door && punched) {
      const slam = this.t < 1.15 ? 0 : smooth(clamp((this.t - 1.15) / 0.55, 0, 1));
      if (slam < 0.999) {
        ctx.save();
        ctx.globalAlpha = 1 - slam;
        this.drawCover(ctx, door, 1.03 + this.t * 0.012);
        ctx.restore();
      }
      if (slam > 0.01) {
        ctx.save();
        ctx.globalAlpha = slam;
        this.drawCover(ctx, punched, 1);
        if (slam > 0.45) {
          const pulse = 0.16 + Math.abs(Math.sin(this.t * 7)) * 0.14;
          const glow = ctx.createRadialGradient(this.w / 2, this.h * 0.46, 6, this.w / 2, this.h * 0.5, this.w * 0.34);
          glow.addColorStop(0, `rgba(90,210,60,${pulse})`);
          glow.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = glow;
          ctx.fillRect(0, 0, this.w, this.h);
        }
        ctx.restore();
      }
    } else {
      const enter = smooth(clamp(this.t / 0.55, 0, 1));
      if (enter < 0.999) this.drawFpsCorridor(ctx, 1, 0, 0, 0);
      ctx.save();
      ctx.globalAlpha = enter;
      this.drawCabinDoors(ctx, this.cabinOpen(), this.cabinArm());
      ctx.restore();
    }
    ctx.restore();
    if (pan > 0.08) {
      ctx.save();
      ctx.globalAlpha = smooth((pan - 0.08) / 0.75);
      ctx.translate((1 - pan) * this.w * 0.72, 0);
      this.drawPanelPlate(ctx);
      ctx.restore();
    }
  }

  private cabinOpen(): number {
    if (this.t < 1.15) return 1;
    if (this.t < 2.9) return 1 - smooth((this.t - 1.15) / 1.7);
    return 0;
  }

  private cabinArm(): number {
    if (this.scene === "lose") {
      if (this.t < 3.5 || this.t > 5.15) return 0;
      return smooth(clamp((this.t - 3.5) / 0.7, 0, 1));
    }
    if (this.t < 1.75 || this.t > 3.05) return 0;
    if (this.t < 2.25) return smooth((this.t - 1.75) / 0.4);
    return 1 - smooth((this.t - 2.25) / 0.62);
  }

  private drawCabinDoors(ctx: CanvasRenderingContext2D, open: number, arm: number): void {
    const w = this.w;
    const h = this.h;
    ctx.fillStyle = "#141812";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1c2218";
    ctx.fillRect(w * 0.06, h * 0.04, w * 0.88, h * 0.9);
    const frame = { x: w * 0.1, y: h * 0.08, w: w * 0.8, h: h * 0.78 };
    ctx.fillStyle = "#0a0c09";
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
    if (open > 0.04) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(frame.x, frame.y, frame.w, frame.h);
      ctx.clip();
      this.drawOutsidePack(ctx, frame, open);
      ctx.restore();
    }
    const leaf = (frame.w / 2) * (1 - clamp(open, 0, 1));
    const paintLeaf = (x: number) => {
      if (leaf < 1) return;
      ctx.fillStyle = "#32392e";
      ctx.fillRect(x, frame.y, leaf, frame.h);
      for (let i = 0; i < leaf; i += 8) {
        ctx.fillStyle = hash(i, 9) > 0.5 ? "#3e4838" : "#262c22";
        ctx.fillRect(x + i, frame.y, 3, frame.h);
      }
      ctx.fillStyle = "#10140f";
      ctx.fillRect(x < w / 2 ? x + leaf - 6 : x, frame.y, 6, frame.h);
    };
    paintLeaf(frame.x);
    paintLeaf(frame.x + frame.w - leaf);
    if (this.scene !== "lose" && arm > 0.05 && open > 0.08) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(frame.x, frame.y, frame.w, frame.h);
      ctx.clip();
      this.drawGrabHand(ctx, 0.5 + arm * 0.4, frame.x + frame.w / 2, frame.y + frame.h * 0.58);
      ctx.restore();
    }
    ctx.fillStyle = "#c4a15a";
    ctx.fillRect(w / 2 - 16, h * 0.08, 32, 8);
    const lamp = 0.35 + Math.abs(Math.sin(this.t * 9)) * 0.2;
    ctx.fillStyle = `rgba(230,177,90,${lamp})`;
    ctx.fillRect(w * 0.3, h * 0.045, w * 0.4, 6);
    this.vignette(ctx, 0.4);
  }

  private drawOutsidePack(ctx: CanvasRenderingContext2D, frame: Rect, open: number): void {
    ctx.fillStyle = "#10160f";
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
    const frames = this.art?.zombie ?? [];
    const near = this.scene === "lose" ? smooth(clamp((this.t - 3.3) / 1.5, 0, 1)) : 0.35 + (1 - open) * 0.2;
    const spots = [
      { ox: 0.22, sc: 0.55 },
      { ox: 0.78, sc: 0.62 },
      { ox: 0.5, sc: 0.78 + near * 0.55 },
    ];
    spots.forEach((s, i) => {
      const hh = frame.h * s.sc;
      const frameImg = frames.length ? frames[(i + Math.floor(this.t * 8)) % frames.length] : null;
      const x = frame.x + frame.w * s.ox;
      const foot = frame.y + frame.h * 0.98;
      if (frameImg) this.drawSprite(ctx, frameImg, x, foot, hh, i === 1);
      else this.drawZedSilhouette(ctx, x, foot, hh);
    });
  }

  private drawPanel(ctx: CanvasRenderingContext2D): void {
    const rise = this.riseT === null ? 0 : smooth(clamp(this.riseT / 1.35, 0, 1));
    ctx.save();
    ctx.translate(0, rise * this.h * 0.92);
    this.drawPanelPlate(ctx);
    ctx.restore();
    if (rise > 0.01) {
      ctx.save();
      ctx.translate(0, (rise - 1) * this.h * 0.92);
      this.drawCeilingView(ctx);
      ctx.restore();
    }
  }

  private drawPanelPlate(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = "#12160f";
    ctx.fillRect(0, 0, this.w, this.h);
    const img = this.art?.panel ?? null;
    if (img) this.blit(ctx, img, this.placed(img, "cover", 1));
    else {
      ctx.fillStyle = "#2a2c28";
      ctx.fillRect(this.w * 0.08, this.h * 0.12, this.w * 0.84, this.h * 0.7);
    }
    for (const dent of this.dents) {
      ctx.save();
      ctx.fillStyle = "rgba(20,12,8,0.45)";
      ctx.beginPath();
      ctx.ellipse(dent.x, dent.y, 16, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (this.presses > 1 || this.failT !== null) {
      ctx.strokeStyle = "rgba(80,40,20,0.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.w * 0.3, this.h * 0.36);
      ctx.lineTo(this.w * 0.48, this.h * 0.5);
      ctx.lineTo(this.w * 0.62, this.h * 0.33);
      ctx.stroke();
    }
    this.flicker(ctx);
    this.vignette(ctx, 0.32);
  }

  private drawOperator(ctx: CanvasRenderingContext2D): void {
    const v = this.opVid;
    if (!this.opBlocked && v && v.readyState >= 2 && v.videoWidth > 0) {
      const settled = v.ended || v.currentTime > 3.05;
      const bob = settled ? Math.sin(this.t * 1.15) * 4 : 0;
      const sway = settled ? Math.sin(this.t * 0.62) * 2.4 : 0;
      const breath = settled ? 1 + Math.sin(this.t * 0.9) * 0.012 : 1;
      const s = Math.max(this.w / v.videoWidth, this.h / v.videoHeight);
      const dw = v.videoWidth * s;
      const dh = v.videoHeight * s;
      const ox = (this.w - dw) / 2;
      const oy = (this.h - dh) / 2;
      ctx.save();
      ctx.translate(this.w / 2 + sway, this.h / 2 + bob);
      ctx.scale(breath, breath);
      ctx.translate(-this.w / 2, -this.h / 2);
      ctx.drawImage(v, ox, oy, dw, dh);
      ctx.restore();
      if (settled) {
        const bx = ox + dw * 0.596;
        const by = oy + dh * 0.444;
        const ex = this.w / 2 + (bx - this.w / 2) * breath + sway;
        const ey = this.h / 2 + (by - this.h / 2) * breath + bob;
        const phase = (this.t * 0.37) % 1;
        const flash = phase < 0.045 || (phase > 0.62 && phase < 0.66);
        const a = flash ? 0.95 : 0.28 + Math.sin(this.t * 2.4) * 0.08;
        const rad = dh * (flash ? 0.028 : 0.016);
        const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, rad);
        glow.addColorStop(0, `rgba(255,40,20,${a})`);
        glow.addColorStop(0.45, `rgba(180,0,0,${a * 0.45})`);
        glow.addColorStop(1, "rgba(120,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(ex, ey, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "#070806";
      ctx.fillRect(0, 0, this.w, this.h);
    }
    this.vignette(ctx, 0.18);
    if (this.askReady()) this.drawAsk(ctx);
  }

  private drawAsk(ctx: CanvasRenderingContext2D): void {
    const { ride, play } = this.choiceButtons();
    ctx.save();
    ctx.font = "700 22px Unbounded, Manrope, DejaVu Sans, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const padX = 22;
    const tw = ctx.measureText(OP_ASK).width;
    const bw = Math.min(this.w - 36, tw + padX * 2);
    const bh = 58;
    const x = (this.w - bw) / 2;
    const y = ride.y - bh - 28;
    ctx.fillStyle = "#f4efe4";
    roundRect(ctx, x, y, bw, bh, 16);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#1a140c";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(this.w / 2 - 14, y);
    ctx.lineTo(this.w / 2 - 2, y - 18);
    ctx.lineTo(this.w / 2 + 16, y);
    ctx.closePath();
    ctx.fillStyle = "#f4efe4";
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f4efe4";
    ctx.fillRect(this.w / 2 - 12, y - 2, 26, 8);
    ctx.fillStyle = "#1a140c";
    ctx.fillText(OP_ASK, this.w / 2, y + bh / 2 + 1);
    const button = (rect: Rect, label: string, live: boolean) => {
      ctx.fillStyle = live ? "#8d2e28" : "#2c312e";
      roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = live ? "#e6b15a" : "#4a524c";
      ctx.stroke();
      ctx.fillStyle = live ? "#f6efe2" : "#6d756f";
      ctx.font = "700 16px Unbounded, Manrope, DejaVu Sans, sans-serif";
      ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
    };
    button(ride, "ЕХАТЬ", false);
    button(play, "ШАШЕЧКИ", true);
    ctx.restore();
  }

  private drawCeilingView(ctx: CanvasRenderingContext2D): void {
    const ceil = this.art?.ceiling ?? null;
    if (ceil) this.blit(ctx, ceil, this.placed(ceil, "cover"));
    else this.drawFakeShaft(ctx);
  }

  private hatchBox(): Rect {
    const hw = this.w * 0.52;
    const hh = Math.min(this.h * 0.18, 150);
    return { x: (this.w - hw) / 2, y: this.h * 0.07, w: hw, h: hh };
  }

  private drawHatchRig(ctx: CanvasRenderingContext2D, open: number, drop: number, hands: boolean): void {
    const box = this.hatchBox();
    ctx.fillStyle = "#050604";
    ctx.fillRect(box.x - 6, box.y - 4, box.w + 12, box.h + 10);
    const flap = (1 - clamp(open, 0, 1)) * box.h;
    ctx.save();
    ctx.translate(box.x, box.y + box.h);
    ctx.rotate((-0.15 - open * 1.15) * (flap > 1 ? 1 : 0));
    if (open < 0.98) {
      ctx.fillStyle = "#4c5646";
      ctx.fillRect(0, -box.h, box.w, box.h);
      ctx.fillStyle = "#c4a15a";
      ctx.fillRect(0, -box.h, box.w, 5);
      ctx.fillStyle = "#2a3228";
      for (let i = 8; i < box.w; i += 14) ctx.fillRect(i, -box.h + 8, 6, box.h - 16);
    }
    ctx.restore();
    if (drop > 0.02) this.drawOperatorDrop(ctx, box, drop);
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.beginPath();
    ctx.ellipse(box.x + box.w / 2, box.y + box.h + drop * this.h * 0.34, box.w * 0.42, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!this.art?.taxi?.length && hands && drop > 0.45 && open > 0.55) {
      const hy = box.y + box.h - 6;
      const grip = (x: number) => {
        ctx.fillStyle = "#d7b394";
        ctx.fillRect(x, hy, 34, 16);
        ctx.fillStyle = "#b89070";
        ctx.fillRect(x + 4, hy - 8, 8, 12);
        ctx.fillRect(x + 14, hy - 10, 8, 12);
        ctx.fillRect(x + 22, hy - 8, 8, 12);
      };
      grip(box.x - 10);
      grip(box.x + box.w - 24);
    }
  }

  private drawOperatorDrop(ctx: CanvasRenderingContext2D, box: Rect, drop: number): void {
    const face = this.art?.bust ?? this.art?.taxi?.[1] ?? null;
    const frames = face ? [face] : (this.art?.operator ?? []);
    if (!frames.length) return;
    const fr = frames[Math.floor(this.t * 5) % frames.length];
    const { w: iw, h: ih } = srcSize(fr);
    const sh = this.h * 0.52;
    const sw = sh * (iw / ih);
    const x = (this.w - sw) / 2;
    const y = box.y + box.h * 0.2 + (drop > 0.98 ? Math.sin(this.t * 1.7) * 3 : 0);
    const reveal = box.h * 0.25 + drop * sh * 0.95;
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x - 30, box.y, box.w + 60, reveal);
    ctx.clip();
    ctx.imageSmoothingEnabled = Boolean(this.art?.bust);
    ctx.drawImage(fr, x, y, sw, sh);
    ctx.restore();
  }

  private caption(ctx: CanvasRenderingContext2D, text: string): void {
    if (text === "…") return;
    ctx.save();
    ctx.font = "700 15px Unbounded, Manrope, DejaVu Sans, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const tw = ctx.measureText(text).width;
    const bw = Math.min(this.w - 24, tw + 22);
    const x = (this.w - bw) / 2;
    const y = 58;
    roundRect(ctx, x, y, bw, 32, 6);
    ctx.fillStyle = "rgba(8,10,8,0.72)";
    ctx.fill();
    ctx.fillStyle = "#f4ead4";
    ctx.fillText(text, x + 11, y + 22);
    ctx.restore();
  }

  private drawCheckers(ctx: CanvasRenderingContext2D): void {
    this.drawCabinDoors(ctx, 0, 0);
    ctx.fillStyle = "rgba(8,10,8,0.45)";
    ctx.fillRect(0, 0, this.w, this.h);
    const m = this.boardGeom();
    const bust = this.art?.bust ?? this.art?.taxi?.[1] ?? null;
    if (bust && m.y > 70) {
      const top = 10;
      const sh = Math.max(48, m.y - top - 86);
      const { w: iw, h: ih } = srcSize(bust);
      const sw = sh * (iw / ih);
      const bob = Math.sin(this.t * 1.5) * 4;
      const x = (this.w - sw) / 2;
      const y = top + bob;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, this.w, Math.max(0, m.y - 58));
      ctx.clip();
      const pad = 8;
      const fx = x - pad;
      const fy = y - pad;
      const fw = sw + pad * 2;
      const fh = sh + pad * 2;
      const pulse = 0.35 + Math.sin(this.t * 3.2) * 0.12;
      ctx.save();
      ctx.shadowColor = "rgba(110, 220, 255, 0.85)";
      ctx.shadowBlur = 16;
      ctx.strokeStyle = `rgba(150, 230, 255, ${0.55 + pulse * 0.4})`;
      ctx.lineWidth = 2;
      roundRect(ctx, fx, fy, fw, fh, 10);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(230, 190, 110, ${0.25 + pulse * 0.3})`;
      ctx.lineWidth = 1;
      roundRect(ctx, fx + 4, fy + 4, fw - 8, fh - 8, 8);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, fx, fy, fw, fh, 10);
      ctx.clip();
      ctx.fillStyle = `rgba(80, 180, 220, ${0.06 + pulse * 0.05})`;
      ctx.fillRect(fx, fy, fw, fh);
      for (let sy = fy; sy < fy + fh; sy += 4) {
        ctx.fillStyle = "rgba(160, 230, 255, 0.05)";
        ctx.fillRect(fx, sy, fw, 1);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bust, x, y, sw, sh);
      ctx.restore();
      ctx.restore();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const wc = this.board.flat().filter((p) => p?.color === "w").length;
    const bc = this.board.flat().filter((p) => p?.color === "b").length;
    const label = this.turn === "w" ? "Ваш ход" : "Лифтёр ходит";
    const must = this.turn === "w" && legalMoves(this.board, "w").some((mv) => mv.caps.length > 0);
    ctx.font = "700 15px Unbounded, Manrope, DejaVu Sans, sans-serif";
    ctx.fillStyle = "#f0e2c0";
    ctx.fillText(must ? "Рубите" : label, this.w / 2, m.y - 14);
    ctx.font = "600 12px Unbounded, Manrope, DejaVu Sans, sans-serif";
    ctx.fillStyle = "#b7a88a";
    if (this.banter && this.banterT > 0.05) {
      ctx.globalAlpha = this.banterT < 0.35 ? this.banterT / 0.35 : 1;
      const lines = wrap(ctx, this.banter, this.w - 36).slice(0, 2);
      lines.forEach((ln, i) => ctx.fillText(ln, this.w / 2, m.y - 48 + i * 15));
      ctx.globalAlpha = 1;
    } else {
      ctx.fillText(`${wc} : ${bc}`, this.w / 2, m.y - 32);
    }

    ctx.fillStyle = "#6a5434";
    ctx.fillRect(m.x - 14, m.y - 14, m.w + 28, m.h + 28);
    ctx.fillStyle = "#3a3226";
    ctx.fillRect(m.x - 8, m.y - 8, m.w + 16, m.h + 16);
    const moves = this.turn === "w" ? legalMoves(this.board, "w") : [];
    const targets =
      this.selected && this.turn === "w" && !this.hop ? nextTargets(moves, this.selected, this.chosen) : [];
    const hidden = this.hiddenKeys();
    const origin = this.moverOrigin();
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const x = m.x + c * m.cell;
        const y = m.y + r * m.cell;
        const dark = (r + c) % 2 === 1;
        ctx.fillStyle = dark ? "#3d4a34" : "#cbb99a";
        ctx.fillRect(x, y, m.cell, m.cell);
        if (this.lastMove && (same(this.lastMove.from, { r, c }) || this.lastMove.hops.some((p) => same(p, { r, c })))) {
          ctx.fillStyle = "rgba(230,177,90,0.28)";
          ctx.fillRect(x, y, m.cell, m.cell);
        }
        if (targets.some((p) => p.r === r && p.c === c)) {
          ctx.fillStyle = "#e6b15a";
          ctx.beginPath();
          ctx.arc(x + m.cell / 2, y + m.cell / 2, m.cell * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
        const piece = this.board[r][c];
        if (!piece) continue;
        if (hidden.has(`${r},${c}`)) continue;
        if (origin && origin.r === r && origin.c === c) continue;
        const pulse = moves.some((mv) => mv.from.r === r && mv.from.c === c) && this.turn === "w";
        this.drawMan(ctx, x + m.cell / 2, y + m.cell / 2, m.cell * 0.36, piece.color, piece.king, false, pulse);
      }
    }
    const vis = this.moverVisual();
    if (vis && origin) {
      const piece = this.board[origin.r][origin.c];
      if (piece) {
        this.drawMan(
          ctx,
          m.x + (vis.c + 0.5) * m.cell,
          m.y + (vis.r + 0.5) * m.cell,
          m.cell * 0.36,
          piece.color,
          piece.king,
          true,
          false,
        );
      }
    }
  }

  private moverOrigin(): Pos | null {
    if (this.hop?.ai && this.hop.move) return this.hop.move.from;
    if (this.selected && (this.hop || this.chosen.length || this.turn === "w")) return this.selected;
    return null;
  }

  private moverVisual(): { r: number; c: number } | null {
    if (this.hop) {
      const u = ease(Math.min(1, this.hop.u));
      return {
        r: lerp(this.hop.from.r, this.hop.to.r, u),
        c: lerp(this.hop.from.c, this.hop.to.c, u),
      };
    }
    if (this.chosen.length) return this.chosen[this.chosen.length - 1];
    if (this.selected && this.turn === "w") return this.selected;
    return null;
  }

  private hiddenKeys(): Set<string> {
    const s = new Set<string>();
    if (this.hop?.ai && this.hop.move) {
      for (let i = 0; i < this.hop.hopIndex; i++) {
        const c = this.hop.move.caps[i];
        if (c) s.add(`${c.r},${c.c}`);
      }
      if (this.hop.cap && this.hop.u > 0.45) s.add(`${this.hop.cap.r},${this.hop.cap.c}`);
      return s;
    }
    if (this.selected) {
      const moves = legalMoves(this.board, "w");
      for (let i = 0; i < this.chosen.length; i++) {
        const c = capForHop(moves, this.selected, this.chosen.slice(0, i), this.chosen[i]);
        if (c) s.add(`${c.r},${c.c}`);
      }
      if (this.hop?.cap && this.hop.u > 0.45) s.add(`${this.hop.cap.r},${this.hop.cap.c}`);
    }
    return s;
  }

  private drawMan(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rad: number,
    color: Color,
    king: boolean,
    sel: boolean,
    pulse: boolean,
  ): void {
    const s = pulse ? 1 + Math.sin(this.t * 6) * 0.04 : 1;
    const r = rad * s;
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.ellipse(x + 2, y + r * 0.75, r * 0.8, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color === "w" ? "#f0e2c4" : "#1a221c";
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.strokeStyle = color === "w" ? "#8d7044" : "#6d8f72";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - r * 0.2, y - r * 0.22, r * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = color === "w" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.08)";
    ctx.fill();
    if (king) {
      ctx.fillStyle = "#e6b15a";
      ctx.fillRect(x - r * 0.34, y - r * 0.18, r * 0.68, r * 0.28);
      ctx.fillRect(x - r * 0.34, y - r * 0.42, r * 0.16, r * 0.28);
      ctx.fillRect(x - r * 0.08, y - r * 0.5, r * 0.16, r * 0.36);
      ctx.fillRect(x + r * 0.18, y - r * 0.42, r * 0.16, r * 0.28);
    }
    if (sel) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = "#f0d48a";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  private endingKind(img: HTMLImageElement | null): string {
    const src = img?.src ?? "";
    if (src.includes("end-home")) return "home";
    if (src.includes("end-child")) return "child";
    if (src.includes("end-dacha")) return "dacha";
    if (src.includes("end-meadow")) return "meadow";
    if (src.includes("end-island")) return "island";
    return "other";
  }

  private endingSource(img: HTMLImageElement): HTMLCanvasElement {
    if (this.aliveCanvas && this.aliveKey === img.src) return this.aliveCanvas;
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || 1;
    c.height = img.naturalHeight || 1;
    c.getContext("2d")?.drawImage(img, 0, 0);
    this.aliveCanvas = c;
    this.aliveKey = img.src;
    return c;
  }

  private drawAliveEnding(ctx: CanvasRenderingContext2D, img: HTMLImageElement, _kind: "meadow" | "island"): void {
    const src = this.endingSource(img);
    const p = this.placed(img, "cover", 1);
    ctx.drawImage(src, p.x, p.y, p.w, p.h);
    const sky = { a: 0, b: 0.46, amp: 16, speed: 0.28, wave: 0.01 };
    const y0 = Math.floor(sky.a * p.h);
    const y1 = Math.floor(sky.b * p.h);
    for (let y = y0; y < y1; y += 3) {
      const sy = (y / p.h) * src.height;
      const sh = Math.max(1, (3 / p.h) * src.height);
      const shift = Math.sin(this.t * sky.speed + y * sky.wave) * sky.amp;
      ctx.drawImage(src, 0, sy, src.width, sh, p.x + shift, p.y + y, p.w, 3);
      ctx.drawImage(src, 0, sy, src.width, sh, p.x + shift - Math.sign(shift || 1) * p.w, p.y + y, p.w, 3);
    }
    const g0 = Math.floor(0.64 * p.h);
    for (let y = g0; y < p.h; y += 2) {
      const depth = (y - g0) / Math.max(1, p.h - g0);
      const amp = 0.6 + depth * 1.6;
      const sy = (y / p.h) * src.height;
      const sh = Math.max(1, (2 / p.h) * src.height);
      const shift = Math.sin(this.t * 3.4 + y * 0.35) * amp;
      ctx.drawImage(src, 0, sy, src.width, sh, p.x + shift, p.y + y, p.w, 2);
      ctx.drawImage(src, 0, sy, src.width, sh, p.x + shift - Math.sign(shift || 1) * p.w, p.y + y, p.w, 2);
    }
  }

  private shoreV(u: number): number {
    const pts: [number, number][] = [
      [0.66, 0.676],
      [0.74, 0.698],
      [0.82, 0.724],
      [0.9, 0.748],
      [1.02, 0.772],
    ];
    if (u <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (u <= pts[i][0]) {
        const a = pts[i - 1];
        const b = pts[i];
        const t = (u - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return pts[pts.length - 1][1];
  }

  private drawSurf(ctx: CanvasRenderingContext2D, p: Rect): void {
    const X = (u: number) => p.x + u * p.w;
    const Y = (v: number) => p.y + v * p.h;
    const u0 = 0.68;
    const u1 = 1.02;
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const phase = (this.t * 0.2 + i / 3) % 1;
      const fade = Math.sin(phase * Math.PI);
      const ahead = (1 - phase) * 0.028;
      const wash = smooth(clamp((phase - 0.28) / 0.45, 0, 1)) * (1 - smooth(clamp((phase - 0.82) / 0.18, 0, 1)));
      ctx.beginPath();
      for (let s = 0; s <= 22; s++) {
        const u = u0 + ((u1 - u0) * s) / 22;
        const wob = Math.sin(u * 26 + this.t * 2.4 + i) * 0.003;
        const v = this.shoreV(u) - ahead + wob;
        if (s === 0) ctx.moveTo(X(u), Y(v));
        else ctx.lineTo(X(u), Y(v));
      }
      for (let s = 22; s >= 0; s--) {
        const u = u0 + ((u1 - u0) * s) / 22;
        ctx.lineTo(X(u), Y(this.shoreV(u) - ahead - 0.012));
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(244,250,248,${0.05 + fade * 0.38})`;
      ctx.fill();
      if (wash > 0.04) {
        ctx.beginPath();
        for (let s = 0; s <= 22; s++) {
          const u = u0 + ((u1 - u0) * s) / 22;
          if (s === 0) ctx.moveTo(X(u), Y(this.shoreV(u)));
          else ctx.lineTo(X(u), Y(this.shoreV(u)));
        }
        for (let s = 22; s >= 0; s--) {
          const u = u0 + ((u1 - u0) * s) / 22;
          const tongue = wash * (0.022 + 0.016 * (0.5 + 0.5 * Math.sin(u * 18 + i * 2)));
          ctx.lineTo(X(u), Y(this.shoreV(u) + tongue));
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(232,242,238,${0.2 + wash * 0.45})`;
        ctx.fill();
        ctx.beginPath();
        for (let s = 0; s <= 22; s++) {
          const u = u0 + ((u1 - u0) * s) / 22;
          const tongue = wash * (0.02 + 0.014 * Math.sin(u * 18 + i));
          const x = X(u);
          const y = Y(this.shoreV(u) + tongue);
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + wash * 0.5})`;
        ctx.lineWidth = 2 + wash * 2.5;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawBirds(ctx: CanvasRenderingContext2D, p: Rect): void {
    ctx.save();
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(42, 30, 22, 0.9)";
    for (let i = 0; i < 6; i++) {
      const u = 0.58 + ((this.t * (0.03 + i * 0.006) + i * 0.16) % 1) * 0.4;
      const x = p.x + u * p.w;
      const y = p.y + p.h * (0.4 + (i % 3) * 0.028) + Math.sin(this.t * 1.6 + i) * 6;
      const flap = Math.sin(this.t * 8 + i) * 3.2;
      ctx.beginPath();
      ctx.moveTo(x - 9, y + flap);
      ctx.quadraticCurveTo(x - 3, y - 5, x, y + 1);
      ctx.quadraticCurveTo(x + 3, y - 5, x + 9, y + flap);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSteam(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const u = (this.t * 0.28 + i * 0.17) % 1;
      const px = x + Math.sin(this.t * 1.6 + i * 1.7) * (4 + u * 10);
      const py = y - u * 86;
      ctx.fillStyle = `rgba(255,250,245,${(1 - u) * 0.38})`;
      ctx.beginPath();
      ctx.ellipse(px, py, 3 + u * 7, 6 + u * 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawRide(ctx: CanvasRenderingContext2D): void {
    this.drawCeilingView(ctx);
    const drop = 1 - smooth(clamp((this.t - 0.35) / 1.35, 0, 1));
    const open = drop > 0.05 ? 1 : 1 - smooth(clamp((this.t - 1.7) / 0.45, 0, 1));
    this.drawHatchRig(ctx, open, drop, drop > 0.2);
    if (this.t > 2.2) {
      const flick = 0.08 + Math.abs(Math.sin(this.t * 22)) * 0.18;
      ctx.fillStyle = `rgba(230,177,90,${flick})`;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      for (let i = 0; i < 8; i++) ctx.fillRect(0, ((this.t * 220 + i * 80) % (this.h + 40)) - 20, this.w, 10);
    }
    if (this.t < 2.3) this.speech(ctx, "op", "Ну что ж. Шашечки были. Теперь ехать.", 18);
  }

  private winClip(): HTMLVideoElement | null {
    const ends = this.art?.endings ?? [];
    if (!ends.length) return null;
    const img = ends[this.winPick % ends.length] ?? null;
    const kind = this.endingKind(img);
    if (kind === "child") return this.childVid;
    if (kind === "dacha") return this.dachaVid;
    return null;
  }

  private drawWin(ctx: CanvasRenderingContext2D): void {
    const clip = this.winClip();
    if (clip && clip.readyState >= 2 && clip.videoWidth > 0) {
      for (const v of [this.childVid, this.dachaVid]) {
        if (v && v !== clip) v.pause();
      }
      if (clip.paused) void clip.play().catch(() => undefined);
      const s = Math.max(this.w / clip.videoWidth, this.h / clip.videoHeight);
      const dw = clip.videoWidth * s;
      const dh = clip.videoHeight * s;
      ctx.drawImage(clip, (this.w - dw) / 2, (this.h - dh) / 2, dw, dh);
      if (clip === this.dachaVid) {
        const open = smooth((this.t - 0.2) / 1.2);
        if (open > 0.55) this.drawMetalSign(ctx, "КОНЕЧНАЯ");
        if (this.t > 1.35) this.speech(ctx, "op", WIN_LINES[this.winPick % WIN_LINES.length], 118);
      }
      return;
    }
    const open = smooth((this.t - 0.2) / 1.2);
    const ends = this.art?.endings ?? [];
    const img = ends.length ? (ends[this.winPick % ends.length] ?? null) : (this.art?.ending ?? null);
    const kind = this.endingKind(img);
    if (img && kind === "meadow") this.drawAliveEnding(ctx, img, kind);
    else if (img) this.blit(ctx, img, this.placed(img, "cover", 1 + (kind === "island" ? 0 : this.t * 0.003)));
    else {
      ctx.fillStyle = "#05060a";
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (img && kind === "island") {
      const p = this.placed(img, "cover", 1);
      this.drawSurf(ctx, p);
      this.drawBirds(ctx, p);
    }
    if (img && kind === "home") {
      const p = this.placed(img, "cover", 1);
      this.drawSteam(ctx, p.x + p.w * 0.45, p.y + p.h * 0.64);
    }
    this.drawLeaves(ctx, open);
    if (open > 0.55) this.drawMetalSign(ctx, "КОНЕЧНАЯ");
    if (this.t > 1.35) this.speech(ctx, "op", WIN_LINES[this.winPick % WIN_LINES.length], 118);
  }

  private drawLose(ctx: CanvasRenderingContext2D): void {
    const v = this.goreVid;
    if (!this.loseBlocked && v && !v.error && v.readyState >= 2 && v.videoWidth > 0) {
      const s = Math.max(this.w / v.videoWidth, this.h / v.videoHeight);
      const dw = v.videoWidth * s;
      const dh = v.videoHeight * s;
      ctx.drawImage(v, (this.w - dw) / 2, (this.h - dh) / 2, dw, dh);
      if (v.currentTime > 2.2) this.drawGoreTitle(ctx);
      return;
    }
    ctx.fillStyle = "#070806";
    ctx.fillRect(0, 0, this.w, this.h);
  }

  private drawGoreVideo(ctx: CanvasRenderingContext2D): void {
    const v = this.goreVid;
    if (!v || v.readyState < 2) return;
    const vw = v.videoWidth || 9;
    const vh = v.videoHeight || 16;
    const s = Math.max(this.w / vw, this.h / vh);
    const dw = vw * s;
    const dh = vh * s;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(v, (this.w - dw) / 2, (this.h - dh) / 2, dw, dh);
    ctx.restore();
  }

  private drawGoreTitle(ctx: CanvasRenderingContext2D): void {
    const text = "ПОЕЗДКА ОКОНЧЕНА";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxW = this.w * 0.82;
    let size = 22;
    ctx.font = `700 ${size}px Unbounded, Manrope, DejaVu Sans, sans-serif`;
    while (size > 13 && ctx.measureText(text).width > maxW) {
      size -= 1;
      ctx.font = `700 ${size}px Unbounded, Manrope, DejaVu Sans, sans-serif`;
    }
    const tw = ctx.measureText(text).width;
    const bw = Math.min(this.w - 24, tw + 36);
    const bh = size + 28;
    const x = (this.w - bw) / 2;
    const y = this.h * 0.42;
    ctx.fillStyle = "rgba(40,0,0,0.72)";
    ctx.fillRect(x, y - bh / 2, bw, bh);
    ctx.fillStyle = "#1a0606";
    ctx.fillText(text, this.w / 2 + 1, y + 1);
    ctx.fillStyle = "#f4e6c8";
    ctx.fillText(text, this.w / 2, y);
  }

  private paintGore(ctx: CanvasRenderingContext2D, a: number): void {
    for (const s of this.stains) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.fillStyle = s.c;
      ctx.fillRect(-s.s / 2, -s.s / 2, s.s, s.s * 0.72);
      ctx.restore();
    }
    for (const b of this.bits) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.s / 2, -b.s / 2, b.s, b.s * 0.66);
      ctx.restore();
    }
    if (a > 0.65) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 26px Unbounded, Manrope, DejaVu Sans, sans-serif";
      ctx.fillStyle = "#1a0606";
      ctx.fillText("ПОЕЗДКА ОКОНЧЕНА", this.w / 2 + 2, this.h * 0.46 + 2);
      ctx.fillStyle = "#f4e6c8";
      ctx.fillText("ПОЕЗДКА ОКОНЧЕНА", this.w / 2, this.h * 0.46);
    }
  }

  private drawDraw(ctx: CanvasRenderingContext2D): void {
    const v = this.drawVid;
    const live = v && !v.error && v.readyState >= 2 && v.videoWidth > 0 && !this.frameIsBlank(v);
    if (live && v) {
      this.rememberDraw(v);
      this.paintCover(ctx, v, v.videoWidth, v.videoHeight);
    } else if (this.drawHold) {
      this.paintCover(ctx, this.drawHold, this.drawHold.width, this.drawHold.height);
    } else {
      ctx.fillStyle = "#07060c";
      ctx.fillRect(0, 0, this.w, this.h);
    }
    const talking = this.line < DRAW_SCRIPT.length - 1 || this.lineT < 2.3;
    if (talking && this.line < DRAW_SCRIPT.length) {
      const row = DRAW_SCRIPT[this.line];
      this.speech(ctx, row.who, row.text, 118);
    }
  }

  private frameIsBlank(v: HTMLVideoElement): boolean {
    if (!this.drawProbe) {
      const c = document.createElement("canvas");
      c.width = 16;
      c.height = 16;
      this.drawProbe = c;
    }
    const probe = this.drawProbe.getContext("2d", { willReadFrequently: true });
    if (!probe || !v.videoWidth) return false;
    probe.drawImage(v, 0, 0, 16, 16);
    const data = probe.getImageData(0, 0, 16, 16).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
    return sum / (256 * 3) < 8;
  }

  private rememberDraw(v: HTMLVideoElement): void {
    if (!this.drawHold) this.drawHold = document.createElement("canvas");
    if (this.drawHold.width !== v.videoWidth || this.drawHold.height !== v.videoHeight) {
      this.drawHold.width = v.videoWidth;
      this.drawHold.height = v.videoHeight;
    }
    this.drawHold.getContext("2d")?.drawImage(v, 0, 0);
  }

  private paintCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number): void {
    const s = Math.max(this.w / sw, this.h / sh);
    const dw = sw * s;
    const dh = sh * s;
    ctx.drawImage(src, (this.w - dw) / 2, (this.h - dh) / 2, dw, dh);
  }

  private drawAbyss(ctx: CanvasRenderingContext2D): void {
    const w = this.w;
    const h = this.h;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#070b16");
    bg.addColorStop(0.45, "#121a2a");
    bg.addColorStop(1, "#070910");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const scroll = this.epi * 92;
    for (let i = -2; i < 18; i++) {
      const y = ((i * 64 + scroll) % (h + 128)) - 64;
      const near = clamp(y / h, 0, 1);
      const ledge = 22 + near * 78;
      const tone = Math.floor(18 + near * 48);
      ctx.fillStyle = `rgb(${tone},${tone + 4},${tone + 12})`;
      ctx.fillRect(0, y, ledge, 8 + near * 14);
      ctx.fillRect(w - ledge, y, ledge, 8 + near * 14);
      ctx.fillStyle = `rgba(196,176,140,${0.12 + near * 0.28})`;
      ctx.fillRect(ledge - 4, y, 4, 6 + near * 8);
      ctx.fillRect(w - ledge, y, 4, 6 + near * 8);
      if (i % 3 === 0) {
        ctx.fillStyle = `rgba(8,10,16,0.55)`;
        ctx.fillRect(6, y + 14, ledge * 0.55, 4);
        ctx.fillRect(w - ledge * 0.55 - 6, y + 18, ledge * 0.45, 4);
      }
    }
    ctx.fillStyle = "rgba(168,178,198,0.22)";
    for (let i = 0; i < 7; i++) {
      const y = ((this.epi * 220 + i * 130) % (h + 80)) - 80;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(w * (0.3 + (i % 3) * 0.14), y, 2, 46 + (i % 3) * 20);
    }
    ctx.globalAlpha = 1;
    const fog = ctx.createLinearGradient(0, h * 0.62, 0, h);
    fog.addColorStop(0, "rgba(7,10,18,0)");
    fog.addColorStop(1, "rgba(7,10,18,0.92)");
    ctx.fillStyle = fog;
    ctx.fillRect(0, h * 0.62, w, h * 0.38);
    const top = ctx.createLinearGradient(0, 0, 0, h * 0.22);
    top.addColorStop(0, "rgba(0,0,0,0.55)");
    top.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, w, h * 0.22);
    ctx.save();
    ctx.translate(w * 0.5 + Math.sin(this.epi * 0.65) * 26, h * 0.46 + Math.sin(this.epi * 0.37) * 16);
    ctx.rotate(Math.sin(this.epi * 0.8) * 0.9 + this.epi * 0.15);
    ctx.scale(1.45, 1.45);
    this.drawFaller(ctx);
    ctx.restore();
    const u = (this.epi * 0.11 + 0.35) % 1;
    ctx.save();
    ctx.globalAlpha = Math.sin(u * Math.PI) * 0.75;
    ctx.translate(w * (0.38 + (u < 0.5 ? 0.08 : -0.06)), h * (0.18 + u * 0.62));
    ctx.rotate(this.epi * 1.4);
    ctx.scale(0.42 + u * 0.7, 0.42 + u * 0.7);
    this.drawFaller(ctx);
    ctx.restore();
  }

  private drawFaller(ctx: CanvasRenderingContext2D): void {
    const flap = Math.sin(this.t * 7);
    ctx.fillStyle = "#0a0d14";
    ctx.strokeStyle = "rgba(186,194,210,0.55)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, -42, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-7, -32);
    ctx.lineTo(-11, 6);
    ctx.lineTo(9, 4);
    ctx.lineTo(6, -32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.rotate(-0.7 + flap * 0.45);
    ctx.fillRect(0, -24, 26, 4);
    ctx.restore();
    ctx.save();
    ctx.rotate(0.85 - flap * 0.4);
    ctx.fillRect(-24, -22, 24, 4);
    ctx.restore();
    ctx.save();
    ctx.translate(-3, 4);
    ctx.rotate(0.5 + flap * 0.2);
    ctx.fillRect(-3, 0, 5, 20);
    ctx.restore();
    ctx.save();
    ctx.translate(3, 4);
    ctx.rotate(-0.35 - flap * 0.25);
    ctx.fillRect(-2, 0, 5, 18);
    ctx.restore();
  }

  private drawMetalSign(ctx: CanvasRenderingContext2D, text: string): void {
    const bw = Math.min(this.w * 0.78, 300);
    const bh = 48;
    const x = (this.w - bw) / 2;
    const y = this.h * 0.16;
    ctx.fillStyle = "#1a140c";
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeStyle = "#e6b15a";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 3, y + 3, bw - 6, bh - 6);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 20px Unbounded, Manrope, DejaVu Sans, sans-serif";
    ctx.fillStyle = "#f3e2bc";
    ctx.fillText(text, this.w / 2, y + bh / 2 + 1);
  }

  private drawLeaves(ctx: CanvasRenderingContext2D, open: number): void {
    const leaf = (this.w / 2) * (1 - clamp(open, 0, 1));
    if (leaf < 1) return;
    const paint = (x: number) => {
      ctx.fillStyle = "#2a3129";
      ctx.fillRect(x, 0, leaf, this.h);
      for (let i = 0; i < leaf; i += 7) {
        ctx.fillStyle = hash(i, 4) > 0.55 ? "#3c4638" : "#1e241d";
        ctx.fillRect(x + i, 0, 3, this.h);
      }
      ctx.fillStyle = "#0c0e0b";
      ctx.fillRect(x < this.w / 2 ? x + leaf - 5 : x, 0, 5, this.h);
    };
    paint(0);
    paint(this.w - leaf);
  }

  private drawSparks(ctx: CanvasRenderingContext2D): void {
    for (const s of this.sparks) {
      const a = 1 - s.u / 0.35;
      ctx.strokeStyle = `rgba(180,220,255,${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x - 10, s.y);
      ctx.lineTo(s.x - 2, s.y + 6);
      ctx.lineTo(s.x + 3, s.y - 8);
      ctx.lineTo(s.x + 12, s.y + 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,240,200,${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5 * a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private speech(ctx: CanvasRenderingContext2D, who: "op" | "you", text: string, bottom: number): void {
    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const maxW = Math.min(this.w - 48, 460);
    ctx.font = "700 17px Unbounded, Manrope, DejaVu Sans, sans-serif";
    const lines = wrap(ctx, text, maxW);
    const boxW = Math.min(this.w - 24, maxW + 28);
    const boxH = 36 + lines.length * 22;
    const x = (this.w - boxW) / 2;
    const y = this.h - boxH - bottom - this.safeBottom;
    roundRect(ctx, x, y, boxW, boxH, 8);
    ctx.fillStyle = "rgba(10,12,9,0.88)";
    ctx.fill();
    ctx.strokeStyle = who === "op" ? "#e6b15a" : "#9eb89a";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = "700 11px Unbounded, Manrope, DejaVu Sans, sans-serif";
    ctx.fillStyle = who === "op" ? "#e6b15a" : "#b7d2b0";
    ctx.fillText(who === "op" ? "ЛИФТЁР" : "ВЫ", x + 12, y + 18);
    ctx.font = "700 16px Unbounded, Manrope, DejaVu Sans, sans-serif";
    ctx.fillStyle = "#f6efe2";
    lines.forEach((ln, i) => ctx.fillText(ln, x + 12, y + 40 + i * 22));
    ctx.restore();
  }

  private bindDebug(): void {
    const api = {
      scene: () => this.scene,
      to: (s: Scene) => this.go(s),
      seek: (n: number) => {
        this.t = n;
      },
      force: (k: "win" | "lose" | "draw") => this.finish(k),
      tap: (x: number, y: number) => this.taps.push({ x, y }),
      start: () => this.start(),
      pick: (n: number) => {
        this.go("win");
        this.winPick = n;
        this.t = 2.2;
      },
      epi: (n: number) => {
        this.epi = n;
      },
      board: () => this.board.map((row) => row.map((p) => (p ? p.color + (p.king ? "K" : "") : ".")).join(" ")).join("\n"),
      geom: () => {
        const m = this.boardGeom();
        return { w: this.w, h: this.h, x: m.x, y: m.y, cell: m.cell, safe: this.safeBottom };
      },
    };
    (window as unknown as { __elevator?: typeof api }).__elevator = api;
  }
}
