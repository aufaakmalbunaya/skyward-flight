// Skyward Flight: deterministic randomness. One job: a seeded stream and a
// smooth value-noise field, so the same seed always builds the same valley,
// the same river and the same clouds, in play and in screenshots.
export function createRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 0..1 hash of an integer lattice point, the same on every run. */
export function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/**
 * Smooth rolling noise at (x, z): the value-noise field the terrain height
 * is built from, in about -1..1, with no cliffs and no dependence on time.
 */
export function valueNoise(x, z, seed) {
  const cell = 260;
  const fx = x / cell;
  const fz = z / cell;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = smooth(fx - ix);
  const tz = smooth(fz - iz);
  const a = hash2(ix, iz, seed) * 2 - 1;
  const b = hash2(ix + 1, iz, seed) * 2 - 1;
  const c = hash2(ix, iz + 1, seed) * 2 - 1;
  const d = hash2(ix + 1, iz + 1, seed) * 2 - 1;
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * tz;
}
