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
  private levelLength: number = 3000;
  private playerStartX: number = 100;
  private playerStartY: number = 400;

  // Гравитация (скорость игрока — в самом Player)
  private gravity: number = 0.5;

  // Отслеживание фронта нажатия пробела — чтобы удержание клавиши
  // не спамило повторные прыжки через key-repeat InputManager
  private wasJumpKeyDown: boolean = false;

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
    // Горизонтальное движение опрашивается через isKeyDown() в update().
    // Прыжок тоже опрашивается в update() — см. updatePlayer() —
    // с отслеживанием фронта нажатия, а не через onKeyDown, чтобы
    // встроенный key-repeat InputManager не спамил повторными прыжками
    // при удержании клавиши.

    // Пауза
    this.inputManager.onKeyDown("Escape", this.onEscape.bind(this));

    // События игрока
    this.eventBus.on(GameEvent.PLAYER_DEATH, this.onPlayerDeath.bind(this));
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
    if (!this.player.isAlive || this.isLevelComplete) return;

    // Обновление игрока (ввод + физика + анимации)
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
        graphics.rect(0, 0, width, height);
        graphics.fill({ color: 0x8b4513 });
        graphics.stroke({ width: 2, color: 0x654321 });

        for (let i = 0; i < width; i += 20) {
          graphics.rect(i, 0, 2, height);
          graphics.fill({ color: 0x754321, alpha: 0.5 });
        }
        break;

      case "pipe":
        graphics.roundRect(0, 0, width, height, height / 2);
        graphics.fill({ color: 0x666666 });
        graphics.stroke({ width: 1, color: 0x888888 });

        graphics.rect(5, 2, width - 10, height / 3);
        graphics.fill({ color: 0x999999, alpha: 0.3 });
        break;

      case "concrete":
        graphics.rect(0, 0, width, height);
        graphics.fill({ color: 0x555555 });
        graphics.stroke({ width: 2, color: 0x666666 });

        for (let i = 0; i < 3; i++) {
          const cx = Math.random() * width;
          graphics.moveTo(cx, 0);
          graphics.lineTo(cx + Math.random() * 20 - 10, height);
          graphics.stroke({ width: 1, color: 0x444444 });
        }
        break;

      case "broken":
        graphics.rect(0, 0, width, height);
        graphics.fill({ color: 0x8b4513, alpha: 0.7 });
        graphics.stroke({ width: 1, color: 0xff0000 });

        for (let i = 0; i < 5; i++) {
          const hx = Math.random() * width;
          graphics.circle(hx, height / 2, Math.random() * 5 + 3);
          graphics.fill({ color: 0x000000, alpha: 0.5 });
        }
        break;

      case "moving":
        graphics.rect(0, 0, width, height);
        graphics.fill({ color: 0x4444ff });
        graphics.stroke({ width: 2, color: 0x6666ff });

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
          for (let i = 0; i < 5; i++) {
            graphics.moveTo(i * 20, 30);
            graphics.lineTo(i * 20 + 10, 0);
            graphics.lineTo(i * 20 + 20, 30);
            graphics.fill({ color: 0xff0000 });
          }
          break;

        case "fire":
          graphics.circle(15, 15, 15);
          graphics.fill({ color: 0xff4400, alpha: 0.8 });
          graphics.circle(15, 15, 10);
          graphics.fill({ color: 0xffaa00, alpha: 0.6 });
          break;

        case "electric":
          for (let i = 0; i < 3; i++) {
            graphics.moveTo(5 + i * 10, 30);
            graphics.lineTo(10 + i * 10, 15);
            graphics.lineTo(15 + i * 10, 25);
            graphics.lineTo(20 + i * 10, 0);
            graphics.stroke({ width: 2, color: 0x00ffff });
          }
          break;

        case "smoke":
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
    this.player.setPosition(this.playerStartX, this.playerStartY);
    this.platformContainer.addChild(this.player);
  }

  /**
   * Создание эффектов
   */
  private createEffects(): void {
    this.fogEffect = new Graphics();
    this.addChild(this.fogEffect);

    for (let i = 0; i < 30; i++) {
      const particle = this.createDustParticle();
      this.dustParticles.push(particle);
      this.platformContainer.addChild(particle);
    }

    this.dangerZone = new Graphics();
    this.dangerZone.rect(0, 500, 4000, 220);
    this.dangerZone.fill({ color: 0xff0000, alpha: 0.1 });
    this.platformContainer.addChild(this.dangerZone);
  }

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

    this.objectiveText = new Text({
      text: "Доберитесь до станции",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 14,
        fill: 0xff6600,
      }),
    });
    this.objectiveText.position.set(20, 20);

    this.distanceText = new Text({
      text: "Дистанция: 0м",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 12,
        fill: 0xffffff,
      }),
    });
    this.distanceText.position.set(20, 50);

    this.warningText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 16,
        fill: 0xff0000,
      }),
    });
    this.warningText.anchor.set(0.5);
    this.warningText.position.set(
      this.app.screen.width / 2,
      this.app.screen.height / 2,
    );
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
   * Движение игрока (горизонталь) через API Player.
   * moveHorizontal не трогает velocityY, поэтому гравитация,
   * посчитанная в updatePlayer, не сбрасывается на каждом шаге.
   */
  private movePlayer(dx: number): void {
    if (!this.player.isAlive || this.isLevelComplete) return;

    this.player.moveHorizontal(dx);

    // Ограничение движения по уровню
    this.player.x = Math.max(0, Math.min(this.levelLength, this.player.x));

    // Обновление цели камеры
    this.cameraTarget.x = this.player.x - 400;
    this.cameraTarget.y = this.player.y - 300;
  }

  /**
   * Прыжок игрока через API Player.
   * Player.jump() сам решает: обычный прыжок (если isOnGround),
   * двойной прыжок (если hasDoubleJump/canDoubleJump) или ничего.
   */
  private jumpPlayer(): void {
    if (!this.player.isAlive || this.isLevelComplete) return;

    this.player.jump();
    this.audioManager.playSFX("jump-sound", { volume: 0.3 });
  }

  /**
   * Обновление игрока: опрос горизонтального ввода + гравитация +
   * анимации/эффекты через Player.update
   */
  private updatePlayer(delta: number): void {
    // Горизонтальное движение
    if (this.inputManager.isKeyDown("ArrowLeft")) {
      this.movePlayer(-1);
    } else if (this.inputManager.isKeyDown("ArrowRight")) {
      this.movePlayer(1);
    } else {
      this.player.stopHorizontalMovement();
    }

    // Прыжок — реагируем только на переход "не нажато -> нажато" (rising edge).
    // Код пробела в KeyboardEvent.code — "Space" (а не " "), и мы опрашиваем
    // сырое состояние клавиши, минуя key-repeat InputManager. Один физический
    // прыжок клавиши = ровно один вызов jump(); повторные вызовы начинаются
    // заново только после отпускания и нового нажатия.
    const isJumpKeyDown = this.inputManager.isKeyDown("Space");
    if (isJumpKeyDown && !this.wasJumpKeyDown) {
      this.jumpPlayer();
    }
    this.wasJumpKeyDown = isJumpKeyDown;

    // Гравитация — напрямую через публичное поле velocityY игрока
    this.player.velocityY += this.gravity * delta;
    this.player.y += this.player.velocityY;

    // Ограничение по высоте (падение за пределы уровня)
    this.player.y = Math.max(0, Math.min(500, this.player.y));

    // Проверка падения в пропасть
    if (this.player.y >= 500) {
      this.killPlayer("fall");
    }

    // Обновление анимаций/эффектов самого игрока
    this.player.update(delta);
  }

  /**
   * Обновление платформ
   */
  private updatePlatforms(delta: number): void {
    this.platforms.forEach((platform) => {
      if (platform.type === "moving") {
        platform.moveOffset! +=
          platform.moveSpeed! * delta * platform.moveDirection!;

        if (Math.abs(platform.moveOffset!) > platform.moveRange!) {
          platform.moveDirection! *= -1;
        }

        platform.graphics.x = platform.x + platform.moveOffset!;
      }

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
    this.cameraOffset.x +=
      (this.cameraTarget.x - this.cameraOffset.x) * 0.1 * delta;
    this.cameraOffset.y +=
      (this.cameraTarget.y - this.cameraOffset.y) * 0.1 * delta;

    this.cameraOffset.x = Math.max(
      0,
      Math.min(this.levelLength - 1280, this.cameraOffset.x),
    );
    this.cameraOffset.y = Math.max(0, Math.min(200, this.cameraOffset.y));

    this.platformContainer.x = -this.cameraOffset.x;
    this.platformContainer.y = -this.cameraOffset.y;

    this.background.x = -this.cameraOffset.x * 0.3;
    this.background.y = -this.cameraOffset.y * 0.1;
  }

  /**
   * Обновление эффектов
   */
  private updateEffects(delta: number): void {
    this.fogEffect.clear();
    for (let i = 0; i < 10; i++) {
      const x =
        ((this.cameraOffset.x + i * 200) % (this.levelLength + 400)) - 200;
      const y = 300 + Math.sin(Date.now() * 0.001 + i) * 50;

      this.fogEffect.circle(x, y, 100 + i * 20);
      this.fogEffect.fill({ color: 0x666666, alpha: 0.05 });
    }

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
    let landedOnPlatform = false;

    this.platforms.forEach((platform) => {
      if (!platform.graphics.visible) return;

      const playerBounds = this.player.getBounds();
      const platformBounds = platform.graphics.getBounds();

      if (
        playerBounds.x < platformBounds.x + platformBounds.width &&
        playerBounds.x + playerBounds.width > platformBounds.x &&
        playerBounds.y + playerBounds.height >= platformBounds.y &&
        playerBounds.y + playerBounds.height <= platformBounds.y + 10 &&
        this.player.velocityY >= 0
      ) {
        // ВАЖНО: platformBounds.y — глобальная координата, а this.player.y —
        // локальная (относительно platformContainer). Компенсируем смещение
        // камеры (platformContainer.y), иначе снэп позиции будет постоянно
        // "промахиваться" на величину текущего скролла камеры, из-за чего
        // игрок бесконечно дёргается вверх-вниз при приземлении.
        this.player.y =
          platformBounds.y - playerBounds.height - this.platformContainer.y;
        landedOnPlatform = true;
      }
    });

    this.player.setOnGround(landedOnPlatform);

    // Проверка препятствий — этот блок не трогаем, тут только boolean-сравнения
    // глобальных bounds, без присвоения в локальные координаты — багов нет.
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
   * Нанесение урона игроку — напрямую через API Player.
   * Player.takeDamage сам проверяет isAlive/isInvincible,
   * поэтому отдельный cooldown в сцене не нужен.
   */
  private damagePlayer(amount: number, source: string): void {
    this.player.takeDamage(amount, source);
    this.audioManager.playSFX("damage-sound", { volume: 0.5 });
    this.showDamageEffect();
  }

  /**
   * Убийство игрока (падение в пропасть).
   * Используем forceKill — он убивает безусловно, минуя щит
   * неуязвимости, чтобы падение в пропасть не "прощалось"
   * недавно полученным уроном.
   */
  private killPlayer(cause: string): void {
    if (!this.player.isAlive) return;
    this.player.forceKill(cause);
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
  }

  /**
   * Эффект получения урона
   */
  private showDamageEffect(): void {
    const overlay = new Graphics();
    overlay.rect(0, 0, this.app.screen.width, this.app.screen.height);
    overlay.fill({ color: 0xff0000, alpha: 0.3 });
    this.addChild(overlay);

    setTimeout(() => {
      this.removeChild(overlay);
      overlay.destroy();
    }, 200);
  }

  /**
   * Обработчик смерти игрока
   */
  private onPlayerDeath(): void {
    this.audioManager.playSFX("death-sound", { volume: 0.7 });

    this.warningText.text = "ВЫ ПОГИБЛИ";
    this.warningText.visible = true;

    setTimeout(() => {
      this.sceneManager.switchTo("platform");
    }, 2000);
  }

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
