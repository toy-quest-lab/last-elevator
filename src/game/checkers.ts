/** Russian draughts on a 6×6 board. Dark squares only. Captures are mandatory,
 *  any length (not forced maximum). Men capture forward and backward.
 *  A man that reaches the last rank while capturing promotes and stops.
 *  Kings fly. Captured pieces stay on the board until the sequence ends.
 */

export type Color = "w" | "b";
export type Piece = { color: Color; king: boolean };
export type Board = (Piece | null)[][];
export type Pos = { r: number; c: number };
export type Move = { from: Pos; hops: Pos[]; caps: Pos[]; promote: boolean };

export const SIZE = 6;

const DIRS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

export function opposite(c: Color): Color {
  return c === "w" ? "b" : "w";
}

export function same(a: Pos, b: Pos): boolean {
  return a.r === b.r && a.c === b.c;
}

function inside(r: number, c: number): boolean {
  return r >= 0 && c >= 0 && r < SIZE && c < SIZE;
}

function id(p: Pos): number {
  return p.r * SIZE + p.c;
}

export function cloneBoard(b: Board): Board {
  const n: Board = new Array(SIZE);
  for (let r = 0; r < SIZE; r++) {
    const row = b[r];
    const nr: (Piece | null)[] = new Array(SIZE);
    for (let c = 0; c < SIZE; c++) {
      const p = row[c];
      nr[c] = p ? { color: p.color, king: p.king } : null;
    }
    n[r] = nr;
  }
  return n;
}

export function initialBoard(): Board {
  const b: Board = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 0) continue;
      if (r <= 1) b[r][c] = { color: "b", king: false };
      else if (r >= 4) b[r][c] = { color: "w", king: false };
    }
  }
  return b;
}

export function posKey(board: Board, turn: Color): string {
  let s = turn;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = board[r][c];
      s += p ? (p.king ? p.color.toUpperCase() : p.color) : ".";
    }
  }
  return s;
}

type Hop = { to: Pos; cap: Pos };

function manCaps(board: Board, r: number, c: number, color: Color, taken: Set<number>): Hop[] {
  const out: Hop[] = [];
  for (const [dr, dc] of DIRS) {
    const er = r + dr;
    const ec = c + dc;
    const lr = r + dr * 2;
    const lc = c + dc * 2;
    if (!inside(er, ec) || !inside(lr, lc)) continue;
    const enemy = board[er][ec];
    if (!enemy || enemy.color === color || taken.has(er * SIZE + ec)) continue;
    if (board[lr][lc]) continue;
    out.push({ to: { r: lr, c: lc }, cap: { r: er, c: ec } });
  }
  return out;
}

function kingCaps(board: Board, r: number, c: number, color: Color, taken: Set<number>): Hop[] {
  const out: Hop[] = [];
  for (const [dr, dc] of DIRS) {
    let rr = r + dr;
    let cc = c + dc;
    while (inside(rr, cc) && !board[rr][cc]) {
      rr += dr;
      cc += dc;
    }
    if (!inside(rr, cc)) continue;
    const enemy = board[rr][cc];
    if (!enemy || enemy.color === color || taken.has(rr * SIZE + cc)) continue;
    let lr = rr + dr;
    let lc = cc + dc;
    while (inside(lr, lc) && !board[lr][lc]) {
      out.push({ to: { r: lr, c: lc }, cap: { r: rr, c: cc } });
      lr += dr;
      lc += dc;
    }
  }
  return out;
}

function captureMoves(board: Board, r: number, c: number): Move[] {
  const piece = board[r][c];
  if (!piece) return [];
  const promoRow = piece.color === "w" ? 0 : SIZE - 1;
  const out: Move[] = [];

  const rec = (bd: Board, cr: number, cc: number, hops: Pos[], caps: Pos[]) => {
    const p = bd[cr][cc];
    if (!p) return;
    const taken = new Set(caps.map(id));
    const options = p.king ? kingCaps(bd, cr, cc, p.color, taken) : manCaps(bd, cr, cc, p.color, taken);
    if (options.length === 0) {
      if (hops.length) out.push({ from: { r, c }, hops, caps, promote: false });
      return;
    }
    for (const op of options) {
      const willPromote = !p.king && op.to.r === promoRow;
      const nextHops = hops.concat(op.to);
      const nextCaps = caps.concat(op.cap);
      if (willPromote) {
        out.push({ from: { r, c }, hops: nextHops, caps: nextCaps, promote: true });
        continue;
      }
      const nb = cloneBoard(bd);
      nb[cr][cc] = null;
      nb[op.to.r][op.to.c] = { color: p.color, king: p.king };
      rec(nb, op.to.r, op.to.c, nextHops, nextCaps);
    }
  };

  rec(board, r, c, [], []);
  return out;
}

function quietMoves(board: Board, r: number, c: number): Move[] {
  const p = board[r][c];
  if (!p) return [];
  const out: Move[] = [];
  if (p.king) {
    for (const [dr, dc] of DIRS) {
      let rr = r + dr;
      let cc = c + dc;
      while (inside(rr, cc) && !board[rr][cc]) {
        out.push({ from: { r, c }, hops: [{ r: rr, c: cc }], caps: [], promote: false });
        rr += dr;
        cc += dc;
      }
    }
    return out;
  }
  const f = p.color === "w" ? -1 : 1;
  const promoRow = p.color === "w" ? 0 : SIZE - 1;
  for (const dc of [-1, 1]) {
    const rr = r + f;
    const cc = c + dc;
    if (!inside(rr, cc) || board[rr][cc]) continue;
    out.push({
      from: { r, c },
      hops: [{ r: rr, c: cc }],
      caps: [],
      promote: rr === promoRow,
    });
  }
  return out;
}

