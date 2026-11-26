// Skyward Flight: the valley the game flies over. One job: the ground under
// the plane — its height, its river, its trees, its runway and the ring
// course — all fixed by the seed, so a screenshot and live play agree.
import { RUNWAY, levelSpec } from './config.js';
import { createRandom, hash2, valueNoise } from './random.js';

const NOISE_SEED = 7713;

/** The river's centreline x at a given z: one slow bend down the valley. */
export function riverX(z) {
  return 170 * Math.sin(z * 0.0016) + 60 * Math.sin(z * 0.004 + 1.7) - 40;
}

/** Distance from (x, z) to the runway centreline, clamped to the strip. */
export function runwayDistance(x, z) {
  const dz = Math.max(RUNWAY.startZ - z, 0, z - RUNWAY.endZ);
  return Math.hypot(x, dz);
}

/**
 * Ground height in metres at (x, z). Rolling hills from value noise, flat
 * (0) on and near the runway, and a shallow dip where the river runs.
 */
export function groundHeight(x, z) {
  const hills = valueNoise(x, z, NOISE_SEED) * 26 + valueNoise(x * 2.7, z * 2.7, NOISE_SEED + 5) * 7;
  const flat = Math.min(1, runwayDistance(x, z) / 160);
  const riverDip = 6 * Math.max(0, 1 - Math.abs(x - riverX(z)) / 55);
  return Math.max(0, hills * flat - riverDip);
}

/** True when (x, z) is on the runway strip itself. */
export function onRunway(x, z) {
  return Math.abs(x) <= RUNWAY.halfWidth && z >= RUNWAY.startZ && z <= RUNWAY.endZ;
}

/**
 * Build one level's course from the seed: a winding chain of rings starting
 * ahead of the runway, each ring turned a little from the last, with the
 * runway as the final landing target. Returns the rings and the wind.
 */
export function buildCourse(seed, level) {
  const spec = levelSpec(level);
  const rng = createRandom(seed * 31 + level * 977);
  const rings = [];
  let heading = 0; // radians, 0 is +z, the take-off heading
  let x = 0;
  let z = RUNWAY.endZ + 420;
  let altitude = 95;
  for (let i = 0; i < spec.rings; i += 1) {
    const turn = (rng() * 2 - 1) * (spec.turnDeg * Math.PI) / 180;
    heading += turn;
    const gap = spec.ringGapMin + rng() * (spec.ringGapMax - spec.ringGapMin);
    x += Math.sin(heading) * gap;
    z += Math.cos(heading) * gap;
    altitude = Math.max(spec.altitudeMin, Math.min(spec.altitudeMax, altitude + (rng() * 2 - 1) * 55));
    rings.push({
      index: i,
      x,
      y: altitude,
      z,
      radius: spec.ringRadius,
      heading,
      passed: false,
      missed: false,
    });
  }
  const wind = {
    speed: spec.windSpeed,
    // Wind blows from the west with a slow swing, so every level feels it.
    direction: Math.PI / 2 + Math.sin(seed * 0.7) * 0.5,
    gust: spec.windGust,
    seed,
  };
  return { rings, wind, spec };
}

/** Wind vector (metres per second) at time t, steady plus a slow gust. */
export function windAt(wind, t) {
  const gust = 1 + (wind.gust / Math.max(1, wind.speed)) * 0.5 * Math.sin(t * 0.35 + wind.seed);
  return {
    x: Math.sin(wind.direction) * wind.speed * gust,
    z: Math.cos(wind.direction) * wind.speed * gust,
  };
}

/**
 * Trees in view: deterministic scatter, one per 90 m cell where the hash
 * says so, kept off the runway and out of the river. Returns {x, y, z, size}.
 */
export function treesNear(seed, cx, cz, radius) {
  const trees = [];
  const cell = 90;
  const minX = Math.floor((cx - radius) / cell);
  const maxX = Math.floor((cx + radius) / cell);
  const minZ = Math.floor((cz - radius) / cell);
  const maxZ = Math.floor((cz + radius) / cell);
  for (let ix = minX; ix <= maxX; ix += 1) {
    for (let iz = minZ; iz <= maxZ; iz += 1) {
      if (hash2(ix, iz, seed + 41) > 0.34) continue;
      const x = ix * cell + hash2(ix, iz, seed + 42) * 70;
      const z = iz * cell + hash2(ix, iz, seed + 43) * 70;
      if (onRunway(x, z) || Math.abs(x - riverX(z)) < 26) continue;
      if (Math.hypot(x - cx, z - cz) > radius) continue;
      trees.push({ x, y: groundHeight(x, z), z, size: 9 + hash2(ix, iz, seed + 44) * 9 });
    }
  }
  return trees;
}

/** Clouds: fixed positions in a wide box around the course, drifting slowly. */
export function buildClouds(seed) {
  const rng = createRandom(seed * 7 + 13);
  const clouds = [];
  for (let i = 0; i < 16; i += 1) {
    clouds.push({
      x: (rng() * 2 - 1) * 2400,
      y: 300 + rng() * 220,
      z: -600 + rng() * 4200,
      size: 60 + rng() * 130,
      drift: 2 + rng() * 3,
    });
  }
  return clouds;
}
