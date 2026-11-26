// Skyward Flight: the screenshot scenes behind ?shot=start|play|end. Each
// one plays the real rules forward from a fresh sortie for a fixed time,
// steered by a simple autopilot (bank toward the next ring, pitch toward
// its height, throttle to cruise, glide slope home for the landing), so the
// frame is what a short game really looks like and the same seed always
// gives the same frame.
import { PLANE, STEP } from './config.js';
import { createFlight, flightStep, nextTarget } from './flight.js';
import { groundHeight, windAt } from './terrain.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 3;
const PLAY_RINGS = 2;
const LIMIT_SECONDS = 600;
const SAMPLE = STEP;
const DEG = Math.PI / 180;

/** Aim point on the path from `from` to `to`: the plane's projection onto
 * that line, pushed 150 m ahead along it, so the bearing pulls the plane
 * back onto the line when it drifts off it. The push is never clamped to
 * the line's end: past a ring the aim point runs on ahead of the plane
 * along the course, so the plane flies on through it instead of turning
 * back to chase a point it already passed. */
function pathAim(flight, from, to, lookahead) {
  const ex = to.x - from.x;
  const ez = to.z - from.z;
  const len = Math.hypot(ex, ez) || 1;
  const ux = ex / len;
  const uz = ez / len;
  const along = (flight.x - from.x) * ux + (flight.z - from.z) * uz;
  const ahead = Math.max(50, along + lookahead);
  return { x: from.x + ux * ahead, z: from.z + uz * ahead };
}

/** The autopilot's stick: a PD loop on bank for the turn the heading error
 * asks for, and a PD loop on pitch for the climb the altitude error asks
 * for, so the plane settles on the ring instead of swinging past it. The
 * pilot follows the line from the last ring to the next, aiming 150 m
 * ahead on it, which pulls the plane back onto the course when it drifts. */
export function autopilot(flight) {
  const target = nextTarget(flight);
  const dist = Math.hypot(target.x - flight.x, target.y - flight.y, target.z - flight.z);
  const rings = flight.course.rings;
  let aim;
  if (target.kind === 'ring') {
    const from = flight.ringIndex > 0 ? rings[flight.ringIndex - 1] : { x: 0, z: 0 };
    aim = pathAim(flight, from, target, 150);
  } else {
    // Landing: follow the runway centreline in from far out — the aim
    // point sits 150 m ahead of the plane on the strip's line, so the
    // bearing pulls the plane onto the centreline early and holds it
    // there, instead of a far aim point that only converges on it at the
    // last moment. The plane lands in the direction it comes from: south
    // when it finishes the course north of the strip, north otherwise.
    const zoneZ = flight.landingAimZ ?? (flight.z > 0 ? 100 : -100);
    const south = zoneZ > 0;
    aim = pathAim(flight, { x: 0, z: south ? 5000 : -5000 }, { x: 0, z: south ? -400 : 400 }, 80);
    // Crab into the wind: aim upwind of the line by the wind's drift over
    // the seconds to the aim point, so the ground track stays on the
    // centreline instead of drifting downwind of it.
    const wind = windAt(flight.course.wind, flight.time);
    const crabSeconds = 80 / Math.max(30, flight.speed);
    aim.x -= wind.x * crabSeconds;
    aim.z -= wind.z * crabSeconds;
  }
  let turn = Math.atan2(aim.x - flight.x, aim.z - flight.z) - flight.heading;
  while (turn > Math.PI) turn -= 2 * Math.PI;
  while (turn < -Math.PI) turn += 2 * Math.PI;
  const desiredTurnRate = Math.max(-0.25, Math.min(0.25, turn * 1.0));
  const bankNeeded = Math.atan2(desiredTurnRate * Math.max(30, flight.speed), 9.81);
  // Feedforward plus correction: the stick maps to a bank angle, so asking
  // for the bank outright (plus a nudge for the error) lands on it, where
  // a bare error gain would settle well short of it.
  const roll = Math.max(-1, Math.min(1, bankNeeded / (PLANE.maxBankDeg * DEG) + (bankNeeded - flight.bank) * 4));
  let desiredThrottle = 0.72;
  let targetAlt = target.y;
  if (target.kind === 'runway') {
    if (dist > 600) {
      // Still far out: stay high above the hills, cruise home.
      targetAlt = Math.max(45, groundHeight(flight.x, flight.z) + 30);
      desiredThrottle = 0.7;
    } else {
      // On final: descend toward the touchdown zone inside the strip,
      // down to half a metre at the zone, so the plane touches down on
      // the strip instead of levelling off above it. And once it is low
      // and close, commit to the landing: keep descending to the ground
      // instead of chasing a slope that rises again past the zone.
      const zoneZ = flight.landingAimZ ?? (flight.z > 0 ? 100 : -100);
      const distZone = Math.hypot(flight.x, flight.y - 4, flight.z - zoneZ);
      if (distZone < 150 && flight.y < 6) {
        targetAlt = 0;
        desiredThrottle = 0.05;
      } else {
        targetAlt = Math.max(0.5, distZone * 0.06);
        desiredThrottle = dist > 300 ? 0.4 : 0.12;
      }
    }
  } else if (dist < 350) {
    desiredThrottle = 0.55; // slow down near a ring: tighter turns, easier aim
  }
  const desiredVs = Math.max(-9, Math.min(9, (targetAlt - flight.y) * 0.8));
  const pitchNeeded = Math.asin(Math.max(-0.45, Math.min(0.45, desiredVs / Math.max(25, flight.speed))));
  let pitch = Math.max(-1, Math.min(1, pitchNeeded / (PLANE.maxPitchDeg * DEG) + (pitchNeeded - flight.pitch) * 4));
  if (!flight.airborne) pitch = flight.speed >= PLANE.takeoffSpeed * 0.7 ? 0.8 : 0;
  return {
    pitch,
    roll,
    throttleUp: flight.throttle < desiredThrottle - 0.02,
    throttleDown: flight.throttle > desiredThrottle + 0.02,
  };
}

/**
 * Set `flight` to the named scene (start, play or end; any other name is
 * start) and return the screen to draw over it and the best score to show.
 * Pure simulation: the caller paints the returned state.
 */
export function stageShot(name, flight) {
  if (name !== 'play' && name !== 'end') {
    for (let t = 0; t < START_SECONDS; t += SAMPLE) {
      flightStep(flight, { pitch: 0, roll: 0, throttleUp: true, throttleDown: false }, SAMPLE);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const wantRings = name === 'play' ? PLAY_RINGS : flight.course.rings.length;
  for (let t = 0; t < LIMIT_SECONDS; t += SAMPLE) {
    flightStep(flight, autopilot(flight), SAMPLE);
    if (flight.status === 'landed' || flight.status === 'crashed') break;
    if (name === 'play' && flight.ringsPassed >= wantRings) {
      const target = nextTarget(flight);
      const dist = Math.hypot(target.x - flight.x, target.y - flight.y, target.z - flight.z);
      if (dist < 180) break;
    }
  }
  const over = flight.status === 'landed' || flight.status === 'crashed';
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: flight.score };
}

/** Build a fresh flight for a shot: the world the scene is staged in. */
export function flightForShot(seed, level) {
  return createFlight(seed, level);
}
