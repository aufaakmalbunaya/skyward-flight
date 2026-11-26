// Skyward Flight: sounds made in the browser, no audio files. One job:
// the engine hum that follows the throttle, a chime for each ring, a thud
// for a crash, and a soft fanfare for a landing. Silent until the pilot
// first touches a key or the mouse, and silent in screenshot mode.
export function createAudio() {
  let ctx = null;
  let engine = null;
  let engineGain = null;
  let windGain = null;
  let enabled = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      engine = ctx.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engine.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engine.start();
      // Wind: looped noise through a bandpass, quiet when slow.
      const length = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 500;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(band);
      band.connect(windGain);
      windGain.connect(ctx.destination);
      noise.start();
      enabled = true;
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, when, duration, volume) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  return {
    /** Call from a key or click handler: audio needs a user gesture. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    /** Every frame: engine pitch follows the throttle, wind the speed. */
    update(throttle, speed) {
      if (!enabled) return;
      const now = ctx.currentTime;
      engine.frequency.setTargetAtTime(48 + throttle * 70 + speed * 0.25, now, 0.1);
      engineGain.gain.setTargetAtTime(0.015 + throttle * 0.035, now, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.05, speed * 0.0006), now, 0.2);
    },
    ring() {
      if (!enabled) return;
      const now = ctx.currentTime;
      tone(660, now, 0.35, 0.12);
      tone(990, now + 0.09, 0.45, 0.12);
    },
    miss() {
      if (!enabled) return;
      tone(220, ctx.currentTime, 0.3, 0.08);
    },
    crash() {
      if (!enabled) return;
      const now = ctx.currentTime;
      tone(70, now, 0.5, 0.25);
      tone(45, now + 0.05, 0.6, 0.2);
    },
    land() {
      if (!enabled) return;
      const now = ctx.currentTime;
      tone(523, now, 0.3, 0.1);
      tone(659, now + 0.12, 0.3, 0.1);
      tone(784, now + 0.24, 0.5, 0.12);
    },
  };
}
