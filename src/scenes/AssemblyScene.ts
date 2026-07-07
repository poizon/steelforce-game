import {
  Container,
  Sprite,
  Graphics,
  Text,
  TextStyle,
  AnimatedSprite,
} from "pixi.js";
import { BaseScene } from "./BaseScene";
import { GameEvent } from "../core/EventBus";
import { Player } from "../entities/Player";
import { ZombieWorker } from "../entities/ZombieWorker";
import { Gear } from "../entities/Gear";
import type { SceneName } from "../core/SceneManager";
import type { Vector2 } from "../types";

interface ConveyorSection {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
  graphics: Graphics;
}

interface Crusher {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
  timer: number;
  graphics: Graphics;
}

export class AssemblyScene extends BaseScene {
  // Игрок
  private player!: Player;

  // Враги
  private zombies: ZombieWorker[] = [];
  private maxZombies: number = 8;
  private zombieSpawnTimer: number = 0;
  private zombieSpawnInterval: number = 300; // кадры

  // Предметы
  private gears: Gear[] = [];
  private collectedGears: number = 0;
  private requiredGears: number = 5;

  // Окружение
  private background!: Container;
  private floorContainer!: Container;
  private machineryContainer!: Container;
  private conveyorSystem!: Container;
  private conveyors: ConveyorSection[] = [];
  private crushers: Crusher[] = [];

  // Эффекты
  private lightingEffect!: Graphics;
  private steamParticles: Graphics[] = [];
  private sparks: Graphics[] = [];
  private darknessOverlay!: Graphics;

  // HUD
  private hudContainer!: Container;
  private gearCounter!: Text;
  private objectiveText!: Text;
  private healthBar!: Container;
  private minimap!: Container;

  // Состояния
  private isLevelComplete: boolean = false;
  private isPlayerDead: boolean = false;
  private isConveyorActive: boolean = false;
  private levelWidth: number = 2400;
  private levelHeight: number = 720;

  // Точки интереса
  private spawnPoints: Vector2[] = [];
  private gearSpawnPoints: Vector2[] = [];
  private exitPoint!: Vector2;

  protected getSceneName(): SceneName {
    return "assembly";
  }

  protected async preload(): Promise<void> {
    // Ресурсы загружены централизованно
  }

  protected setup(): void {
    this.createBackground();
    this.createFloor();
    this.createMachinery();
    this.createConveyorSystem();
    this.createCrushers();
    this.createSpawnPoints();
    this.createGearSpawnPoints();
    this.createExitPoint();
    this.createPlayer();
    this.createEffects();
    this.createHUD();
    this.createMinimap();

    // Начальное состояние
    this.alpha = 0;

    // Спавним начальных зомби
    this.spawnInitialZombies();

    // Спавним шестерёнки
    this.spawnGears();
  }

  protected bindEvents(): void {
    // Управление
    this.inputManager.onKeyDown("ArrowLeft", () => this.movePlayer(-1, 0));
    this.inputManager.onKeyDown("ArrowRight", () => this.movePlayer(1, 0));
    this.inputManager.onKeyDown("ArrowUp", () => this.movePlayer(0, -1));
    this.inputManager.onKeyDown("ArrowDown", () => this.movePlayer(0, 1));
    this.inputManager.onKeyDown(" ", (event) => {
      event?.preventDefault();
      this.playerInteract();
    });

    // Пауза
    this.inputManager.onKeyDown("Escape", this.onEscape.bind(this));

    // События
    this.eventBus.on(GameEvent.PLAYER_DEATH, this.onPlayerDeath.bind(this));
    this.eventBus.on(GameEvent.ITEM_COLLECT, this.onItemCollect.bind(this));
    this.eventBus.on(
      GameEvent.MONSTER_DESTROY,
      this.onMonsterDestroy.bind(this),
    );
  }

