import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { BaseScene } from "./BaseScene";
import { GameEvent } from "../core/EventBus";
import { Player } from "../entities/Player";
import type { SceneName } from "../core/SceneManager";

interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  type: "wood" | "pipe" | "concrete" | "broken" | "moving";
  graphics: Graphics;
  moveRange?: number;
  moveSpeed?: number;
  moveOffset?: number;
  moveDirection?: number;
}

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  type: "spike" | "fire" | "electric" | "smoke";
  graphics: Graphics;
  active: boolean;
  timer?: number;
}

export class PlatformScene extends BaseScene {
  // Игрок
  private player!: Player;

  // Окружение
  private background!: Container;
  private platformContainer!: Container;
  private platforms: Platform[] = [];
  private obstacles: Obstacle[] = [];
  private goalZone!: Graphics;

  // Эффекты
  private fogEffect!: Graphics;
  private dustParticles: Graphics[] = [];
  private dangerZone!: Graphics;

  // HUD
  private hudContainer!: Container;
  private objectiveText!: Text;
  private distanceText!: Text;
  private warningText!: Text;

  // Камера
  private cameraOffset: { x: number; y: number } = { x: 0, y: 0 };
  private cameraTarget: { x: number; y: number } = { x: 0, y: 0 };

  // Состояния
  private isLevelComplete: boolean = false;
  private isPlayerDead: boolean = false;
  private levelLength: number = 3000;
  private playerStartX: number = 100;
  private playerStartY: number = 400;

  // Физика (упрощённая)
  private gravity: number = 0.5;
  private playerVelocityY: number = 0;
  private isOnGround: boolean = false;

  protected getSceneName(): SceneName {
    return "platform";
  }

  protected async preload(): Promise<void> {
    // Ресурсы загружены централизованно
  }

  protected setup(): void {
    this.createBackground();
    this.createPlatforms();
    this.createObstacles();
    this.createGoalZone();
    this.createPlayer();
    this.createEffects();
    this.createHUD();

    // Начальное состояние
    this.alpha = 0;
  }

  protected bindEvents(): void {
    // Управление игроком
    this.inputManager.onKeyDown("ArrowLeft", () => this.movePlayer(-1, 0));
    this.inputManager.onKeyDown("ArrowRight", () => this.movePlayer(1, 0));
    this.inputManager.onKeyDown("ArrowUp", () => this.jumpPlayer());
    this.inputManager.onKeyDown(" ", (event) => {
      event?.preventDefault();
      this.jumpPlayer();
    });

    // Пауза
    this.inputManager.onKeyDown("Escape", this.onEscape.bind(this));

    // События игрока
    this.eventBus.on(GameEvent.PLAYER_DEATH, this.onPlayerDeath.bind(this));
    // this.eventBus.on(GameEvent.PLAYER_DAMAGE, this.onPlayerDamage.bind(this));
  }

  protected async onEnter(): Promise<void> {
    // Музыка геймплея
    this.audioManager.stopCategory("ambient", 500);
    this.audioManager.playMusic("gameplay-music", {
      volume: 0.4,
      fadeIn: 1000,
    });

    // Эмбиент
    this.audioManager.playAmbient("wind-ambient", {
      volume: 0.2,
    });

    // Анимация появления
    await this.fadeIn(1000);

    // Показываем подсказку
    await this.showObjective();
  }

  public update(delta: number): void {
    if (this.isPlayerDead || this.isLevelComplete) return;

    // Обновление игрока
    this.updatePlayer(delta);

    // Обновление платформ
    this.updatePlatforms(delta);

    // Обновление препятствий
    this.updateObstacles(delta);

    // Обновление камеры
    this.updateCamera(delta);

    // Обновление эффектов
    this.updateEffects(delta);

    // Проверка столкновений
    this.checkCollisions();

    // Проверка достижения цели
    this.checkGoalReached();

    // Обновление HUD
    this.updateHUD();
  }

