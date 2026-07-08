import * as pixiJs from "pixi.js";
import { BaseScene } from "./BaseScene";
import { GameEvent } from "../core/EventBus";
import { Player } from "../entities/Player";
import { DialogBox } from "../components/DialogBox";
import type { SceneName } from "../core/SceneManager";

interface ElevatorState {
  position: number; // 0-1, где 0 - верх, 1 - низ
  speed: number;
  isMoving: boolean;
  isBroken: boolean;
  targetPosition: number;
}

interface Container_ {
  x: number;
  y: number;
  width: number;
  height: number;
  type: "metal" | "wood" | "hanging" | "falling";
  graphics: pixiJs.Graphics;
  velocity: { x: number; y: number };
  isFalling: boolean;
  fallTimer: number;
  initialY: number;
  swingPhase: number;
}

interface ChainLink {
  graphics: pixiJs.Graphics;
  attached: boolean;
  targetContainer?: Container_;
}

export class ElevatorScene extends BaseScene {
  // Игрок
  private player!: Player;

  // Лифт
  private elevatorContainer!: pixiJs.Container;
  private elevatorPlatform!: pixiJs.Graphics;
  private elevatorCage!: pixiJs.Graphics;
  private elevatorState: ElevatorState;
  private chainLinks: ChainLink[] = [];

  // Контейнеры для прыжков
  private containers: Container_[] = [];
  private containerGraphics: pixiJs.Container;

  // Окружение
  private background!: pixiJs.Container;
  private shaftWalls!: pixiJs.Graphics;
  private platformLedges: pixiJs.Graphics[] = [];

  // Эффекты
  private dustParticles: pixiJs.Graphics[] = [];
  private sparks: pixiJs.Graphics[] = [];
  private warningLight!: pixiJs.Graphics;
  private alarmText!: pixiJs.Text;

  // HUD
  private hudContainer!: pixiJs.Container;
  private heightText!: pixiJs.Text;
  private objectiveText!: pixiJs.Text;
  private warningText!: pixiJs.Text;

  // Диалог
  private dialogBox!: DialogBox;

  // Состояния
  private isLevelComplete: boolean = false;
  private isPlayerDead: boolean = false;
  private playerStartX: number = 400;
  private playerStartY: number = 500;
  private time: number = 0;
  private shakeIntensity: number = 0;

  // Физика
  private gravity: number = 0.3;
  private playerVelocityY: number = 0;
  private isOnGround: boolean = false;

  // Границы уровня
  private readonly shaftTop: number = 100;
  private readonly shaftBottom: number = 600;
  private readonly shaftLeft: number = 200;
  private readonly shaftRight: number = 600;

  protected getSceneName(): SceneName {
    return "elevator";
  }

  constructor(...args: ConstructorParameters<typeof BaseScene>) {
    super(...args);

    this.elevatorState = {
      position: 0.3,
      speed: 0,
      isMoving: false,
      isBroken: true,
      targetPosition: 0.3,
    };

    this.containerGraphics = new pixiJs.Container();
  }

  protected async preload(): Promise<void> {
    // Ресурсы загружены централизованно
  }

  protected setup(): void {
    this.createBackground();
    this.createShaft();
    this.createElevator();
    this.createContainers();
    this.createPlayer();
    this.createEffects();
    this.createHUD();
    this.createDialogBox();

    this.alpha = 0;
  }

  protected bindEvents(): void {
    // Управление
    this.inputManager.onKeyDown("ArrowLeft", () => this.movePlayer(-1, 0));
    this.inputManager.onKeyDown("ArrowRight", () => this.movePlayer(1, 0));
    this.inputManager.onKeyDown("ArrowUp", () => this.jumpPlayer());
    this.inputManager.onKeyDown(" ", (event) => {
      event?.preventDefault();
      this.jumpPlayer();
    });

    // Взаимодействие с лифтом
    this.inputManager.onKeyDown("e", () => this.interactWithElevator());
    this.inputManager.onKeyDown("E", () => this.interactWithElevator());

    // Пауза
    this.inputManager.onKeyDown("Escape", this.onEscape.bind(this));

    // События
    this.eventBus.on(GameEvent.PLAYER_DEATH, this.onPlayerDeath.bind(this));
  }

