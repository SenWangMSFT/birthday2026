import assert from "node:assert/strict";
import test from "node:test";
import { BirthdayPuzzle, createPuzzlePieces, orbitPiecePose, pieceMatrix, puzzlePiecePose, puzzleViewBox } from "../birthday-puzzle.js";
import { BirthdayTimeline, PUZZLE_TIMING, getBirthdayFrame } from "../scene.js";

const bounds = { x: 50, y: 100, width: 900, height: 200 };
const lockTime = PUZZLE_TIMING.start + PUZZLE_TIMING.stagger + PUZZLE_TIMING.duration;

test("the greeting is split into 48 unique interlocking vector pieces", () => {
  const pieces = createPuzzlePieces(bounds);
  assert.equal(pieces.length, 48);
  assert.equal(new Set(pieces.map((piece) => piece.path)).size, 48);
  assert.equal(new Set(pieces.map((piece) => piece.index)).size, 48);
  assert.ok(pieces.every((piece) => piece.path.startsWith("M ") && piece.path.endsWith(" Z")));
  assert.ok(pieces.every((piece) => piece.path.includes(" C ")));
  assert.deepEqual(createPuzzlePieces(bounds), pieces);
});

test("every puzzle tab has an exactly matching reversed edge on its neighbor", () => {
  const curves = new Map();
  for (const piece of createPuzzlePieces(bounds)) {
    let previous;
    for (const match of piece.path.matchAll(/([MLC]) ([^MLCZ]+)/g)) {
      const values = match[2].trim().split(/\s+/).map(Number);
      if (match[1] === "C") {
        const forward = [...previous, ...values].map((value) => value.toFixed(4)).join(",");
        const reversed = [values[4], values[5], values[2], values[3], values[0], values[1], ...previous]
          .map((value) => value.toFixed(4)).join(",");
        const key = forward < reversed ? forward : reversed;
        curves.set(key, (curves.get(key) ?? 0) + 1);
      }
      previous = values.slice(-2);
    }
  }
  assert.equal(curves.size, 160);
  assert.ok([...curves.values()].every((count) => count === 2));
});

test("pieces start scattered, then arrive in staggered groups rather than a text fade", () => {
  const pieces = createPuzzlePieces(bounds);
  const first = puzzlePiecePose(pieces[0], 0);
  assert.equal(first.opacity, orbitPiecePose(pieces[0], 0).opacity);
  assert.equal(first.progress, 0);
  assert.ok(Math.hypot(first.dx, first.dy) > 100);
  const almost = pieces.map((piece) => puzzlePiecePose(piece, 7200));
  assert.ok(almost.some((pose) => pose.progress === 1));
  assert.ok(almost.some((pose) => pose.progress < 1));
  assert.ok(new Set(almost.map((pose) => pose.progress)).size > 10);
});

test("every piece locks into its exact original glyph coordinates", () => {
  for (const piece of createPuzzlePieces(bounds)) {
    assert.deepEqual(puzzlePiecePose(piece, lockTime), {
      progress: 1, dx: 0, dy: 0, rotation: 0, scale: 1, opacity: 1,
    });
  }
});

test("the birthday assembly starts from the exact visible orbit pose", () => {
  for (const piece of createPuzzlePieces(bounds)) {
    const origin = orbitPiecePose(piece, 17.25, 0.8);
    const first = puzzlePiecePose(piece, 0, origin);
    assert.deepEqual(first, origin);
    assert.deepEqual(pieceMatrix(piece, first), pieceMatrix(piece, origin));
  }
});