  /**
   * Создание фона
   */
  private createBackground(): void {
    this.background = new Container();

    // Небо
    const sky = new Graphics();
    sky.rect(0, 0, 4000, 720);
    sky.fill({ color: 0x1a0a2e });

    // Градиент неба
    for (let i = 0; i < 400; i++) {
      const progress = i / 400;
      const color = this.lerpColor(0xff4400, 0x1a0a2e, progress);
      sky.rect(0, i, 4000, 1);
      sky.fill({ color, alpha: 0.5 });
    }

    this.background.addChild(sky);

    // Здания на заднем плане
    for (let i = 0; i < 20; i++) {
      const building = this.createBackgroundBuilding(
        i * 200 + Math.random() * 100,
        300 + Math.random() * 200,
      );
      this.background.addChild(building);
    }

    // Дым на заднем плане
    for (let i = 0; i < 10; i++) {
      const smoke = this.createSmokeParticle(
        Math.random() * 4000,
        200 + Math.random() * 300,
      );
      this.background.addChild(smoke);
    }

    this.addChild(this.background);
  }

  /**
   * Создание здания на заднем плане
   */
  private createBackgroundBuilding(x: number, height: number): Graphics {
    const building = new Graphics();
    building.rect(x, 400 - height, 60, height);
    building.fill({ color: 0x111111, alpha: 0.8 });

    // Окна
    for (let wy = 400 - height + 10; wy < 390; wy += 20) {
      for (let wx = x + 5; wx < x + 55; wx += 15) {
        if (Math.random() > 0.4) {
          building.rect(wx, wy, 6, 10);
          building.fill({ color: 0xff6600, alpha: 0.3 });
        }
      }
    }

    return building;
  }

  /**
   * Создание платформ
   */
  private createPlatforms(): void {
    this.platformContainer = new Container();

    // Стартовая платформа
    this.createPlatform(0, 450, 200, 20, "concrete");

    // Основной путь из платформ
    const platformData = [
      { x: 250, y: 400, w: 120, h: 15, type: "wood" as const },
      { x: 420, y: 350, w: 100, h: 15, type: "pipe" as const },
      { x: 560, y: 380, w: 80, h: 15, type: "broken" as const },
      { x: 680, y: 300, w: 150, h: 15, type: "wood" as const },
      { x: 880, y: 350, w: 120, h: 15, type: "pipe" as const },
      { x: 1050, y: 280, w: 100, h: 15, type: "concrete" as const },
      {
        x: 1200,
        y: 330,
        w: 80,
        h: 15,
        type: "moving" as const,
        moveRange: 100,
      },
      { x: 1330, y: 380, w: 120, h: 15, type: "wood" as const },
      { x: 1500, y: 320, w: 100, h: 15, type: "pipe" as const },
      { x: 1650, y: 400, w: 150, h: 15, type: "broken" as const },
      { x: 1850, y: 350, w: 120, h: 15, type: "wood" as const },
      {
        x: 2020,
        y: 280,
        w: 100,
        h: 15,
        type: "moving" as const,
        moveRange: 80,
      },
      { x: 2170, y: 320, w: 80, h: 15, type: "pipe" as const },
      { x: 2300, y: 380, w: 150, h: 15, type: "concrete" as const },
      { x: 2500, y: 420, w: 120, h: 15, type: "wood" as const },
      { x: 2670, y: 370, w: 100, h: 15, type: "broken" as const },
      { x: 2820, y: 400, w: 200, h: 20, type: "concrete" as const },
    ];

    platformData.forEach((data) => {
      this.createPlatform(
        data.x,
        data.y,
        data.w,
        data.h,
        data.type,
        data.moveRange,
      );
    });

    // Вертикальные трубы (по которым можно карабкаться)
    this.createVerticalPipe(400, 350, 200);
    this.createVerticalPipe(900, 280, 180);
    this.createVerticalPipe(1600, 300, 200);
    this.createVerticalPipe(2200, 320, 180);

    this.addChild(this.platformContainer);
  }