function dedupe(moves: Move[]): Move[] {
  const seen = new Set<string>();
  const out: Move[] = [];
  for (const m of moves) {
    const k =
      m.from.r +
      "," +
      m.from.c +
      ">" +
      m.hops.map((p) => p.r + "." + p.c).join(";") +
      "|" +
      m.caps.map((p) => p.r + "." + p.c).join(";");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

export function legalMoves(board: Board, color: Color): Move[] {
  const caps: Move[] = [];
  const quiet: Move[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = board[r][c];
      if (!p || p.color !== color) continue;
      caps.push(...captureMoves(board, r, c));
      quiet.push(...quietMoves(board, r, c));
    }
  }
  return dedupe(caps.length ? caps : quiet);
}

export function applyMove(board: Board, move: Move): Board {
  const next = cloneBoard(board);
  const piece = next[move.from.r][move.from.c];
  if (!piece) return next;
  next[move.from.r][move.from.c] = null;
  for (const cap of move.caps) next[cap.r][cap.c] = null;
  const dest = move.hops[move.hops.length - 1] ?? move.from;
  const promoRow = piece.color === "w" ? 0 : SIZE - 1;
  const king = piece.king || move.promote || dest.r === promoRow;
  next[dest.r][dest.c] = { color: piece.color, king };
  return next;
}

export function matchingMoves(moves: Move[], from: Pos, hops: Pos[]): Move[] {
  return moves.filter(
    (m) =>
      same(m.from, from) &&
      hops.every((p, i) => m.hops[i] && same(m.hops[i], p)) &&
      m.hops.length >= hops.length,
  );
}

export function nextTargets(moves: Move[], from: Pos, hops: Pos[]): Pos[] {
  const map = new Map<number, Pos>();
  for (const m of matchingMoves(moves, from, hops)) {
    if (m.hops.length === hops.length) continue;
    const p = m.hops[hops.length];
    map.set(id(p), p);
  }
  return [...map.values()];
}

export function exactMove(moves: Move[], from: Pos, hops: Pos[]): Move | undefined {
  return moves.find(
    (m) => same(m.from, from) && m.hops.length === hops.length && m.hops.every((p, i) => same(p, hops[i])),
  );
}

export function capForHop(moves: Move[], from: Pos, prev: Pos[], to: Pos): Pos | null {
  const m = moves.find(
    (mv) =>
      same(mv.from, from) &&
      prev.every((p, i) => mv.hops[i] && same(mv.hops[i], p)) &&
      mv.hops[prev.length] &&
      same(mv.hops[prev.length], to),
  );
  return m?.caps[prev.length] ?? null;
}

function material(board: Board, maxColor: Color): number {
  let s = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const p = board[r][c];
      if (!p) continue;
      const sign = p.color === maxColor ? 1 : -1;
      let v = p.king ? 300 : 100;
      if (!p.king) {
        const adv = p.color === "w" ? SIZE - 1 - r : r;
        v += adv * 7;
        if (c >= 2 && c <= 3) v += 4;
      } else {
        const center = 3 - Math.abs(r - 2.5) - Math.abs(c - 2.5);
        v += center * 3;
      }
      s += sign * v;
    }
  }
  return s;
}

function search(
  board: Board,
  color: Color,
  depth: number,
  alpha: number,
  beta: number,
  maxColor: Color,
  quietPlies: number,
): number {
  if (quietPlies >= 24) return 0;
  const moves = legalMoves(board, color);
  if (moves.length === 0) {
    return color === maxColor ? -100000 - depth : 100000 + depth;
  }
  if (depth === 0) return material(board, maxColor);
  moves.sort((a, b) => b.caps.length - a.caps.length || Number(b.promote) - Number(a.promote));
  const next = opposite(color);
  if (color === maxColor) {
    let best = -1e9;
    for (const m of moves) {
      const sc = search(
        applyMove(board, m),
        next,
        depth - 1,
        alpha,
        beta,
        maxColor,
        m.caps.length ? 0 : quietPlies + 1,
      );
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = 1e9;
  for (const m of moves) {
    const sc = search(
      applyMove(board, m),
      next,
      depth - 1,
      alpha,
      beta,
      maxColor,
      m.caps.length ? 0 : quietPlies + 1,
    );
    if (sc < best) best = sc;
    if (sc < beta) beta = sc;
    if (alpha >= beta) break;
  }
  return best;
}

export function chooseAiMove(
  board: Board,
  color: Color,
  opts?: { depth?: number; rng?: () => number },
): Move | null {
  const moves = legalMoves(board, color);
  if (moves.length === 0) return null;
  const rng = opts?.rng ?? Math.random;
  const depth = opts?.depth ?? (moves.length > 10 ? 2 : 3);
  const scored = moves.map((m) => ({
    m,
    sc: search(applyMove(board, m), opposite(color), depth - 1, -1e9, 1e9, color, m.caps.length ? 0 : 1),
  }));
  scored.sort((a, b) => b.sc - a.sc);
  const best = scored[0].sc;
  const close = scored.filter((s) => best - s.sc <= 36);
  if (close.length > 1 && rng() < 0.45) {
    return close[Math.floor(rng() * close.length)].m;
  }
  return scored[0].m;
}
