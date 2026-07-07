import { Container, Sprite, Graphics, Text, TextStyle, AnimatedSprite } from 'pixi.js';
import { BaseScene } from './BaseScene';
import { GameEvent } from '../core/EventBus';
import { Player } from '../entities/Player';
import { MutatedWorker } from '../entities/MutatedWorker';
import { PipePuzzle } from '../components/PuzzleElements/PipePuzzle';
import type { SceneName } from '../core/SceneManager';
import type { Vector2 } from '../types';

interface GasVent {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
  timer: number;
  interval: number;
  duration: number;
  graphics: Graphics;
}

interface ChemicalPipe {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  isBlocked: boolean;
  isSelected: boolean;
  color: number;
  graphics: Graphics;
}

interface PuzzleNode {
  id: string;
  x: number;
  y: number;
  type: 'start' | 'end' | 'junction' | 'valve';
  connections: string[];
  isActive: boolean;
}

export class ChemicalScene extends BaseScene {
  // Игрок
  private player!: Player;

  // Враги
  private mutants: MutatedWorker[] = [];
  private maxMutants: number = 5;
  private mutantSpawnTimer: number = 0;
  private mutantSpawnInterval: number = 360; // кадры

  // Окружение
  private background!: Container;
  private pipeNetwork!: Container;
  private chemicalTanks: Container[] = [];
  private gasVents: GasVent[] = [];
  private warningLights: Graphics[] = [];

  // Головоломка с трубами
  private pipePuzzle!: PipePuzzle;
  private puzzleNodes: PuzzleNode[] = [];
  private isPuzzleActive: boolean = false;
  private isPuzzleComplete: boolean = false;

  // Химические эффекты
  private gasClouds: Graphics[] = [];
  private chemicalSpills: Graphics[] = [];
  private toxicFog!: Graphics;
  private acidDroplets: Graphics[] = [];

  // HUD
  private hudContainer!: Container;
  private puzzleHint!: Text;
  private objectiveText!: Text;
  private dangerIndicator!: Container;
  private gasMaskIndicator!: Container;

  // Миникарта схемы
  private minimapContainer!: Container;
  private minimapVisible: boolean = false;

  // Состояния
  private isLevelComplete: boolean = false;
  private isPlayerDead: boolean = false;
  private gasMaskDurability: number = 100;
  private isWearingGasMask: boolean = false;
  private toxicLevel: number = 0;
  private valvePositions: Map<string, boolean> = new Map();

  // Размеры уровня
  private levelWidth: number = 2800;
  private levelHeight: number = 720;

  // Точки интереса
  private spawnPoints: Vector2[] = [];
  private safeZones: Vector2[] = [];
  private exitPoint: Vector2 = { x: 2600, y: 400 };

  protected getSceneName(): SceneName {
    return 'chemical';
  }

  protected async preload(): Promise<void> {
    // Ресурсы загружены централизованно
  }

  protected setup(): void {
    this.createBackground();
    this.createPipeNetwork();
    this.createChemicalTanks();
    this.createGasVents();
    this.createWarningSystem();
    this.createChemicalSpills();
    this.createPlayer();
    this.createPuzzleSystem();
    this.createEffects();
    this.createHUD();
    this.createMinimap();

    // Спавн мутантов
    this.spawnInitialMutants();

    // Начальное состояние
    this.alpha = 0;
    this.toxicFog.alpha = 0;
  }

  protected bindEvents(): void {
    // Управление игроком
    this.inputManager.onKeyDown('ArrowLeft', () => this.movePlayer(-1, 0));
    this.inputManager.onKeyDown('ArrowRight', () => this.movePlayer(1, 0));
    this.inputManager.onKeyDown('ArrowUp', () => this.movePlayer(0, -1));
    this.inputManager.onKeyDown('ArrowDown', () => this.movePlayer(0, 1));
    this.inputManager.onKeyDown(' ', (event) => {
      event?.preventDefault();
      this.playerInteract();
    });

    // Открытие миникарты
    this.inputManager.onKeyDown('Tab', (event) => {
      event?.preventDefault();
      this.toggleMinimap();
    });

    // Пауза
    this.inputManager.onKeyDown('Escape', this.onEscape.bind(this));

    // События
    this.eventBus.on(GameEvent.PLAYER_DEATH, this.onPlayerDeath.bind(this));
    this.eventBus.on(GameEvent.PUZZLE_COMPLETE, this.onPuzzleComplete.bind(this));
    this.eventBus.on(GameEvent.MONSTER_DESTROY, this.onMonsterDestroy.bind(this));
  }

  protected async onEnter(): Promise<void> {
    // Атмосферная музыка
    this.audioManager.stopAll(500);
    this.audioManager.playMusic('chemical-music', {
      volume: 0.3,
      fadeIn: 1000,
    });

    // Индустриальные звуки
    this.audioManager.playAmbient('chemical-factory', {
      volume: 0.3,
      fadeIn: 2000,
    });

    // Анимация появления
    await this.fadeIn(1000);

    // Показываем цель
    await this.showObjective();

    // Активируем начальные венты
    this.activateInitialVents();
  }