  protected async onEnter(): Promise<void> {
    // Атмосферная музыка
    this.audioManager.stopAll(500);
    this.audioManager.playMusic("assembly-music", {
      volume: 0.4,
      fadeIn: 1000,
    });

    // Звуки завода
    this.audioManager.playAmbient("factory-machinery", {
      volume: 0.3,
      fadeIn: 2000,
    });

    // Анимация появления
    await this.fadeIn(1000);

    // Показываем цель
    await this.showObjective();

    // Анимация входа игрока
    await this.playerEnterAnimation();
  }

  public update(delta: number): void {
    if (this.isPlayerDead || this.isLevelComplete) return;

    // Обновление игрока
    this.player.update(delta);

    // Обновление зомби
    this.updateZombies(delta);

    // Спавн зомби
    this.updateZombieSpawning(delta);

    // Обновление конвейеров
    this.updateConveyors(delta);

    // Обновление дробилок
    this.updateCrushers(delta);

    // Обновление эффектов
    this.updateEffects(delta);

    // Проверка столкновений
    this.checkCollisions();

    // Обновление HUD
    this.updateHUD();

    // Проверка условий победы
    this.checkWinCondition();
  }

  /**
   * Создание фона
   */
  private createBackground(): void {
    this.background = new Container();

    // Тёмный фон цеха
    const bg = new Graphics();
    bg.rect(0, 0, this.levelWidth, this.levelHeight);
    bg.fill({ color: 0x1a1a1a });

    // Стены
    const walls = new Graphics();
    walls.rect(0, 0, this.levelWidth, 20);
    walls.fill({ color: 0x333333 });
    walls.rect(0, this.levelHeight - 20, this.levelWidth, 20);
    walls.fill({ color: 0x333333 });

    // Трубы на потолке
    for (let i = 0; i < this.levelWidth; i += 200) {
      const pipe = new Graphics();
      pipe.rect(i, 10, 150, 5);
      pipe.fill({ color: 0x555555 });
      this.background.addChild(pipe);
    }

    this.background.addChild(bg, walls);
    this.addChild(this.background);
  }

  /**
   * Создание пола
   */
  private createFloor(): void {
    this.floorContainer = new Container();

    // Разметка пола
    for (let x = 0; x < this.levelWidth; x += 100) {
      for (let y = 20; y < this.levelHeight - 20; y += 100) {
        const tile = new Graphics();
        tile.rect(x, y, 100, 100);
        tile.fill({ color: 0x2a2a2a });
        tile.stroke({ width: 1, color: 0x333333 });
        this.floorContainer.addChild(tile);
      }
    }

    // Масляные пятна
    for (let i = 0; i < 15; i++) {
      const stain = new Graphics();
      stain.circle(0, 0, Math.random() * 30 + 10);
      stain.fill({ color: 0x111111, alpha: 0.5 });
      stain.x = Math.random() * this.levelWidth;
      stain.y = 40 + Math.random() * (this.levelHeight - 80);
      this.floorContainer.addChild(stain);
    }

    this.addChild(this.floorContainer);
  }

  /**
   * Создание оборудования
   */
  private createMachinery(): void {
    this.machineryContainer = new Container();

    // Станки и оборудование
    const machineData = [
      { x: 200, y: 200, w: 100, h: 80, type: "press" },
      { x: 500, y: 400, w: 120, h: 60, type: "welder" },
      { x: 900, y: 250, w: 80, h: 100, type: "cutter" },
      { x: 1300, y: 350, w: 100, h: 80, type: "press" },
      { x: 1700, y: 200, w: 120, h: 90, type: "assembler" },
      { x: 2100, y: 400, w: 100, h: 70, type: "welder" },
    ];

    machineData.forEach((data) => {
      const machine = this.createMachine(
        data.x,
        data.y,
        data.w,
        data.h,
        data.type,
      );
      this.machineryContainer.addChild(machine);
    });

    this.addChild(this.machineryContainer);
  }

