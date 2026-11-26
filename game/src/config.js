// Skyward Flight: tuning, levels and colours. One job: every number the game
// and the screenshots share, so a staged shot and live play use the same rules.
export const STEP = 1 / 60;
export const BEST_KEY = 'skyward-flight-best';
export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 800;

// Flight model, metres and metres per second inside the simulation.
export const PLANE = {
  minSpeed: 18, // below this the wing stops flying and the plane sinks
  maxSpeed: 95, // flat out, full throttle, nose level
  cruiseSpeed: 62, // the speed the autopilot and the HUD bug aim for
  climbSpeed: 46, // best climb happens near this speed
  maxBankDeg: 55, // hardest the pilot or the autopilot may bank
  maxPitchDeg: 24, // hardest nose up or down
  pitchRateDeg: 42, // degrees per second the nose answers the stick
  bankRateDeg: 95, // degrees per second the wings answer the stick
  throttleRate: 0.55, // throttle travel per second
  fuelDrain: 0.16, // fuel units per second at idle
  fuelDrainThrottle: 0.55, // extra fuel units per second at full throttle
  fuelStart: 130,
  takeoffSpeed: 30, // rolling faster than this, the runway lets go
};

// The runway the course starts and ends on: a strip along +z at x = 0.
export const RUNWAY = {
  halfWidth: 16,
  startZ: -260,
  endZ: 260,
  headingDeg: 0, // take off toward +z, heading 0
};

// One level: how many rings, how tight they are, how hard the wind blows.
export function levelSpec(level) {
  return {
    level,
    rings: 5 + level, // level 1 flies 6 rings, level 2 flies 7, and so on
    ringRadius: Math.max(20, 36 - level * 2),
    windSpeed: 2 + level * 2, // metres per second, from the west
    windGust: level * 1.2, // gust strength on top of the steady wind
    ringGapMin: 520,
    ringGapMax: 720,
    altitudeMin: 70,
    altitudeMax: 170,
    turnDeg: 26, // how far the course may bend between rings
  };
}

// Scoring: rings pay, landing pays, leftover fuel and spare time pay.
export const SCORE = {
  ring: 250,
  landing: 500,
  fuelPerUnit: 4,
  timePerSecond: 8,
};

// The sky, the fields and the paint: one palette, so terrain and sky read as
// one place in every screenshot.
export const PALETTE = {
  skyTop: '#2f6fd0',
  skyMid: '#7db3e8',
  skyHorizon: '#cfe6f5',
  sun: '#fff3c4',
  ridgeFar: '#8fa8c8',
  ridgeNear: '#5f7fa8',
  fieldA: '#6da24f',
  fieldB: '#8fae4e',
  fieldC: '#c2a95c',
  fieldD: '#4f8a4a',
  river: '#4f8fd0',
  runway: '#3a3f46',
  runwayLine: '#f2f2e8',
  ring: '#ff7a1a',
  ringAlt: '#ffffff',
  ringMissed: '#c0392b',
  hudInk: '#ffffff',
  hudDim: '#bcd6ee',
  hudAmber: '#ffc233',
  hudRed: '#ff5a4e',
  hudPanel: 'rgba(8, 22, 44, 0.55)',
};
