// Skyward Flight: the flight model and the sortie. One job: move the plane
// by the stick and the throttle, fly the ring course, and decide when a
// sortie is a landing, a crash, or still flying.
import { PLANE, RUNWAY, SCORE, STEP } from './config.js';
import { buildCourse, groundHeight, onRunway, windAt } from './terrain.js';

const DEG = Math.PI / 180;
const PAR_TIME = 180; // seconds: landing sooner than this earns a time bonus

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** A fresh sortie: the plane parked on the runway, throttle idle, full tank. */
export function createFlight(seed, level) {
  const course = buildCourse(seed, level);
  return {
    seed,
    level,
    course,
    time: 0,
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0,
    fuel: PLANE.fuelStart,
    airborne: false,
    onGround: true,
    airborneSince: 0,
    maxAltitude: 0,
    status: 'ready', // ready | flying | landed | crashed
    ringsPassed: 0,
    ringsMissed: 0,
    ringIndex: 0,
    score: 0,
    timeBonus: 0,
    fuelBonus: 0,
    crashReason: '',
    message: 'Hold ENTER or click to take off',
    messageUntil: 0,
    fuelWarned: false,
    ringNear: false,
    ringMinDist: Infinity,
    landingAimZ: null, // the far end of the strip to land toward, fixed once
  };
}

export function currentRing(flight) {
  return flight.course.rings[flight.ringIndex] ?? null;
}

/** Where the pilot should aim next: the next ring, or the runway home. */
export function nextTarget(flight) {
  const ring = currentRing(flight);
  if (ring) return { x: ring.x, y: ring.y, z: ring.z, kind: 'ring', radius: ring.radius, heading: ring.heading };
  return { x: 0, y: 4, z: 0, kind: 'runway', radius: RUNWAY.halfWidth };
}

function announce(flight, text, seconds) {
  flight.message = text;
  flight.messageUntil = flight.time + seconds;
}

function turnRate(bankRad, speed) {
  return (9.81 * Math.tan(bankRad)) / Math.max(20, speed);
}

/**
 * Advance one fixed step. `stick` is { pitch: -1..1, roll: -1..1,
 * throttleUp, throttleDown } where pitch +1 is nose up and roll +1 is right.
 * Returns the events of this step: 'takeoff', 'ring', 'miss', 'landed',
 * 'crashed', 'fuel-low'. Pure simulation: no canvas, no audio, no input.
 */
