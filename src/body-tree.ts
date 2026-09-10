import { transferPickup } from "./bonuses";
import type { BlackHole } from "./Game";
import { intersectionMass, massFromRadius, bodyRadius, radiusScale, RADIATION_FRAGMENT_RADIUS } from "./mass";

export const GRAVITY_THETA = 0.75;
const passive = (body: BlackHole) => body.type === "fluctuation" || body.type === "radiation";

type Cell = {
  x: number; y: number; size: number;
  conditional: boolean; mass: number; cx: number; cy: number; maxRadius: number;
  indices: number[]; children: Cell[]; parent?: Cell;
};

/** Fixed quadrant/traversal order, bounded depth, no random tie breaking. Rebuilt each tick. */
export class BodyTree {
  private root: Cell;
  private leaves: Cell[] = [];

  constructor(private bodies: BlackHole[]) {
    let half = 32768;
    for (const body of bodies) {
      while (Math.abs(body.position.x) >= half || Math.abs(body.position.y) >= half) half *= 2;
    }
    this.root = this.build(bodies.map((_, i) => i), -half, -half, half * 2, 0);
  }

  private build(indices: number[], x: number, y: number, size: number, depth: number, parent?: Cell): Cell {
    const cell: Cell = { x, y, size, conditional: false, mass: 0, cx: 0, cy: 0, maxRadius: 0, indices: [], children: [], parent };
    for (const i of indices) cell.maxRadius = Math.max(cell.maxRadius, this.bodies[i].radius);
    // Coincident centers terminate in a bucket instead of subdividing forever.
    if (indices.length <= 4 || depth === 24) {
      cell.indices = indices;
      for (const i of indices) this.leaves[i] = cell;
    } else {
      const half = size / 2, groups: number[][] = [[], [], [], []];
      for (const i of indices) {
        const p = this.bodies[i].position;
        groups[(p.x >= x + half ? 1 : 0) + (p.y >= y + half ? 2 : 0)].push(i);
      }
      for (let q = 0; q < 4; q++) if (groups[q].length) {
        cell.children.push(this.build(groups[q], x + (q % 2) * half, y + (q >= 2 ? half : 0), half, depth + 1, cell));
      }
    }
    return cell;
  }

  private grow(index: number) {
    const radius = this.bodies[index].radius;
    // A stale overestimate is safe for collision culling; an underestimate is not.
    for (let cell: Cell | undefined = this.leaves[index]; cell && radius > cell.maxRadius; cell = cell.parent) cell.maxRadius = radius;
  }

  private overlaps(body: BlackHole, after: number): number[] {
    const result: number[] = [];
    const visit = (cell: Cell) => {
      const dx = Math.max(cell.x - body.position.x, 0, body.position.x - cell.x - cell.size);
      const dy = Math.max(cell.y - body.position.y, 0, body.position.y - cell.y - cell.size);
      const reach = body.radius + cell.maxRadius;
      if (dx * dx + dy * dy > reach * reach) return;
      for (const i of cell.indices) {
        if (i <= after || this.bodies[i].mass <= 0) continue;
        const other = this.bodies[i], r = body.radius + other.radius;
        const x = body.position.x - other.position.x, y = body.position.y - other.position.y;
        if (x * x + y * y <= r * r) result.push(i);
      }
      for (const child of cell.children) visit(child);
    };
    visit(this.root);
    return result.sort((a, b) => a - b);
  }