  protected async onEnter(): Promise<void> {
    // Музыка и эмбиент
    this.audioManager.stopAll(500);
    this.audioManager.playMusic("elevator-music", {
      volume: 0.4,
      fadeIn: 1000,
    });
    this.audioManager.playAmbient("elevator-ambient", {
      volume: 0.3,
    });
    this.audioManager.playAmbient("alarm-sound", {
      volume: 0.2,
    });

    // Анимация появления
    await this.fadeIn(1000);

    // Начальный диалог
    await this.showInitialDialog();

    // Запуск поломки лифта
    setTimeout(() => this.breakElevator(), 2000);
  }

  public update(delta: number): void {
    if (this.isPlayerDead || this.isLevelComplete) return;

    this.time += delta * 0.01;

    // Обновление игрока
    this.updatePlayer(delta);

    // Обновление лифта
    this.updateElevator(delta);

    // Обновление контейнеров
    this.updateContainers(delta);

    // Обновление цепей
    this.updateChains(delta);

    // Обновление эффектов
    this.updateEffects(delta);

    // Проверка коллизий
    this.checkCollisions();

    // Проверка выхода
    this.checkExitReached();

    // Обновление тряски
    this.updateShake(delta);

    // Обновление HUD
    this.updateHUD();

    // Обновление диалога
    this.dialogBox.update(delta);
  }

  /**
   * Создание фона
   */
  private createBackground(): void {
    this.background = new pixiJs.Container();

    // Тёмный фон шахты
    const bg = new pixiJs.Graphics();
    bg.rect(0, 0, 800, 720);
    bg.fill({ color: 0x0a0a0a });

    // Градиент освещения
    for (let i = 0; i < 720; i++) {
      const progress = i / 720;
      const alpha = 0.1 + Math.sin(progress * Math.PI) * 0.1;
      bg.rect(200, i, 400, 1);
      bg.fill({ color: 0xff6600, alpha });
    }

    this.background.addChild(bg);
    this.addChild(this.background);

    // Добавляем контейнеры в основную сцену
    this.addChild(this.containerGraphics);
  }

  /**
   * Создание шахты лифта
   */
  private createShaft(): void {
    // Стены шахты
    this.shaftWalls = new pixiJs.Graphics();

    // Левая стена
    this.shaftWalls.rect(this.shaftLeft, 0, 10, 720);
    this.shaftWalls.fill({ color: 0x333333 });

    // Правая стена
    this.shaftWalls.rect(this.shaftRight, 0, 10, 720);
    this.shaftWalls.fill({ color: 0x333333 });

    // Текстура стен
    for (let y = 0; y < 720; y += 50) {
      this.shaftWalls.rect(this.shaftLeft, y, 10, 25);
      this.shaftWalls.fill({ color: 0x444444, alpha: 0.5 });

      this.shaftWalls.rect(this.shaftRight, y, 10, 25);
      this.shaftWalls.fill({ color: 0x444444, alpha: 0.5 });
    }

    // Направляющие рельсы
    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? this.shaftLeft + 20 : this.shaftRight - 30;
      this.shaftWalls.rect(x, 0, 5, 720);
      this.shaftWalls.fill({ color: 0x666666 });
    }

    this.addChild(this.shaftWalls);

    // Платформы-уступы на стенах
    const ledgeData = [
      { x: this.shaftLeft, y: 500, width: 50 },
      { x: this.shaftRight - 50, y: 400, width: 50 },
      { x: this.shaftLeft, y: 300, width: 50 },
      { x: this.shaftRight - 50, y: 200, width: 50 },
    ];