  /**
   * Создание отдельного станка
   */
  private createMachine(
    x: number,
    y: number,
    width: number,
    height: number,
    type: string,
  ): Container {
    const machine = new Container();
    machine.position.set(x, y);

    // Корпус
    const body = new Graphics();
    body.rect(0, 0, width, height);
    body.fill({ color: 0x444444 });
    body.stroke({ width: 2, color: 0x666666 });
    machine.addChild(body);

    // Детали в зависимости от типа
    switch (type) {
      case "press":
        const press = new Graphics();
        press.rect(10, height - 20, width - 20, 15);
        press.fill({ color: 0xff0000 });
        machine.addChild(press);
        break;

      case "welder":
        const welder = new Graphics();
        welder.circle(width / 2, 10, 8);
        welder.fill({ color: 0x00ffff, alpha: 0.8 });
        machine.addChild(welder);
        break;

      case "cutter":
        const blade = new Graphics();
        blade.moveTo(10, 0);
        blade.lineTo(20, height);
        blade.stroke({ width: 3, color: 0xcccccc });
        machine.addChild(blade);
        break;

      case "assembler":
        const arm = new Graphics();
        arm.rect(width / 2 - 5, 0, 10, height / 2);
        arm.fill({ color: 0xffaa00 });
        machine.addChild(arm);
        break;
    }

    // Индикатор
    const indicator = new Graphics();
    indicator.circle(width - 10, 10, 5);
    indicator.fill({ color: Math.random() > 0.3 ? 0x00ff00 : 0xff0000 });
    machine.addChild(indicator);

    return machine;
  }

  /**
   * Создание конвейерной системы
   */
  private createConveyorSystem(): void {
    this.conveyorSystem = new Container();

    // Горизонтальные конвейеры
    const conveyorData = [
      { x: 0, y: 100, w: 800, h: 30 },
      { x: 1000, y: 100, w: 1400, h: 30 },
      { x: 0, y: 500, w: 600, h: 30 },
      { x: 800, y: 500, w: 1600, h: 30 },
    ];

    conveyorData.forEach((data) => {
      this.createConveyor(data.x, data.y, data.w, data.h);
    });

    this.addChild(this.conveyorSystem);
  }

  /**
   * Создание конвейера
   */
  private createConveyor(
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const conveyor = new Graphics();

    // Основа
    conveyor.rect(x, y, width, height);
    conveyor.fill({ color: 0x333333 });
    conveyor.stroke({ width: 2, color: 0x555555 });

    // Ролики
    for (let i = x; i < x + width; i += 20) {
      conveyor.rect(i, y + 5, 15, height - 10);
      conveyor.fill({ color: 0x666666 });
      conveyor.stroke({ width: 1, color: 0x777777 });
    }

    // Стрелки направления
    for (let i = x + 10; i < x + width - 30; i += 60) {
      conveyor.moveTo(i, y + height / 2);
      conveyor.lineTo(i + 15, y + height / 2);
      conveyor.lineTo(i + 10, y + height / 2 - 5);
      conveyor.moveTo(i + 15, y + height / 2);
      conveyor.lineTo(i + 10, y + height / 2 + 5);
      conveyor.stroke({ width: 2, color: 0x00ff00 });
    }

    this.conveyorSystem.addChild(conveyor);

    this.conveyors.push({
      x,
      y,
      width,
      height,
      active: true,
      graphics: conveyor,
    });
  }

  /**
   * Создание дробилок
   */
  private createCrushers(): void {
    const crusherPositions = [
      { x: 400, y: 300 },
      { x: 1000, y: 450 },
      { x: 1600, y: 250 },
      { x: 2200, y: 400 },
    ];

    crusherPositions.forEach((pos) => {
      const crusher = this.createCrusher(pos.x, pos.y);
      this.machineryContainer.addChild(crusher);

      this.crushers.push({
        x: pos.x,
        y: pos.y,
        width: 80,
        height: 100,
        active: true,
        timer: Math.random() * Math.PI * 2,
        graphics: crusher,
      });
    });
  }