  /**
   * Создание отдельной платформы
   */
  private createPlatform(
    x: number,
    y: number,
    width: number,
    height: number,
    type: Platform["type"],
    moveRange?: number,
  ): void {
    const graphics = new Graphics();

    switch (type) {
      case "wood":
        // Деревянные доски
        graphics.rect(0, 0, width, height);
        graphics.fill({ color: 0x8b4513 });
        graphics.stroke({ width: 2, color: 0x654321 });

        // Текстура досок
        for (let i = 0; i < width; i += 20) {
          graphics.rect(i, 0, 2, height);
          graphics.fill({ color: 0x754321, alpha: 0.5 });
        }
        break;

      case "pipe":
        // Металлические трубы
        graphics.roundRect(0, 0, width, height, height / 2);
        graphics.fill({ color: 0x666666 });
        graphics.stroke({ width: 1, color: 0x888888 });

        // Блики на трубах
        graphics.rect(5, 2, width - 10, height / 3);
        graphics.fill({ color: 0x999999, alpha: 0.3 });
        break;

      case "concrete":
        // Бетонные блоки
        graphics.rect(0, 0, width, height);
        graphics.fill({ color: 0x555555 });
        graphics.stroke({ width: 2, color: 0x666666 });

        // Трещины
        for (let i = 0; i < 3; i++) {
          const cx = Math.random() * width;
          graphics.moveTo(cx, 0);
          graphics.lineTo(cx + Math.random() * 20 - 10, height);
          graphics.stroke({ width: 1, color: 0x444444 });
        }
        break;

      case "broken":
        // Разрушенные платформы
        graphics.rect(0, 0, width, height);
        graphics.fill({ color: 0x8b4513, alpha: 0.7 });
        graphics.stroke({ width: 1, color: 0xff0000 });

        // Дыры
        for (let i = 0; i < 5; i++) {
          const hx = Math.random() * width;
          graphics.circle(hx, height / 2, Math.random() * 5 + 3);
          graphics.fill({ color: 0x000000, alpha: 0.5 });
        }
        break;

      case "moving":
        // Движущиеся платформы
        graphics.rect(0, 0, width, height);
        graphics.fill({ color: 0x4444ff });
        graphics.stroke({ width: 2, color: 0x6666ff });

        // Индикатор движения
        graphics.moveTo(width / 2, 0);
        graphics.lineTo(width / 2, -10);
        graphics.stroke({ width: 2, color: 0x6666ff });
        break;
    }

    graphics.position.set(x, y);
    this.platformContainer.addChild(graphics);

    const platform: Platform = {
      x,
      y,
      width,
      height,
      type,
      graphics,
      moveRange: moveRange || 0,
      moveSpeed: 0.5 + Math.random(),
      moveOffset: 0,
      moveDirection: 1,
    };

    this.platforms.push(platform);
  }

  /**
   * Создание вертикальной трубы
   */
  private createVerticalPipe(x: number, y: number, height: number): void {
    const pipe = new Graphics();
    pipe.roundRect(0, 0, 15, height, 7);
    pipe.fill({ color: 0x666666 });
    pipe.stroke({ width: 2, color: 0x888888 });
    pipe.position.set(x, y);

    this.platformContainer.addChild(pipe);
  }

