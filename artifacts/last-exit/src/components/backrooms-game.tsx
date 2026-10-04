import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link } from 'wouter';
import {
  ArrowLeft, Award, Flashlight, Pause, Play, Radio, RotateCcw, Trophy,
  Volume2, VolumeX,
} from 'lucide-react';

/* ── Level 0 layout ────────────────────────────────────────────────────────
 * 0 = floor, 1 = wall, 2 = exit door, 3/4/5 = evidence tape 01/02/03.      */
const MAP_WIDTH = 18;
const MAP_HEIGHT = 18;

const TILE_WALL = 1;
const TILE_EXIT = 2;
const FIRST_TAPE_TILE = 3;
const LAST_TAPE_TILE = 5;
const TAPE_COUNT = 3;

const MAZE: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 3, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 4, 0, 1],
  [1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1],
  [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 5, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 2, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

/* ── Tuning ─────────────────────────────────────────────────────────────── */
const SPAWN_X = 1.5;
const SPAWN_Y = 1.5;
const WALK_SPEED = 2.55;          // cells per second
const RUN_MULTIPLIER = 1.55;
const TURN_SPEED = 2.3;           // radians per second
const LOOK_SENSITIVITY = 0.0023;
const PICKUP_RADIUS = 1.05;
const MAX_FRAME_SECONDS = 0.05;   // never simulate a single step longer than this
const MAX_STEP_LENGTH = 0.18;     // collision sub-step, prevents tunnelling
const MAX_DDA_STEPS = 96;         // hard raycast bound, prevents an infinite loop
const BATTERY_DRAIN_PER_SECOND = 100 / 240;
const AMBIENT_LIGHT = 0.3;        // brightness with the flashlight switched off
const MAX_CANVAS_WIDTH = 1280;
const MINIMAP_SCALE = 5;
const REVEAL_RADIUS = 3.2;

const isTapeTile = (tile: number): boolean =>
  tile >= FIRST_TAPE_TILE && tile <= LAST_TAPE_TILE;

const LITTLE_ENDIAN =
  new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04;

/** Packs 0-255 channels into the native Uint32 pixel layout for ImageData. */
function packColor(r: number, g: number, b: number): number {
  return LITTLE_ENDIAN
    ? (0xff000000 | (b << 16) | (g << 8) | r) >>> 0
    : (((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0);
}

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

interface GameState {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  planeX: number;
  planeY: number;
  collected: Set<number>;
  unlocked: boolean;
  escaped: boolean;
  flashlight: boolean;
  battery: number;
  sound: boolean;
  paused: boolean;
  explored: Uint8Array;
  lastCellX: number;
  lastCellY: number;
  minimapDirty: boolean;
}

const createGameState = (): GameState => ({
  x: SPAWN_X,
  y: SPAWN_Y,
  dirX: 1,
  dirY: 0,
  planeX: 0,
  planeY: 0.66,
  collected: new Set<number>(),
  unlocked: false,
  escaped: false,
  flashlight: true,
  battery: 100,
  sound: false,
  paused: false,
  explored: new Uint8Array(MAP_WIDTH * MAP_HEIGHT),
  lastCellX: -1,
  lastCellY: -1,
  minimapDirty: true,
});

/** Reads a tile, treating anything outside the maze as solid rock. */
function tileAt(cx: number, cy: number): number {
  if (cx < 0 || cy < 0 || cx >= MAP_WIDTH || cy >= MAP_HEIGHT) return TILE_WALL;
  return MAZE[cy][cx];
}

export function BackroomsGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const gameRef = useRef<GameState>(createGameState());
  const keysRef = useRef<Set<string>>(new Set());
  const lookDragRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const resizeSignalRef = useRef(true);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const humGainRef = useRef<GainNode | null>(null);

  const [tapes, setTapes] = useState<number[]>([]);
  const [message, setMessage] = useState('FIND 3 TAPES TO UNLOCK THE LAST EXIT');
  const [escaped, setEscaped] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [battery, setBattery] = useState(100);
  const [paused, setPaused] = useState(false);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [stats, setStats] = useState({ fps: 60, seconds: 0 });

  /* ── Audio ───────────────────────────────────────────────────────────── */

  const ensureAudio = useCallback(() => {
    if (typeof window === 'undefined') return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;

    if (!audioCtxRef.current) {
      let ctx: AudioContext;
      try {
        ctx = new Ctor();
      } catch {
        return;
      }
      audioCtxRef.current = ctx;

      // 60 Hz mains hum layered under a lowpass: the sound of failing lights.
      try {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = 60;
        filter.type = 'lowpass';
        filter.frequency.value = 240;
        filter.Q.value = 0.7;
        gain.gain.value = 0;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        humGainRef.current = gain;
      } catch {
        humGainRef.current = null;
      }
    }

    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  }, []);

  const playTone = useCallback(
    (steps: readonly { freq: number; delay: number; dur: number; vol: number }[]) => {
      const ctx = audioCtxRef.current;
      if (!ctx || !gameRef.current.sound || ctx.state !== 'running') return;
      try {
        const now = ctx.currentTime;
        for (const step of steps) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(step.freq, now + step.delay);
          gain.gain.setValueAtTime(0.0001, now + step.delay);
          gain.gain.exponentialRampToValueAtTime(step.vol, now + step.delay + 0.02);
          gain.gain.exponentialRampToValueAtTime(
            0.0001,
            now + step.delay + step.dur,
          );
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + step.delay);
          osc.stop(now + step.delay + step.dur + 0.05);
        }
      } catch {
        /* audio is decorative; never let it break the frame */
      }
    },
    [],
  );

  const playPickup = useCallback(() => {
    playTone([
      { freq: 587.33, delay: 0, dur: 0.16, vol: 0.16 },
      { freq: 880, delay: 0.09, dur: 0.22, vol: 0.14 },
    ]);
  }, [playTone]);

  const playWin = useCallback(() => {
    playTone([
      { freq: 440, delay: 0, dur: 0.34, vol: 0.18 },
      { freq: 554.37, delay: 0.14, dur: 0.34, vol: 0.18 },
      { freq: 659.25, delay: 0.28, dur: 0.36, vol: 0.18 },
      { freq: 880, delay: 0.42, dur: 0.5, vol: 0.2 },
    ]);
  }, [playTone]);

  const playLocked = useCallback(() => {
    playTone([{ freq: 150, delay: 0, dur: 0.13, vol: 0.13 }]);
  }, [playTone]);

  // Keep the hum gain in step with the toggle without rebuilding the graph.
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const gain = humGainRef.current;
    if (!ctx || !gain) return;
    try {
      gain.gain.setTargetAtTime(soundOn ? 0.05 : 0, ctx.currentTime, 0.08);
    } catch {
      /* ignore */
    }
  }, [soundOn]);

  useEffect(
    () => () => {
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      humGainRef.current = null;
      if (ctx) void ctx.close().catch(() => {});
    },
    [],
  );

  /* ── Player actions, reachable from the mount-once input effect ──────── */

  const rotatePlayer = useCallback((angle: number) => {
    const g = gameRef.current;
    if (!Number.isFinite(angle) || angle === 0) return;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dirX = g.dirX;
    const dirY = g.dirY;
    g.dirX = dirX * cos - dirY * sin;
    g.dirY = dirX * sin + dirY * cos;
    const planeX = g.planeX;
    const planeY = g.planeY;
    g.planeX = planeX * cos - planeY * sin;
    g.planeY = planeX * sin + planeY * cos;
    g.minimapDirty = true;
  }, []);

  const restart = useCallback(() => {
    const keepSound = gameRef.current.sound;
    gameRef.current = createGameState();
    gameRef.current.sound = keepSound;
    setTapes([]);
    setEscaped(false);
    setPaused(false);
    setBattery(100);
    setMessage('FIND 3 TAPES TO UNLOCK THE LAST EXIT');
  }, []);

  const toggleFlashlight = useCallback(() => {
    const g = gameRef.current;
    if (g.escaped) return;
    if (!g.flashlight && g.battery <= 0) {
      setMessage('BATTERY DEAD // RECOVER A TAPE TO RECHARGE');
      playLocked();
      return;
    }
    g.flashlight = !g.flashlight;
    g.minimapDirty = true;
    setFlashlightOn(g.flashlight);
  }, [playLocked]);

  const toggleSound = useCallback(() => {
    const next = !gameRef.current.sound;
    gameRef.current.sound = next;
    setSoundOn(next);
    if (next) ensureAudio();
  }, [ensureAudio]);

  const togglePause = useCallback(() => {
    const g = gameRef.current;
    if (g.escaped) return;
    g.paused = !g.paused;
    setPaused(g.paused);
  }, []);

  const actionsRef = useRef({
    restart,
    toggleFlashlight,
    toggleSound,
    togglePause,
  });
  actionsRef.current = { restart, toggleFlashlight, toggleSound, togglePause };

  /* ── Input ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const keys = keysRef.current;
    const scrollKeys = new Set([
      'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'spacebar',
    ]);

    const clearInput = () => {
      keys.clear();
      lookDragRef.current = null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (scrollKeys.has(key)) event.preventDefault();
      // `keys.has` doubles as auto-repeat suppression for the action keys.
      if (keys.has(key)) return;
      keys.add(key);
      if (key === 'f') actionsRef.current.toggleFlashlight();
      else if (key === 'r') actionsRef.current.restart();
      else if (key === 'm') actionsRef.current.toggleSound();
      else if (key === 'p') actionsRef.current.togglePause();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
    };

    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvasRef.current) return;
      rotatePlayer(event.movementX * LOOK_SENSITIVITY);
    };

    const onPointerLockChange = () => {
      setPointerLocked(document.pointerLockElement === canvasRef.current);
    };

    const onVisibility = () => {
      if (document.hidden) clearInput();
    };

    const onWindowResize = () => {
      resizeSignalRef.current = true;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInput);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInput);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onWindowResize);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
    };
  }, [rotatePlayer]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      resizeSignalRef.current = true;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const requestLook = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || gameRef.current.escaped) return;
    try {
      const result = (
        canvas.requestPointerLock?.() as unknown as Promise<void> | undefined
      );
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      /* pointer lock can be refused; drag-look still works */
    }
  }, []);

  const onCanvasPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.pointerType === 'mouse') {
        event.currentTarget.focus();
        requestLook();
        return;
      }
      lookDragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    },
    [requestLook],
  );

  const onCanvasPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const drag = lookDragRef.current;
      if (!drag || drag.id !== event.pointerId) return;
      rotatePlayer((event.clientX - drag.x) * LOOK_SENSITIVITY * 1.5);
      drag.x = event.clientX;
      drag.y = event.clientY;
    },
    [rotatePlayer],
  );

  const endLookDrag = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (lookDragRef.current?.id === event.pointerId) lookDragRef.current = null;
  }, []);

  /* ── Render loop ─────────────────────────────────────────────────────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return undefined;

    const minimap = minimapRef.current;
    const minimapCtx = minimap?.getContext('2d') ?? null;

    const wallFalloff = new Float32Array(256);
    for (let i = 0; i < 256; i += 1) {
      const v = i / 255;
      wallFalloff[i] = 1 - 0.45 * v * v;
    }

    let frame = 0;
    let raf = 0;
    let previous = performance.now();
    let frameMs = 16.7;
    let resolutionScale = 1;
    let scaleCooldown = 0;
    let hudCooldown = 0;
    let elapsed = 0;
    let lastBattery = -1;
    let lastFps = -1;

    let image: ImageData | null = null;
    let pixels: Uint32Array | null = null;
    let rowColors = new Uint32Array(0);
    let paletteKey = '';

    const resize = (): boolean => {
      const host = canvas.parentElement;
      const cssWidth = Math.max(
        300,
        Math.floor(host?.clientWidth || canvas.clientWidth || 640),
      );
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = clamp(
        Math.round(cssWidth * dpr * resolutionScale),
        300,
        MAX_CANVAS_WIDTH,
      );
      const height = Math.max(160, Math.round((width * 9) / 16));
      if (canvas.width === width && canvas.height === height) return false;
      canvas.width = width;
      canvas.height = height;
      image = ctx.createImageData(width, height);
      pixels = new Uint32Array(image.data.buffer);
      paletteKey = '';
      return true;
    };

    /** Ceiling/floor bands, rebuilt only when size or lighting changes. */
    const buildPalette = () => {
      const lit = gameRef.current.flashlight ? 1 : AMBIENT_LIGHT;
      const key = `${canvas.width}x${canvas.height}:${gameRef.current.flashlight ? 1 : 0}`;
      if (key === paletteKey) return;
      paletteKey = key;
      const height = canvas.height;
      rowColors = new Uint32Array(height);
      for (let y = 0; y < height; y += 1) {
        const t = height > 1 ? y / (height - 1) : 0;
        let r: number;
        let g: number;
        let b: number;
        if (y < height / 2) {
          const k = 1 - t * 2;
          r = 36 - 21 * k;
          g = 34 - 20 * k;
          b = 23 - 13 * k;
        } else {
          const k = (t - 0.5) * 2;
          r = 43 - 19 * k;
          g = 39 - 18 * k;
          b = 26 - 14 * k;
        }
        rowColors[y] = packColor(
          clamp(r * lit, 0, 255),
          clamp(g * lit, 0, 255),
          clamp(b * lit, 0, 255),
        );
      }
    };

    const revealAround = (px: number, py: number) => {
      const g = gameRef.current;
      const cx = Math.floor(px);
      const cy = Math.floor(py);
      const span = Math.ceil(REVEAL_RADIUS);
      for (let y = cy - span; y <= cy + span; y += 1) {
        if (y < 0 || y >= MAP_HEIGHT) continue;
        for (let x = cx - span; x <= cx + span; x += 1) {
          if (x < 0 || x >= MAP_WIDTH) continue;
          const dx = x + 0.5 - px;
          const dy = y + 0.5 - py;
          if (dx * dx + dy * dy > REVEAL_RADIUS * REVEAL_RADIUS) continue;
          g.explored[y * MAP_WIDTH + x] = 1;
        }
      }
      // The way out is always marked on the map; the tapes are not.
      for (let y = 0; y < MAP_HEIGHT; y += 1) {
        for (let x = 0; x < MAP_WIDTH; x += 1) {
          if (MAZE[y][x] === TILE_EXIT) g.explored[y * MAP_WIDTH + x] = 1;
        }
      }
      g.lastCellX = cx;
      g.lastCellY = cy;
      g.minimapDirty = true;
    };

    const drawMinimap = () => {
      if (!minimap || !minimapCtx) return;
      const g = gameRef.current;
      const unit = minimap.width / MAP_WIDTH;
      minimapCtx.clearRect(0, 0, minimap.width, minimap.height);
      minimapCtx.fillStyle = 'rgba(14, 13, 9, 0.88)';
      minimapCtx.fillRect(0, 0, minimap.width, minimap.height);

      for (let y = 0; y < MAP_HEIGHT; y += 1) {
        for (let x = 0; x < MAP_WIDTH; x += 1) {
          if (!g.explored[y * MAP_WIDTH + x]) continue;
          const tile = MAZE[y][x];
          if (tile === TILE_WALL) minimapCtx.fillStyle = '#6f6746';
          else if (tile === TILE_EXIT)
            minimapCtx.fillStyle = g.unlocked ? '#4ce06a' : '#d0402c';
          else if (isTapeTile(tile) && !g.collected.has(tile))
            minimapCtx.fillStyle = '#e8c33a';
          else minimapCtx.fillStyle = '#2b2718';
          minimapCtx.fillRect(x * unit, y * unit, unit, unit);
        }
      }

      minimapCtx.fillStyle = '#ff5a48';
      minimapCtx.beginPath();
      minimapCtx.arc(g.x * unit, g.y * unit, unit * 0.55, 0, Math.PI * 2);
      minimapCtx.fill();

      // Facing indicator.
      minimapCtx.strokeStyle = 'rgba(255, 213, 107, 0.9)';
      minimapCtx.lineWidth = Math.max(1, unit * 0.22);
      minimapCtx.beginPath();
      minimapCtx.moveTo(g.x * unit, g.y * unit);
      minimapCtx.lineTo(
        (g.x + g.dirX * 2.4) * unit,
        (g.y + g.dirY * 2.4) * unit,
      );
      minimapCtx.stroke();
    };

    const solidAt = (x: number, y: number): boolean => {
      const tile = tileAt(Math.floor(x), Math.floor(y));
      if (tile === TILE_WALL) return true;
      if (tile === TILE_EXIT) return !gameRef.current.unlocked;
      if (isTapeTile(tile)) return !gameRef.current.collected.has(tile);
      return false;
    };

    const render = (now: number) => {
      const g = gameRef.current;
      const delta = clamp((now - previous) / 1000, 0, MAX_FRAME_SECONDS);
      previous = now;
      frame += 1;

      if (resizeSignalRef.current) {
        resizeSignalRef.current = false;
        resize();
      }

      /* Physics ------------------------------------------------------- */
      if (!g.paused && !g.escaped) {
        const keys = keysRef.current;
        let turn = 0;
        if (keys.has('arrowleft') || keys.has('a')) turn -= 1;
        if (keys.has('arrowright') || keys.has('d')) turn += 1;
        if (turn !== 0) rotatePlayer(turn * TURN_SPEED * delta);

        let forward = 0;
        if (keys.has('arrowup') || keys.has('w')) forward += 1;
        if (keys.has('arrowdown') || keys.has('s')) forward -= 1;
        if (forward !== 0) {
          const running = keys.has('shift');
          const speed = WALK_SPEED * (running ? RUN_MULTIPLIER : 1) * delta;
          const moveX = g.dirX * speed * forward;
          const moveY = g.dirY * speed * forward;
          const steps = Math.max(
            1,
            Math.ceil(
              Math.max(Math.abs(moveX), Math.abs(moveY)) / MAX_STEP_LENGTH,
            ),
          );
          // Per-axis resolution keeps the player sliding along walls instead
          // of sticking to them when walking diagonally.
          for (let i = 0; i < steps; i += 1) {
            const stepX = moveX / steps;
            const stepY = moveY / steps;
            if (!solidAt(g.x + stepX, g.y)) g.x += stepX;
            if (!solidAt(g.x, g.y + stepY)) g.y += stepY;
          }
        }

        if (!Number.isFinite(g.x) || !Number.isFinite(g.y)) {
          g.x = SPAWN_X;
          g.y = SPAWN_Y;
        }
        g.x = clamp(g.x, 0.02, MAP_WIDTH - 0.02);
        g.y = clamp(g.y, 0.02, MAP_HEIGHT - 0.02);

        if (g.flashlight) {
          g.battery = Math.max(0, g.battery - BATTERY_DRAIN_PER_SECOND * delta);
          if (g.battery === 0) {
            g.flashlight = false;
            setFlashlightOn(false);
            setMessage('FLASHLIGHT DEAD // FIND A TAPE TO RECHARGE');
          }
        }

        /* Pickups ----------------------------------------------------- */
        for (let y = 0; y < MAP_HEIGHT; y += 1) {
          for (let x = 0; x < MAP_WIDTH; x += 1) {
            const tile = MAZE[y][x];
            if (!isTapeTile(tile) || g.collected.has(tile)) continue;
            const dx = x + 0.5 - g.x;
            const dy = y + 0.5 - g.y;
            if (dx * dx + dy * dy > PICKUP_RADIUS * PICKUP_RADIUS) continue;

            g.collected.add(tile);
            g.battery = 100;
            g.minimapDirty = true;
            const found = g.collected.size;
            const next = Array.from(g.collected).sort((a, b) => a - b);
            setTapes(next);
            playPickup();
            if (found >= TAPE_COUNT) {
              g.unlocked = true;
              g.minimapDirty = true;
              setMessage('ALL 3 TAPES RECOVERED! THE LAST EXIT IS UNLOCKED!');
            } else {
              setMessage(
                `TAPE 0${tile - FIRST_TAPE_TILE + 1} RECOVERED (${found}/${TAPE_COUNT}) // KEEP SEARCHING`,
              );
            }
          }
        }

        if (g.unlocked && !g.escaped) {
          for (let y = 0; y < MAP_HEIGHT; y += 1) {
            for (let x = 0; x < MAP_WIDTH; x += 1) {
              if (MAZE[y][x] !== TILE_EXIT) continue;
              const dx = x + 0.5 - g.x;
              const dy = y + 0.5 - g.y;
              if (dx * dx + dy * dy > PICKUP_RADIUS * PICKUP_RADIUS) continue;
              g.escaped = true;
              g.paused = false;
              setEscaped(true);
              setPaused(false);
              setMessage('YOU FOUND THE LAST EXIT!');
              playWin();
            }
          }
        }

        elapsed += delta;
      }

      const cellX = Math.floor(g.x);
      const cellY = Math.floor(g.y);
      if (cellX !== g.lastCellX || cellY !== g.lastCellY) revealAround(g.x, g.y);

      /* Render ------------------------------------------------------- */
      buildPalette();
      const width = canvas.width;
      const height = canvas.height;
      if (!image || !pixels) {
        resize();
        raf = requestAnimationFrame(render);
        return;
      }

      for (let y = 0; y < height; y += 1) {
        pixels.fill(rowColors[y], y * width, y * width + width);
      }

      const lit = g.flashlight;
      const ambient = AMBIENT_LIGHT;
      const pulse = 0.86 + 0.14 * Math.sin(elapsed * 4.2);
      const half = height / 2;

      for (let x = 0; x < width; x += 1) {
        const cameraX = (2 * x) / width - 1;
        const rayDirX = g.dirX + g.planeX * cameraX;
        const rayDirY = g.dirY + g.planeY * cameraX;

        let mapX = Math.floor(g.x);
        let mapY = Math.floor(g.y);
        const deltaX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
        const deltaY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

        let stepX: number;
        let stepY: number;
        let sideX: number;
        let sideY: number;
        if (rayDirX < 0) {
          stepX = -1;
          sideX = (g.x - mapX) * deltaX;
        } else {
          stepX = 1;
          sideX = (mapX + 1 - g.x) * deltaX;
        }
        if (rayDirY < 0) {
          stepY = -1;
          sideY = (g.y - mapY) * deltaY;
        } else {
          stepY = 1;
          sideY = (mapY + 1 - g.y) * deltaY;
        }

        let side = 0;
        let hit = false;
        let tile = TILE_WALL;

        for (let i = 0; i < MAX_DDA_STEPS; i += 1) {
          if (sideX < sideY) {
            sideX += deltaX;
            mapX += stepX;
            side = 0;
          } else {
            sideY += deltaY;
            mapY += stepY;
            side = 1;
          }
          if (
            mapX < 0 ||
            mapY < 0 ||
            mapX >= MAP_WIDTH ||
            mapY >= MAP_HEIGHT
          ) {
            hit = true;
            tile = TILE_WALL;
            break;
          }
          const candidate = MAZE[mapY][mapX];
          if (
            candidate === TILE_WALL ||
            candidate === TILE_EXIT ||
            (isTapeTile(candidate) && !g.collected.has(candidate))
          ) {
            hit = true;
            tile = candidate;
            break;
          }
        }
        if (!hit) continue;

        let distance = side === 0 ? sideX - deltaX : sideY - deltaY;
        if (!Number.isFinite(distance) || distance < 1e-4) distance = 1e-4;

        const lineHeight = height / distance;
        let start = Math.floor((height - lineHeight) / 2);
        let end = Math.ceil((height + lineHeight) / 2);
        if (start < 0) start = 0;
        if (end > height) end = height;
        if (end <= start) continue;

        let fog = 1.55 / (distance + 0.32);
        if (fog > 1) fog = 1;
        const cone = lit ? clamp(1 - cameraX * cameraX * 0.8, 0.1, 1) : 1;
        const brightness = lit ? 0.3 + 0.7 * cone : 1;
        const shade = fog * brightness;

        let baseR: number;
        let baseG: number;
        let baseB: number;
        if (tile === TILE_EXIT) {
          if (g.unlocked) {
            baseR = 46 * pulse;
            baseG = 226 * pulse;
            baseB = 88 * pulse;
          } else {
            baseR = 196;
            baseG = 52;
            baseB = 38;
          }
        } else if (isTapeTile(tile)) {
          baseR = 255 * pulse;
          baseG = 186 * pulse;
          baseB = 44 * pulse;
        } else {
          const wallHit =
            side === 0 ? g.y + distance * rayDirY : g.x + distance * rayDirX;
          let u = wallHit - Math.floor(wallHit);
          if (u < 0) u += 1;
          else if (u > 1) u -= 1;
          // Vertical wallpaper seams plus the damp mottling of Level 0.
          const seam = u < 0.05 || u > 0.95 ? 0.74 : 1;
          const mottle = 0.94 + 0.06 * Math.sin(wallHit * 9.1);
          const tint = seam * mottle;
          if (side === 1) {
            baseR = 186 * tint;
            baseG = 162 * tint;
            baseB = 78 * tint;
          } else {
            baseR = 216 * tint;
            baseG = 192 * tint;
            baseB = 104 * tint;
          }
        }

        const halfLine = lineHeight / 2;
        let index = start * width + x;
        for (let y = start; y < end; y += 1) {
          const v = Math.abs(y - half) / halfLine;
          const k = wallFalloff[(v * 255) | 0] * shade;
          pixels[index] = packColor(
            baseR * k,
            baseG * k,
            baseB * k,
          );
          index += width;
        }
      }

      ctx.putImageData(image, 0, 0);

      if (g.minimapDirty) {
        g.minimapDirty = false;
        drawMinimap();
      }

      /* Adaptive resolution + HUD refresh ---------------------------- */
      const measured = delta * 1000;
      frameMs += (measured - frameMs) * 0.1;

      if (scaleCooldown > 0) scaleCooldown -= 1;
      if (frame % 45 === 0 && scaleCooldown === 0) {
        const before = resolutionScale;
        if (frameMs > 21 && resolutionScale > 0.55) resolutionScale -= 0.1;
        else if (frameMs < 12.5 && resolutionScale < 1) resolutionScale += 0.05;
        resolutionScale = clamp(resolutionScale, 0.55, 1);
        if (resolutionScale !== before) {
          resize();
          scaleCooldown = 90;
        }
      }

      if (hudCooldown > 0) hudCooldown -= 1;
      if (hudCooldown === 0) {
        hudCooldown = 30;
        const batteryValue = Math.ceil(g.battery);
        const fpsValue = Math.round(1000 / Math.max(measured, 1));
        if (batteryValue !== lastBattery || fpsValue !== lastFps) {
          lastBattery = batteryValue;
          lastFps = fpsValue;
          setBattery(batteryValue);
          setStats({ fps: fpsValue, seconds: Math.floor(elapsed) });
        }
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [playLocked, playPickup, playWin, rotatePlayer]);

  /* ── Virtual controls ────────────────────────────────────────────────── */

  const pressVirtual = useCallback((action: string) => {
    keysRef.current.add(action);
  }, []);
  const releaseVirtual = useCallback((action: string) => {
    keysRef.current.delete(action);
  }, []);

  const clock = useCallback(() => {
    const total = Math.max(0, Math.floor(stats.seconds));
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }, [stats.seconds]);

  const batteryPct = Math.round(battery);

  return (
    <div className="game-wrapper film-grain">
      <div className="game-top-bar">
        <div className="game-status-left">
          <Link href="/" className="button button-outline button-small">
            <ArrowLeft size={14} /> Exit to Menu
          </Link>
          <span className="live-pip" />
          <span className="game-rec-text">
            REC {clock()} // LEVEL 0 LIVE SIMULATION
          </span>
        </div>

        <div className="game-attribution-badge">
          <Award size={14} className="gold-accent" />
          <span>
            GAME DESIGNED &amp; DEVELOPED BY{' '}
            <strong>MOHAMMED DANSEER Z</strong>
          </span>
        </div>

        <div className="game-status-right">
          <span className="game-fps" title="Frames per second">
            {stats.fps} FPS
          </span>
          <button
            className={`button button-small ${soundOn ? 'button-primary' : 'button-outline'}`}
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label="Toggle Sound"
          >
            {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>{soundOn ? 'HUM ON' : 'HUM OFF'}</span>
          </button>
          <button
            className={`button button-small ${flashlightOn ? 'button-primary' : 'button-outline'}`}
            onClick={toggleFlashlight}
            aria-pressed={flashlightOn}
            aria-label="Toggle Flashlight"
          >
            <Flashlight size={14} />
            <span>{flashlightOn ? 'LIGHT ON' : 'LIGHT OFF'}</span>
          </button>
          <button
            className="button button-small button-outline"
            onClick={togglePause}
            aria-label={paused ? 'Resume' : 'Pause'}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
            <span>{paused ? 'RESUME' : 'PAUSE'}</span>
          </button>
        </div>
      </div>

      <div className="canvas-container" ref={viewportRef}>
        <canvas
          ref={canvasRef}
          className="game-canvas"
          aria-label="The Backrooms Level 0 Exploration Viewport"
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={endLookDrag}
          onPointerCancel={endLookDrag}
        />

        <div className="game-scanlines" aria-hidden="true" />
        <div className="game-vignette" aria-hidden="true" />

        <canvas
          ref={minimapRef}
          className="game-minimap"
          width={MAP_WIDTH * MINIMAP_SCALE}
          height={MAP_HEIGHT * MINIMAP_SCALE}
          aria-hidden="true"
        />

        {!escaped && !pointerLocked && (
          <button
            type="button"
            className="look-hint"
            onClick={requestLook}
          >
            CLICK TO LOOK AROUND
          </button>
        )}

        <div className="game-crosshair" aria-hidden="true" />

        <div className="game-hud">
          <div className="hud-top-left">
            <div className="hud-tape-counter">
              <span className="hud-label">EVIDENCE TAPES RECOVERED:</span>
              <div className="hud-tapes">
                {[1, 2, 3].map((num) => {
                  const hasTape = tapes.includes(num + FIRST_TAPE_TILE - 1);
                  return (
                    <span
                      key={num}
                      className={`tape-badge ${hasTape ? 'tape-badge-found' : ''}`}
                    >
                      <Radio size={12} /> TAPE 0{num}
                    </span>
                  );
                })}
              </div>
              <div className="hud-battery">
                <span className="hud-label">FLASHLIGHT</span>
                <span className="battery-track">
                  <span
                    className={`battery-fill ${batteryPct <= 25 ? 'battery-low' : ''}`}
                    style={{ width: `${batteryPct}%` }}
                  />
                </span>
                <span className="hud-label">{batteryPct}%</span>
              </div>
            </div>
            <div className="hud-message">{message}</div>
          </div>

          <div className="hud-bottom-bar">
            <div className="hud-instructions">
              <span>
                <b>[WASD]</b> Move
              </span>
              <span>
                <b>[MOUSE]</b> Look
              </span>
              <span>
                <b>[SHIFT]</b> Run
              </span>
              <span>
                <b>[F]</b> Light
              </span>
              <span>
                <b>[P]</b> Pause
              </span>
              <span>
                <b>[R]</b> Reset
              </span>
            </div>
            <div className="hud-credits-pill">
              <Link href="/credits" className="hud-credits-link">
                VIEW GAME CREDITS (/credits)
              </Link>
            </div>
          </div>
        </div>

        {paused && !escaped && (
          <div className="victory-overlay">
            <div className="victory-card paper-shadow">
              <div className="victory-icon">
                <Pause size={38} />
              </div>
              <h2>SIMULATION PAUSED</h2>
              <p className="victory-subtitle">
                The halls are holding their breath. Press P or tap resume.
              </p>
              <div className="victory-actions">
                <button className="button button-primary" onClick={togglePause}>
                  <Play size={16} /> Resume
                </button>
                <button className="button button-outline" onClick={restart}>
                  <RotateCcw size={16} /> Restart run
                </button>
              </div>
            </div>
          </div>
        )}

        {escaped && (
          <div className="victory-overlay">
            <div className="victory-card paper-shadow">
              <div className="victory-icon">
                <Trophy size={42} />
              </div>
              <h2>YOU FOUND THE LAST EXIT!</h2>
              <p className="victory-subtitle">
                Level 0 escaped in {clock()} with all 3 recovered tapes intact.
              </p>

              <div className="victory-credits-box">
                <span className="eyebrow">GAME CREATOR &amp; DEVELOPER</span>
                <h3>MOHAMMED DANSEER Z</h3>
                <p>THE GAME IS MADE BY MOHAMMED DANSEER Z</p>
                <div className="victory-url-badge">
                  CREDITS PERMANENT URL: <code>/credits</code>
                </div>
              </div>

              <div className="victory-actions">
                <button className="button button-primary" onClick={restart}>
                  <RotateCcw size={16} /> Play Again
                </button>
                <Link href="/credits" className="button button-outline">
                  <Award size={16} /> Full Game Credits (/credits)
                </Link>
                <Link href="/" className="button button-dark">
                  Return to Main Menu
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mobile-touch-controls">
        <div className="touch-group-dpad">
          <button
            className="touch-btn touch-up"
            aria-label="Move forward"
            onPointerDown={() => pressVirtual('w')}
            onPointerUp={() => releaseVirtual('w')}
            onPointerLeave={() => releaseVirtual('w')}
            onPointerCancel={() => releaseVirtual('w')}
          >
            ▲
          </button>
          <div className="touch-mid-row">
            <button
              className="touch-btn touch-left"
              aria-label="Turn left"
              onPointerDown={() => pressVirtual('a')}
              onPointerUp={() => releaseVirtual('a')}
              onPointerLeave={() => releaseVirtual('a')}
              onPointerCancel={() => releaseVirtual('a')}
            >
              ◄
            </button>
            <button
              className="touch-btn touch-down"
              aria-label="Move backward"
              onPointerDown={() => pressVirtual('s')}
              onPointerUp={() => releaseVirtual('s')}
              onPointerLeave={() => releaseVirtual('s')}
              onPointerCancel={() => releaseVirtual('s')}
            >
              ▼
            </button>
            <button
              className="touch-btn touch-right"
              aria-label="Turn right"
              onPointerDown={() => pressVirtual('d')}
              onPointerUp={() => releaseVirtual('d')}
              onPointerLeave={() => releaseVirtual('d')}
              onPointerCancel={() => releaseVirtual('d')}
            >
              ►
            </button>
          </div>
        </div>

        <div className="touch-group-actions">
          <button
            className="touch-btn touch-action"
            aria-label="Run"
            onPointerDown={() => pressVirtual('shift')}
            onPointerUp={() => releaseVirtual('shift')}
            onPointerLeave={() => releaseVirtual('shift')}
            onPointerCancel={() => releaseVirtual('shift')}
          >
            <span className="touch-run">RUN</span>
          </button>
          <button
            className="touch-btn touch-action"
            aria-label="Toggle flashlight"
            onClick={toggleFlashlight}
          >
            <Flashlight size={16} />
          </button>
          <button
            className="touch-btn touch-action"
            aria-label="Restart run"
            onClick={restart}
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default BackroomsGame;