export function flightStep(flight, stick, dt = STEP) {
  if (flight.status === 'landed' || flight.status === 'crashed') return [];
  const events = [];
  flight.time += dt;
  const wind = windAt(flight.course.wind, flight.time);

  if (flight.fuel <= 0) flight.throttle = 0;
  else {
    if (stick.throttleUp) flight.throttle = clamp(flight.throttle + PLANE.throttleRate * dt, 0, 1);
    if (stick.throttleDown) flight.throttle = clamp(flight.throttle - PLANE.throttleRate * dt, 0, 1);
  }

  const targetBank = stick.roll * PLANE.maxBankDeg * DEG;
  const bankStep = PLANE.bankRateDeg * DEG * dt;
  flight.bank += clamp(targetBank - flight.bank, -bankStep, bankStep);
  const targetPitch = stick.pitch * PLANE.maxPitchDeg * DEG;
  const pitchStep = PLANE.pitchRateDeg * DEG * dt;
  flight.pitch += clamp(targetPitch - flight.pitch, -pitchStep, pitchStep);

  const targetSpeed = PLANE.minSpeed + flight.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
  flight.speed += (targetSpeed - flight.speed) * 0.35 * dt;
  flight.speed -= Math.sin(flight.pitch) * 7 * dt;
  flight.speed = clamp(flight.speed, 0, PLANE.maxSpeed);

  const turn = turnRate(flight.bank, flight.speed) * (flight.onGround ? 0.25 : 1);
  flight.heading += turn * dt;

  // Climbing bleeds speed; below flying speed the wing sinks.
  let verticalSpeed = flight.speed * Math.sin(flight.pitch);
  if (flight.speed < PLANE.minSpeed) verticalSpeed -= (PLANE.minSpeed - flight.speed) * 0.9;
  if (!flight.airborne) verticalSpeed = 0;

  flight.x += Math.sin(flight.heading) * flight.speed * dt + wind.x * dt * (flight.onGround ? 0.15 : 1);
  flight.z += Math.cos(flight.heading) * flight.speed * dt + wind.z * dt * (flight.onGround ? 0.15 : 1);
  flight.y += verticalSpeed * dt;
  if (flight.airborne) flight.maxAltitude = Math.max(flight.maxAltitude, flight.y);

  flight.fuel = Math.max(0, flight.fuel - (PLANE.fuelDrain + flight.throttle * PLANE.fuelDrainThrottle) * dt);
  if (!flight.fuelWarned && flight.fuel <= PLANE.fuelStart * 0.25) {
    flight.fuelWarned = true;
    events.push('fuel-low');
    announce(flight, 'LOW FUEL — land soon', 4);
  }

  if (flight.onGround) {
    flight.y = 0;
    if (flight.speed >= PLANE.takeoffSpeed && stick.pitch > 0.2) {
      flight.onGround = false;
      flight.airborne = true;
      flight.airborneSince = flight.time;
      flight.status = 'flying';
      events.push('takeoff');
      announce(flight, 'AIRBORNE — fly through the orange rings', 4);
    }
  }

  // Ring judging, by closest approach: the ring's plane is tilted to the
  // course, so crossing its infinite plane can happen far from the ring.
  // The plane is near the ring while it is within 250 m of the centre; when
  // it leaves that bubble — or flies 250 m past the ring's plane — the ring
  // is judged by the closest it ever came: inside the ring is a pass.
  const ring = currentRing(flight);
  if (ring && flight.airborne) {
    const dx = flight.x - ring.x;
    const dy = flight.y - ring.y;
    const dz = flight.z - ring.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 250) {
      flight.ringNear = true;
      flight.ringMinDist = Math.min(flight.ringMinDist, dist);
    }
    // Leave the bubble only counts once the plane really visited the ring:
    // it came within 150 m of the centre and is now more than 150 m away
    // again, so its closest approach is final.
    const leftBubble = flight.ringNear && flight.ringMinDist < 150 && dist > 150;
    // Flew by: the ring is behind the nose and more than 300 m away, so
    // the plane went past it without ever coming near it.
    const vx = Math.sin(flight.heading);
    const vz = Math.cos(flight.heading);
    const ahead = (ring.x - flight.x) * vx + (ring.z - flight.z) * vz;
    const flewPast = !flight.ringNear && ahead < 0 && dist > 300;
    if (leftBubble || flewPast) {
      if (flight.ringMinDist <= ring.radius) {
        ring.passed = true;
        flight.ringsPassed += 1;
        flight.score += SCORE.ring;
        events.push('ring');
        announce(flight, `RING ${flight.ringsPassed} — +${SCORE.ring}`, 2.5);
      } else {
        ring.missed = true;
        flight.ringsMissed += 1;
        events.push('miss');
        announce(flight, `MISSED THE RING — ${flight.course.rings.length - flight.ringIndex - 1} left`, 2.5);
      }
      flight.ringIndex += 1;
      flight.ringNear = false;
      flight.ringMinDist = Infinity;
      if (flight.ringIndex >= flight.course.rings.length) {
        // Course clear: fix the landing direction now, from where the plane
        // is, so the aim never flips sides while it comes home.
        if (flight.landingAimZ === null) flight.landingAimZ = flight.z > 0 ? 100 : -100;
        announce(flight, 'COURSE CLEAR — land on the runway', 5);
      }
    }
  }

  // Ground contact: a gentle touchdown on the strip after the course is
  // flown is a landing; a gentle touch before that is a bounce back onto
  // the runway, and anything else is a crash. The first second after
  // lift-off is grace: the plane is still climbing out of ground effect.
  const ground = groundHeight(flight.x, flight.z);
  const climbedOut = flight.time - flight.airborneSince > 1 || flight.maxAltitude > 3;
  if (flight.airborne && climbedOut && flight.y <= ground + 0.6) {
    const gentle = Math.abs(verticalSpeed) < 4 && flight.speed < 55 && Math.abs(flight.bank) < 20 * DEG;
    const courseDone = flight.ringIndex >= flight.course.rings.length;
    if (onRunway(flight.x, flight.z) && gentle && courseDone) {
      flight.y = 0;
      flight.status = 'landed';
      flight.airborne = false;
      flight.onGround = true;
      flight.fuelBonus = Math.round(flight.fuel * SCORE.fuelPerUnit);
      flight.timeBonus = Math.max(0, Math.round((PAR_TIME - flight.time) * SCORE.timePerSecond));
      flight.score += SCORE.landing + flight.fuelBonus + flight.timeBonus;
      events.push('landed');
      announce(flight, 'TOUCHDOWN — course complete', 6);
    } else if (onRunway(flight.x, flight.z) && gentle && flight.maxAltitude < 25) {
      // Bounced: back on the wheels, still in the sortie, take off again.
      flight.y = 0;
      flight.airborne = false;
      flight.onGround = true;
    } else {
      flight.y = ground;
      flight.status = 'crashed';
      flight.crashReason = onRunway(flight.x, flight.z)
        ? 'Too fast or too steep for the runway'
        : 'Flew into the ground';
      events.push('crashed');
    }
  }
  return events;
}

/** Heading in degrees the pilot should fly to reach the next target. */
export function headingToTarget(flight) {
  const target = nextTarget(flight);
  return Math.atan2(target.x - flight.x, target.z - flight.z);
}

/** Smallest signed turn, in radians, from the nose to the next target. */
export function turnToTarget(flight) {
  let diff = headingToTarget(flight) - flight.heading;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return diff;
}
