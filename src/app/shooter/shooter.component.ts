import {
  Component,
  ElementRef,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
  Ticker,
} from 'pixi.js';

@Component({
  selector: 'app-shooter',
  standalone: true,
  templateUrl: './shooter.component.html',
  styleUrl: './shooter.component.scss',
})
export class ShooterComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameHost', { static: true }) hostRef!: ElementRef<HTMLDivElement>;

  // HUD (signals)
  private _score = signal(0);
  private _lives = signal(3);
  score = computed(() => this._score());
  lives = computed(() => this._lives());

  isTouch = 'ontouchstart' in window;

  // Pixi
  private app!: Application;
  private gameLayer!: Container;
  private idleTexture!: Texture;
  private shootTexture!: Texture;
  private rightTexture!: Texture;
  private leftTexture!: Texture;
  private player!: Sprite & { speed: number; isAlive: boolean };
  private gameOverText!: Text | null;

  // state
  private running = false;
  private bullets: Graphics[] = [];
  private enemies: (Graphics & { radius: number; vy: number })[] = [];
  private lastEnemySpawn = 0;
  private enemySpawnInterval = 900; // ms
  private lastShot = 0;
  private shotInterval = 220; // ms

  private keys: Record<string, boolean> = {};

  async ngAfterViewInit(): Promise<void> {
    this.app = new Application();
    await this.app.init({
      width: Math.min(window.innerWidth, 1024),
      height: Math.min(window.innerHeight, 768),
      background: 0x071024,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    this.hostRef.nativeElement.appendChild(this.app.canvas);

    this.gameLayer = new Container();
    this.app.stage.addChild(this.gameLayer);

    // ✅ Preload textures with Assets.load
    const [idle, shoot, right, left] = await Promise.all([
      Assets.load('assets/sprites/idle.png'),
      Assets.load('assets/sprites/shoot.png'),
      Assets.load('assets/sprites/right.png'),
      Assets.load('assets/sprites/left.png'),
    ]);
    this.idleTexture = idle;
    this.shootTexture = shoot;
    this.rightTexture = right;
    this.leftTexture = left;

    // HUD instruction text
    const instr = new Text(
      '← / → to move • Space to shoot',
      new TextStyle({ fontSize: 16, fill: '#cfe8ff' })
    );
    instr.x = 12;
    instr.y = this.app.renderer.height - 28;
    instr.anchor.set(0, 0.5);
    this.app.stage.addChild(instr);

    // Input listeners
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.app.ticker.add(this.tick);

    this.initPlayer();
    this.running = false;
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.app?.ticker?.remove(this.tick);
    this.app?.destroy(true);
  }

  // Template API
  start(): void {
    this.bullets.forEach((b) => this.gameLayer.removeChild(b));
    this.bullets = [];
    this.enemies.forEach((e) => this.gameLayer.removeChild(e));
    this.enemies = [];
    this.gameOverText && this.app.stage.removeChild(this.gameOverText);
    this._score.set(0);
    this._lives.set(3);
    this.lastEnemySpawn = performance.now();
    this.enemySpawnInterval = 900;

    this.running = true;
  }

  press(which: 'left' | 'right' | 'shoot', down: boolean): void {
    if (which === 'left') this.keys['ArrowLeft'] = down;
    if (which === 'right') this.keys['ArrowRight'] = down;
    if (which === 'shoot') this.keys['Space'] = down;
  }

  // ---- Pixi helpers ----
  private initPlayer() {
    if (this.player) this.gameLayer.removeChild(this.player);
    const s = new Sprite(this.idleTexture);
    s.anchor.set(0.5);
    s.x = this.app.renderer.width / 2;
    s.y = this.app.renderer.height - 80;
    (s as any).speed = 6;
    (s as any).isAlive = true;
    this.player = s as any;
    this.gameLayer.addChild(this.player);
  }

  private makeEnemy(x: number, y: number, radius = 14) {
    const g = new Graphics();
    g.beginFill(0xff8a80);
    g.drawCircle(0, 0, radius);
    g.endFill();
    g.x = x;
    g.y = y;
    (g as any).radius = radius;
    (g as any).vy = 1.2 + Math.random() * 1.6;
    return g as Graphics & { radius: number; vy: number };
  }

  private makeBullet(x: number, y: number) {
    const g = new Graphics();
    g.beginFill(0xfff59d);
    g.drawRect(-3, -10, 6, 12);
    g.endFill();
    g.x = x;
    g.y = y;
    (g as any).vy = -8;
    return g as Graphics & { vy: number };
  }

  private addScore(n: number) {
    this._score.update((v) => v + n);
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
      `Game Over\nScore: ${this._score()}\nPress Start to play again`,
      style
    );
    this.gameOverText.anchor.set(0.5);
    this.gameOverText.x = this.app.renderer.width / 2;
    this.gameOverText.y = this.app.renderer.height / 2;
    this.app.stage.addChild(this.gameOverText);
  }

  private loseLife() {
    const next = Math.max(0, this._lives() - 1);
    this._lives.set(next);
    if (next <= 0) {
      this.running = false;
      this.showGameOver();
    }
  }

  private explodePlayer() {
    if (!this.player) return;
    (this.player as any).isAlive = false;
    let flashes = 0;
    const blink = setInterval(() => {
      this.player.visible = !this.player.visible;
      flashes++;
      if (flashes > 6) {
        clearInterval(blink);
        this.player.visible = true;
        (this.player as any).isAlive = true;
        this.player.x = this.app.renderer.width / 2;
        this.loseLife();
      }
    }, 120);
  }

  // ---- events ----
  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onResize = () => {
    const newW = Math.min(window.innerWidth, 1024);
    const newH = Math.min(window.innerHeight, 768);
    this.app.renderer.resize(newW, newH);
    if (this.player) this.player.y = this.app.renderer.height - 80;
  };

  private onVisibility = () => {
    this.running = !document.hidden && this._lives() > 0;
  };

  private tick = (ticker: Ticker) => {
    if (!this.running) return;
    const delta = ticker.deltaTime;
    const now = performance.now();

    if (this.player && (this.player as any).isAlive) {
      if (this.keys['ArrowLeft'] || this.keys['KeyA']){
        this.player.x -= (this.player as any).speed * delta;
        this.player.x = Math.max(16, Math.min(this.app.renderer.width - 16, this.player.x));
        this.player.texture = this.leftTexture;
        setTimeout(() => {
          this.player.texture = this.idleTexture;
        }, 120);
    }
      if (this.keys['ArrowRight'] || this.keys['KeyD']) {
        this.player.x += (this.player as any).speed * delta;
        this.player.x = Math.max(16, Math.min(this.app.renderer.width - 16, this.player.x));
        this.player.texture = this.rightTexture;
        setTimeout(() => {
          this.player.texture = this.idleTexture;
        }, 120);
      }
      // Shooting → swap to shoot texture briefly
      if (
        (this.keys['Space'] || this.keys['KeyW'] || this.keys['ArrowUp']) &&
        now - this.lastShot > this.shotInterval
      ) {
        const b = this.makeBullet(this.player.x, this.player.y - 16);
        this.bullets.push(b);
        this.gameLayer.addChild(b);
        this.lastShot = now;

        this.player.texture = this.shootTexture;
        setTimeout(() => {
          this.player.texture = this.idleTexture;
        }, 120);
      }
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b: any = this.bullets[i];
      b.y += b.vy * delta;
      if (b.y < -20) {
        this.gameLayer.removeChild(b);
        this.bullets.splice(i, 1);
      }
    }

    if (now - this.lastEnemySpawn > this.enemySpawnInterval) {
      this.lastEnemySpawn = now;
      const x = 20 + Math.random() * (this.app.renderer.width - 40);
      const e = this.makeEnemy(x, -20, 12 + Math.random() * 10);
      this.enemies.push(e);
      this.gameLayer.addChild(e);
      this.enemySpawnInterval = Math.max(500, this.enemySpawnInterval - 8);
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e: any = this.enemies[i];
      e.y += e.vy * delta;
      if (e.y > this.app.renderer.height + 30) {
        this.gameLayer.removeChild(e);
        this.enemies.splice(i, 1);
        this.loseLife();
        continue;
      }

      for (let j = this.bullets.length - 1; j >= 0; j--) {
        const b: any = this.bullets[j];
        const dx = b.x - e.x,
          dy = b.y - e.y;
        if (dx * dx + dy * dy < (e.radius + 6) * (e.radius + 6)) {
          this.gameLayer.removeChild(e);
          this.gameLayer.removeChild(b);
          this.enemies.splice(i, 1);
          this.bullets.splice(j, 1);
          this.addScore(10);
          break;
        }
      }

      if (this.player && (this.player as any).isAlive) {
        const dx = this.player.x - e.x,
          dy = this.player.y - e.y;
        const pr = 12;
        if (dx * dx + dy * dy < (pr + e.radius) * (pr + e.radius)) {
          this.gameLayer.removeChild(e);
          this.enemies.splice(i, 1);
          this.explodePlayer();
        }
      }
    }
  };
}