  public update(delta: number): void {
    if (this.isPlayerDead || this.isLevelComplete) return;

    // Обновление игрока
    this.player.update(delta);

    // Обновление мутантов
    this.updateMutants(delta);

    // Обновление газовых вентов
    this.updateGasVents(delta);

    // Обновление эффектов
    this.updateEffects(delta);

    // Обновление токсичности
    this.updateToxicity(delta);

    // Проверка столкновений
    this.checkCollisions();

    // Обновление HUD
    this.updateHUD();

    // Обновление миникарты
    if (this.minimapVisible) {
      this.updateMinimap();
    }

    // Спавн мутантов
    this.updateMutantSpawning(delta);

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
    bg.fill({ color: 0x0a1a0a });

    // Стены с пятнами химикатов
    const walls = new Graphics();
    for (let x = 0; x < this.levelWidth; x += 50) {
      const wallColor = Math.random() > 0.8 ? 0x1a2a1a : 0x1a1a1a;
      walls.rect(x, 0, 50, 20);
      walls.fill({ color: wallColor });
      walls.rect(x, this.levelHeight - 20, 50, 20);
      walls.fill({ color: wallColor });
    }

    // Химические подтёки на стенах
    for (let i = 0; i < 15; i++) {
      const stain = new Graphics();
      const x = Math.random() * this.levelWidth;
      const y = Math.random() > 0.5 ? 15 : this.levelHeight - 25;
      stain.rect(x, y, Math.random() * 10 + 3, Math.random() * 20 + 10);
      stain.fill({ color: Math.random() > 0.5 ? 0x88ff00 : 0x448800, alpha: 0.3 });
      this.background.addChild(stain);
    }

    this.background.addChild(bg, walls);
    this.addChild(this.background);
  }

  /**
   * Создание сети труб
   */
  private createPipeNetwork(): void {
    this.pipeNetwork = new Container();

    // Горизонтальные трубы
    const horizontalPipes = [
      { x: 0, y: 100, w: 500 },
      { x: 600, y: 100, w: 400 },
      { x: 0, y: 300, w: 300 },
      { x: 400, y: 300, w: 600 },
      { x: 1100, y: 300, w: 500 },
      { x: 0, y: 500, w: 700 },
      { x: 800, y: 500, w: 800 },
      { x: 1700, y: 500, w: 1100 },
    ];

    horizontalPipes.forEach(pipe => {
      this.createHorizontalPipe(pipe.x, pipe.y, pipe.w);
    });

    // Вертикальные трубы
    const verticalPipes = [
      { x: 300, y: 100, h: 200 },
      { x: 600, y: 100, h: 200 },
      { x: 1000, y: 100, h: 200 },
      { x: 300, y: 300, h: 200 },
      { x: 800, y: 300, h: 200 },
      { x: 1600, y: 300, h: 200 },
      { x: 700, y: 500, h: 100 },
      { x: 1600, y: 500, h: 100 },
    ];

    verticalPipes.forEach(pipe => {
      this.createVerticalPipe(pipe.x, pipe.y, pipe.h);
    });

    // Вентили на трубах
    this.createValves();

    this.addChild(this.pipeNetwork);
  }

  /**
   * Создание горизонтальной трубы
   */
  private createHorizontalPipe(x: number, y: number, width: number): void {
    const pipe = new Graphics();

    // Основная труба
    pipe.rect(x, y - 8, width, 16);
    pipe.fill({ color: 0x556655 });
    pipe.stroke({ width: 2, color: 0x667766 });

    // Соединения
    for (let i = x; i < x + width; i += 100) {
      pipe.rect(i - 5, y - 12, 10, 24);
      pipe.fill({ color: 0x445544 });
      pipe.stroke({ width: 1, color: 0x778877 });
    }

    // Потёки
    for (let i = 0; i < width / 50; i++) {
      if (Math.random() > 0.7) {
        const leakX = x + Math.random() * width;
        pipe.rect(leakX, y + 8, 2, Math.random() * 5 + 2);
        pipe.fill({ color: 0x88ff00, alpha: 0.5 });
      }
    }

    this.pipeNetwork.addChild(pipe);
  }

  /**
   * Создание вертикальной трубы
   */
  private createVerticalPipe(x: number, y: number, height: number): void {
    const pipe = new Graphics();

    pipe.rect(x - 8, y, 16, height);
    pipe.fill({ color: 0x556655 });
    pipe.stroke({ width: 2, color: 0x667766 });

    this.pipeNetwork.addChild(pipe);
  }

  /**
   * Создание вентилей
   */
  private createValves(): void {
    const valvePositions = [
      { x: 300, y: 100 },
      { x: 600, y: 100 },
      { x: 300, y: 300 },
      { x: 800, y: 300 },
      { x: 1000, y: 100 },
      { x: 700, y: 500 },
    ];

    valvePositions.forEach((pos, index) => {
      const valve = new Graphics();

      // Корпус вентиля
      valve.circle(0, 0, 12);
      valve.fill({ color: 0xff0000 });
      valve.stroke({ width: 2, color: 0xcc0000 });

      // Ручка
      valve.rect(-15, -2, 30, 4);
      valve.fill({ color: 0x888888 });

      // Индикатор
      valve.circle(0, 0, 4);
      valve.fill({ color: 0x00ff00 });

      valve.position.set(pos.x, pos.y);
      valve.eventMode = 'static';
      valve.cursor = 'pointer';

      const valveId = `valve_${index}`;
      this.valvePositions.set(valveId, false);

      valve.on('pointerdown', () => {
        this.toggleValve(valveId, valve);
      });

      this.pipeNetwork.addChild(valve);
    });
  }

