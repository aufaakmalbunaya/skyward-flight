// Skyward Flight: everything the pilot sees. One job: paint the chase view —
// sky, ridges, fields, river, runway, rings, the little yellow plane — and
// the lit instruments on top, plus the title, pause and end screens.
import { PALETTE, PLANE, RUNWAY } from './config.js';
import { currentRing, nextTarget, turnToTarget } from './flight.js';
import { groundHeight, onRunway, riverX, treesNear } from './terrain.js';

const DEG = Math.PI / 180;
const ROW_DISTANCES = [10, 16, 25, 38, 56, 82, 120, 175, 255, 370, 540, 790, 1150, 1700];
const COLS = 17;
const FIELDS = [PALETTE.fieldA, PALETTE.fieldB, PALETTE.fieldC, PALETTE.fieldD];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixHex(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], t))).join(',')})`;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

/** Create the renderer for a canvas; it sizes itself to the window. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;

  function resize() {
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    canvas.width = width;
    canvas.height = height;
  }
  resize();
  window.addEventListener('resize', resize);

  // Camera basis from the plane: behind it, above it, looking ahead of it.
  // right is east of the nose, up is the sky: cross(up, fwd) then
  // cross(fwd, right), so the view is neither mirrored nor upside down.
  function camera(flight) {
    const fx = Math.sin(flight.heading);
    const fz = Math.cos(flight.heading);
    const cam = { x: flight.x - fx * 26, y: flight.y + 8, z: flight.z - fz * 26 };
    const look = { x: flight.x + fx * 40, y: flight.y + 1, z: flight.z + fz * 40 };
    let fwd = { x: look.x - cam.x, y: look.y - cam.y, z: look.z - cam.z };
    const len = Math.hypot(fwd.x, fwd.y, fwd.z);
    fwd = { x: fwd.x / len, y: fwd.y / len, z: fwd.z / len };
    // right = up x fwd, with up the world up (0, 1, 0).
    let right = { x: fwd.z, y: 0, z: -fwd.x };
    const rl = Math.hypot(right.x, right.z) || 1;
    right = { x: right.x / rl, y: 0, z: right.z / rl };
    // up = fwd x right.
    const up = {
      x: fwd.y * right.z - fwd.z * right.y,
      y: fwd.z * right.x - fwd.x * right.z,
      z: fwd.x * right.y - fwd.y * right.x,
    };
    return { cam, fwd, right, up };
  }

  function project(cam, p) {
    const dx = p.x - cam.cam.x;
    const dy = p.y - cam.cam.y;
    const dz = p.z - cam.cam.z;
    const zc = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
    if (zc < 1.5) return null;
    const xc = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
    const yc = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
    const focal = height * 1.05;
    return {
      x: width / 2 + (xc / zc) * focal,
      y: height * 0.52 - (yc / zc) * focal,
      d: zc,
    };
  }

  function fieldColour(x, z, dist) {
    const cell = Math.floor(x / 150) + Math.floor(z / 150);
    let colour = FIELDS[((cell % 4) + 4) % 4];
    if (Math.abs(x - riverX(z)) < 16) colour = PALETTE.river;
    const fog = clamp(dist / 1500, 0, 0.82);
    return mixHex(colour, PALETTE.skyHorizon, fog);
  }

  function drawSky(flight, cam) {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.55, PALETTE.skyMid);
    grad.addColorStop(0.78, PALETTE.skyHorizon);
    grad.addColorStop(1, PALETTE.skyHorizon);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    // The sun sits low in the west, so it stays in frame on the take-off run.
    const sun = project(cam, { x: flight.x + 2600, y: 620, z: flight.z + 1400 });
    if (sun) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 120);
      glow.addColorStop(0, 'rgba(255, 243, 196, 0.95)');
      glow.addColorStop(0.25, 'rgba(255, 243, 196, 0.45)');
      glow.addColorStop(1, 'rgba(255, 243, 196, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sun.x - 130, sun.y - 130, 260, 260);
      ctx.fillStyle = PALETTE.sun;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    // Two ridge lines on the horizon, sliding with the heading.
    const horizon = project(cam, { x: flight.x + Math.sin(flight.heading) * 2000, y: flight.y, z: flight.z + Math.cos(flight.heading) * 2000 });
    const hy = horizon ? horizon.y : height * 0.55;
    for (let layer = 0; layer < 2; layer += 1) {
      const amp = layer === 0 ? 46 : 26;
      const base = hy + layer * 14;
      const off = wrapAngle(flight.heading) * width * (layer === 0 ? 0.4 : 0.7);
      ctx.fillStyle = layer === 0 ? PALETTE.ridgeFar : PALETTE.ridgeNear;
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let sx = 0; sx <= width; sx += 16) {
        const ridge = base - amp * (0.6 + 0.4 * Math.sin((sx + off) * 0.006 + layer * 2.1)) - amp * 0.3 * Math.sin((sx + off) * 0.017 + layer);
        ctx.lineTo(sx, ridge);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGround(flight, cam) {
    const fx = Math.sin(flight.heading);
    const fz = Math.cos(flight.heading);
    const rx = Math.cos(flight.heading);
    const rz = -Math.sin(flight.heading);
    const rows = [];
    for (let r = 0; r < ROW_DISTANCES.length; r += 1) {
      const dist = ROW_DISTANCES[r];
      const cx = cam.cam.x + fx * dist;
      const cz = cam.cam.z + fz * dist;
      const half = dist * 0.85 + 40;
      const pts = [];
      for (let c = 0; c < COLS; c += 1) {
        const lat = -half + (2 * half * c) / (COLS - 1);
        const x = cx + rx * lat;
        const z = cz + rz * lat;
        pts.push({ p: project(cam, { x, y: groundHeight(x, z), z }), x, z, dist });
      }
      rows.push(pts);
    }
    for (let r = ROW_DISTANCES.length - 2; r >= 0; r -= 1) {
      for (let c = 0; c < COLS - 1; c += 1) {
        const a = rows[r][c];
        const b = rows[r][c + 1];
        const d = rows[r + 1][c + 1];
        const e = rows[r + 1][c];
        if (!a.p || !b.p || !d.p || !e.p) continue;
        ctx.fillStyle = fieldColour((a.x + b.x) / 2, (a.z + b.z) / 2, a.dist);
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y);
        ctx.lineTo(b.p.x, b.p.y);
        ctx.lineTo(d.p.x, d.p.y);
        ctx.lineTo(e.p.x, e.p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawRunway(flight, cam) {
    const segments = 13;
    for (let s = 0; s < segments; s += 1) {
      const z0 = RUNWAY.startZ + ((RUNWAY.endZ - RUNWAY.startZ) * s) / segments;
      const z1 = RUNWAY.startZ + ((RUNWAY.endZ - RUNWAY.startZ) * (s + 1)) / segments;
      const corners = [
        project(cam, { x: -RUNWAY.halfWidth, y: 0.4, z: z0 }),
        project(cam, { x: RUNWAY.halfWidth, y: 0.4, z: z0 }),
        project(cam, { x: RUNWAY.halfWidth, y: 0.4, z: z1 }),
        project(cam, { x: -RUNWAY.halfWidth, y: 0.4, z: z1 }),
      ];
      if (corners.some((p) => !p)) continue;
      ctx.fillStyle = PALETTE.runway;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      corners.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fill();
      if (s % 2 === 0) {
        const dash = [
          project(cam, { x: -1.2, y: 0.6, z: z0 + 8 }),
          project(cam, { x: 1.2, y: 0.6, z: z0 + 8 }),
          project(cam, { x: 1.2, y: 0.6, z: z1 - 8 }),
          project(cam, { x: -1.2, y: 0.6, z: z1 - 8 }),
        ];
        if (dash.every((p) => p)) {
          ctx.fillStyle = PALETTE.runwayLine;
          ctx.beginPath();
          ctx.moveTo(dash[0].x, dash[0].y);
          dash.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    // Threshold bars at the far end, so the strip reads as a runway.
    const bar = [
      project(cam, { x: -RUNWAY.halfWidth + 1, y: 0.6, z: RUNWAY.endZ - 14 }),
      project(cam, { x: RUNWAY.halfWidth - 1, y: 0.6, z: RUNWAY.endZ - 14 }),
      project(cam, { x: RUNWAY.halfWidth - 1, y: 0.6, z: RUNWAY.endZ - 6 }),
      project(cam, { x: -RUNWAY.halfWidth + 1, y: 0.6, z: RUNWAY.endZ - 6 }),
    ];
    if (bar.every((p) => p)) {
      ctx.fillStyle = PALETTE.runwayLine;
      ctx.beginPath();
      ctx.moveTo(bar[0].x, bar[0].y);
      bar.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawTrees(flight, cam) {
    const trees = treesNear(flight.seed, flight.x, flight.z, 700);
    const projected = [];
    for (const tree of trees) {
      const p = project(cam, { x: tree.x, y: tree.y + tree.size, z: tree.z });
      const base = project(cam, { x: tree.x, y: tree.y, z: tree.z });
      if (p && base) projected.push({ p, base, size: tree.size });
    }
    projected.sort((a, b) => b.p.d - a.p.d);
    for (const tree of projected) {
      const h = Math.abs(tree.base.y - tree.p.y);
      if (h < 2) continue;
      ctx.fillStyle = '#2f6b2f';
      ctx.beginPath();
      ctx.moveTo(tree.p.x, tree.p.y);
      ctx.lineTo(tree.p.x - h * 0.42, tree.base.y);
      ctx.lineTo(tree.p.x + h * 0.42, tree.base.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawClouds(flight, cam, clouds) {
    const drawn = [];
    for (const cloud of clouds) {
      const x = cloud.x + cloud.drift * flight.time;
      const p = project(cam, { x, y: cloud.y, z: cloud.z });
      if (p && p.x > -200 && p.x < width + 200 && p.y > -100 && p.y < height) {
        drawn.push({ p, size: cloud.size * (900 / Math.max(200, p.d)) });
      }
    }
    drawn.sort((a, b) => b.p.d - a.p.d);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    for (const cloud of drawn) {
      const s = cloud.size;
      ctx.beginPath();
      ctx.ellipse(cloud.p.x, cloud.p.y, s, s * 0.36, 0, 0, Math.PI * 2);
      ctx.ellipse(cloud.p.x - s * 0.55, cloud.p.y + s * 0.08, s * 0.6, s * 0.28, 0, 0, Math.PI * 2);
      ctx.ellipse(cloud.p.x + s * 0.55, cloud.p.y + s * 0.08, s * 0.6, s * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRings(flight, cam) {
    const rings = flight.course.rings;
    for (let i = rings.length - 1; i >= 0; i -= 1) {
      const ring = rings[i];
      const isNext = i === flight.ringIndex;
      if (ring.passed && !isNext) continue;
      const centre = project(cam, { x: ring.x, y: ring.y, z: ring.z });
      if (!centre) continue;
      const nx = Math.sin(ring.heading);
      const nz = Math.cos(ring.heading);
      const ux = nz;
      const uz = -nx;
      const pts = [];
      for (let a = 0; a <= 24; a += 1) {
        const ang = (a / 24) * Math.PI * 2;
        const px = ring.x + (Math.cos(ang) * ux) * ring.radius;
        const py = ring.y + Math.sin(ang) * ring.radius;
        const pz = ring.z + (Math.cos(ang) * uz) * ring.radius;
        const p = project(cam, { x: px, y: py, z: pz });
        pts.push(p);
      }
      if (pts.some((p) => !p)) continue;
      const alpha = isNext ? 1 : 0.45;
      const colour = ring.missed ? PALETTE.ringMissed : ring.passed ? '#3fae5a' : PALETTE.ring;
      ctx.lineWidth = Math.max(3, 900 / Math.max(60, centre.d) * 0.55);
      for (let s = 0; s < 24; s += 1) {
        ctx.strokeStyle = s % 2 === 0 ? colour : PALETTE.ringAlt;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(pts[s].x, pts[s].y);
        ctx.lineTo(pts[s + 1].x, pts[s + 1].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (isNext) {
        ctx.fillStyle = PALETTE.hudInk;
        ctx.font = `bold ${Math.max(13, Math.round(620 / Math.max(60, centre.d)))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`RING ${ring.index + 1}`, centre.x, centre.y - ring.radius * (height * 1.05 / Math.max(60, centre.d)) - 14);
      }
    }
  }

  function drawPlaneShadow(flight, cam) {
    if (!flight.airborne) return;
    const ground = groundHeight(flight.x, flight.z);
    const p = project(cam, { x: flight.x, y: ground + 0.8, z: flight.z });
    if (!p) return;
    const size = clamp(2600 / Math.max(20, flight.y - ground), 8, 90);
    ctx.fillStyle = 'rgba(10, 25, 10, 0.30)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, size, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** The little yellow plane, seen from behind and above, banked with the roll. */
  function drawPlane(flight, cam) {
    const p = project(cam, { x: flight.x, y: flight.y, z: flight.z });
    if (!p) return;
    const scale = clamp(1100 / Math.max(8, p.d), 0.6, 1.6);
    ctx.save();
    ctx.translate(p.x, p.y + 26 * scale);
    ctx.rotate(flight.bank * 0.9);
    ctx.scale(scale, scale);
    // Tailplane and fin, at the near end.
    ctx.fillStyle = '#d23b2e';
    ctx.beginPath();
    ctx.moveTo(-34, 26);
    ctx.lineTo(34, 26);
    ctx.lineTo(26, 14);
    ctx.lineTo(-26, 14);
    ctx.closePath();
    ctx.fill();
    // Wings, wide and slightly swept.
    ctx.fillStyle = '#f7b731';
    ctx.beginPath();
    ctx.moveTo(-78, 6);
    ctx.lineTo(-14, -6);
    ctx.lineTo(14, -6);
    ctx.lineTo(78, 6);
    ctx.lineTo(70, 14);
    ctx.lineTo(-70, 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e09a17';
    ctx.fillRect(-78, 6, 156, 3);
    // Fuselage, nose away from the camera.
    ctx.fillStyle = '#ffd23e';
    ctx.beginPath();
    ctx.ellipse(0, -2, 13, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7ec8e8';
    ctx.beginPath();
    ctx.ellipse(0, -14, 8, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // Spinning propeller at the nose.
    ctx.fillStyle = 'rgba(60, 60, 60, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, -36, 26, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Navigation lights on the wingtips.
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-76, 10, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#34c759';
    ctx.beginPath();
    ctx.arc(76, 10, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.hudPanel;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
  }

  function drawHud(flight) {
    const altFt = Math.round(flight.y * 3.28084);
    const speedKt = Math.round(flight.speed * 1.94384);
    const headingDeg = Math.round(((flight.heading * 180) / Math.PI % 360 + 360) % 360);
    const ring = currentRing(flight);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Top-left instruments: altitude, speed, heading, big and lit.
    panel(16, 14, 330, 86);
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText('ALT  ft', 30, 36);
    ctx.fillText('SPD  kt', 140, 36);
    ctx.fillText('HDG', 250, 36);
    ctx.fillStyle = PALETTE.hudInk;
    ctx.font = 'bold 34px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(String(altFt).padStart(5, '0'), 28, 76);
    ctx.fillText(String(speedKt).padStart(3, '0'), 138, 76);
    ctx.fillText(String(headingDeg).padStart(3, '0') + '°', 248, 76);
    // Top-centre: course progress and score.
    panel(width / 2 - 150, 14, 300, 86);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(ring ? `RING ${flight.ringIndex + 1} OF ${flight.course.rings.length}` : 'LAND ON THE RUNWAY', width / 2, 36);
    ctx.fillStyle = PALETTE.hudInk;
    ctx.font = 'bold 30px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`SCORE ${flight.score}`, width / 2, 74);
    // Top-right: time, fuel and level.
    panel(width - 246, 14, 230, 86);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = '600 13px system-ui, sans-serif';
    const mins = Math.floor(flight.time / 60);
    const secs = Math.floor(flight.time % 60);
    ctx.fillText(`TIME ${mins}:${String(secs).padStart(2, '0')}   LEVEL ${flight.level}`, width - 232, 36);
    ctx.fillStyle = flight.fuel <= PLANE.fuelStart * 0.25 ? PALETTE.hudRed : PALETTE.hudInk;
    ctx.font = 'bold 26px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`FUEL ${Math.round((flight.fuel / PLANE.fuelStart) * 100)}%`, width - 232, 74);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(width - 232, 82, 200, 6);
    ctx.fillStyle = flight.fuel <= PLANE.fuelStart * 0.25 ? PALETTE.hudRed : '#3fae5a';
    ctx.fillRect(width - 232, 82, 200 * clamp(flight.fuel / PLANE.fuelStart, 0, 1), 6);
    // Centre reticle.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(width / 2, height * 0.52, 14, 0, Math.PI * 2);
    ctx.moveTo(width / 2 - 24, height * 0.52);
    ctx.lineTo(width / 2 - 16, height * 0.52);
    ctx.moveTo(width / 2 + 16, height * 0.52);
    ctx.lineTo(width / 2 + 24, height * 0.52);
    ctx.stroke();
    // Attitude indicator, bottom-left: the horizon tips with the bank.
    const ax = 78;
    const ay = height - 78;
    panel(ax - 62, ay - 62, 124, 124);
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, 46, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(ax, ay);
    ctx.rotate(-flight.bank);
    ctx.translate(0, clamp(flight.pitch * 220, -40, 40));
    ctx.fillStyle = '#4f9be0';
    ctx.fillRect(-50, -50, 100, 50);
    ctx.fillStyle = '#8a6b46';
    ctx.fillRect(-50, 0, 100, 50);
    ctx.restore();
    ctx.strokeStyle = PALETTE.hudInk;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ax, ay, 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.fillRect(ax - 18, ay - 2, 36, 4);
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', ax, ay + 62 - 6);
    // Throttle bar, bottom-centre-left.
    const tx = ax + 84;
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('THROTTLE', tx, ay - 46);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(tx, ay - 40, 16, 92);
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.fillRect(tx, ay + 52 - 92 * flight.throttle, 16, 92 * flight.throttle);
    ctx.fillStyle = PALETTE.hudInk;
    ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.fillText(`${Math.round(flight.throttle * 100)}%`, tx + 24, ay + 52);
    // Wind, bottom-right.
    const wind = flight.course.wind;
    const rel = wrapAngle(wind.direction - flight.heading);
    const wx = width - 130;
    const wy = height - 78;
    panel(wx - 62, wy - 62, 124, 124);
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(rel + Math.PI);
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(12, 6);
    ctx.lineTo(4, 6);
    ctx.lineTo(4, 26);
    ctx.lineTo(-4, 26);
    ctx.lineTo(-4, 6);
    ctx.lineTo(-12, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = PALETTE.hudInk;
    ctx.font = 'bold 16px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`WIND ${Math.round(wind.speed * 1.94)} kt`, wx, wy + 52);
    // Off-screen target arrow: point the pilot at the next ring or runway.
    const target = nextTarget(flight);
    const cam2 = camera(flight);
    const tp = project(cam2, { x: target.x, y: target.y, z: target.z });
    const dist = Math.hypot(target.x - flight.x, target.y - flight.y, target.z - flight.z);
    if (!tp || tp.x < 60 || tp.x > width - 60 || tp.y < 130 || tp.y > height - 60) {
      const ang = Math.atan2((tp ? tp.y : height * 0.3) - height * 0.52, (tp ? tp.x : width / 2) - width / 2);
      const ex = width / 2 + Math.cos(ang) * (width / 2 - 70);
      const ey = height * 0.52 + Math.sin(ang) * (height * 0.42);
      ctx.save();
      ctx.translate(clamp(ex, 60, width - 60), clamp(ey, 130, height - 80));
      ctx.rotate(ang);
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(-8, -12);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-8, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.font = 'bold 16px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(dist)} m`, clamp(ex, 60, width - 60), clamp(ey, 130, height - 80) + 34);
    } else if (target.kind === 'ring') {
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.font = 'bold 15px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(dist)} m`, tp.x, tp.y - 18);
    }
    // Message line under the top bar.
    if (flight.time < flight.messageUntil) {
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(flight.message, width / 2, 132);
    }
    // Turn hint when the next ring is well off the nose.
    const turn = turnToTarget(flight);
    if (Math.abs(turn) > 0.5 && flight.status === 'flying') {
      ctx.fillStyle = PALETTE.hudDim;
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(turn > 0 ? '◀ TURN LEFT TO THE NEXT RING' : 'TURN RIGHT TO THE NEXT RING ▶', width / 2, height - 24);
    }
  }

  function centrePanel(title, lines, accent) {
    const w = 560;
    const h = 120 + lines.length * 34;
    const x = width / 2 - w / 2;
    const y = height / 2 - h / 2 - 40;
    ctx.fillStyle = 'rgba(8, 22, 44, 0.78)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillText(title, width / 2, y + 62);
    ctx.fillStyle = PALETTE.hudInk;
    ctx.font = '20px system-ui, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, width / 2, y + 108 + i * 34));
  }

  function drawTitle(flight, best) {
    ctx.fillStyle = 'rgba(8, 22, 44, 0.35)';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudInk;
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.fillText('SKYWARD FLIGHT', width / 2, height * 0.30);
    ctx.fillStyle = PALETTE.hudAmber;
    ctx.font = '600 24px system-ui, sans-serif';
    ctx.fillText('A valley run in a little yellow plane', width / 2, height * 0.30 + 44);
    ctx.fillStyle = PALETTE.hudInk;
    ctx.font = '20px system-ui, sans-serif';
    const lines = [
      'Take off from the runway, thread the orange rings, then land back home.',
      '↑ ↓ pitch      ← → bank and turn      W / S throttle      Mouse steers too',
      'Mind the fuel and the wind — a hard landing is a crash.',
      '',
      'ENTER or CLICK to fly',
    ];
    lines.forEach((line, i) => ctx.fillText(line, width / 2, height * 0.44 + i * 34));
    if (best > 0) {
      ctx.fillStyle = PALETTE.hudAmber;
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText(`BEST SCORE  ${best}`, width / 2, height * 0.44 + lines.length * 34 + 18);
    }
  }

  function drawOver(flight) {
    if (flight.status === 'landed') {
      centrePanel('TOUCHDOWN!', [
        `Rings flown  ${flight.ringsPassed} of ${flight.course.rings.length}`,
        `Landing  +${500}     Fuel bonus  +${flight.fuelBonus}     Time bonus  +${flight.timeBonus}`,
        `TOTAL SCORE  ${flight.score}`,
        'Press R for the next level — more rings, tighter turns, stronger wind',
      ], '#3fae5a');
    } else {
      centrePanel('CRASHED', [
        flight.crashReason || 'The valley wins this time',
        `Rings flown  ${flight.ringsPassed} of ${flight.course.rings.length}     Score  ${flight.score}`,
        'Press R to try the sortie again',
      ], PALETTE.hudRed);
    }
  }

  /** Paint one frame: the world, the plane, the instruments, then the screen. */
  function draw(flight, clouds, screen, best) {
    const cam = camera(flight);
    drawSky(flight, cam);
    drawGround(flight, cam);
    drawRunway(flight, cam);
    drawTrees(flight, cam);
    drawClouds(flight, cam, clouds);
    drawRings(flight, cam);
    drawPlaneShadow(flight, cam);
    drawPlane(flight, cam);
    if (screen === SCREEN_TITLE) {
      drawTitle(flight, best);
      return;
    }
    drawHud(flight);
    if (screen === SCREEN_PAUSED) {
      centrePanel('PAUSED', ['Press P to keep flying'], PALETTE.hudAmber);
    } else if (screen === SCREEN_OVER) {
      drawOver(flight);
    }
  }

  return { draw, resize };
}
