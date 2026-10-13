import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyMove,
  chooseAiMove,
  initialBoard,
  legalMoves,
  type Board,
  type Color,
  type Piece,
} from "./checkers.ts";

function empty(): Board {
  return Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => null));
}

function put(b: Board, r: number, c: number, color: Color, king = false): void {
  const p: Piece = { color, king };
  b[r][c] = p;
}

describe("russian draughts 6x6", () => {
  it("starts with six men a side and five quiet white moves", () => {
    const b = initialBoard();
    const count = (color: Color) => b.flat().filter((p) => p?.color === color).length;
    assert.equal(count("w"), 6);
    assert.equal(count("b"), 6);
    const moves = legalMoves(b, "w");
    assert.equal(moves.length, 5);
    assert.ok(moves.every((m) => m.caps.length === 0 && m.hops.length === 1 && m.hops[0].r === m.from.r - 1));
  });

  it("does not mutate the board when listing or applying", () => {
    const b = initialBoard();
    const snap = JSON.stringify(b);
    const moves = legalMoves(b, "w");
    applyMove(b, moves[0]);
    assert.equal(JSON.stringify(b), snap);
  });

  it("forces a backward capture and forbids quiet moves", () => {
    const b = empty();
    put(b, 2, 3, "w");
    put(b, 3, 2, "b");
    put(b, 4, 5, "w");
    const moves = legalMoves(b, "w");
    assert.ok(moves.length >= 1);
    assert.ok(moves.every((m) => m.caps.length === 1));
    assert.ok(moves.some((m) => m.from.r === 2 && m.hops[0].r === 4 && m.hops[0].c === 1));
  });

  it("continues a multi-jump and promotes on the last rank, stopping there", () => {
    const b = empty();
    put(b, 4, 1, "w");
    put(b, 3, 2, "b");
    put(b, 1, 2, "b");
    const moves = legalMoves(b, "w");
    assert.equal(moves.length, 1);
    assert.equal(moves[0].hops.length, 2);
    assert.equal(moves[0].caps.length, 2);
    assert.equal(moves[0].promote, true);
    assert.deepEqual(moves[0].hops[1], { r: 0, c: 1 });
    const next = applyMove(b, moves[0]);
    assert.equal(next[0][1]?.king, true);
    assert.equal(next[3][2], null);
    assert.equal(next[1][2], null);
    assert.equal(next[4][1], null);
  });

  it("lets a king fly and capture at a distance, not land before the victim", () => {
    const b = empty();
    put(b, 5, 0, "w", true);
    put(b, 2, 3, "b");
    const moves = legalMoves(b, "w");
    assert.ok(moves.every((m) => m.caps.length === 1));
    const lands = moves.map((m) => m.hops[0]);
    assert.ok(lands.some((p) => p.r === 1 && p.c === 4));
    assert.ok(lands.some((p) => p.r === 0 && p.c === 5));
    assert.ok(!lands.some((p) => p.r === 4 && p.c === 1));
    assert.ok(!lands.some((p) => p.r === 3 && p.c === 2));
  });

  it("promotes a quiet man on the last rank", () => {
    const b = empty();
    put(b, 1, 0, "w");
    const moves = legalMoves(b, "w");
    const promo = moves.find((m) => m.promote);
    assert.ok(promo);
    const next = applyMove(b, promo);
    assert.equal(next[0][1]?.king, true);
  });

  it("plays a legal, sensible opening as black", () => {
    const b = initialBoard();
    const t0 = Date.now();
    const m = chooseAiMove(b, "b", { rng: () => 1 });
    const dt = Date.now() - t0;
    assert.ok(m);
    const legal = legalMoves(b, "b");
    assert.ok(legal.some((x) => JSON.stringify(x) === JSON.stringify(m)));
    assert.ok(dt < 800, `ai too slow: ${dt}ms`);
  });
});