    ledgeData.forEach((data) => {
      const ledge = new pixiJs.Graphics();
      ledge.rect(data.x, data.y, data.width, 10);
      ledge.fill({ color: 0x555555 });
      ledge.stroke({ width: 1, color: 0x777777 });
      this.platformLedges.push(ledge);
      this.addChild(ledge);
    });
  }

  /**
   * Создание лифта
   */
  private createElevator(): void {
    this.elevatorContainer = new pixiJs.Container();

    // Платформа лифта
    this.elevatorPlatform = new pixiJs.Graphics();
    this.elevatorPlatform.rect(0, 0, 370, 15);
    this.elevatorPlatform.fill({ color: 0x666666 });
    this.elevatorPlatform.stroke({ width: 2, color: 0x888888 });

    // Решётка на платформе
    for (let i = 0; i < 370; i += 20) {
      this.elevatorPlatform.rect(i, 0, 2, 15);
      this.elevatorPlatform.fill({ color: 0x777777, alpha: 0.5 });
    }

    // Клетка лифта
    this.elevatorCage = new pixiJs.Graphics();

    // Задняя стенка
    this.elevatorCage.rect(0, -200, 370, 200);
    this.elevatorCage.fill({ color: 0x222222, alpha: 0.8 });

    // Прутья клетки
    for (let i = 0; i < 370; i += 30) {
      this.elevatorCage.rect(i, -200, 3, 200);
      this.elevatorCage.fill({ color: 0x444444 });
    }

    // Верхняя рама
    this.elevatorCage.rect(0, -205, 370, 5);
    this.elevatorCage.fill({ color: 0x555555 });

    this.elevatorContainer.addChild(this.elevatorCage, this.elevatorPlatform);

    // Позиционирование
    this.elevatorContainer.x = this.shaftLeft + 15;
    this.elevatorContainer.y = this.getElevatorY();

    this.addChild(this.elevatorContainer);

    // Создание цепей
    this.createChains();

    // Предупреждающая лампа
    this.warningLight = new pixiJs.Graphics();
    this.warningLight.circle(0, 0, 15);
    this.warningLight.fill({ color: 0xff0000, alpha: 0.5 });
    this.warningLight.position.set(this.shaftLeft + 185, 80);
    this.addChild(this.warningLight);

    // Текст тревоги
    this.alarmText = new pixiJs.Text({
      text: "⚠ ЛИФТ НЕИСПРАВЕН ⚠",
      style: new pixiJs.TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 10,
        fill: 0xff0000,
      }),
    });
    this.alarmText.anchor.set(0.5);
    this.alarmText.position.set(this.shaftLeft + 185, 110);
    this.alarmText.alpha = 0;
    this.addChild(this.alarmText);
  }

  /**
   * Создание цепей лифта
   */
  private createChains(): void {
    const attachmentPoints = [
      this.shaftLeft + 50,
      this.shaftLeft + 185,
      this.shaftRight - 50,
    ];

    attachmentPoints.forEach((x) => {
      for (let i = 0; i < 5; i++) {
        const link = new pixiJs.Graphics();
        link.rect(-3, -8, 6, 16);
        link.fill({ color: 0x888888 });
        link.stroke({ width: 1, color: 0x999999 });
        link.position.set(x, -i * 16);

        this.elevatorContainer.addChild(link);

        this.chainLinks.push({
          graphics: link,
          attached: true,
        });
      }
    });
  }

  /**
   * Создание контейнеров для прыжков
   */
  private createContainers(): void {
    const containerData = [
      {
        x: this.shaftLeft + 60,
        y: 550,
        width: 80,
        height: 40,
        type: "metal" as const,
      },
      {
        x: this.shaftRight - 120,
        y: 480,
        width: 70,
        height: 35,
        type: "wood" as const,
      },
      {
        x: this.shaftLeft + 80,
        y: 380,
        width: 75,
        height: 40,
        type: "hanging" as const,
      },
      {
        x: this.shaftRight - 100,
        y: 290,
        width: 85,
        height: 35,
        type: "metal" as const,
      },
      {
        x: this.shaftLeft + 70,
        y: 200,
        width: 80,
        height: 40,
        type: "falling" as const,
      },
      {
        x: this.shaftRight - 110,
        y: 130,
        width: 90,
        height: 45,
        type: "metal" as const,
      },
    ];

    containerData.forEach((data) => {
      const graphics = new pixiJs.Graphics();

      switch (data.type) {
        case "metal":
          graphics.rect(0, 0, data.width, data.height);
          graphics.fill({ color: 0x666666 });
          graphics.stroke({ width: 2, color: 0x888888 });

          // Рёбра жёсткости
          for (let i = 0; i < data.width; i += 15) {
            graphics.rect(i, 0, 2, data.height);
            graphics.fill({ color: 0x777777, alpha: 0.3 });
          }
          break;

        case "wood":
          graphics.rect(0, 0, data.width, data.height);
          graphics.fill({ color: 0x8b4513 });
          graphics.stroke({ width: 1, color: 0x654321 });

          // Доски
          for (let i = 0; i < data.height; i += 8) {
            graphics.rect(0, i, data.width, 2);
            graphics.fill({ color: 0x754321, alpha: 0.3 });
          }
          break;

        case "hanging":
          graphics.rect(0, 0, data.width, data.height);
          graphics.fill({ color: 0x555555 });
          graphics.stroke({ width: 2, color: 0x777777 });

          // Цепи сверху
          graphics.moveTo(data.width / 2, 0);
          graphics.lineTo(data.width / 2, -30);
          graphics.stroke({ width: 1, color: 0x888888 });
          break;

        case "falling":
          graphics.rect(0, 0, data.width, data.height);
          graphics.fill({ color: 0x8b0000, alpha: 0.7 });
          graphics.stroke({ width: 2, color: 0xff0000 });

          // Трещины
          for (let i = 0; i < 3; i++) {
            graphics.moveTo(Math.random() * data.width, 0);
            graphics.lineTo(Math.random() * data.width, data.height);
            graphics.stroke({ width: 1, color: 0xff0000, alpha: 0.5 });
          }
          break;
      }

      graphics.position.set(data.x, data.y);
      this.containerGraphics.addChild(graphics);

      this.containers.push({
        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height,
        type: data.type,
        graphics,
        velocity: { x: 0, y: 0 },
        isFalling: false,
        fallTimer: 0,
        initialY: data.y,
        swingPhase: Math.random() * Math.PI * 2,
      });
    });
  }

  /**
   * Создание игрока
   */
  private createPlayer(): void {
    this.player = new Player(this.eventBus);
    this.player.position.set(this.shaftLeft + 185, this.getElevatorY() - 20);
    this.addChild(this.player);
  }

  /**
   * Создание эффектов
   */
  private createEffects(): void {
    // Частицы пыли
    for (let i = 0; i < 30; i++) {
      const particle = new pixiJs.Graphics();
      particle.circle(0, 0, Math.random() * 2 + 1);
      particle.fill({ color: 0x888888, alpha: 0.3 });
      particle.position.set(
        this.shaftLeft + Math.random() * (this.shaftRight - this.shaftLeft),
        Math.random() * 720,
      );
      this.dustParticles.push(particle);
      this.addChild(particle);
    }

    // Искры
    for (let i = 0; i < 10; i++) {
      const spark = new pixiJs.Graphics();
      spark.circle(0, 0, 2);
      spark.fill({ color: 0xffaa00, alpha: 0.8 });
      spark.position.set(
        this.shaftLeft + Math.random() * (this.shaftRight - this.shaftLeft),
        Math.random() * 300,
      );
      this.sparks.push(spark);
      this.addChild(spark);
    }
  }

  /**
   * Создание HUD
   */
  private createHUD(): void {
    this.hudContainer = new pixiJs.Container();

    // Высота
    this.heightText = new pixiJs.Text({
      text: "Глубина: 0м",
      style: new pixiJs.TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 12,
        fill: 0xffffff,
      }),
    });
    this.heightText.position.set(20, 20);

    // Цель
    this.objectiveText = new pixiJs.Text({
      text: "Поднимитесь наверх по контейнерам",
      style: new pixiJs.TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 10,
        fill: 0x888888,
      }),
    });
    this.objectiveText.position.set(20, 45);

    // Предупреждение
    this.warningText = new pixiJs.Text({
      text: "",
      style: new pixiJs.TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 16,
        fill: 0xff0000,
      }),
    });
    this.warningText.anchor.set(0.5);
    this.warningText.position.set(400, 360);
    this.warningText.visible = false;

    this.hudContainer.addChild(
      this.heightText,
      this.objectiveText,
      this.warningText,
    );

    this.addChild(this.hudContainer);
  }

  /**
   * Создание диалогового окна
   */
  private createDialogBox(): void {
    this.dialogBox = new DialogBox(this.eventBus);
    this.dialogBox.visible = false;
    this.addChild(this.dialogBox);
  }

  /**
   * Показ начального диалога
   */
  private async showInitialDialog(): Promise<void> {
    await this.showDialog(
      "Н",
      "Платформа застряла... Придётся прыгать по контейнерам.",
      "worried",
    );

    await this.showDialog(
      "М",
      "Будь осторожна, некоторые из них едва держатся!",
      "scared",
    );
  }

  /**
   * Показ строки диалога
   */
  private showDialog(
    speaker: string,
    text: string,
    emotion:
      "neutral" | "scared" | "determined" | "hopeful" | "worried" = "neutral",
  ): Promise<void> {
    return new Promise((resolve) => {
      this.dialogBox.show(speaker, text, emotion, resolve);
    });
  }

  /**
   * Поломка лифта
   */
  private breakElevator(): void {
    if (!this.elevatorState.isBroken) return;

    // Рывок лифта
    this.elevatorState.speed = -3;
    this.elevatorState.isMoving = true;
    this.shakeIntensity = 1;

    // Звук поломки
    this.audioManager.playSFX("elevator-break", { volume: 0.7 });

    // Показываем предупреждение
    this.alarmText.alpha = 1;

    // Остановка через некоторое время
    setTimeout(() => {
      this.elevatorState.speed = 0;
      this.elevatorState.isMoving = false;
      this.elevatorState.position = 0.7;
      this.shakeIntensity = 0.3;
    }, 1000);
  }

  /**
   * Взаимодействие с лифтом
   */
  private interactWithElevator(): void {
    const elevatorY = this.getElevatorY();
    const distToElevator = Math.abs(this.player.y - elevatorY);

    if (
      distToElevator < 30 &&
      this.player.x > this.shaftLeft &&
      this.player.x < this.shaftRight
    ) {
      // Пытаемся починить лифт
      this.showDialog("Н", "Бесполезно... Механизм полностью разрушен.", "sad");
    }
  }

  /**
   * Получение Y позиции лифта
   */
  private getElevatorY(): number {
    return (
      this.shaftTop +
      this.elevatorState.position * (this.shaftBottom - this.shaftTop)
    );
  }

  /**
   * Движение игрока
   */
  private movePlayer(dx: number, dy: number): void {
    if (this.isPlayerDead || this.isLevelComplete) return;
    if (this.dialogBox.visible) return;

    const speed = 3;
    this.player.x += dx * speed;
    this.player.y += dy * speed;

    // Ограничение движения стенами шахты
    this.player.x = Math.max(
      this.shaftLeft + 20,
      Math.min(this.shaftRight - 20, this.player.x),
    );
    this.player.y = Math.max(50, Math.min(650, this.player.y));
  }

  /**
   * Прыжок игрока
   */
  private jumpPlayer(): void {
    if (this.isPlayerDead || this.isLevelComplete) return;
    if (!this.isOnGround) return;

    this.playerVelocityY = -8;
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

    // Проверка падения в пропасть
    if (this.player.y > 650) {
      this.killPlayer("fall");
    }

    // Нахождение на лифте
    const elevatorY = this.getElevatorY();
    if (
      Math.abs(this.player.y - elevatorY) < 5 &&
      this.player.x > this.shaftLeft &&
      this.player.x < this.shaftRight &&
      this.playerVelocityY >= 0
    ) {
      this.player.y = elevatorY;
      this.playerVelocityY = 0;
      this.isOnGround = true;
    }

    this.player.update(delta);
  }

  /**
   * Обновление лифта
   */
  private updateElevator(delta: number): void {
    // Движение лифта
    if (this.elevatorState.isMoving) {
      this.elevatorState.position += this.elevatorState.speed * delta * 0.01;

      // Ограничение
      this.elevatorState.position = Math.max(
        0,
        Math.min(0.7, this.elevatorState.position),
      );

      // Остановка на границах
      if (
        this.elevatorState.position <= 0 ||
        this.elevatorState.position >= 0.7
      ) {
        this.elevatorState.speed = 0;
        this.elevatorState.isMoving = false;
      }
    }

    // Обновление позиции
    this.elevatorContainer.y = this.getElevatorY();

    // Лёгкое покачивание
    if (!this.elevatorState.isMoving) {
      this.elevatorContainer.x =
        this.shaftLeft + 15 + Math.sin(this.time * 2) * this.shakeIntensity * 3;
    }

    // Анимация лампы
    this.warningLight.alpha = 0.3 + Math.sin(this.time * 4) * 0.2;
    this.alarmText.alpha = Math.sin(this.time * 3) * 0.5 + 0.5;
  }

  /**
   * Обновление контейнеров
   */
  private updateContainers(delta: number): void {
    this.containers.forEach((container) => {
      switch (container.type) {
        case "hanging":
          // Раскачивание
          container.swingPhase += delta * 0.03;
          container.graphics.x =
            container.x + Math.sin(container.swingPhase) * 15;
          container.graphics.rotation = Math.sin(container.swingPhase) * 0.05;
          break;

        case "falling":
          // Падение при касании
          if (container.isFalling) {
            container.velocity.y += this.gravity * 2 * delta;
            container.graphics.y += container.velocity.y * delta;

            // Уничтожение при падении за экран
            if (container.graphics.y > 800) {
              container.graphics.visible = false;
            }
          }
          break;
      }
    });
  }

  /**
   * Обновление цепей
   */
  private updateChains(delta: number): void {
    console.log(delta);
    this.chainLinks.forEach((link, index) => {
      if (link.attached) {
        // Лёгкое покачивание цепей
        link.graphics.x += Math.sin(this.time * 3 + index) * 0.5;
        link.graphics.rotation = Math.sin(this.time * 2 + index) * 0.02;
      }
    });
  }

  /**
   * Обновление эффектов
   */
  private updateEffects(delta: number): void {
    // Пыль
    this.dustParticles.forEach((particle) => {
      particle.y -= delta * 0.3;
      particle.x += Math.sin(this.time + particle.y) * delta * 0.2;

      if (particle.y < 0) {
        particle.y = 720;
      }
    });

    // Искры
    this.sparks.forEach((spark) => {
      spark.y -= delta * 2;
      spark.alpha -= delta * 0.01;

      if (spark.y < 0 || spark.alpha <= 0) {
        spark.y = Math.random() * 300;
        spark.x =
          this.shaftLeft + Math.random() * (this.shaftRight - this.shaftLeft);
        spark.alpha = 0.8;
      }
    });
  }

  /**
   * Обновление тряски экрана
   */
  private updateShake(delta: number): void {
    console.log(delta);
    if (this.shakeIntensity > 0) {
      this.shakeIntensity *= 0.95;

      if (this.shakeIntensity < 0.01) {
        this.shakeIntensity = 0;
      }

      // Применение тряски ко всем элементам
      this.containerGraphics.x =
        (Math.random() - 0.5) * this.shakeIntensity * 10;
      this.containerGraphics.y =
        (Math.random() - 0.5) * this.shakeIntensity * 10;
    }
  }

  /**
   * Проверка коллизий
   */
  private checkCollisions(): void {
    this.isOnGround = false;

    const playerBounds = this.player.getBounds();

    // Проверка контейнеров
    this.containers.forEach((container) => {
      if (!container.graphics.visible) return;

      const containerBounds = container.graphics.getBounds();

      if (
        playerBounds.x < containerBounds.x + containerBounds.width &&
        playerBounds.x + playerBounds.width > containerBounds.x &&
        playerBounds.y + playerBounds.height >= containerBounds.y &&
        playerBounds.y + playerBounds.height <= containerBounds.y + 5 &&
        this.playerVelocityY >= 0
      ) {
        this.player.y = containerBounds.y - playerBounds.height;
        this.playerVelocityY = 0;
        this.isOnGround = true;

        // Активация падающего контейнера
        if (container.type === "falling" && !container.isFalling) {
          container.isFalling = true;
          container.fallTimer = 30;
          this.audioManager.playSFX("container-break", { volume: 0.5 });
          this.shakeIntensity = 0.5;
        }
      }
    });

    // Проверка платформ-уступов
    this.platformLedges.forEach((ledge) => {
      const ledgeBounds = ledge.getBounds();

      if (
        playerBounds.x < ledgeBounds.x + ledgeBounds.width &&
        playerBounds.x + playerBounds.width > ledgeBounds.x &&
        playerBounds.y + playerBounds.height >= ledgeBounds.y &&
        playerBounds.y + playerBounds.height <= ledgeBounds.y + 5 &&
        this.playerVelocityY >= 0
      ) {
        this.player.y = ledgeBounds.y - playerBounds.height;
        this.playerVelocityY = 0;
        this.isOnGround = true;
      }
    });
  }

  /**
   * Проверка достижения выхода
   */
  private checkExitReached(): void {
    if (
      this.player.y < 100 &&
      this.player.x > this.shaftLeft &&
      this.player.x < this.shaftRight
    ) {
      this.completeLevel();
    }
  }

  /**
   * Завершение уровня
   */
  private completeLevel(): void {
    if (this.isLevelComplete) return;
    this.isLevelComplete = true;

    this.audioManager.stopAll(1000);
    this.audioManager.playSFX("level-complete", { volume: 0.7 });

    this.eventBus.emit(GameEvent.SCENE_CHANGE, {
      from: "elevator",
      to: "assembly",
    });

    setTimeout(() => {
      this.sceneManager.switchTo(
        "assembly",
        {},
        {
          type: "fade",
          duration: 1000,
        },
      );
    }, 2000);
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
   * Обновление HUD
   */
  private updateHUD(): void {
    const depth = Math.floor((this.player.y - 100) / 5);
    this.heightText.text = `Глубина: ${Math.max(0, depth)}м`;
  }

  /**
   * Обработчик смерти игрока
   */
  private onPlayerDeath(): void {
    this.audioManager.playSFX("death-sound", { volume: 0.7 });

    this.warningText.text = "ВЫ УПАЛИ";
    this.warningText.visible = true;

    setTimeout(() => {
      this.sceneManager.switchTo("elevator");
    }, 2000);
  }

  /**
   * Обработчик Escape
   */
  private onEscape(): void {
    this.eventBus.emit(GameEvent.GAME_PAUSE, { reason: "escape" });
  }

  /**
   * Очистка сцены
   */
  public async cleanup(): Promise<void> {
    this.audioManager.stopAll(500);
    this.containers.length = 0;
    this.dustParticles.length = 0;
    this.sparks.length = 0;
    this.chainLinks.length = 0;

    await super.cleanup();
  }
}