  /**
   * Переключение вентиля
   */
  private toggleValve(valveId: string, valve: Graphics): void {
    const currentState = this.valvePositions.get(valveId) || false;
    this.valvePositions.set(valveId, !currentState);

    // Визуальное обновление
    valve.rotation = currentState ? 0 : Math.PI / 2;

    // Обновление индикатора
    const indicator = valve.children[2] as Graphics;
    if (indicator) {
      indicator.clear();
      indicator.circle(0, 0, 4);
      indicator.fill({ color: currentState ? 0xff0000 : 0x00ff00 });
    }

    this.audioManager.playSFX('valve-turn', { volume: 0.3 });

    // Обновление головоломки
    this.updatePuzzleState(valveId, !currentState);

    // Обновление газовых вентов
    this.updateGasVentStates();
  }

  /**
   * Создание химических резервуаров
   */
  private createChemicalTanks(): void {
    const tankPositions = [
      { x: 200, y: 150, w: 80, h: 120 },
      { x: 800, y: 120, w: 100, h: 150 },
      { x: 1500, y: 140, w: 90, h: 130 },
      { x: 2200, y: 130, w: 110, h: 140 },
    ];

    tankPositions.forEach(pos => {
      const tank = this.createChemicalTank(pos.x, pos.y, pos.w, pos.h);
      this.chemicalTanks.push(tank);
      this.addChild(tank);
    });
  }

  /**
   * Создание химического резервуара
   */
  private createChemicalTank(
    x: number,
    y: number,
    width: number,
    height: number
  ): Container {
    const tank = new Container();
    tank.position.set(x, y);

    // Корпус
    const body = new Graphics();
    body.roundRect(0, 0, width, height, 10);
    body.fill({ color: 0x334433 });
    body.stroke({ width: 3, color: 0x556655 });
    tank.addChild(body);

    // Уровень жидкости
    const liquidLevel = 0.3 + Math.random() * 0.5;
    const liquid = new Graphics();
    liquid.roundRect(5, height * (1 - liquidLevel), width - 10, height * liquidLevel, 5);
    liquid.fill({ color: 0x88ff00, alpha: 0.6 });
    tank.addChild(liquid);

    // Трубы сверху
    const topPipe = new Graphics();
    topPipe.rect(width / 2 - 5, -20, 10, 20);
    topPipe.fill({ color: 0x556655 });
    tank.addChild(topPipe);

    // Индикатор давления
    const gauge = new Graphics();
    gauge.circle(width - 15, 15, 10);
    gauge.fill({ color: 0x222222 });
    gauge.stroke({ width: 1, color: 0x666666 });

    // Стрелка
    const angle = Math.random() * Math.PI;
    gauge.moveTo(width - 15, 15);
    gauge.lineTo(
      width - 15 + Math.cos(angle) * 8,
      15 + Math.sin(angle) * 8
    );
    gauge.stroke({ width: 1, color: 0xff0000 });
    tank.addChild(gauge);

    // Предупреждающие метки
    const warningStripe = new Graphics();
    for (let i = 0; i < height; i += 15) {
      if (i % 30 < 15) {
        warningStripe.rect(width - 3, i, 3, 15);
        warningStripe.fill({ color: 0xffaa00 });
      }
    }
    tank.addChild(warningStripe);

    return tank;
  }

  /**
   * Создание газовых вентов
   */
  private createGasVents(): void {
    const ventPositions = [
      { x: 400, y: 500 },
      { x: 900, y: 300 },
      { x: 1400, y: 500 },
      { x: 1900, y: 300 },
      { x: 2400, y: 500 },
    ];

    ventPositions.forEach(pos => {
      const vent = this.createGasVent(pos.x, pos.y);
      this.gasVents.push(vent);
      this.addChild(vent.graphics);
    });
  }

  /**
   * Создание газового вента
   */
  private createGasVent(x: number, y: number): GasVent {
    const graphics = new Graphics();

    // Решётка вента
    graphics.rect(-15, -5, 30, 10);
    graphics.fill({ color: 0x444444 });
    graphics.stroke({ width: 1, color: 0x666666 });

    // Отверстия
    for (let i = -12; i < 15; i += 5) {
      graphics.rect(i, -3, 3, 6);
      graphics.fill({ color: 0x222222 });
    }

    // Предупреждающая рамка
    graphics.rect(-20, -10, 40, 20);
    graphics.stroke({ width: 1, color: 0xffaa00, alpha: 0.5 });

    graphics.position.set(x, y);

    return {
      x, y,
      width: 40,
      height: 20,
      active: false,
      timer: 0,
      interval: 180 + Math.random() * 120,
      duration: 120,
      graphics,
    };
  }

  /**
   * Создание системы предупреждения
   */
  private createWarningSystem(): void {
    // Лампы предупреждения
    for (let i = 0; i < 8; i++) {
      const light = new Graphics();
      light.circle(0, 0, 8);
      light.fill({ color: 0xff0000, alpha: 0.3 });
      light.position.set(
        100 + i * 350,
        30
      );
      this.warningLights.push(light);
      this.addChild(light);
    }
  }

  /**
   * Создание химических разливов
   */
  private createChemicalSpills(): void {
    for (let i = 0; i < 10; i++) {
      const spill = new Graphics();
      const radius = Math.random() * 30 + 10;
      spill.circle(0, 0, radius);
      spill.fill({ color: 0x88ff00, alpha: 0.2 });
      spill.position.set(
        Math.random() * this.levelWidth,
        40 + Math.random() * (this.levelHeight - 80)
      );
      this.chemicalSpills.push(spill);
      this.addChild(spill);
    }
  }

