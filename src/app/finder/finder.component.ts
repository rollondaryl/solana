import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild, signal, computed } from '@angular/core';
import {
  Application,
  Container,
  Assets,
  Sprite,
  Graphics,
  Text,
  TextStyle,
  Texture,
  Ticker,
} from 'pixi.js';

@Component({
  selector: 'app-finder',
  standalone: true,
  templateUrl: './finder.component.html',
  styleUrl: './finder.component.scss',
})
export class FinderComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameHost', { static: true }) hostRef!: ElementRef<HTMLDivElement>;

  // Pixi
  private app!: Application;
  private gameLayer!: Container;

  // Player + Target
  private player!: Sprite & { speed: number; isAlive: boolean };
  private target!: Sprite | Graphics;

  // Textures
  private playerTexture!: Texture | null;
  private targetTexture!: Texture | null;

  // Game state
  private running = false;
  private keys: Record<string, boolean> = {};
  private gameOverText: Text | null = null;

  // 60s timer
  private roundMs = 60_000;
  private startTime = 0;

  // HUD (Angular signals)
  private _found = signal(0);
  private _timeLeft = signal('60.0');
  found = computed(() => this._found());
  timeLeft = computed(() => this._timeLeft());

  // ===== Lifecycle =====
  async ngAfterViewInit(): Promise<void> {
    // Pixi v7: create + init (async)
    this.app = new Application();
    await this.app.init({
      width: Math.min(window.innerWidth, 1024),
      height: Math.min(window.innerHeight, 768),
      background: 0x071024,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // v7: append canvas (not view)
    this.hostRef.nativeElement.appendChild(this.app.canvas);

    this.gameLayer = new Container();
    this.app.stage.addChild(this.gameLayer);

    // HUD instructions
    const instr = new Text(
      '← / → / ↑ / ↓ to move — find as many targets as you can in 60s',
      new TextStyle({ fontSize: 16, fill: '#cfe8ff' })
    );
    instr.x = 12;
    instr.y = this.app.renderer.height - 28;
    instr.anchor.set(0, 0.5);
    this.app.stage.addChild(instr);

    // Inputs
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);

    // v7 ticker: callback receives Ticker
    this.app.ticker.add(this.tick);

    // --- Load assets (v7 Assets API) ---
    // Prefer relative paths to be safe with GitHub Pages base-href
    const src = (p: string) => `./${p}`;
    Assets.add({ alias: 'player', src: src('assets/sprites/idle.png') });
    Assets.add({ alias: 'target', src: src('assets/sprites/target.png') });

    const [playerTex, targetTex] = await Promise.all([
      Assets.load<Texture>('player').catch(() => null),
      Assets.load<Texture>('target').catch(() => null),
    ]);

    this.playerTexture = playerTex;
    this.targetTexture = targetTex;

    this.initScene();
    this.running = false; // wait for Start
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.app?.ticker?.remove(this.tick);
    this.app?.destroy(true);
  }

  // ===== UI =====
  start(): void {
    this._found.set(0);
    this._timeLeft.set('60.0');
    this.startTime = performance.now();
    this.running = true;

    if (this.gameOverText) {
      this.app.stage.removeChild(this.gameOverText);
      this.gameOverText = null;
    }

    this.centerPlayer();
    this.placeTargetRandom();
  }

  // ===== Setup helpers =====
  private initScene() {
    // Player
    if (this.player) this.gameLayer.removeChild(this.player);
    if (this.playerTexture) {
      const s = new Sprite(this.playerTexture);
      s.anchor.set(0.5);
      (s as any).speed = 4;
      (s as any).isAlive = true;
      this.player = s as any;
    } else {
      // Fallback triangle
      const g = new Graphics();
      g.beginFill(0x6ad1ff);
      g.drawPolygon([0, -18, 12, 12, -12, 12]);
      g.endFill();
      (g as any).speed = 4;
      (g as any).isAlive = true;
      this.player = g as any;
    }
    this.centerPlayer();
    this.gameLayer.addChild(this.player);

    // Target
    if (this.target) this.gameLayer.removeChild(this.target);
    if (this.targetTexture) {
      const t = new Sprite(this.targetTexture);
      t.anchor.set(0.5);
      this.target = t;
    } else {
      const c = new Graphics();
      c.beginFill(0xffe082);
      c.drawCircle(0, 0, 12);
      c.endFill();
      this.target = c;
    }
    this.placeTargetRandom();
    this.gameLayer.addChild(this.target);
  }

  private centerPlayer() {
    this.player.x = this.app.renderer.width / 2;
    this.player.y = this.app.renderer.height / 2;
  }

  private placeTargetRandom() {
    const pad = 24;
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    let x = pad + Math.random() * (w - pad * 2);
    let y = pad + Math.random() * (h - pad * 2);

    // keep distance from player
    const dx = x - this.player.x;
    const dy = y - this.player.y;
    if (dx * dx + dy * dy < 90 * 90) {
      x = w - x;
      y = h - y;
    }
    this.target.x = x;
    this.target.y = y;
  }

  private showGameOver() {
    const style = new TextStyle({
      fontFamily: 'Arial',
      fontSize: 36,
      fill: '#ffffff',
      stroke: '#000000',
      align: 'center',
    });
    this.gameOverText = new Text(
      `Time Up!\nFound: ${this._found()}\nPress Start to play again`,
      style
    );
    this.gameOverText.anchor.set(0.5);
    this.gameOverText.x = this.app.renderer.width / 2;
    this.gameOverText.y = this.app.renderer.height / 2;
    this.app.stage.addChild(this.gameOverText);
  }

  // ===== Events =====
  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };
  private onVisibility = () => {
    this.running = !document.hidden && this.remainingMs() > 0;
  };
  private onResize = () => {
    const w = Math.min(window.innerWidth, 1024);
    const h = Math.min(window.innerHeight, 768);
    this.app.renderer.resize(w, h);
    if (this.gameOverText) {
      this.gameOverText.x = this.app.renderer.width / 2;
      this.gameOverText.y = this.app.renderer.height / 2;
    }
  };

  // ===== Timer helpers =====
  private remainingMs(): number {
    if (!this.running && this.startTime === 0) return this.roundMs;
    const elapsed = Math.max(0, performance.now() - this.startTime);
    return Math.max(0, this.roundMs - elapsed);
    }

  private updateTimerHUD() {
    const ms = this.remainingMs();
    this._timeLeft.set((ms / 1000).toFixed(1));
  }

  // ===== Main loop (v7) =====
  private tick = (ticker: Ticker) => {
    if (this.running) {
      this.updateTimerHUD();
      if (this.remainingMs() <= 0) {
        this.running = false;
        this.showGameOver();
        return;
      }
    }
    if (!this.running) return;

    const delta = ticker.deltaTime;
    const speed = (this.player as any).speed || 4;

    // Movement
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) this.player.x -= speed * delta;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) this.player.x += speed * delta;
    if (this.keys['ArrowUp'] || this.keys['KeyW']) this.player.y -= speed * delta;
    if (this.keys['ArrowDown'] || this.keys['KeyS']) this.player.y += speed * delta;

    // Clamp
    this.player.x = Math.max(12, Math.min(this.app.renderer.width - 12, this.player.x));
    this.player.y = Math.max(12, Math.min(this.app.renderer.height - 12, this.player.y));

    // Collision with target
    const dx = this.player.x - this.target.x;
    const dy = this.player.y - this.target.y;
    const r = 20; // hit radius
    if (dx * dx + dy * dy < r * r) {
      this._found.update((v) => v + 1);
      this.placeTargetRandom();
    }
  };
}
