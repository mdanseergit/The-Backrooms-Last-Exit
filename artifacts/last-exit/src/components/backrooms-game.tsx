import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'wouter';
import {
  Volume2, VolumeX, Flashlight, ArrowLeft, RotateCcw,
  Sparkles, Award, Radio, Check, Trophy, AlertTriangle,
} from 'lucide-react';

// Maze definition (1 = Wall, 0 = Empty, 2 = Exit Door, 3 = Tape 1, 4 = Tape 2, 5 = Tape 3)
const MAP_WIDTH = 18;
const MAP_HEIGHT = 18;
const MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,3,0,1],
  [1,0,1,0,1,0,1,1,1,0,1,0,1,1,1,1,0,1],
  [1,0,1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,1],
  [1,0,1,1,1,1,1,0,1,1,1,0,1,0,1,1,0,1],
  [1,0,0,0,0,0,1,0,0,0,1,0,0,0,1,4,0,1],
  [1,1,1,0,1,0,1,1,1,0,1,1,1,0,1,1,0,1],
  [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
  [1,0,1,1,1,1,1,0,1,1,1,0,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1,0,1],
  [1,1,1,0,1,1,1,1,1,0,1,0,1,1,0,1,0,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,1,5,0,1,0,1],
  [1,0,1,1,1,0,1,1,1,1,1,0,1,1,0,1,0,1],
  [1,0,0,0,1,0,1,0,0,0,0,0,0,1,0,0,0,1],
  [1,1,1,0,1,0,1,0,1,1,1,1,0,1,1,1,0,1],
  [1,0,0,0,0,0,1,0,0,0,0,1,0,0,0,1,0,1],
  [1,0,1,1,1,1,1,1,1,1,0,1,1,1,0,2,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

export function BackroomsGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const humOscRef = useRef<OscillatorNode | null>(null);
  const humGainRef = useRef<GainNode | null>(null);

  // Game state
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(true);
  const [tapesCollected, setTapesCollected] = useState<number[]>([]);
  const [escaped, setEscaped] = useState(false);
  const [message, setMessage] = useState('FIND 3 TAPES TO UNLOCK THE LAST EXIT');
  const [battery, setBattery] = useState(100);

  // Player state refs for 60fps loop
  const playerRef = useRef({
    x: 1.5,
    y: 1.5,
    dirX: 1,
    dirY: 0,
    planeX: 0,
    planeY: 0.66,
    speed: 0.045,
    rotSpeed: 0.038,
  });

  const keysRef = useRef<{ [key: string]: boolean }>({});
  const collectedRef = useRef<Set<number>>(new Set());
  const exitUnlockedRef = useRef(false);

  // Sound generator
  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    if (!humOscRef.current) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(60, ctx.currentTime); // 60Hz mains electrical buzz

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, ctx.currentTime);

      gain.gain.setValueAtTime(0.04, ctx.currentTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      humOscRef.current = osc;
      humGainRef.current = gain;
    }
  };

  const playPickupSound = () => {
    if (!audioCtxRef.current || !soundEnabled) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  };

  const playWinSound = () => {
    if (!audioCtxRef.current || !soundEnabled) return;
    const ctx = audioCtxRef.current;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.15);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + idx * 0.15 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.15);
      osc.stop(ctx.currentTime + idx * 0.15 + 0.45);
    });
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) {
      initAudio();
      if (humGainRef.current && audioCtxRef.current) {
        humGainRef.current.gain.setValueAtTime(0.04, audioCtxRef.current.currentTime);
      }
    } else if (humGainRef.current && audioCtxRef.current) {
      humGainRef.current.gain.setValueAtTime(0, audioCtxRef.current.currentTime);
    }
  };

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true;
      if (e.key.toLowerCase() === 'f') {
        setFlashlightOn((prev) => !prev);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Raycaster 60FPS loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const player = playerRef.current;
      const keys = keysRef.current;
      const isShift = keys['shift'];
      const moveSpeed = player.speed * (isShift ? 1.5 : 1.0);
      const rotSpeed = player.rotSpeed;

      // Player rotation
      if (keys['arrowleft'] || keys['a']) {
        const oldDirX = player.dirX;
        player.dirX = player.dirX * Math.cos(-rotSpeed) - player.dirY * Math.sin(-rotSpeed);
        player.dirY = oldDirX * Math.sin(-rotSpeed) + player.dirY * Math.cos(-rotSpeed);
        const oldPlaneX = player.planeX;
        player.planeX = player.planeX * Math.cos(-rotSpeed) - player.planeY * Math.sin(-rotSpeed);
        player.planeY = oldPlaneX * Math.sin(-rotSpeed) + player.planeY * Math.cos(-rotSpeed);
      }
      if (keys['arrowright'] || keys['d']) {
        const oldDirX = player.dirX;
        player.dirX = player.dirX * Math.cos(rotSpeed) - player.dirY * Math.sin(rotSpeed);
        player.dirY = oldDirX * Math.sin(rotSpeed) + player.dirY * Math.cos(rotSpeed);
        const oldPlaneX = player.planeX;
        player.planeX = player.planeX * Math.cos(rotSpeed) - player.planeY * Math.sin(rotSpeed);
        player.planeY = oldPlaneX * Math.sin(rotSpeed) + player.planeY * Math.cos(rotSpeed);
      }

      // Player movement
      let moveX = 0;
      let moveY = 0;
      if (keys['arrowup'] || keys['w']) {
        moveX += player.dirX * moveSpeed;
        moveY += player.dirY * moveSpeed;
      }
      if (keys['arrowdown'] || keys['s']) {
        moveX -= player.dirX * moveSpeed;
        moveY -= player.dirY * moveSpeed;
      }

      // Collision checks with walls
      const newX = player.x + moveX;
      const newY = player.y + moveY;
      const currentCellX = Math.floor(newX);
      const currentCellY = Math.floor(newY);

      if (currentCellX >= 0 && currentCellX < MAP_WIDTH && currentCellY >= 0 && currentCellY < MAP_HEIGHT) {
        const cell = MAP[currentCellY][currentCellX];
        if (cell === 0 || (cell === 2 && exitUnlockedRef.current) || cell >= 3) {
          player.x = newX;
          player.y = newY;
        }

        // Check tape pickup
        if (cell >= 3 && cell <= 5 && !collectedRef.current.has(cell)) {
          collectedRef.current.add(cell);
          const newSet = Array.from(collectedRef.current);
          setTapesCollected(newSet);
          playPickupSound();

          if (newSet.length === 3) {
            exitUnlockedRef.current = true;
            setMessage('ALL 3 TAPES RECOVERED! THE LAST EXIT IS NOW UNLOCKED!');
          } else {
            setMessage(`RECOVERED TAPE 0${cell - 2} / 3. KEEP SEARCHING.`);
          }
        }

        // Check exit door escape
        if (cell === 2 && exitUnlockedRef.current && !escaped) {
          setEscaped(true);
          playWinSound();
        }
      }

      // Clear Screen
      const w = canvas.width;
      const h = canvas.height;

      // Draw Ceiling & Floor
      const ceilingGrad = ctx.createLinearGradient(0, 0, 0, h / 2);
      ceilingGrad.addColorStop(0, '#0f0e0a');
      ceilingGrad.addColorStop(1, '#242217');
      ctx.fillStyle = ceilingGrad;
      ctx.fillRect(0, 0, w, h / 2);

      const floorGrad = ctx.createLinearGradient(0, h / 2, 0, h);
      floorGrad.addColorStop(0, '#2b271a');
      floorGrad.addColorStop(1, '#18150c');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, h / 2, w, h / 2);

      // Raycasting loop
      for (let x = 0; x < w; x++) {
        const cameraX = (2 * x) / w - 1;
        const rayDirX = player.dirX + player.planeX * cameraX;
        const rayDirY = player.dirY + player.planeY * cameraX;

        let mapX = Math.floor(player.x);
        let mapY = Math.floor(player.y);

        const deltaDistX = Math.abs(1 / (rayDirX || 0.0001));
        const deltaDistY = Math.abs(1 / (rayDirY || 0.0001));

        let stepX: number;
        let stepY: number;
        let sideDistX: number;
        let sideDistY: number;

        if (rayDirX < 0) {
          stepX = -1;
          sideDistX = (player.x - mapX) * deltaDistX;
        } else {
          stepX = 1;
          sideDistX = (mapX + 1.0 - player.x) * deltaDistX;
        }

        if (rayDirY < 0) {
          stepY = -1;
          sideDistY = (player.y - mapY) * deltaDistY;
        } else {
          stepY = 1;
          sideDistY = (mapY + 1.0 - player.y) * deltaDistY;
        }

        let hit = 0;
        let side = 0;
        let hitType = 1;

        while (hit === 0) {
          if (sideDistX < sideDistY) {
            sideDistX += deltaDistX;
            mapX += stepX;
            side = 0;
          } else {
            sideDistY += deltaDistY;
            mapY += stepY;
            side = 1;
          }

          if (mapX >= 0 && mapX < MAP_WIDTH && mapY >= 0 && mapY < MAP_HEIGHT) {
            const tile = MAP[mapY][mapX];
            if (tile === 1 || tile === 2 || (tile >= 3 && !collectedRef.current.has(tile))) {
              hit = 1;
              hitType = tile;
            }
          } else {
            hit = 1;
            hitType = 1;
          }
        }

        let perpWallDist: number;
        if (side === 0) {
          perpWallDist = (mapX - player.x + (1 - stepX) / 2) / (rayDirX || 0.0001);
        } else {
          perpWallDist = (mapY - player.y + (1 - stepY) / 2) / (rayDirY || 0.0001);
        }

        const lineHeight = Math.floor(h / (perpWallDist || 0.0001));
        const drawStart = Math.max(0, -lineHeight / 2 + h / 2);
        const drawEnd = Math.min(h - 1, lineHeight / 2 + h / 2);

        // Shading based on distance & orientation (Backrooms Mono-yellow aesthetic)
        const intensity = Math.max(0.08, Math.min(1.0, 1.4 / (perpWallDist + 0.3)));

        if (hitType === 2) {
          // Exit Door: Green exit sign glow
          const exitUnlocked = exitUnlockedRef.current;
          ctx.fillStyle = exitUnlocked
            ? `rgb(${Math.floor(40 * intensity)}, ${Math.floor(220 * intensity)}, ${Math.floor(70 * intensity)})`
            : `rgb(${Math.floor(180 * intensity)}, ${Math.floor(40 * intensity)}, ${Math.floor(30 * intensity)})`;
        } else if (hitType >= 3) {
          // Tape artifact: Amber golden glow
          ctx.fillStyle = `rgb(${Math.floor(255 * intensity)}, ${Math.floor(190 * intensity)}, ${Math.floor(50 * intensity)})`;
        } else {
          // Yellow Backrooms wallpaper
          const rBase = side === 1 ? 190 : 218;
          const gBase = side === 1 ? 165 : 194;
          const bBase = side === 1 ? 80 : 105;
          ctx.fillStyle = `rgb(${Math.floor(rBase * intensity)}, ${Math.floor(gBase * intensity)}, ${Math.floor(bBase * intensity)})`;
        }

        ctx.fillRect(x, drawStart, 1, drawEnd - drawStart);
      }

      // Flashlight Vignette Overlay
      if (flashlightOn) {
        const spotGrad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.7);
        spotGrad.addColorStop(0, 'rgba(255, 245, 190, 0.05)');
        spotGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.25)');
        spotGrad.addColorStop(1, 'rgba(0, 0, 0, 0.88)');
        ctx.fillStyle = spotGrad;
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, w, h);
      }

      // CRT Scanlines
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      for (let y = 0; y < h; y += 4) {
        ctx.fillRect(0, y, w, 1);
      }

      // Minimap in top-right corner
      const mapScale = 4;
      const mmX = w - MAP_WIDTH * mapScale - 16;
      const mmY = 16;

      ctx.fillStyle = 'rgba(20, 19, 15, 0.75)';
      ctx.fillRect(mmX - 2, mmY - 2, MAP_WIDTH * mapScale + 4, MAP_HEIGHT * mapScale + 4);

      for (let my = 0; my < MAP_HEIGHT; my++) {
        for (let mx = 0; mx < MAP_WIDTH; mx++) {
          const t = MAP[my][mx];
          if (t === 1) {
            ctx.fillStyle = '#6b6343';
            ctx.fillRect(mmX + mx * mapScale, mmY + my * mapScale, mapScale, mapScale);
          } else if (t === 2) {
            ctx.fillStyle = exitUnlockedRef.current ? '#44cc55' : '#cc3322';
            ctx.fillRect(mmX + mx * mapScale, mmY + my * mapScale, mapScale, mapScale);
          } else if (t >= 3 && !collectedRef.current.has(t)) {
            ctx.fillStyle = '#ffcc00';
            ctx.fillRect(mmX + mx * mapScale, mmY + my * mapScale, mapScale, mapScale);
          }
        }
      }

      // Player dot on minimap
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(mmX + player.x * mapScale, mmY + player.y * mapScale, 2, 0, Math.PI * 2);
      ctx.fill();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [flashlightOn, escaped, soundEnabled]);

  // Reset exploration
  const restart = () => {
    playerRef.current = {
      x: 1.5,
      y: 1.5,
      dirX: 1,
      dirY: 0,
      planeX: 0,
      planeY: 0.66,
      speed: 0.045,
      rotSpeed: 0.038,
    };
    collectedRef.current.clear();
    exitUnlockedRef.current = false;
    setTapesCollected([]);
    setEscaped(false);
    setMessage('FIND 3 TAPES TO UNLOCK THE LAST EXIT');
  };

  // Mobile virtual button controls
  const handleVirtualPress = (action: string) => {
    keysRef.current[action] = true;
  };
  const handleVirtualRelease = (action: string) => {
    keysRef.current[action] = false;
  };

  return (
    <div className="game-wrapper film-grain">
      {/* Top Game Bar */}
      <div className="game-top-bar">
        <div className="game-status-left">
          <Link href="/" className="button button-outline button-small">
            <ArrowLeft size={14} /> Exit to Menu
          </Link>
          <span className="live-pip" />
          <span className="game-rec-text">REC 00:03:42 // LEVEL 0 LIVE SIMULATION</span>
        </div>

        <div className="game-attribution-badge">
          <Award size={14} className="gold-accent" />
          <span>GAME DESIGNED &amp; DEVELOPED BY <strong>MOHAMMED DANSEER Z</strong></span>
        </div>

        <div className="game-status-right">
          <button
            className={`button button-small ${soundEnabled ? 'button-primary' : 'button-outline'}`}
            onClick={toggleSound}
            aria-label="Toggle Sound"
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>{soundEnabled ? 'HUM ON' : 'HUM OFF'}</span>
          </button>
          <button
            className={`button button-small ${flashlightOn ? 'button-primary' : 'button-outline'}`}
            onClick={() => setFlashlightOn((v) => !v)}
            aria-label="Toggle Flashlight"
          >
            <Flashlight size={14} />
            <span>{flashlightOn ? 'LIGHT ON' : 'LIGHT OFF'}</span>
          </button>
        </div>
      </div>

      {/* Main 3D Canvas Viewport */}
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          width={640}
          height={380}
          className="game-canvas"
          aria-label="The Backrooms Level 0 Exploration Viewport"
        />

        {/* In-game HUD */}
        <div className="game-hud">
          <div className="hud-top-left">
            <div className="hud-tape-counter">
              <span className="hud-label">EVIDENCE TAPES RECOVERED:</span>
              <div className="hud-tapes">
                {[1, 2, 3].map((num) => {
                  const hasTape = tapesCollected.includes(num + 2);
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
            </div>
            <div className="hud-message">{message}</div>
          </div>

          <div className="hud-bottom-bar">
            <div className="hud-instructions">
              <span><b>[W,A,S,D]</b> Walk &amp; Turn</span>
              <span><b>[SHIFT]</b> Run</span>
              <span><b>[F]</b> Flashlight</span>
            </div>
            <div className="hud-credits-pill">
              <Link href="/credits" className="hud-credits-link">
                VIEW GAME CREDITS (/credits)
              </Link>
            </div>
          </div>
        </div>

        {/* Victory Screen Modal */}
        {escaped && (
          <div className="victory-overlay">
            <div className="victory-card paper-shadow">
              <div className="victory-icon"><Trophy size={42} /></div>
              <h2>YOU FOUND THE LAST EXIT!</h2>
              <p className="victory-subtitle">
                Level 0 escaped with all 3 recovered tapes intact.
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

      {/* Mobile Touch Controller (Visible on touch/small devices) */}
      <div className="mobile-touch-controls">
        <div className="touch-group-dpad">
          <button
            className="touch-btn touch-up"
            onPointerDown={() => handleVirtualPress('w')}
            onPointerUp={() => handleVirtualRelease('w')}
            onPointerLeave={() => handleVirtualRelease('w')}
          >
            ▲
          </button>
          <div className="touch-mid-row">
            <button
              className="touch-btn touch-left"
              onPointerDown={() => handleVirtualPress('a')}
              onPointerUp={() => handleVirtualRelease('a')}
              onPointerLeave={() => handleVirtualRelease('a')}
            >
              ◄
            </button>
            <button
              className="touch-btn touch-down"
              onPointerDown={() => handleVirtualPress('s')}
              onPointerUp={() => handleVirtualRelease('s')}
              onPointerLeave={() => handleVirtualRelease('s')}
            >
              ▼
            </button>
            <button
              className="touch-btn touch-right"
              onPointerDown={() => handleVirtualPress('d')}
              onPointerUp={() => handleVirtualRelease('d')}
              onPointerLeave={() => handleVirtualRelease('d')}
            >
              ►
            </button>
          </div>
        </div>

        <div className="touch-group-actions">
          <button
            className="touch-btn touch-action"
            onClick={() => setFlashlightOn((v) => !v)}
          >
            <Flashlight size={16} />
          </button>
          <button
            className="touch-btn touch-action"
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