  /**
   * Создание игрока
   */
  private createPlayer(): void {
    this.player = new Player(this.eventBus);
    this.player.position.set(100, 400);
    this.addChild(this.player);

    // Противогаз
    this.gasMaskIndicator = this.createGasMaskIndicator();
    this.addChild(this.gasMaskIndicator);
  }

  /**
   * Создание индикатора противогаза
   */
  private createGasMaskIndicator(): Container {
    const container = new Container();
    container.position.set(1000, 50);
    container.visible = false;

    const icon = new Graphics();
    icon.roundRect(0, 0, 200, 30, 5);
    icon.fill({ color: 0x000000, alpha: 0.7 });
    icon.stroke({ width: 1, color: 0x00ff00 });
    container.addChild(icon);

    const text = new Text({
      text: 'Противогаз: 100%',
      style: new TextStyle({
        fontFamily: 'Press Start 2P',
        fontSize: 10,
        fill: 0x00ff00,
      }),
    });
    text.position.set(10, 8);
    text.name = 'maskText';
    container.addChild(text);

    return container;
  }

  /**
   * Создание системы головоломки
   */
  private createPuzzleSystem(): void {
    // Создаём узлы схемы
    this.puzzleNodes = [
      { id: 'start', x: 100, y: 400, type: 'start', connections: ['node1', 'node2'], isActive: true },
      { id: 'node1', x: 400, y: 300, type: 'junction', connections: ['start', 'node3', 'node4'], isActive: false },
      { id: 'node2', x: 400, y: 500, type: 'junction', connections: ['start', 'node4', 'node5'], isActive: false },
      { id: 'node3', x: 700, y: 200, type: 'valve', connections: ['node1', 'end'], isActive: false },
      { id: 'node4', x: 700, y: 400, type: 'valve', connections: ['node1', 'node2', 'node5'], isActive: false },
      { id: 'node5', x: 1000, y: 500, type: 'valve', connections: ['node2', 'node4', 'end'], isActive: false },
      { id: 'end', x: 1300, y: 400, type: 'end', connections: ['node3', 'node5'], isActive: true },
    ];

    // Создаём головоломку
    this.pipePuzzle = new PipePuzzle(this.eventBus, this.puzzleNodes);
    this.pipePuzzle.position.set(50, 50);
    this.pipePuzzle.visible = false;
    this.addChild(this.pipePuzzle);
  }

  /**
   * Создание эффектов
   */
  private createEffects(): void {
    // Токсичный туман
    this.toxicFog = new Graphics();
    this.toxicFog.rect(0, 0, this.levelWidth, this.levelHeight);
    this.toxicFog.fill({ color: 0x88ff00, alpha: 0.05 });
    this.addChild(this.toxicFog);

    // Газовые облака
    for (let i = 0; i < 8; i++) {
      const cloud = this.createGasCloud();
      this.gasClouds.push(cloud);
      this.addChild(cloud);
    }

    // Капли кислоты
    for (let i = 0; i < 20; i++) {
      const droplet = this.createAcidDroplet();
      this.acidDroplets.push(droplet);
      this.addChild(droplet);
    }
  }

  /**
   * Создание газового облака
   */
  private createGasCloud(): Graphics {
    const cloud = new Graphics();
    const radius = Math.random() * 40 + 20;

    for (let i = 0; i < 5; i++) {
      const cx = (Math.random() - 0.5) * radius;
      const cy = (Math.random() - 0.5) * radius;
      cloud.circle(cx, cy, radius * (0.5 + Math.random() * 0.5));
      cloud.fill({ color: 0x88ff00, alpha: 0.1 });
    }

    cloud.position.set(
      Math.random() * this.levelWidth,
      Math.random() * this.levelHeight
    );
    cloud.alpha = 0;

    return cloud;
  }

  /**
   * Создание капли кислоты
   */
  private createAcidDroplet(): Graphics {
    const droplet = new Graphics();
    droplet.ellipse(0, 0, 2, 3);
    droplet.fill({ color: 0x88ff00, alpha: 0.8 });
    droplet.position.set(
      Math.random() * this.levelWidth,
      Math.random() * 100
    );
    return droplet;
  }

  /**
   * Создание HUD
   */
  private createHUD(): void {
    this.hudContainer = new Container();

    // Цель
    this.objectiveText = new Text({
      text: 'Настройте систему труб и доберитесь до выхода',
      style: new TextStyle({
        fontFamily: 'Press Start 2P',
        fontSize: 12,
        fill: 0xff6600,
        wordWrap: true,
        wordWrapWidth: 400,
      }),
    });
    this.objectiveText.position.set(20, 20);

    // Подсказка головоломки
    this.puzzleHint = new Text({
      text: 'Нажмите Tab для просмотра схемы',
      style: new TextStyle({
        fontFamily: 'Press Start 2P',
        fontSize: 10,
        fill: 0x888888,
      }),
    });
    this.puzzleHint.position.set(20, 60);

    // Индикатор опасности
    this.dangerIndicator = this.createDangerIndicator();
    this.dangerIndicator.position.set(1100, 20);

    this.hudContainer.addChild(
      this.objectiveText,
      this.puzzleHint,
      this.dangerIndicator
    );
    this.addChild(this.hudContainer);
  }