  /**
   * Создание препятствий
   */
  private createObstacles(): void {
    const obstacleData = [
      { x: 350, y: 440, type: "spike" as const },
      { x: 600, y: 340, type: "fire" as const },
      { x: 750, y: 430, type: "electric" as const },
      { x: 1000, y: 440, type: "smoke" as const },
      { x: 1300, y: 330, type: "spike" as const },
      { x: 1550, y: 440, type: "fire" as const },
      { x: 1900, y: 340, type: "electric" as const },
      { x: 2100, y: 430, type: "smoke" as const },
      { x: 2400, y: 440, type: "spike" as const },
      { x: 2700, y: 350, type: "fire" as const },
    ];

    obstacleData.forEach((data) => {
      const graphics = new Graphics();

      switch (data.type) {
        case "spike":
          // Шипы
          for (let i = 0; i < 5; i++) {
            graphics.moveTo(i * 20, 30);
            graphics.lineTo(i * 20 + 10, 0);
            graphics.lineTo(i * 20 + 20, 30);
            graphics.fill({ color: 0xff0000 });
          }
          break;

        case "fire":
          // Огонь
          graphics.circle(15, 15, 15);
          graphics.fill({ color: 0xff4400, alpha: 0.8 });
          graphics.circle(15, 15, 10);
          graphics.fill({ color: 0xffaa00, alpha: 0.6 });
          break;

        case "electric":
          // Электричество
          for (let i = 0; i < 3; i++) {
            graphics.moveTo(5 + i * 10, 30);
            graphics.lineTo(10 + i * 10, 15);
            graphics.lineTo(15 + i * 10, 25);
            graphics.lineTo(20 + i * 10, 0);
            graphics.stroke({ width: 2, color: 0x00ffff });
          }
          break;

        case "smoke":
          // Ядовитый дым
          for (let i = 0; i < 3; i++) {
            graphics.circle(10 + i * 15, 15, 12);
            graphics.fill({ color: 0x88ff00, alpha: 0.4 });
          }
          break;
      }

      graphics.position.set(data.x, data.y);
      this.platformContainer.addChild(graphics);

      this.obstacles.push({
        x: data.x,
        y: data.y,
        width: 60,
        height: 30,
        type: data.type,
        graphics,
        active: true,
        timer: Math.random() * Math.PI * 2,
      });
    });
  }

  /**
   * Создание зоны цели
   */
  private createGoalZone(): void {
    this.goalZone = new Graphics();
    this.goalZone.rect(2820, 370, 200, 50);
    this.goalZone.fill({ color: 0x00ff00, alpha: 0.2 });
    this.goalZone.stroke({ width: 2, color: 0x00ff00 });

    // Стрелка вниз
    this.goalZone.moveTo(2920, 385);
    this.goalZone.lineTo(2900, 405);
    this.goalZone.lineTo(2940, 405);
    this.goalZone.fill({ color: 0x00ff00 });

    this.platformContainer.addChild(this.goalZone);
  }

  /**
   * Создание игрока
   */
  private createPlayer(): void {
    this.player = new Player(this.eventBus);
    this.player.position.set(this.playerStartX, this.playerStartY);
    this.platformContainer.addChild(this.player);
  }

  /**
   * Создание эффектов
   */
  private createEffects(): void {
    // Туман
    this.fogEffect = new Graphics();
    this.addChild(this.fogEffect);

    // Частицы пыли
    for (let i = 0; i < 30; i++) {
      const particle = this.createDustParticle();
      this.dustParticles.push(particle);
      this.platformContainer.addChild(particle);
    }

    // Опасная зона (красный низ экрана)
    this.dangerZone = new Graphics();
    this.dangerZone.rect(0, 500, 4000, 220);
    this.dangerZone.fill({ color: 0xff0000, alpha: 0.1 });
    this.platformContainer.addChild(this.dangerZone);
  }

  /**
   * Создание частицы пыли
   */
  private createDustParticle(): Graphics {
    const particle = new Graphics();
    particle.circle(0, 0, Math.random() * 2 + 1);
    particle.fill({ color: 0x888888, alpha: 0.3 });
    particle.x = Math.random() * this.levelLength;
    particle.y = Math.random() * 500;
    return particle;
  }