  /**
   * Создание дробилки
   */
  private createCrusher(x: number, y: number): Graphics {
    const crusher = new Graphics();

    // Корпус
    crusher.rect(0, 0, 80, 100);
    crusher.fill({ color: 0x444444 });
    crusher.stroke({ width: 3, color: 0xff0000 });

    // Челюсти
    crusher.moveTo(10, 20);
    crusher.lineTo(40, 80);
    crusher.lineTo(70, 20);
    crusher.fill({ color: 0x666666 });

    // Зубы
    for (let i = 0; i < 4; i++) {
      crusher.moveTo(20 + i * 15, 30 + i * 15);
      crusher.lineTo(25 + i * 15, 45 + i * 15);
      crusher.stroke({ width: 2, color: 0xffffff });
    }

    // Предупреждающие полосы
    for (let i = 0; i < 8; i++) {
      crusher.rect(i * 10, 0, 5, 10);
      crusher.fill({ color: i % 2 === 0 ? 0xffaa00 : 0x000000 });
    }

    crusher.position.set(x, y);
    return crusher;
  }

  /**
   * Создание точек спавна
   */
  private createSpawnPoints(): void {
    this.spawnPoints = [
      { x: 100, y: 200 },
      { x: 500, y: 400 },
      { x: 900, y: 300 },
      { x: 1300, y: 500 },
      { x: 1700, y: 250 },
      { x: 2100, y: 450 },
      { x: 300, y: 600 },
      { x: 1500, y: 150 },
    ];
  }

  /**
   * Создание точек для шестерёнок
   */
  private createGearSpawnPoints(): void {
    this.gearSpawnPoints = [
      { x: 300, y: 250 },
      { x: 700, y: 450 },
      { x: 1100, y: 300 },
      { x: 1500, y: 500 },
      { x: 1900, y: 350 },
      { x: 2200, y: 200 },
      { x: 400, y: 550 },
      { x: 1800, y: 150 },
    ];
  }

  /**
   * Создание точки выхода
   */
  private createExitPoint(): void {
    this.exitPoint = { x: 2300, y: 550 };

    // Визуальное обозначение выхода
    const exitMarker = new Graphics();
    exitMarker.rect(this.exitPoint.x - 50, this.exitPoint.y - 50, 100, 100);
    exitMarker.fill({ color: 0x00ff00, alpha: 0.2 });
    exitMarker.stroke({ width: 2, color: 0x00ff00 });

    // Стрелка
    exitMarker.moveTo(this.exitPoint.x, this.exitPoint.y - 20);
    exitMarker.lineTo(this.exitPoint.x - 20, this.exitPoint.y + 20);
    exitMarker.lineTo(this.exitPoint.x + 20, this.exitPoint.y + 20);
    exitMarker.fill({ color: 0x00ff00 });

    this.floorContainer.addChild(exitMarker);
  }

  /**
   * Создание игрока
   */
  private createPlayer(): void {
    this.player = new Player(this.eventBus);
    this.player.position.set(100, 100);
    this.addChild(this.player);
  }

  /**
   * Создание эффектов
   */
  private createEffects(): void {
    // Освещение
    this.lightingEffect = new Graphics();
    this.addChild(this.lightingEffect);

    // Затемнение
    this.darknessOverlay = new Graphics();
    this.darknessOverlay.rect(0, 0, this.levelWidth, this.levelHeight);
    this.darknessOverlay.fill({ color: 0x000000, alpha: 0.4 });
    this.addChild(this.darknessOverlay);

    // Пар
    for (let i = 0; i < 20; i++) {
      const steam = this.createSteamParticle();
      this.steamParticles.push(steam);
      this.addChild(steam);
    }

    // Искры
    for (let i = 0; i < 15; i++) {
      const spark = this.createSpark();
      this.sparks.push(spark);
      this.addChild(spark);
    }
  }

  /**
   * Создание частицы пара
   */
  private createSteamParticle(): Graphics {
    const steam = new Graphics();
    steam.circle(0, 0, Math.random() * 15 + 5);
    steam.fill({ color: 0xffffff, alpha: 0.1 });
    steam.x = Math.random() * this.levelWidth;
    steam.y = Math.random() * this.levelHeight;
    return steam;
  }

  /**
   * Создание искры
   */
  private createSpark(): Graphics {
    const spark = new Graphics();
    spark.rect(0, 0, 3, 3);
    spark.fill({ color: 0xffaa00, alpha: 0.8 });
    spark.x = Math.random() * this.levelWidth;
    spark.y = Math.random() * this.levelHeight;
    return spark;
  }