  /**
   * Создание индикатора опасности
   */
  private createDangerIndicator(): Container {
    const container = new Container();

    const bg = new Graphics();
    bg.roundRect(0, 0, 150, 40, 5);
    bg.fill({ color: 0x000000, alpha: 0.7 });
    bg.stroke({ width: 1, color: 0x666666 });
    container.addChild(bg);

    const icon = new Text({
      text: '⚠',
      style: new TextStyle({
        fontSize: 20,
        fill: 0xffff00,
      }),
    });
    icon.position.set(10, 5);
    container.addChild(icon);

    const text = new Text({
      text: 'Токсичность: 0%',
      style: new TextStyle({
        fontFamily: 'Press Start 2P',
        fontSize: 8,
        fill: 0xffff00,
      }),
    });
    text.position.set(40, 12);
    text.name = 'toxicityText';
    container.addChild(text);

    return container;
  }

  /**
   * Создание миникарты
   */
  private createMinimap(): void {
    this.minimapContainer = new Container();
    this.minimapContainer.position.set(800, 100);
    this.minimapContainer.visible = false;

    // Фон
    const bg = new Graphics();
    bg.roundRect(0, 0, 400, 300, 10);
    bg.fill({ color: 0x000000, alpha: 0.9 });
    bg.stroke({ width: 2, color: 0x00ff00 });
    this.minimapContainer.addChild(bg);

    // Заголовок
    const title = new Text({
      text: 'СХЕМА ТРУБОПРОВОДА',
      style: new TextStyle({
        fontFamily: 'Press Start 2P',
        fontSize: 12,
        fill: 0x00ff00,
      }),
    });
    title.position.set(40, 15);
    this.minimapContainer.addChild(title);

    this.addChild(this.minimapContainer);
  }

  /**
   * Активация начальных вентов
   */
  private activateInitialVents(): void {
    // Активируем несколько вентов для начальной сложности
    this.gasVents.forEach((vent, index) => {
      if (index % 2 === 0) {
        vent.active = true;
        vent.timer = Math.random() * vent.interval;
      }
    });
  }

  /**
   * Спавн начальных мутантов
   */
  private spawnInitialMutants(): void {
    this.spawnPoints = [
      { x: 500, y: 400 },
      { x: 1000, y: 300 },
      { x: 1500, y: 500 },
      { x: 2000, y: 350 },
    ];

    for (let i = 0; i < 2; i++) {
      this.spawnMutant();
    }
  }

  /**
   * Спавн мутанта
   */
  private spawnMutant(): void {
    if (this.mutants.length >= this.maxMutants) return;

    const spawnPoint = this.spawnPoints[
      Math.floor(Math.random() * this.spawnPoints.length)
    ];

    const mutant = new MutatedWorker(this.eventBus, this.player);
    mutant.setPosition(spawnPoint.x, spawnPoint.y);

    this.mutants.push(mutant);
    this.addChild(mutant);

    this.eventBus.emit(GameEvent.MONSTER_SPAWN, {
      type: 'mutated_worker',
      id: `mutant_${Date.now()}`,
      position: spawnPoint,
    });
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
    this.player.y = Math.max(30, Math.min(this.levelHeight - 30, this.player.y));

    // Проверка безопасных зон
    this.checkSafeZones();
  }

  /**
   * Взаимодействие игрока
   */
  private playerInteract(): void {
    // Проверка взаимодействия с вентилями
    this.checkValveInteraction();

    // Проверка взаимодействия с головоломкой
    if (this.isNearPuzzleTerminal()) {
      this.togglePuzzle();
    }
  }

  /**
   * Проверка взаимодействия с вентилями
   */
  private checkValveInteraction(): void {
    const playerPos = this.player.getPosition();

    // Поиск ближайшего вентиля
    for (const [valveId, _] of this.valvePositions) {
      const valveIndex = parseInt(valveId.split('_')[1]);
      const valvePos = {
        x: [300, 600, 300, 800, 1000, 700][valveIndex],
        y: [100, 100, 300, 300, 100, 500][valveIndex],
      };

      const distance = Math.sqrt(
        Math.pow(playerPos.x - valvePos.x, 2) +
        Math.pow(playerPos.y - valvePos.y, 2)
      );

      if (distance < 50) {
        const valve = this.pipeNetwork.children[3 + valveIndex] as Graphics;
        this.toggleValve(valveId, valve);
        break;
      }
    }
  }

  /**
   * Проверка близости к терминалу головоломки
   */
  private isNearPuzzleTerminal(): boolean {
    const playerPos = this.player.getPosition();
    const terminalPos = { x: 600, y: 650 };

    const distance = Math.sqrt(
      Math.pow(playerPos.x - terminalPos.x, 2) +
      Math.pow(playerPos.y - terminalPos.y, 2)
    );

    return distance < 60;
  }

  /**
   * Переключение головоломки
   */
  private togglePuzzle(): void {
    this.isPuzzleActive = !this.isPuzzleActive;
    this.pipePuzzle.visible = this.isPuzzleActive;

    if (this.isPuzzleActive) {
      this.eventBus.emit(GameEvent.GAME_PAUSE, { reason: 'puzzle' });
    } else {
      this.eventBus.emit(GameEvent.GAME_RESUME, {});
    }
  }

