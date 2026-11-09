import { PUZZLE_TIMING } from "./scene.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const COLUMNS = 12;
const ROWS = 4;
const LOCK_TIME = PUZZLE_TIMING.start + PUZZLE_TIMING.stagger + PUZZLE_TIMING.duration;

function edge(x1, y1, x2, y2, direction, tabSize) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const point = (along, out = 0) => [
    x1 + dx * along - dy / length * out * tabSize * direction,
    y1 + dy * along + dx / length * out * tabSize * direction,
  ].map((value) => value.toFixed(4)).join(" ");
  if (!direction) return `L ${point(1)}`;
  return `L ${point(0.32)} C ${point(0.43)} ${point(0.35, 1)} ${point(0.5, 1)} C ${point(0.65, 1)} ${point(0.57)} ${point(0.68)} L ${point(1)}`;
}

export function createPuzzlePieces(bounds) {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
      bounds.width <= 0 || bounds.height <= 0) {
    throw new RangeError("Puzzle bounds must be finite and have positive dimensions.");
  }
  const width = bounds.width / COLUMNS;
  const height = bounds.height / ROWS;
  const tab = Math.min(width, height) * 0.16;
  const pieces = [];
  const direction = (column, row) => (column + row) % 2 ? 1 : -1;
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const index = row * COLUMNS + column;
      const x = bounds.x + column * width;
      const y = bounds.y + row * height;
      const order = index * 0.61803398875 % 1;
      const angle = index * 2.3999632297;
      const cx = x + width / 2;
      const cy = y + height / 2;
      pieces.push({
        index, cx, cy, order,
        dx: 500 + Math.cos(angle) * (460 + order * 180) - cx,
        dy: 200 + Math.sin(angle) * (200 + order * 100) - cy,
        rotation: (order - 0.5) * 190,
        bend: (index % 2 ? 1 : -1) * (25 + order * 35),
        path: [
          `M ${x.toFixed(4)} ${y.toFixed(4)}`,
          edge(x, y, x + width, y, row ? direction(column, row) : 0, tab),
          edge(x + width, y, x + width, y + height, column < COLUMNS - 1 ? direction(column + 1, row) : 0, tab),
          edge(x + width, y + height, x, y + height, row < ROWS - 1 ? -direction(column, row + 1) : 0, tab),
          edge(x, y + height, x, y, column ? -direction(column, row) : 0, tab),
          "Z",
        ].join(" "),
      });
    }
  }
  return pieces;
}

export function orbitPiecePose(piece, seconds, light = 1) {
  const angle = piece.index * 2.3999632297 + seconds * 0.045;
  return {
    progress: 0,
    dx: 500 + Math.cos(angle) * (430 + piece.order * 90) - piece.cx,
    dy: 200 + Math.sin(angle) * (220 + piece.order * 50) - piece.cy,
    rotation: piece.rotation + Math.sin(seconds * 0.19 + piece.index) * 12,
    scale: 0.76,
    opacity: light * (0.52 - 0.18 * Math.sin(angle + piece.index * 0.8)),
  };
}

export function puzzlePiecePose(piece, elapsed, origin = orbitPiecePose(piece, 0)) {
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    throw new RangeError("Puzzle time must be finite and non-negative.");
  }
  const progress = Math.max(0, Math.min(1,
    (elapsed - PUZZLE_TIMING.start - piece.order * PUZZLE_TIMING.stagger) / PUZZLE_TIMING.duration));
  if (progress === 1) {
    return { progress: 1, dx: 0, dy: 0, rotation: 0, scale: 1, opacity: 1 };
  }
  const eased = progress * progress * progress * (progress * (progress * 6 - 15) + 10);
  const remaining = 1 - eased;
  const arc = progress > 0 && progress < 1 ? Math.sin(progress * Math.PI) * piece.bend : 0;
  return {
    progress,
    dx: origin.dx * remaining + arc,
    dy: origin.dy * remaining + (Math.sin(elapsed / 1400 + piece.index) - Math.sin(piece.index)) * 6 * remaining,
    rotation: origin.rotation * remaining,
    scale: 1 + (origin.scale - 1) * remaining,
    opacity: origin.opacity + (1 - origin.opacity) * eased,
  };
}

export function pieceMatrix(piece, pose) {
  const z = pose.rotation * Math.PI / 180;
  const a = Math.cos(z) * pose.scale;
  const b = Math.sin(z) * pose.scale;
  const c = -b;
  const d = a;
  return [
    a, b, c, d,
    piece.cx + pose.dx - a * piece.cx - c * piece.cy,
    piece.cy + pose.dy - b * piece.cx - d * piece.cy,
  ];
}

export function puzzleViewBox(zoom) {
  if (!Number.isFinite(zoom) || zoom < 1) {
    throw new RangeError("Puzzle zoom must be finite and at least one.");
  }
  const width = 1000 / zoom;
  const height = 400 / zoom;
  return {
    x: 500 - width / 2,
    y: 200 - height / 2,
    width,
    height,
  };
}