test("orbiting pieces use only flat rotation and uniform scale in a centered ring", () => {
  const pieces = createPuzzlePieces(bounds);
  const poses = pieces.map((piece) => orbitPiecePose(piece, 12));
  assert.ok(poses.every((pose) => !("depth" in pose) && !("tiltX" in pose) && !("tiltY" in pose)));
  const centers = pieces.map((piece, index) => {
    const [a, b, c, d, e, f] = pieceMatrix(piece, poses[index]);
    assert.ok(Math.abs(Math.hypot(a, b) - poses[index].scale) < 1e-10);
    assert.ok(Math.abs(Math.hypot(c, d) - poses[index].scale) < 1e-10);
    assert.ok(Math.abs(a * c + b * d) < 1e-10);
    return { x: a * piece.cx + c * piece.cy + e, y: b * piece.cx + d * piece.cy + f };
  });
  assert.ok(Math.abs(centers.reduce((sum, point) => sum + point.x, 0) / centers.length - 500) < 35);
  assert.ok(Math.abs(centers.reduce((sum, point) => sum + point.y, 0) / centers.length - 200) < 35);
});

test("the assembled word holds for 2.8 seconds before the full camera zoom", () => {
  const timeline = new BirthdayTimeline();
  timeline.advance(lockTime);
  assert.equal(getBirthdayFrame(timeline).puzzleSettled, true);
  assert.equal(getBirthdayFrame(timeline).zoom, 1);
  timeline.advance(2799);
  assert.equal(getBirthdayFrame(timeline).zoom, 1);
  timeline.advance(1000);
  assert.ok(getBirthdayFrame(timeline).zoom > 1);
});

test("the puzzle shares the scene clock and stays frozen when playback is paused", () => {
  const timeline = new BirthdayTimeline();
  const piece = createPuzzlePieces(bounds)[15];
  timeline.advance(5500);
  timeline.paused = true;
  const pose = puzzlePiecePose(piece, timeline.elapsed);
  timeline.advance(10000);
  assert.deepEqual(puzzlePiecePose(piece, timeline.elapsed), pose);
  timeline.restart();
  assert.equal(puzzlePiecePose(piece, timeline.elapsed).progress, 0);
});

test("each piece frame updates just one face's transform and opacity, without depth or material work", () => {
  const writes = [];
  const piece = {
    ...createPuzzlePieces(bounds)[0],
    element: { setAttribute: (name, value) => writes.push([name, value]) },
  };
  const renderer = { currentPoses: new Map() };
  const pose = orbitPiecePose(piece, 12);
  BirthdayPuzzle.prototype.renderPiece.call(renderer, piece, pose);
  assert.deepEqual(writes.map(([name]) => name), ["transform", "opacity"]);
  assert.deepEqual(renderer.currentPoses.get(piece.index), pose);
  assert.ok(writes[0][1].startsWith("matrix("));
});

test("the 32x zoom narrows the native SVG view instead of resizing a bitmap", () => {
  assert.deepEqual(puzzleViewBox(1), { x: 0, y: 0, width: 1000, height: 400 });
  const close = puzzleViewBox(32);
  assert.equal(close.width, 31.25);
  assert.equal(close.height, 12.5);
  assert.equal(close.x + close.width / 2, 500);
  assert.equal(close.y + close.height / 2, 200);
});

test("every frame zooms into the middle, never toward one character", () => {
  for (let zoom = 1; zoom <= 32; zoom += 0.25) {
    const view = puzzleViewBox(zoom);
    assert.equal(view.x + view.width / 2, 500);
    assert.equal(view.y + view.height / 2, 200);
  }
});

test("puzzle geometry, time, and camera inputs are checked explicitly", () => {
  assert.throws(() => createPuzzlePieces({ ...bounds, width: 0 }), RangeError);
  assert.throws(() => createPuzzlePieces({ ...bounds, x: NaN }), RangeError);
  const piece = createPuzzlePieces(bounds)[0];
  for (const invalid of [-1, NaN, Infinity, "100"]) {
    assert.throws(() => puzzlePiecePose(piece, invalid), RangeError);
    assert.throws(() => puzzleViewBox(invalid), RangeError);
  }
  assert.throws(() => puzzleViewBox(0.5), RangeError);
});