  /**
   * Переключение миникарты
   */
  private toggleMinimap(): void {
    this.minimapVisible = !this.minimapVisible;
    this.minimapContainer.visible = this.minimapVisible;

    if (this.minimapVisible) {
      this.updateMinimap();
    }
  }

  /**
   * Обновление мутантов
   */
  private updateMutants(delta: number): void {
    this.mutants = this.mutants.filter(mutant => {
      if (!mutant.isAlive) {
        this.removeChild(mutant);
        mutant.destroy();
        return false;
      }

      mutant.update(delta);

      // Мутанты получают урон от газа
      if (this.toxicLevel > 50) {
        mutant.takeDamage(0.5, 'toxic_gas');
      }

      return true;
    });
  }

  /**
   * Обновление спавна мутантов
   */
  private updateMutantSpawning(delta: number): void {
    this.mutantSpawnTimer += delta;

    if (this.mutantSpawnTimer >= this.mutantSpawnInterval) {
      this.mutantSpawnTimer = 0;
      this.spawnMutant();

      // Увеличиваем частоту спавна
      this.mutantSpawnInterval = Math.max(180, this.mutantSpawnInterval - 1);
    }
  }

  /**
   * Обновление газовых вентов
   */
  private updateGasVents(delta: number): void {
    this.gasVents.forEach(vent => {
      if (!vent.active) return;

      vent.timer -= delta;

      if (vent.timer <= 0) {
        // Переключение состояния вента
        if (vent.graphics.alpha > 0.5) {
          // Выключение газа
          vent.graphics.alpha = 0.3;
          vent.timer = vent.interval;
        } else {
          // Включение газа
          vent.graphics.alpha = 1;
          vent.timer = vent.duration;
          this.emitGasCloud(vent.x, vent.y + 20);
        }
      }

      // Анимация активного вента
      if (vent.graphics.alpha > 0.5) {
        vent.graphics.scale.set(1 + Math.sin(Date.now() * 0.01) * 0.1);
      }
    });
  }

  /**
   * Выброс газового облака
   */
  private emitGasCloud(x: number, y: number): void {
    const cloud = this.gasClouds.find(c => c.alpha <= 0);
    if (!cloud) return;

    cloud.position.set(x, y);
    cloud.alpha = 0.6;
    cloud.scale.set(0.5);
  }

  /**
   * Обновление состояний газовых вентов
   */
  private updateGasVentStates(): void {
    // Анализируем позиции вентилей и определяем, какие венты активны
    let activeVentCount = 0;

    for (const [valveId, isOpen] of this.valvePositions) {
      if (isOpen) activeVentCount++;
    }

    // Обновляем активность вентов
    this.gasVents.forEach((vent, index) => {
      vent.active = index < activeVentCount;
    });
  }

  /**
   * Обновление состояния головоломки
   */
  private updatePuzzleState(valveId: string, isOpen: boolean): void {
    if (this.isPuzzleComplete) return;

    // Обновляем узлы головоломки
    const nodeIndex = this.puzzleNodes.findIndex(
      node => node.type === 'valve' && `valve_${node.id}` === valveId
    );

    if (nodeIndex !== -1) {
      this.puzzleNodes[nodeIndex].isActive = isOpen;
      this.pipePuzzle.updateNodes(this.puzzleNodes);

      // Проверяем решение
      this.checkPuzzleSolution();
    }
  }

  /**
   * Проверка решения головоломки
   */
  private checkPuzzleSolution(): void {
    // Проверяем, можно ли добраться от start до end
    const visited = new Set<string>();
    const queue = ['start'];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current === 'end') {
        this.completePuzzle();
        return;
      }

      if (visited.has(current)) continue;
      visited.add(current);

      const node = this.puzzleNodes.find(n => n.id === current);
      if (!node) continue;