export class BirthdayPuzzle {
  constructor(svg, notify) {
    this.svg = svg;
    this.notify = notify;
    this.source = svg.querySelector("#birthday-glyphs");
    this.defs = svg.querySelector("defs");
    this.layer = svg.querySelector("#birthday-pieces");
    this.complete = svg.querySelector("#birthday-complete");
    this.stage = svg.parentElement;
    this.prepared = false;
    this.failed = false;
    this.pieces = [];
    this.currentPoses = new Map();
    this.origins = new Map();
    this.svg.dataset.titleStyle = "flat";
  }

  prepare() {
    if (this.prepared) return;
    this.prepared = true;
    let bounds;
    try {
      bounds = this.source.getBBox();
      if (bounds.width && bounds.height) {
        this.source.setAttribute("x", String(Number(this.source.getAttribute("x")) + 500 - bounds.x - bounds.width / 2));
        this.source.setAttribute("y", String(Number(this.source.getAttribute("y")) + 200 - bounds.y - bounds.height / 2));
        bounds = this.source.getBBox();
      }
    } catch (error) {
      this.fail(error);
      return;
    }
    if (!bounds.width || !bounds.height) {
      this.fail(new Error("The birthday font has no measurable glyph bounds."));
      return;
    }
    this.pieces = createPuzzlePieces({
      x: bounds.x - 2, y: bounds.y - 2,
      width: bounds.width + 4, height: bounds.height + 4,
    }).map((piece) => {
      const clip = document.createElementNS(SVG_NS, "clipPath");
      clip.id = `birthday-piece-clip-${piece.index}`;
      clip.setAttribute("clipPathUnits", "userSpaceOnUse");
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", piece.path);
      clip.append(path);
      this.defs.append(clip);
      const group = document.createElementNS(SVG_NS, "g");
      group.setAttribute("clip-path", `url(#${clip.id})`);
      const glyph = document.createElementNS(SVG_NS, "use");
      glyph.setAttribute("href", "#birthday-glyphs");
      group.append(glyph);
      group.dataset.piece = String(piece.index);
      this.layer.append(group);
      return { ...piece, element: group };
    });
  }

  renderPiece(piece, pose) {
    this.currentPoses.set(piece.index, { ...pose });
    const matrix = `matrix(${pieceMatrix(piece, pose).map((value) => value.toFixed(6)).join(" ")})`;
    piece.element.setAttribute("transform", matrix);
    piece.element.setAttribute("opacity", pose.opacity.toFixed(4));
  }

  setSettled(settled) {
    if (this.settledState === settled) return;
    this.settledState = settled;
    this.layer.setAttribute("visibility", settled || this.failed ? "hidden" : "visible");
    this.complete.setAttribute("visibility", settled ? "visible" : "hidden");
  }

  updateAmbient(seconds, light) {
    this.stage.hidden = false;
    this.prepare();
    this.setSettled(false);
    for (const piece of this.pieces) this.renderPiece(piece, orbitPiecePose(piece, seconds, light));
    this.svg.setAttribute("viewBox", "0 0 1000 400");
    this.svg.style.opacity = "1";
    this.svg.dataset.puzzleState = "orbiting";
    this.svg.dataset.pieceCount = String(this.pieces.length);
    this.svg.dataset.zoom = "1";
  }

  begin() {
    this.stage.hidden = false;
    this.origins = new Map([...this.currentPoses].map(([index, pose]) => [index, { ...pose }]));
  }

  hide() {
    this.stage.hidden = true;
  }

  fail(error) {
    this.failed = true;
    console.error("Unable to assemble the vector birthday puzzle.", error);
    this.notify("拼字动画暂时无法加载，将直接显示生日祝福。");
  }

  update(elapsed, frame, reducedMotion) {
    this.prepare();
    const settled = reducedMotion || this.failed || frame.puzzleSettled;
    this.setSettled(settled);
    if (!settled || this.svg.dataset.puzzleState !== "assembled") {
      for (const piece of this.pieces) {
        const pose = puzzlePiecePose(piece, settled
          ? LOCK_TIME
          : elapsed, this.origins.get(piece.index));
        this.renderPiece(piece, pose);
      }
    }
    const view = puzzleViewBox(reducedMotion ? 1 : frame.zoom);
    this.svg.setAttribute("viewBox", [view.x, view.y, view.width, view.height].map((value) => value.toFixed(6)).join(" "));
    this.svg.style.opacity = String(reducedMotion ? 1 : frame.titleOpacity);
    this.svg.dataset.puzzleState = this.failed ? "fallback" : settled ? "assembled" : "assembling";
    this.svg.dataset.pieceCount = String(this.pieces.length);
    this.svg.dataset.zoom = String(reducedMotion ? 1 : frame.zoom);
  }
}