  /**
   * Создание HUD
   */
  private createHUD(): void {
    this.hudContainer = new Container();

    // Цель
    this.objectiveText = new Text({
      text: "Доберитесь до станции",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 14,
        fill: 0xff6600,
      }),
    });
    this.objectiveText.position.set(20, 20);

    // Дистанция
    this.distanceText = new Text({
      text: "Дистанция: 0м",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 12,
        fill: 0xffffff,
      }),
    });
    this.distanceText.position.set(20, 50);

    // Предупреждение
    this.warningText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 16,
        fill: 0xff0000,
      }),
    });
    this.warningText.anchor.set(0.5);
    this.warningText.position.set(640, 360);
    this.warningText.visible = false;

    this.hudContainer.addChild(
      this.objectiveText,
      this.distanceText,
      this.warningText,
    );
    this.addChild(this.hudContainer);
  }

  /**
   * Показ цели
   */
  private async showObjective(): Promise<void> {
    this.objectiveText.alpha = 0;

    const duration = 1000;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        this.objectiveText.alpha = progress;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setTimeout(() => {
            // Скрываем через 3 секунды
            const fadeOut = () => {
              this.objectiveText.alpha -= 0.02;
              if (this.objectiveText.alpha > 0) {
                requestAnimationFrame(fadeOut);
              }
            };
            setTimeout(fadeOut, 3000);
          }, 0);
          resolve();
        }
      };
      animate();
    });
  }

  /**
   * Движение игрока
   */
  private movePlayer(dx: number, dy: number): void {
    if (this.isPlayerDead || this.isLevelComplete) return;

    const speed = 5;
    this.player.x += dx * speed;
    this.player.y += dy * speed;

    // Ограничение движения
    this.player.x = Math.max(0, Math.min(this.levelLength, this.player.x));
    this.player.y = Math.max(0, Math.min(500, this.player.y));

    // Обновление цели камеры
    this.cameraTarget.x = this.player.x - 400;
    this.cameraTarget.y = this.player.y - 300;
  }

  /**
   * Прыжок игрока
   */
  private jumpPlayer(): void {
    if (this.isPlayerDead || this.isLevelComplete) return;
    if (!this.isOnGround) return;

    this.playerVelocityY = -12;
    this.isOnGround = false;

    this.audioManager.playSFX("jump-sound", { volume: 0.3 });
  }

  /**
   * Обновление игрока
   */
  private updatePlayer(delta: number): void {
    // Гравитация
    this.playerVelocityY += this.gravity * delta;
    this.player.y += this.playerVelocityY;

    // Проверка падения
    if (this.player.y > 550) {
      this.killPlayer("fall");
    }

    // Анимация игрока
    this.player.update(delta);
  }

  /**
   * Обновление платформ
   */
  private updatePlatforms(delta: number): void {
    this.platforms.forEach((platform) => {
      if (platform.type === "moving") {
        platform.moveOffset +=
          platform.moveSpeed * delta * platform.moveDirection;

        if (Math.abs(platform.moveOffset) > platform.moveRange) {
          platform.moveDirection *= -1;
        }

        platform.graphics.x = platform.x + platform.moveOffset;
      }

      // Разрушение broken платформ
      if (platform.type === "broken" && this.isPlayerOnPlatform(platform)) {
        platform.graphics.alpha -= delta * 0.01;
        if (platform.graphics.alpha <= 0) {
          platform.graphics.visible = false;
        }
      }
    });
  }

  /**
   * Обновление препятствий
   */
  private updateObstacles(delta: number): void {
    this.obstacles.forEach((obstacle) => {
      obstacle.timer! += delta * 0.02;

      switch (obstacle.type) {
        case "fire":
          obstacle.graphics.alpha = 0.5 + Math.sin(obstacle.timer!) * 0.3;
          obstacle.graphics.scale.set(1 + Math.sin(obstacle.timer!) * 0.1);
          break;

        case "electric":
          obstacle.active = Math.sin(obstacle.timer!) > 0;
          obstacle.graphics.alpha = obstacle.active ? 1 : 0.2;
          break;

        case "smoke":
          obstacle.graphics.y = obstacle.y + Math.sin(obstacle.timer!) * 5;
          break;
      }
    });
  }

  /**
   * Обновление камеры
   */
  private updateCamera(delta: number): void {
    // Плавное следование камеры
    this.cameraOffset.x +=
      (this.cameraTarget.x - this.cameraOffset.x) * 0.1 * delta;
    this.cameraOffset.y +=
      (this.cameraTarget.y - this.cameraOffset.y) * 0.1 * delta;

    // Ограничение камеры
    this.cameraOffset.x = Math.max(
      0,
      Math.min(this.levelLength - 1280, this.cameraOffset.x),
    );
    this.cameraOffset.y = Math.max(0, Math.min(200, this.cameraOffset.y));

    // Применение смещения
    this.platformContainer.x = -this.cameraOffset.x;
    this.platformContainer.y = -this.cameraOffset.y;

    // Параллакс для фона
    this.background.x = -this.cameraOffset.x * 0.3;
    this.background.y = -this.cameraOffset.y * 0.1;
  }

  /**
   * Обновление эффектов
   */
  private updateEffects(delta: number): void {
    // Туман
    this.fogEffect.clear();
    for (let i = 0; i < 10; i++) {
      const x =
        ((this.cameraOffset.x + i * 200) % (this.levelLength + 400)) - 200;
      const y = 300 + Math.sin(Date.now() * 0.001 + i) * 50;

      this.fogEffect.circle(x, y, 100 + i * 20);
      this.fogEffect.fill({ color: 0x666666, alpha: 0.05 });
    }

    // Частицы пыли
    this.dustParticles.forEach((particle) => {
      particle.y -= delta * 0.2;
      particle.x += Math.sin(Date.now() * 0.001 + particle.y) * delta * 0.1;

      if (particle.y < 0) {
        particle.y = 500;
        particle.x = Math.random() * this.levelLength;
      }
    });
  }

  /**
   * Проверка столкновений
   */
  private checkCollisions(): void {
    this.isOnGround = false;

    // Проверка платформ
    this.platforms.forEach((platform) => {
      if (!platform.graphics.visible) return;

      const playerBounds = this.player.getBounds();
      const platformBounds = platform.graphics.getBounds();

      // Столкновение сверху
      if (
        playerBounds.x < platformBounds.x + platformBounds.width &&
        playerBounds.x + playerBounds.width > platformBounds.x &&
        playerBounds.y + playerBounds.height >= platformBounds.y &&
        playerBounds.y + playerBounds.height <= platformBounds.y + 10 &&
        this.playerVelocityY >= 0
      ) {
        this.player.y = platformBounds.y - playerBounds.height;
        this.playerVelocityY = 0;
        this.isOnGround = true;
      }
    });

    // Проверка препятствий
    this.obstacles.forEach((obstacle) => {
      if (!obstacle.active) return;

      const playerBounds = this.player.getBounds();
      const obstacleBounds = obstacle.graphics.getBounds();

      if (
        playerBounds.x < obstacleBounds.x + obstacleBounds.width &&
        playerBounds.x + playerBounds.width > obstacleBounds.x &&
        playerBounds.y < obstacleBounds.y + obstacleBounds.height &&
        playerBounds.y + playerBounds.height > obstacleBounds.y
      ) {
        this.damagePlayer(20, obstacle.type);
      }
    });
  }

  /**
   * Проверка, стоит ли игрок на платформе
   */
  private isPlayerOnPlatform(platform: Platform): boolean {
    const playerBounds = this.player.getBounds();
    const platformBounds = platform.graphics.getBounds();

    return (
      playerBounds.x < platformBounds.x + platformBounds.width &&
      playerBounds.x + playerBounds.width > platformBounds.x &&
      Math.abs(playerBounds.y + playerBounds.height - platformBounds.y) < 5
    );
  }

  /**
   * Проверка достижения цели
   */
  private checkGoalReached(): void {
    const playerBounds = this.player.getBounds();
    const goalBounds = this.goalZone.getBounds();

    if (
      playerBounds.x < goalBounds.x + goalBounds.width &&
      playerBounds.x + playerBounds.width > goalBounds.x &&
      playerBounds.y < goalBounds.y + goalBounds.height &&
      playerBounds.y + playerBounds.height > goalBounds.y
    ) {
      this.completeLevel();
    }
  }

  /**
   * Нанесение урона игроку
   */
  private damagePlayer(amount: number, source: string): void {
    this.eventBus.emit(GameEvent.PLAYER_DAMAGE, {
      amount,
      currentHealth: 80, // Упрощённо
      source,
    });

    this.audioManager.playSFX("damage-sound", { volume: 0.5 });

    // Эффект красного экрана
    this.showDamageEffect();
  }

  /**
   * Убийство игрока
   */
  private killPlayer(cause: string): void {
    if (this.isPlayerDead) return;

    this.isPlayerDead = true;

    this.eventBus.emit(GameEvent.PLAYER_DEATH, {
      cause,
      position: { x: this.player.x, y: this.player.y },
    });
  }

  /**
   * Завершение уровня
   */
  private completeLevel(): void {
    if (this.isLevelComplete) return;

    this.isLevelComplete = true;

    this.eventBus.emit(GameEvent.SCENE_CHANGE, {
      from: "platform",
      to: "elevator",
    });

    // Задержка перед переходом
    setTimeout(() => {
      this.sceneManager.switchTo(
        "elevator",
        {},
        {
          type: "fade",
          duration: 1000,
        },
      );
    }, 2000);
  }

  /**
   * Обновление HUD
   */
  private updateHUD(): void {
    const distance = Math.floor(this.player.x / 10);
    this.distanceText.text = `Дистанция: ${distance}м`;

    // Предупреждение при низком здоровье
    // (упрощённо, просто для демонстрации)
  }

  /**
   * Эффект получения урона
   */
  private showDamageEffect(): void {
    const overlay = new Graphics();
    overlay.rect(0, 0, 1280, 720);
    overlay.fill({ color: 0xff0000, alpha: 0.3 });
    this.addChild(overlay);

    setTimeout(() => {
      this.removeChild(overlay);
    }, 200);
  }

  /**
   * Обработчик смерти игрока
   */
  private onPlayerDeath(): void {
    this.audioManager.playSFX("death-sound", { volume: 0.7 });

    // Показываем сообщение
    this.warningText.text = "ВЫ ПОГИБЛИ";
    this.warningText.visible = true;

    // Рестарт через 2 секунды
    setTimeout(() => {
      this.sceneManager.switchTo("platform");
    }, 2000);
  }

  /**
   * Обработчик урона игроку
   */
  // private onPlayerDamage(data: {
  //   amount: number;
  //   currentHealth: number;
  // }): void {
  //   // Обновление HUD или эффектов
  // }

  /**
   * Обработчик Escape
   */
  private onEscape(): void {
    this.eventBus.emit(GameEvent.GAME_PAUSE, { reason: "escape" });
  }

  /**
   * Создание частицы дыма
   */
  private createSmokeParticle(x: number, y: number): Graphics {
    const particle = new Graphics();
    particle.circle(0, 0, Math.random() * 20 + 10);
    particle.fill({ color: 0x444444, alpha: 0.2 });
    particle.x = x;
    particle.y = y;
    return particle;
  }

  /**
   * Интерполяция цветов
   */
  private lerpColor(color1: number, color2: number, t: number): number {
    const r1 = (color1 >> 16) & 0xff;
    const g1 = (color1 >> 8) & 0xff;
    const b1 = color1 & 0xff;

    const r2 = (color2 >> 16) & 0xff;
    const g2 = (color2 >> 8) & 0xff;
    const b2 = color2 & 0xff;

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return (r << 16) | (g << 8) | b;
  }

  /**
   * Очистка сцены
   */
  public async cleanup(): Promise<void> {
    this.audioManager.stopAll(500);
    this.platforms.length = 0;
    this.obstacles.length = 0;
    this.dustParticles.length = 0;

    await super.cleanup();
  }
}