      // Для активных узлов или start/end добавляем соединения
      if (node.isActive || node.type === 'start' || node.type === 'end') {
        node.connections.forEach(conn => {
          if (!visited.has(conn)) {
            queue.push(conn);
          }
        });
      }
    }
  }

  /**
   * Завершение головоломки
   */
  private completePuzzle(): void {
    this.isPuzzleComplete = true;
    this.isPuzzleActive = false;
    this.pipePuzzle.visible = false;

    // Отключаем все газовые венты
    this.gasVents.forEach(vent => {
      vent.active = false;
    });

    // Уменьшаем токсичность
    this.toxicLevel = Math.max(0, this.toxicLevel - 50);

    this.eventBus.emit(GameEvent.PUZZLE_COMPLETE, {
      puzzleId: 'pipe_system',
      reward: 'gas_disabled',
    });

    this.eventBus.emit(GameEvent.GAME_RESUME, {});

    this.audioManager.playSFX('puzzle-complete', { volume: 0.7 });

    // Показываем сообщение
    this.showMessage('Система труб настроена! Газ отключён!', 0x00ff00);
  }

  /**
   * Обновление эффектов
   */
  private updateEffects(delta: number): void {
    // Токсичный туман
    if (this.toxicLevel > 0) {
      this.toxicFog.alpha = this.toxicLevel / 100 * 0.3;
      this.toxicFog.x = Math.sin(Date.now() * 0.0005) * 10;
    }

    // Газовые облака
    this.gasClouds.forEach(cloud => {
      if (cloud.alpha > 0) {
        cloud.alpha -= delta * 0.001;
        cloud.scale.set(cloud.scale.x + delta * 0.002);
        cloud.x += Math.sin(Date.now() * 0.001 + cloud.y) * delta * 0.2;
      }
    });

    // Капли кислоты
    this.acidDroplets.forEach(droplet => {
      droplet.y += delta * 1.5;

      if (droplet.y > this.levelHeight) {
        droplet.y = Math.random() * 100;
        droplet.x = Math.random() * this.levelWidth;
      }
    });

    // Лампы предупреждения
    this.warningLights.forEach((light, index) => {
      const intensity = 0.3 + Math.sin(Date.now() * 0.003 + index) * 0.3;
      light.alpha = intensity;

      if (this.toxicLevel > 50) {
        light.alpha = 0.5 + Math.sin(Date.now() * 0.01 + index) * 0.5;
      }
    });

    // Химические разливы
    this.chemicalSpills.forEach(spill => {
      spill.alpha = 0.1 + Math.sin(Date.now() * 0.002 + spill.x) * 0.1;
    });
  }

  /**
   * Обновление токсичности
   */
  private updateToxicity(delta: number): void {
    // Проверяем, находится ли игрок в зоне газа
    let isInGas = false;

    this.gasVents.forEach(vent => {
      if (!vent.active || vent.graphics.alpha < 0.5) return;

      const playerPos = this.player.getPosition();
      const distance = Math.sqrt(
        Math.pow(playerPos.x - vent.x, 2) +
        Math.pow(playerPos.y - (vent.y + 50), 2)
      );

      if (distance < 80) {
        isInGas = true;
      }
    });

    // Проверка газовых облаков
    this.gasClouds.forEach(cloud => {
      if (cloud.alpha <= 0) return;

      const playerPos = this.player.getPosition();
      const distance = Math.sqrt(
        Math.pow(playerPos.x - cloud.x, 2) +
        Math.pow(playerPos.y - cloud.y, 2)
      );

      if (distance < 60) {
        isInGas = true;
      }
    });

    // Обновление уровня токсичности
    if (isInGas && !this.isWearingGasMask) {
      this.toxicLevel = Math.min(100, this.toxicLevel + delta * 0.5);
    } else if (this.isWearingGasMask) {
      this.gasMaskDurability -= delta * 0.3;
      if (this.gasMaskDurability <= 0) {
        this.isWearingGasMask = false;
        this.gasMaskIndicator.visible = false;
        this.showMessage('Противогаз сломан!', 0xff0000);
      }
    } else {
      this.toxicLevel = Math.max(0, this.toxicLevel - delta * 0.1);
    }

    // Урон от токсичности
    if (this.toxicLevel >= 100) {
      this.player.takeDamage(5, 'toxic_gas');
    } else if (this.toxicLevel >= 50) {
      this.player.takeDamage(1, 'toxic_gas');
    }
  }

  /**
   * Проверка безопасных зон
   */
  private checkSafeZones(): void {
    const playerPos = this.player.getPosition();

    this.safeZones.forEach(zone => {
      const distance = Math.sqrt(
        Math.pow(playerPos.x - zone.x, 2) +
        Math.pow(playerPos.y - zone.y, 2)
      );

      if (distance < 50) {
        this.toxicLevel = Math.max(0, this.toxicLevel - 2);
      }
    });
  }

  /**
   * Проверка столкновений
   */
  private checkCollisions(): void {
    // Столкновения с мутантами
    this.mutants.forEach(mutant => {
      if (this.isColliding(this.player, mutant)) {
        if (mutant.canAttack()) {
          this.player.takeDamage(15, 'mutant');
        }
      }
    });

    // Столкновения с химическими разливами
    this.chemicalSpills.forEach(spill => {
      const playerPos = this.player.getPosition();
      const distance = Math.sqrt(
        Math.pow(playerPos.x - spill.x, 2) +
        Math.pow(playerPos.y - spill.y, 2)
      );

      if (distance < 20) {
        this.player.takeDamage(3, 'chemical_spill');
      }
    });

    // Столкновения с каплями кислоты
    this.acidDroplets.forEach(droplet => {
      if (this.isColliding(this.player, droplet)) {
        this.player.takeDamage(2, 'acid_droplet');
        droplet.y = -10;
      }
    });
  }

  /**
   * Проверка условий победы
   */
  private checkWinCondition(): void {
    const playerPos = this.player.getPosition();
    const distance = Math.sqrt(
      Math.pow(playerPos.x - this.exitPoint.x, 2) +
      Math.pow(playerPos.y - this.exitPoint.y, 2)
    );

    if (distance < 50) {
      this.completeLevel();
    }
  }

  /**
   * Завершение уровня
   */
  private completeLevel(): void {
    if (this.isLevelComplete) return;
    this.isLevelComplete = true;

    this.audioManager.playSFX('level-complete', { volume: 0.7 });

    this.eventBus.emit(GameEvent.SCENE_CHANGE, {
      from: 'chemical',
      to: 'soldiers',
    });

    setTimeout(() => {
      this.sceneManager.switchTo('soldiers', {}, {
        type: 'fade',
        duration: 1500,
      });
    }, 2000);
  }

  /**
   * Проверка столкновения
   */
  private isColliding(a: Container, b: Container): boolean {
    const boundsA = a.getBounds();
    const boundsB = b.getBounds();

    return boundsA.x < boundsB.x + boundsB.width &&
           boundsA.x + boundsA.width > boundsB.x &&
           boundsA.y < boundsB.y + boundsB.height &&
           boundsA.y + boundsA.height > boundsB.y;
  }

  /**
   * Обновление HUD
   */
  private updateHUD(): void {
    // Обновление индикатора токсичности
    const toxicityText = this.dangerIndicator.getChildByName('toxicityText') as Text;
    if (toxicityText) {
      toxicityText.text = `Токсичность: ${Math.floor(this.toxicLevel)}%`;

      if (this.toxicLevel > 75) {
        toxicityText.style.fill = 0xff0000;
      } else if (this.toxicLevel > 50) {
        toxicityText.style.fill = 0xff6600;
      } else if (this.toxicLevel > 25) {
        toxicityText.style.fill = 0xffff00;
      } else {
        toxicityText.style.fill = 0x00ff00;
      }
    }

    // Обновление индикатора противогаза
    if (this.isWearingGasMask) {
      this.gasMaskIndicator.visible = true;
      const maskText = this.gasMaskIndicator.getChildByName('maskText') as Text;
      if (maskText) {
        maskText.text = `Противогаз: ${Math.floor(this.gasMaskDurability)}%`;
      }
    }

    // Обновление подсказки головоломки
    if (this.isPuzzleComplete) {
      this.puzzleHint.text = 'Система труб настроена!';
      this.puzzleHint.style.fill = 0x00ff00;
    }
  }

  /**
   * Обновление миникарты
   */
  private updateMinimap(): void {
    // Очищаем старые элементы (кроме фона и заголовка)
    while (this.minimapContainer.children.length > 2) {
      this.minimapContainer.removeChildAt(2);
    }

    const scale = 0.3;
    const offsetX = 20;
    const offsetY = 50;

    // Рисуем узлы
    this.puzzleNodes.forEach(node => {
      const nodeGraphic = new Graphics();
      const x = offsetX + node.x * scale;
      const y = offsetY + node.y * scale;

      nodeGraphic.circle(x, y, 5);

      switch (node.type) {
        case 'start':
          nodeGraphic.fill({ color: 0x00ff00 });
          break;
        case 'end':
          nodeGraphic.fill({ color: 0xff0000 });
          break;
        case 'valve':
          nodeGraphic.fill({ color: node.isActive ? 0x00ff00 : 0xff0000 });
          break;
        case 'junction':
          nodeGraphic.fill({ color: 0xffff00 });
          break;
      }

      this.minimapContainer.addChild(nodeGraphic);
    });

    // Рисуем соединения
    this.puzzleNodes.forEach(node => {
      const startX = offsetX + node.x * scale;
      const startY = offsetY + node.y * scale;

      node.connections.forEach(connId => {
        const connNode = this.puzzleNodes.find(n => n.id === connId);
        if (!connNode) return;

        const endX = offsetX + connNode.x * scale;
        const endY = offsetY + connNode.y * scale;

        const line = new Graphics();
        line.moveTo(startX, startY);
        line.lineTo(endX, endY);
        line.stroke({ width: 2, color: 0x444444 });

        this.minimapContainer.addChild(line);
      });
    });
  }

  /**
   * Показ цели
   */
  private async showObjective(): Promise<void> {
    this.objectiveText.alpha = 0;

    const duration = 1000;
    const startTime = Date.now();

    return new Promise(resolve => {
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
   * Показ сообщения
   */
  private showMessage(text: string, color: number = 0xffffff): void {
    const message = new Text({
      text,
      style: new TextStyle({
        fontFamily: 'Press Start 2P',
        fontSize: 14,
        fill: color,
      }),
    });
    message.anchor.set(0.5);
    message.position.set(640, 600);
    this.addChild(message);

    setTimeout(() => {
      this.removeChild(message);
      message.destroy();
    }, 3000);
  }

  /**
   * Обработчик смерти игрока
   */
  private onPlayerDeath(): void {
    this.audioManager.playSFX('death-sound', { volume: 0.7 });

    const deathText = new Text({
      text: 'ВЫ ПОГИБЛИ',
      style: new TextStyle({
        fontFamily: 'Press Start 2P',
        fontSize: 32,
        fill: 0x88ff00,
      }),
    });
    deathText.anchor.set(0.5);
    deathText.position.set(640, 360);
    this.addChild(deathText);

    setTimeout(() => {
      this.sceneManager.switchTo('chemical');
    }, 2000);
  }

  /**
   * Обработчик завершения головоломки
   */
  private onPuzzleComplete(): void {
    // Дополнительная логика
  }

  /**
   * Обработчик уничтожения монстра
   */
  private onMonsterDestroy(): void {
    // Может выпасть предмет
    if (Math.random() < 0.3) {
      this.showMessage('Выпал фильтр для противогаза!', 0x00ff00);
      this.gasMaskDurability = 100;
      this.isWearingGasMask = true;
    }
  }

  /**
   * Обработчик Escape
   */
  private onEscape(): void {
    if (this.isPuzzleActive) {
      this.togglePuzzle();
    } else {
      this.eventBus.emit(GameEvent.GAME_PAUSE, { reason: 'escape' });
    }
  }

  /**
   * Очистка сцены
   */
  public async cleanup(): Promise<void> {
    this.audioManager.stopAll(500);
    this.mutants.forEach(m => m.destroy());
    this.mutants.length = 0;
    this.gasVents.length = 0;
    this.gasClouds.length = 0;
    this.acidDroplets.length = 0;
    this.chemicalSpills.length = 0;

    await super.cleanup();
  }
}