  absorb() {
    // Keep the original ascending pair order, including contacts created by growth.
    for (let i = 0; i < this.bodies.length; i++) {
      const body = this.bodies[i];
      if (body.mass <= 0) continue;
      let candidates = this.overlaps(body, i), cursor = 0;
      while (cursor < candidates.length) {
        const j = candidates[cursor++], other = this.bodies[j];
        // Physical radius decides absorption, so compression makes a body vulnerable.
        if (passive(body) && passive(other)) continue;
        const loser = passive(body) ? body : passive(other) ? other : body.radius < other.radius ? body : other;
        const winner = loser === body ? other : body;
        if (loser.type === "radiation" && winner.radius <= RADIATION_FRAGMENT_RADIUS) continue;
        const densityScale = radiusScale(loser);
        const density = loser.type === "radiation" ? loser.mass / massFromRadius(loser.radius) : 1 / (densityScale * densityScale * densityScale);
        let amount = loser.type === "fluctuation" ? loser.mass : Math.min(loser.mass,
          intersectionMass(body.position, body.radius, other.position, other.radius) * density);
        if (amount <= 0) continue;
        // Transfer the final speck instead of discarding its mass during compaction.
        if (loser.mass - amount < massFromRadius(1)) amount = loser.mass;
        // The transferred mass carries the donor's momentum; its remainder keeps its velocity.
        const combinedMass = winner.mass + amount;
        winner.velocity.x = (winner.mass * winner.velocity.x + amount * loser.velocity.x) / combinedMass;
        winner.velocity.y = (winner.mass * winner.velocity.y + amount * loser.velocity.y) / combinedMass;
        const previousRadius = body.radius;
        const transfer = loser === body ? -amount : amount;
        body.mass += transfer; other.mass -= transfer;
        transferPickup(loser, winner, amount, this.bodies);
        body.radius = bodyRadius(body);
        other.radius = bodyRadius(other);
        this.grow(i); this.grow(j);
        if (body.mass <= 0) break;
        if (body.radius > previousRadius && candidates.length - cursor < this.bodies.length - j - 1) {
          candidates = this.overlaps(body, j); cursor = 0;
        }
      }
    }
  }

  private aggregate(cell: Cell) {
    let mass = 0, x = 0, y = 0;
    cell.conditional = false;
    for (const i of cell.indices) {
      const body = this.bodies[i];
      if (body.mass <= 0) continue;
      const sourceMass = body.mass * (body.activeBonus === "supermassive" ? 8 : 1);
      cell.conditional ||= body.activeBonus === "surge";
      mass += sourceMass; x += body.position.x * sourceMass; y += body.position.y * sourceMass;
    }
    for (const child of cell.children) {
      this.aggregate(child);
      cell.conditional ||= child.conditional;
      mass += child.mass; x += child.cx * child.mass; y += child.cy * child.mass;
    }
    cell.mass = mass; cell.cx = mass ? x / mass : 0; cell.cy = mass ? y / mass : 0;
  }

  applyGravity(gravity: number, theta = GRAVITY_THETA) {
    this.aggregate(this.root);
    const thetaSquared = theta * theta;
    for (let i = 0; i < this.bodies.length; i++) {
      const body = this.bodies[i];
      if (body.mass <= 0) continue;
      const p = body.position;
      let ax = 0, ay = 0;
      const attract = (x: number, y: number, mass: number) => {
        const dx = x - p.x, dy = y - p.y, squared = dx * dx + dy * dy;
        if (squared === 0) return;
        const factor = gravity * mass / (squared * Math.sqrt(squared));
        ax += dx * factor; ay += dy * factor;
      };
      const visit = (cell: Cell) => {
        if (!cell.mass) return;
        const dx = cell.cx - p.x, dy = cell.cy - p.y;
        const contains = p.x >= cell.x && p.x < cell.x + cell.size && p.y >= cell.y && p.y < cell.y + cell.size;
        if (!contains && !cell.conditional && cell.size * cell.size < thetaSquared * (dx * dx + dy * dy)) {
          attract(cell.cx, cell.cy, cell.mass);
          return;
        }
        for (const j of cell.indices) if (j !== i && this.bodies[j].mass > 0) {
          const other = this.bodies[j];
          const multiplier = other.activeBonus === "supermassive" ? 8 : other.activeBonus === "surge" && other.radius > body.radius ? 3 : 1;
          attract(other.position.x, other.position.y, other.mass * multiplier);
        }
        for (const child of cell.children) visit(child);
      };
      visit(this.root);
      body.velocity.x += ax; body.velocity.y += ay;
    }
  }
}
