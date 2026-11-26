// Skyward Flight: keyboard and mouse. One job: read the pilot's hands into
// one stick — pitch, roll and throttle — plus the confirm, pause and restart
// keys, with no scrolling or selecting while flying.
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_RESTART = 'restart';

export function createInput(canvas) {
  const keys = new Set();
  let mouse = { active: false, x: 0, y: 0 };
  let pressed = new Set();

  function codeOf(event) {
    return event.code;
  }

  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat) pressed.add(event.code);
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  canvas.addEventListener('mousedown', (event) => {
    mouse = { active: true, x: event.clientX, y: event.clientY };
  });
  window.addEventListener('mouseup', () => {
    mouse = { active: false, x: mouse.x, y: mouse.y };
  });
  window.addEventListener('mousemove', (event) => {
    if (mouse.active) mouse = { active: true, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('click', () => {
    pressed.add('Click');
  });

  return {
    /** The stick this frame: pitch +1 nose up, roll +1 right, throttle keys. */
    readStick() {
      let pitch = 0;
      let roll = 0;
      if (keys.has('ArrowUp')) pitch += 1;
      if (keys.has('ArrowDown')) pitch -= 1;
      if (keys.has('ArrowLeft')) roll -= 1;
      if (keys.has('ArrowRight')) roll += 1;
      if (mouse.active) {
        const rect = canvas.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height * 0.52;
        roll += Math.max(-1, Math.min(1, (mouse.x - rect.left - cx) / (rect.width * 0.3)));
        pitch += Math.max(-1, Math.min(1, (cy - (mouse.y - rect.top)) / (rect.height * 0.3)));
      }
      return {
        pitch: Math.max(-1, Math.min(1, pitch)),
        roll: Math.max(-1, Math.min(1, roll)),
        throttleUp: keys.has('KeyW') || keys.has('ShiftLeft') || keys.has('ShiftRight'),
        throttleDown: keys.has('KeyS') || keys.has('ControlLeft') || keys.has('ControlRight'),
      };
    },
    /** One-shot actions pressed since the last call, then cleared. */
    readActions() {
      const actions = new Set();
      if (pressed.has('Enter') || pressed.has('Space') || pressed.has('Click')) actions.add(ACTION_CONFIRM);
      if (pressed.has('KeyP') || pressed.has('Escape')) actions.add(ACTION_PAUSE);
      if (pressed.has('KeyR')) actions.add(ACTION_RESTART);
      pressed = new Set();
      return actions;
    },
  };
}