  /**
   * Создание HUD
   */
  private createHUD(): void {
    this.hudContainer = new Container();

    // Счётчик шестерёнок
    const gearIcon = new Graphics();
    gearIcon.circle(10, 10, 8);
    gearIcon.fill({ color: 0xffaa00 });
    gearIcon.position.set(20, 20);

    this.gearCounter = new Text({
      text: `Шестерёнки: 0/${this.requiredGears}`,
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 16,
        fill: 0xffffff,
      }),
    });
    this.gearCounter.position.set(45, 18);

    // Цель
    this.objectiveText = new Text({
      text: "Соберите шестерёнки и доберитесь до выхода",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 12,
        fill: 0xff6600,
      }),
    });
    this.objectiveText.position.set(20, 50);

    // Полоса здоровья
    this.healthBar = this.createHealthBar();
    this.healthBar.position.set(20, 80);

    this.hudContainer.addChild(
      gearIcon,
      this.gearCounter,
      this.objectiveText,
      this.healthBar,
    );
    this.addChild(this.hudContainer);
  }

  /**
   * Создание полосы здоровья
   */
  private createHealthBar(): Container {
    const container = new Container();

    const bg = new Graphics();
    bg.rect(0, 0, 200, 15);
    bg.fill({ color: 0x333333 });
    bg.stroke({ width: 1, color: 0x666666 });

    const fill = new Graphics();
    fill.rect(0, 0, 200, 15);
    fill.fill({ color: 0x00ff00 });
    fill.label = "healthFill";

    const text = new Text({
      text: "HP",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 10,
        fill: 0xffffff,
      }),
    });
    text.position.set(5, 2);
    text.label = "healthText";

    container.addChild(bg, fill, text);
    return container;
  }

  /**
   * Создание миникарты
   */
  private createMinimap(): void {
    this.minimap = new Container();
    this.minimap.position.set(1080, 20);

    const bg = new Graphics();
    bg.rect(0, 0, 180, 100);
    bg.fill({ color: 0x000000, alpha: 0.7 });
    bg.stroke({ width: 1, color: 0x444444 });
    this.minimap.addChild(bg);

    this.addChild(this.minimap);
  }

  /**
   * Спавн начальных зомби
   */
  private spawnInitialZombies(): void {
    for (let i = 0; i < 3; i++) {
      this.spawnZombie();
    }
  }

  /**
   * Спавн зомби
   */
  private spawnZombie(): void {
    if (this.zombies.length >= this.maxZombies) return;

    const spawnPoint =
      this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
    const zombie = new ZombieWorker(this.eventBus, this.player);
    zombie.position.set(spawnPoint.x, spawnPoint.y);

    this.zombies.push(zombie);
    this.addChild(zombie);

    this.eventBus.emit(GameEvent.MONSTER_SPAWN, {
      type: "zombie_worker",
      id: `zombie_${Date.now()}`,
      position: spawnPoint,
    });
  }

  /**
   * Спавн шестерёнок
   */
  private spawnGears(): void {
    // Перемешиваем точки спавна
    const shuffled = [...this.gearSpawnPoints].sort(() => Math.random() - 0.5);

    for (let i = 0; i < this.requiredGears + 2; i++) {
      const point = shuffled[i];
      const gear = new Gear(this.eventBus);
      gear.position.set(point.x, point.y);
      this.gears.push(gear);
      this.addChild(gear);
    }
  }

  /**
   * Движение игрока
   */
  private movePlayer(dx: number, dy: number): void {
    if (this.isPlayerDead || this.isLevelComplete) return;

    const speed = 3;
    this.player.x += dx * speed;
    this.player.y += dy * speed;

    // Ограничение в пределах уровня
    this.player.x = Math.max(10, Math.min(this.levelWidth - 10, this.player.x));
    this.player.y = Math.max(
      30,
      Math.min(this.levelHeight - 30, this.player.y),
    );

    // Эффект конвейера
    this.checkConveyorEffect();
  }

  /**
   * Взаимодействие игрока
   */
  private playerInteract(): void {
    // Проверка сбора шестерёнок
    this.checkGearCollection();

    // Проверка активации конвейера
    this.checkConveyorActivation();
  }

  /**
   * Проверка эффекта конвейера
   */
  private checkConveyorEffect(): void {
    this.conveyors.forEach((conveyor) => {
      if (!conveyor.active) return;

      const playerBounds = this.player.getBounds();

      if (
        playerBounds.x > conveyor.x &&
        playerBounds.x < conveyor.x + conveyor.width &&
        playerBounds.y > conveyor.y &&
        playerBounds.y < conveyor.y + conveyor.height
      ) {
        // Движение по конвейеру
        this.player.x += 2;
      }
    });
  }

  /**
   * Обновление зомби
   */
  private updateZombies(delta: number): void {
    this.zombies = this.zombies.filter((zombie) => {
      if (!zombie.isAlive) {
        this.removeChild(zombie);
        return false;
      }

      zombie.update(delta);
      return true;
    });
  }

  /**
   * Обновление спавна зомби
   */
  private updateZombieSpawning(delta: number): void {
    this.zombieSpawnTimer += delta;

    if (this.zombieSpawnTimer >= this.zombieSpawnInterval) {
      this.zombieSpawnTimer = 0;
      this.spawnZombie();

      // Увеличиваем частоту спавна со временем
      this.zombieSpawnInterval = Math.max(120, this.zombieSpawnInterval - 1);
    }
  }

  /**
   * Обновление конвейеров
   */
  private updateConveyors(delta: number): void {
    this.conveyors.forEach((conveyor) => {
      // Анимация движения
      const time = Date.now() * 0.001;
      conveyor.graphics.x += Math.sin(time) * 0.5;
    });
  }

  /**
   * Обновление дробилок
   */
  private updateCrushers(delta: number): void {
    this.crushers.forEach((crusher) => {
      crusher.timer += delta * 0.03;

      // Анимация открытия/закрытия
      const scale = 1 + Math.sin(crusher.timer) * 0.1;
      crusher.graphics.scale.y = scale;

      // Звук дробилки
      if (Math.abs(Math.sin(crusher.timer)) > 0.9 && crusher.active) {
        // this.audioManager.playSFX('crusher-sound', { volume: 0.1 });
      }
    });
  }

  /**
   * Обновление эффектов
   */
  private updateEffects(delta: number): void {
    // Освещение вокруг игрока
    this.lightingEffect.clear();
    const gradientRadius = 200;

    for (let r = gradientRadius; r > 0; r -= 10) {
      const alpha = (r / gradientRadius) * 0.3;
      this.lightingEffect.circle(this.player.x, this.player.y, r);
      this.lightingEffect.fill({ color: 0xffffff, alpha });
    }

    // Пар
    this.steamParticles.forEach((steam) => {
      steam.y -= delta * 0.5;
      steam.x += Math.sin(Date.now() * 0.001 + steam.y) * delta * 0.2;
      steam.alpha = 0.1 + Math.sin(Date.now() * 0.002) * 0.05;

      if (steam.y < 0) {
        steam.y = this.levelHeight;
        steam.x = Math.random() * this.levelWidth;
      }
    });

    // Искры
    this.sparks.forEach((spark) => {
      spark.y -= delta * 2;
      spark.x += (Math.random() - 0.5) * delta * 2;
      spark.alpha -= delta * 0.01;

      if (spark.alpha <= 0 || spark.y < 0) {
        spark.y = Math.random() * this.levelHeight;
        spark.x = Math.random() * this.levelWidth;
        spark.alpha = 0.8;
      }
    });
  }

  /**
   * Проверка столкновений
   */
  private checkCollisions(): void {
    // Столкновения с зомби
    this.zombies.forEach((zombie) => {
      if (this.isColliding(this.player, zombie)) {
        if (zombie.canAttack()) {
          this.damagePlayer(10, "zombie");
          zombie.attack();
        }
      }
    });

    // Столкновения с дробилками
    this.crushers.forEach((crusher) => {
      if (!crusher.active) return;

      const playerBounds = this.player.getBounds();

      if (
        playerBounds.x > crusher.x &&
        playerBounds.x < crusher.x + crusher.width &&
        playerBounds.y > crusher.y &&
        playerBounds.y < crusher.y + crusher.height
      ) {
        this.killPlayer("crusher");
      }
    });

    // Сбор шестерёнок
    this.checkGearCollection();
  }

  /**
   * Проверка сбора шестерёнок
   */
  private checkGearCollection(): void {
    this.gears = this.gears.filter((gear) => {
      if (this.isColliding(this.player, gear)) {
        gear.collect();
        this.collectedGears++;

        this.eventBus.emit(GameEvent.ITEM_COLLECT, {
          type: "gear",
          alias: "gear",
          total: this.collectedGears,
        });

        this.audioManager.playSFX("gear-collect", { volume: 0.5 });

        return false;
      }
      return true;
    });
  }

  /**
   * Проверка активации конвейера
   */
  private checkConveyorActivation(): void {
    if (this.isConveyorActive) return;

    // Проверяем, стоит ли игрок рядом с конвейером выхода
    const playerBounds = this.player.getBounds();
    const exitConveyor = this.conveyors[3]; // Последний конвейер

    if (
      playerBounds.x > exitConveyor.x &&
      playerBounds.x < exitConveyor.x + exitConveyor.width &&
      Math.abs(playerBounds.y - exitConveyor.y) < 50
    ) {
      if (this.collectedGears >= this.requiredGears) {
        this.activateExitConveyor();
      } else {
        // Показать сообщение
        this.showMessage("Нужно больше шестерёнок!");
      }
    }
  }

  /**
   * Активация конвейера выхода
   */
  private activateExitConveyor(): void {
    this.isConveyorActive = true;

    const message = new Text({
      text: "Конвейер активирован!",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 20,
        fill: 0x00ff00,
      }),
    });
    message.anchor.set(0.5);
    message.position.set(640, 360);
    this.addChild(message);

    setTimeout(() => {
      this.removeChild(message);
    }, 2000);
  }

  /**
   * Проверка условий победы
   */
  private checkWinCondition(): void {
    if (!this.isConveyorActive) return;

    const playerBounds = this.player.getBounds();

    if (
      playerBounds.x > this.exitPoint.x - 25 &&
      playerBounds.x < this.exitPoint.x + 25 &&
      playerBounds.y > this.exitPoint.y - 25 &&
      playerBounds.y < this.exitPoint.y + 25
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
      currentHealth: 90, // Упрощённо
      source,
    });

    this.audioManager.playSFX("damage-sound", { volume: 0.5 });
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

    this.audioManager.playSFX("level-complete", { volume: 0.7 });

    this.eventBus.emit(GameEvent.SCENE_CHANGE, {
      from: "assembly",
      to: "chemical",
    });

    setTimeout(() => {
      this.sceneManager.switchTo(
        "chemical",
        {
          inventory: { gears: this.collectedGears },
        },
        {
          type: "fade",
          duration: 1500,
        },
      );
    }, 2000);
  }

  /**
   * Проверка столкновения
   */
  private isColliding(a: Container, b: Container): boolean {
    const boundsA = a.getBounds();
    const boundsB = b.getBounds();

    return (
      boundsA.x < boundsB.x + boundsB.width &&
      boundsA.x + boundsA.width > boundsB.x &&
      boundsA.y < boundsB.y + boundsB.height &&
      boundsA.y + boundsA.height > boundsB.y
    );
  }

  /**
   * Обновление HUD
   */
  private updateHUD(): void {
    this.gearCounter.text = `Шестерёнки: ${this.collectedGears}/${this.requiredGears}`;

    // Цвет счётчика
    if (this.collectedGears >= this.requiredGears) {
      this.gearCounter.style.fill = 0x00ff00;
    } else {
      this.gearCounter.style.fill = 0xffffff;
    }

    // Обновление полосы здоровья
    const healthFill = this.healthBar.getChildByLabel("healthFill") as Graphics;
    if (healthFill) {
      healthFill.clear();
      healthFill.rect(0, 0, 200 * 0.9, 15); // 90% здоровья
      healthFill.fill({ color: 0x00ff00 });
    }
    // Обновление миникарты
    this.updateMinimap();
  }

  /**
   * Обновление миникарты
   */
  private updateMinimap(): void {
    // Очищаем (кроме фона)
    while (this.minimap.children.length > 1) {
      this.minimap.removeChildAt(1);
    }

    // Игрок на миникарте
    const playerDot = new Graphics();
    playerDot.circle(
      (this.player.x / this.levelWidth) * 180,
      (this.player.y / this.levelHeight) * 100,
      3,
    );
    playerDot.fill({ color: 0x00ff00 });
    this.minimap.addChild(playerDot);

    // Зомби на миникарте
    this.zombies.forEach((zombie) => {
      const zombieDot = new Graphics();
      zombieDot.circle(
        (zombie.x / this.levelWidth) * 180,
        (zombie.y / this.levelHeight) * 100,
        2,
      );
      zombieDot.fill({ color: 0xff0000 });
      this.minimap.addChild(zombieDot);
    });

    // Выход на миникарте
    const exitDot = new Graphics();
    exitDot.circle(
      (this.exitPoint.x / this.levelWidth) * 180,
      (this.exitPoint.y / this.levelHeight) * 100,
      3,
    );
    exitDot.fill({ color: 0xffff00 });
    this.minimap.addChild(exitDot);
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
   * Анимация входа игрока
   */
  private async playerEnterAnimation(): Promise<void> {
    this.player.alpha = 0;
    const startTime = Date.now();
    const duration = 1000;

    return new Promise((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        this.player.alpha = progress;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      animate();
    });
  }

  /**
   * Эффект получения урона
   */
  private showDamageEffect(): void {
    const overlay = new Graphics();
    overlay.rect(0, 0, 1280, 720);
    overlay.fill({ color: 0xff0000, alpha: 0.3 });
    overlay.name = "damageOverlay";
    this.addChild(overlay);

    setTimeout(() => {
      this.removeChild(overlay);
    }, 200);
  }

  /**
   * Показ сообщения
   */
  private showMessage(text: string): void {
    const message = new Text({
      text,
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 16,
        fill: 0xff0000,
      }),
    });
    message.anchor.set(0.5);
    message.position.set(640, 600);
    message.name = "message";
    this.addChild(message);

    setTimeout(() => {
      this.removeChild(message);
    }, 2000);
  }

  /**
   * Обработчик смерти игрока
   */
  private onPlayerDeath(): void {
    this.audioManager.playSFX("death-sound", { volume: 0.7 });

    const deathText = new Text({
      text: "ВЫ ПОГИБЛИ",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 32,
        fill: 0xff0000,
      }),
    });
    deathText.anchor.set(0.5);
    deathText.position.set(640, 360);
    this.addChild(deathText);

    setTimeout(() => {
      this.sceneManager.switchTo("assembly");
    }, 2000);
  }

  /**
   * Обработчик сбора предмета
   */
  private onItemCollect(data: { type: string; total: number }): void {
    if (data.type === "gear" && data.total >= this.requiredGears) {
      const message = new Text({
        text: "Все шестерёнки собраны! Найдите выход!",
        style: new TextStyle({
          fontFamily: "Press Start 2P",
          fontSize: 14,
          fill: 0x00ff00,
        }),
      });
      message.anchor.set(0.5);
      message.position.set(640, 600);
      this.addChild(message);

      setTimeout(() => {
        this.removeChild(message);
      }, 3000);
    }
  }

  /**
   * Обработчик уничтожения монстра
   */
  private onMonsterDestroy(): void {
    this.audioManager.playSFX("zombie-death", { volume: 0.5 });
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
    this.zombies.length = 0;
    this.gears.length = 0;
    this.steamParticles.length = 0;
    this.sparks.length = 0;
    this.conveyors.length = 0;
    this.crushers.length = 0;

    await super.cleanup();
  }
}
