/**
 * A* on a 4-connected grid. grid[y][x] === 0 is walkable, anything else is an obstacle.
 * Start and end are always treated as walkable (e.g. a desk destination).
 * Returns an array of {x, y} from start to end, or [] if unreachable.
 */
function findPath(grid, startNode, endNode) {
  const h = grid.length;
  const w = grid[0].length;
  const key = (x, y) => y * w + x;
  const heuristic = (x, y) => Math.abs(x - endNode.x) + Math.abs(y - endNode.y);

  const g = new Map([[key(startNode.x, startNode.y), 0]]);
  const parent = new Map();
  const closed = new Set();
  const open = [{ x: startNode.x, y: startNode.y, f: heuristic(startNode.x, startNode.y) }];

  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const cur = open.splice(best, 1)[0];
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (cur.x === endNode.x && cur.y === endNode.y) {
      const path = [{ x: cur.x, y: cur.y }];
      let k = ck;
      while (parent.has(k)) {
        k = parent.get(k);
        path.push({ x: k % w, y: Math.floor(k / w) });
      }
      return path.reverse();
    }

    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const isEnd = nx === endNode.x && ny === endNode.y;
      if (grid[ny][nx] !== 0 && !isEnd) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = g.get(ck) + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        parent.set(nk, ck);
        open.push({ x: nx, y: ny, f: ng + heuristic(nx, ny) });
      }
    }
  }
  return [];
}
