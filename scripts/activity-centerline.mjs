import assert from 'node:assert/strict';
import { booleanPointInPolygon, polygon, tesselate } from '@turf/turf';

const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const key = (a, b) => [a.join(','), b.join(',')].sort().join('|');
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];

// Check every interval cut by the boundary, not merely vertices or sampled points.
function segmentInside(a, b, shape) {
  if (![a, b].every((p) => booleanPointInPolygon(p, shape))) return false;
  const cuts = [0, 1];
  const direction = subtract(b, a);
  const ring = shape.coordinates[0];
  for (let i = 1; i < ring.length; i++) {
    const edge = subtract(ring[i], ring[i - 1]);
    const denominator = cross(direction, edge);
    if (Math.abs(denominator) < 1e-10) continue;
    const offset = subtract(ring[i - 1], a);
    const t = cross(offset, edge) / denominator;
    const u = cross(offset, direction) / denominator;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
  }
  cuts.sort((x, y) => x - y);
  return cuts.slice(1).every((end, i) => {
    const t = (cuts[i] + end) / 2;
    return booleanPointInPolygon([a[0] + direction[0] * t, a[1] + direction[1] * t], shape);
  });
}

function projection(geometry) {
  const origin = geometry.coordinates[0][0];
  const longitudeScale = 111320 * Math.cos(origin[1] * Math.PI / 180);
  return {
    project: (p) => [(p[0] - origin[0]) * longitudeScale, (p[1] - origin[1]) * 111320],
    unproject: (p) => [p[0] / longitudeScale + origin[0], p[1] / 111320 + origin[1]],
  };
}

export function centerlineIsInside(geometry, line) {
  const { project } = projection(geometry);
  const shape = { type: 'Polygon', coordinates: geometry.coordinates.map((ring) => ring.map(project)) };
  const points = line.coordinates.map(project);
  return points.slice(1).every((point, i) => segmentInside(points[i], point, shape));
}

// A polygon without holes has a tree-shaped triangle adjacency graph. The longest
// of the shortest boundary-to-boundary corridors supplies an interior spine
// through shared-edge midpoints. This follows bends without north/south scans.
// This is a geometric estimate,
// not surveyed route data; the importer retains the original polygon for review.
export function polygonCenterline(geometry) {
  assert.equal(geometry?.type, 'Polygon');
  assert.equal(geometry.coordinates.length, 1, 'Polygons with holes require manual review');
  const { project, unproject } = projection(geometry);
  const shape = polygon([geometry.coordinates[0].map(project)]);
  const ring = shape.geometry.coordinates[0];
  // The existing lifts are four-corner strips. Join their opposing short caps.
  if (ring.length === 5) {
    const capStart = distance(ring[0], ring[1]) + distance(ring[2], ring[3])
      <= distance(ring[1], ring[2]) + distance(ring[3], ring[0]) ? 0 : 1;
    const caps = [midpoint(ring[capStart], ring[capStart + 1]), midpoint(ring[capStart + 2], ring[(capStart + 3) % 4])];
    const center = midpoint(...caps);
    const inset = caps.map((p) => p.map((value, axis) => value * 0.999 + center[axis] * 0.001));
    if (segmentInside(...inset, shape.geometry)) {
      if (inset[0][1] < inset[1][1]) inset.reverse();
      const line = { type: 'LineString', coordinates: inset.map(unproject) };
      assert.ok(centerlineIsInside(geometry, line));
      return line;
    }
  }
  const triangles = tesselate(shape).features.map((f) => f.geometry.coordinates[0].slice(0, 3));
  assert.ok(triangles.length >= 2, 'A triangle requires manual endpoint selection');
  const edges = new Map();
  const graph = triangles.map(() => []);
  triangles.forEach((triangle, index) => triangle.forEach((a, i) => {
    const b = triangle[(i + 1) % 3];
    const id = key(a, b);
    if (!edges.has(id)) edges.set(id, { a, b, triangles: [] });
    edges.get(id).triangles.push(index);
  }));
  for (const edge of edges.values()) {
    assert.ok(edge.triangles.length <= 2);
    if (edge.triangles.length === 2) {
      const [a, b] = edge.triangles;
      graph[a].push({ to: b, point: midpoint(edge.a, edge.b) });
      graph[b].push({ to: a, point: midpoint(edge.a, edge.b) });
    }
  }
  assert.equal(graph.reduce((sum, neighbors) => sum + neighbors.length, 0), 2 * (triangles.length - 1), 'Expected a connected corridor without holes');
  const paths = triangles.map((_, start) => {
    const result = new Map();
    const walk = (current, previous, points) => {
      assert.ok(!result.has(current), 'Unexpected cycle in triangulation');
      result.set(current, points);
      for (const neighbor of graph[current]) if (neighbor.to !== previous) walk(neighbor.to, current, [...points, neighbor.point]);
    };
    walk(start, -1, []);
    assert.equal(result.size, triangles.length);
    return result;
  });
  const endpoints = ring.slice(0, -1).map((point) => ({ point,
    owners: triangles.flatMap((triangle, i) => triangle.some((p) => distance(point, p) < 1e-8) ? [i] : []),
  }));
  let best = [];
  let bestLength = -1;
  for (let i = 0; i < endpoints.length; i++) for (let j = i + 1; j < endpoints.length; j++) {
    const [start, end] = [endpoints[i], endpoints[j]];
    let shortest = [], shortestLength = Infinity;
    for (const a of start.owners) for (const b of end.owners) {
      const candidate = [start.point, ...paths[a].get(b), end.point];
      const length = candidate.slice(1).reduce((sum, p, k) => sum + distance(candidate[k], p), 0);
      if (length < shortestLength) { shortest = candidate; shortestLength = length; }
    }
    if (shortestLength > bestLength && shortest.length) { best = shortest; bestLength = shortestLength; }
  }
  assert.ok(best.length >= 2);
  // Move endpoints just inside the boundary, keeping their full route extent.
  for (const [i, neighbor] of [[0, 1], [best.length - 1, best.length - 2]]) {
    best[i] = best[i].map((value, axis) => value * 0.999 + best[neighbor][axis] * 0.001);
  }
  // Round local zigzags only where both replacement segments remain inside.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < best.length - 1; i++) {
      const candidate = midpoint(best[i], midpoint(best[i - 1], best[i + 1]));
      if (segmentInside(best[i - 1], candidate, shape.geometry) && segmentInside(candidate, best[i + 1], shape.geometry)) best[i] = candidate;
    }
  }
  // Remove near-collinear handles within 1 m without cutting across the boundary.
  for (let i = best.length - 2; i > 0; i--) {
    const [a, p, b] = [best[i - 1], best[i], best[i + 1]];
    const length = distance(a, b);
    const deviation = length ? Math.abs(cross(subtract(p, a), subtract(b, a))) / length : Infinity;
    if (deviation < 1 && segmentInside(a, b, shape.geometry)) best.splice(i, 1);
  }
  // Consistent north-to-south orientation; geographic north is not elevation.
  if (best[0][1] < best.at(-1)[1]) best.reverse();
  const line = { type: 'LineString', coordinates: best.map(unproject) };
  assert.ok(line.coordinates.length <= 200, 'Too many editing points');
  assert.ok(centerlineIsInside(geometry, line), 'Centerline leaves its source polygon');
  return line;
}
