// Skyward Flight: boot and the one loop. Input is read every frame, the
// sortie advances in fixed 1/60 s steps (several in a slow frame, none in a
// fast one), and the renderer paints what is there. The game moves between
// four screens: title, play, paused and game over.
//
// ?seed=N fixes the valley and the course. ?shot=start|play|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { buildClouds } from './terrain.js';
import { createFlight, flightStep } from './flight.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { flightForShot, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const levelParam = Number.parseInt(params.get('level') ?? '', 10);
const level = Number.isInteger(levelParam) && levelParam >= 1 ? levelParam : 1;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function describe(flight, screen) {
  if (screen === SCREEN_TITLE) return 'Skyward Flight. Press Enter or click to fly.';
  if (screen === SCREEN_PAUSED) return 'Paused. Press P to keep flying.';
  if (screen === SCREEN_OVER) {
    return flight.status === 'landed'
      ? `Landed. Score ${flight.score}. Press R for the next level.`
      : `Crashed. Score ${flight.score}. Press R to try again.`;
  }
  return `Flying. Altitude ${Math.round(flight.y * 3.28)} feet, speed ${Math.round(flight.speed * 1.94)} knots, score ${flight.score}.`;
}

function runShot(name) {
  const flight = flightForShot(seed, level);
  const clouds = buildClouds(seed);
  const renderer = createRenderer(canvas);
  const scene = stageShot(name, flight);
  let painted = 0;
  function paint() {
    renderer.draw(flight, clouds, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const renderer = createRenderer(canvas);
  let flight = createFlight(seed, level);
  let clouds = buildClouds(seed);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function startSortie(nextLevel) {
    flight = createFlight(seed, nextLevel);
    clouds = buildClouds(seed + nextLevel);
    screen = SCREEN_TITLE;
  }

  function frame(now) {
    const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    const actions = input.readActions();
    if (actions.has(ACTION_PAUSE) && screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
    else if (actions.has(ACTION_PAUSE) && screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    if (screen === SCREEN_TITLE && actions.has(ACTION_CONFIRM)) {
      audio.unlock();
      screen = SCREEN_PLAY;
    }
    if (screen === SCREEN_OVER && actions.has(ACTION_RESTART)) {
      const nextLevel = flight.status === 'landed' ? flight.level + 1 : flight.level;
      startSortie(nextLevel);
      screen = SCREEN_PLAY;
    }
    if (screen === SCREEN_PLAY) {
      audio.unlock();
      accumulator += elapsed;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        const events = flightStep(flight, input.readStick(), STEP);
        for (const event of events) {
          if (event === 'ring') audio.ring();
          else if (event === 'miss') audio.miss();
          else if (event === 'crashed') audio.crash();
          else if (event === 'landed') audio.land();
        }
        if (flight.status === 'landed' || flight.status === 'crashed') {
          screen = SCREEN_OVER;
          if (flight.score > best) {
            best = flight.score;
            saveBest(best);
          }
          break;
        }
      }
      audio.update(flight.throttle, flight.speed);
    }
    renderer.draw(flight, clouds, screen, best);
    const text = describe(flight, screen);
    if (status.textContent !== text) status.textContent = text;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
