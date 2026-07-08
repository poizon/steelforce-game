import {
  Container,
  Sprite,
  Graphics,
  Text,
  TextStyle,
  AnimatedSprite,
} from "pixi.js";
import * as BaseScene from "./BaseScene";
import { GameEvent } from "../core/EventBus";
import { Player } from "../entities/Player";
import { Soldier } from "../entities/Soldier";
import { DialogBox } from "../components/DialogBox";
import type { SceneName } from "../core/SceneManager";
import type { Vector2 } from "../types";

interface QuestItem {
  id: string;
  name: string;
  description: string;
  location: Vector2;
  found: boolean;
  delivered: boolean;
  sprite?: Sprite;
}

interface DialogOption {
  text: string;
  action: () => void;
  condition?: () => boolean;
}

export class SoldiersScene extends BaseScene.BaseScene {
  // Игрок
  private player!: Player;

  // Солдаты
  private soldiers: Soldier[] = [];
  private soldierLeader!: Soldier;
  private soldierPositions: Vector2[] = [];

  // Диалог
  private dialogBox!: DialogBox;
  private isDialogActive: boolean = false;

  // Квестовые предметы
  private questItems: QuestItem[] = [];
  private requiredItems: string[] = [];
  private deliveredItems: Set<string> = new Set();

  // Окружение
  private background!: Container;
  private streetContainer!: Container;
  private tunnelEntrance!: Container;
  private barricade!: Container;
  private searchZones: Container[] = [];

  // Эффекты
  private fogEffect!: Graphics;
  private searchlightEffect!: Graphics;
  private dustParticles: Graphics[] = [];
  private rainDrops: Graphics[] = [];

  // HUD
  private hudContainer!: Container;
  private questLog!: Container;
  private objectiveText!: Text;
  private itemCountText!: Text;
  private interactionHint!: Text;

  // Состояния
  private isLevelComplete: boolean = false;
  private isPlayerDead: boolean = false;
  private gamePhase: "dialogue" | "search" | "delivery" | "complete" =
    "dialogue";
  private currentDialogIndex: number = 0;
  private searchTimer: number = 0;
  private searchTimeLimit: number = 18000; // 5 минут в кадрах

  // Диалоги
  private introductionDialogues: Array<{
    speaker: string;
    text: string;
    emotion?: "neutral" | "angry" | "suspicious" | "demanding";
  }> = [];

  private deliveryDialogues: Array<{
    speaker: string;
    text: string;
    emotion?: "neutral" | "angry" | "satisfied" | "impatient";
  }> = [];

  // Размеры уровня
  private levelWidth: number = 2400;
  private levelHeight: number = 720;

  protected getSceneName(): SceneName {
    return "soldiers";
  }

  protected async preload(): Promise<void> {
    // Ресурсы загружены централизованно
  }

  protected setup(): void {
    this.initQuestItems();
    this.initDialogues();

    this.createBackground();
    this.createStreet();
    this.createBarricade();
    this.createTunnelEntrance();
    this.createSearchZones();
    this.createPlayer();
    this.createSoldiers();
    this.createEffects();
    this.createHUD();
    this.createDialogBox();

    // Начальное состояние
    this.alpha = 0;
    this.fogEffect.alpha = 0.3;
  }

  protected bindEvents(): void {
    // Управление игроком
    this.inputManager.onKeyDown("ArrowLeft", () => this.movePlayer(-1, 0));
    this.inputManager.onKeyDown("ArrowRight", () => this.movePlayer(1, 0));
    this.inputManager.onKeyDown("ArrowUp", () => this.movePlayer(0, -1));
    this.inputManager.onKeyDown("ArrowDown", () => this.movePlayer(0, 1));
    this.inputManager.onKeyDown(" ", (event) => {
      event?.preventDefault();
      this.playerInteract();
    });
    this.inputManager.onKeyDown("E", (event) => {
      event?.preventDefault();
      this.playerInteract();
    });

    // Инвентарь
    this.inputManager.onKeyDown("I", (event) => {
      event?.preventDefault();
      this.toggleQuestLog();
    });

    // Пауза
    this.inputManager.onKeyDown("Escape", this.onEscape.bind(this));

    // События
    this.eventBus.on(GameEvent.PLAYER_DEATH, this.onPlayerDeath.bind(this));
    this.eventBus.on(GameEvent.ITEM_COLLECT, this.onItemCollect.bind(this));
    this.eventBus.on(GameEvent.DIALOG_END, this.onDialogEnd.bind(this));
  }

  protected async onEnter(): Promise<void> {
    // Атмосферная музыка
    this.audioManager.stopAll(500);
    this.audioManager.playMusic("tense-music", {
      volume: 0.3,
      fadeIn: 1000,
    });

    // Звуки улицы
    this.audioManager.playAmbient("street-ambient", {
      volume: 0.2,
      fadeIn: 2000,
    });

    // Анимация появления
    await this.fadeIn(1000);

    // Начинаем диалог с солдатами
    await this.startIntroDialogue();
  }

  public update(delta: number): void {
    if (this.isPlayerDead || this.isLevelComplete) return;

    // Обновление игрока
    this.player.update(delta);

    // Обновление солдат
    this.updateSoldiers(delta);

    // Обновление поиска
    if (this.gamePhase === "search") {
      this.updateSearchTimer(delta);
    }

    // Обновление эффектов
    this.updateEffects(delta);

    // Обновление HUD
    this.updateHUD();

    // Проверка взаимодействий
    this.checkInteractions();

    // Проверка условий доставки
    if (this.gamePhase === "delivery") {
      this.checkDeliveryConditions();
    }
  }

  /**
   * Инициализация квестовых предметов
   */
  private initQuestItems(): void {
    this.questItems = [
      {
        id: "medkit",
        name: "Аптечка",
        description: "Военная аптечка первой помощи",
        location: { x: 400, y: 300 },
        found: false,
        delivered: false,
      },
      {
        id: "ammo_box",
        name: "Ящик с патронами",
        description: "Запечатанный ящик боеприпасов",
        location: { x: 800, y: 450 },
        found: false,
        delivered: false,
      },
      {
        id: "radio_parts",
        name: "Детали рации",
        description: "Запчасти для полевой радиостанции",
        location: { x: 1200, y: 350 },
        found: false,
        delivered: false,
      },
      {
        id: "water_supply",
        name: "Запасы воды",
        description: "Канистра с чистой водой",
        location: { x: 1600, y: 500 },
        found: false,
        delivered: false,
      },
      {
        id: "fuel_canister",
        name: "Канистра топлива",
        description: "Канистра с горючим для генератора",
        location: { x: 2000, y: 400 },
        found: false,
        delivered: false,
      },
    ];

    // Солдатам нужно 3 случайных предмета
    const shuffled = [...this.questItems].sort(() => Math.random() - 0.5);
    this.requiredItems = shuffled.slice(0, 3).map((item) => item.id);
  }

  /**
   * Инициализация диалогов
   */
  private initDialogues(): void {
    this.introductionDialogues = [
      {
        speaker: "Сержант",
        text: "СТОЯТЬ! Никому не пройти через тоннель без специального разрешения.",
        emotion: "angry",
      },
      {
        speaker: "Сержант",
        text: "У нас приказ: никого не пропускать. Но... возможно мы сможем договориться.",
        emotion: "suspicious",
      },
      {
        speaker: "Сержант",
        text: "Нам нужны припасы. Разграбленные здания вокруг полны полезных вещей.",
        emotion: "neutral",
      },
      {
        speaker: "Сержант",
        text: `Принесите нам следующие предметы: ${this.requiredItems
          .map((id) => {
            const item = this.questItems.find((i) => i.id === id);
            return item?.name || id;
          })
          .join(", ")}.`,
        emotion: "demanding",
      },
      {
        speaker: "Сержант",
        text: "Найдите эти предметы в округе и принесите их нам. Тогда мы пропустим вас через тоннель.",
        emotion: "neutral",
      },
      {
        speaker: "Сержант",
        text: "Но поторопитесь! У нас приказ взорвать тоннель через 5 минут. Время пошло!",
        emotion: "angry",
      },
    ];

    this.deliveryDialogues = [
      {
        speaker: "Сержант",
        text: "Отлично! Вы принесли всё что нужно. Мы сдержим слово.",
        emotion: "satisfied",
      },
      {
        speaker: "Сержант",
        text: "Проходите через тоннель, пока есть время. Удачи вам!",
        emotion: "neutral",
      },
    ];
  }

  /**
   * Создание фона
   */
  private createBackground(): void {
    this.background = new Container();

    // Тёмное небо
    const sky = new Graphics();
    sky.rect(0, 0, this.levelWidth, 400);
    sky.fill({ color: 0x1a1a2e });

    // Звёзды (редкие)
    for (let i = 0; i < 30; i++) {
      sky.circle(Math.random() * this.levelWidth, Math.random() * 200, 1);
      sky.fill({ color: 0xffffff, alpha: Math.random() * 0.5 });
    }

    // Луна (кровавая)
    sky.circle(1800, 80, 40);
    sky.fill({ color: 0xff4400, alpha: 0.8 });
    sky.circle(1800, 80, 35);
    sky.fill({ color: 0xff6600, alpha: 0.3 });

    this.background.addChild(sky);

    // Разрушенные здания на заднем плане
    for (let i = 0; i < 12; i++) {
      const building = this.createRuinedBuilding(
        i * 200 + Math.random() * 50,
        200 + Math.random() * 200,
      );
      this.background.addChild(building);
    }

    this.addChild(this.background);
  }

  /**
   * Создание разрушенного здания
   */
  private createRuinedBuilding(x: number, height: number): Graphics {
    const building = new Graphics();

    // Остов здания
    building.rect(x, 400 - height, 80, height);
    building.fill({ color: 0x222222, alpha: 0.8 });
    building.stroke({ width: 1, color: 0x333333 });

    // Разрушенные этажи
    for (let y = 400 - height; y < 400; y += 40) {
      if (Math.random() > 0.3) {
        building.rect(x + 5, y, 70, 3);
        building.fill({ color: 0x444444 });
      }
    }

    // Пробоины
    for (let i = 0; i < 5; i++) {
      if (Math.random() > 0.5) {
        building.circle(
          x + 20 + Math.random() * 40,
          400 - height + Math.random() * (height - 40),
          Math.random() * 10 + 3,
        );
        building.fill({ color: 0x000000, alpha: 0.5 });
      }
    }

    // Огонь в некоторых окнах
    if (Math.random() > 0.7) {
      for (let i = 0; i < 3; i++) {
        building.circle(
          x + 20 + Math.random() * 40,
          400 - height + 20 + Math.random() * (height - 60),
          Math.random() * 5 + 2,
        );
        building.fill({ color: 0xff4400, alpha: 0.6 });
      }
    }

    return building;
  }

  /**
   * Создание улицы
   */
  private createStreet(): void {
    this.streetContainer = new Container();

    // Дорога
    const road = new Graphics();
    road.rect(0, 420, this.levelWidth, 200);
    road.fill({ color: 0x333333 });

    // Разметка (стёртая)
    for (let x = 0; x < this.levelWidth; x += 200) {
      road.rect(x, 515, 100, 5);
      road.fill({ color: 0x666666, alpha: 0.3 });
    }

    // Трещины
    for (let i = 0; i < 20; i++) {
      const startX = Math.random() * this.levelWidth;
      const startY = 420 + Math.random() * 200;
      road.moveTo(startX, startY);
      road.lineTo(
        startX + Math.random() * 30 - 15,
        startY + Math.random() * 20,
      );
      road.stroke({ width: 1, color: 0x222222 });
    }

    this.streetContainer.addChild(road);

    // Обломки
    for (let i = 0; i < 30; i++) {
      const debris = new Graphics();
      debris.rect(0, 0, Math.random() * 15 + 5, Math.random() * 10 + 3);
      debris.fill({ color: 0x555555 });
      debris.position.set(
        Math.random() * this.levelWidth,
        420 + Math.random() * 200,
      );
      debris.rotation = Math.random() * Math.PI * 2;
      this.streetContainer.addChild(debris);
    }

    // Брошенные машины
    for (let i = 0; i < 5; i++) {
      const car = this.createAbandonedCar(
        200 + i * 500 + Math.random() * 200,
        470 + Math.random() * 50,
      );
      this.streetContainer.addChild(car);
    }

    this.addChild(this.streetContainer);
  }

  /**
   * Создание брошенной машины
   */
  private createAbandonedCar(x: number, y: number): Container {
    const car = new Container();
    car.position.set(x, y);

    // Кузов
    const body = new Graphics();
    body.roundRect(0, 0, 60, 25, 5);
    body.fill({ color: 0x664400 });
    body.stroke({ width: 1, color: 0x885500 });
    car.addChild(body);

    // Окна (разбитые)
    const window = new Graphics();
    window.roundRect(10, -8, 15, 10, 2);
    window.fill({ color: 0x333333, alpha: 0.5 });
    window.stroke({ width: 1, color: 0x444444 });
    car.addChild(window);

    window.roundRect(35, -8, 15, 10, 2);
    window.fill({ color: 0x333333, alpha: 0.5 });
    window.stroke({ width: 1, color: 0x444444 });
    car.addChild(window);

    // Колёса
    for (let i = 0; i < 2; i++) {
      const wheel = new Graphics();
      wheel.circle(i * 40 + 10, 25, 6);
      wheel.fill({ color: 0x111111 });
      wheel.stroke({ width: 2, color: 0x333333 });
      car.addChild(wheel);
    }

    return car;
  }

  /**
   * Создание баррикады
   */
  private createBarricade(): void {
    this.barricade = new Container();
    this.barricade.position.set(300, 350);

    // Мешки с песком
    for (let i = 0; i < 8; i++) {
      const sandbag = new Graphics();
      sandbag.ellipse(0, 0, 25, 12);
      sandbag.fill({ color: 0x8b7355 });
      sandbag.stroke({ width: 1, color: 0x6b5335 });
      sandbag.position.set(i * 30, 60 - (i % 2) * 15);
      this.barricade.addChild(sandbag);
    }

    // Металлические листы
    const metalSheet = new Graphics();
    metalSheet.rect(0, 40, 250, 5);
    metalSheet.fill({ color: 0x666666 });
    metalSheet.stroke({ width: 1, color: 0x888888 });
    this.barricade.addChild(metalSheet);

    // Колючая проволока сверху
    const wire = new Graphics();
    for (let x = 0; x < 250; x += 15) {
      wire.moveTo(x, 30);
      wire.lineTo(x + 10, 20);
      wire.lineTo(x + 15, 30);
      wire.stroke({ width: 1, color: 0x888888 });
    }
    this.barricade.addChild(wire);

    // Предупреждающий знак
    const sign = new Graphics();
    sign.rect(100, 10, 50, 25);
    sign.fill({ color: 0xff0000, alpha: 0.7 });
    sign.stroke({ width: 1, color: 0xcc0000 });

    const signText = new Text({
      text: "СТОП",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 8,
        fill: 0xffffff,
      }),
    });
    signText.position.set(110, 16);

    this.barricade.addChild(sign, signText);

    this.addChild(this.barricade);
  }

  /**
   * Создание входа в тоннель
   */
  private createTunnelEntrance(): void {
    this.tunnelEntrance = new Container();
    this.tunnelEntrance.position.set(2000, 300);

    // Арка тоннеля
    const arch = new Graphics();
    arch.arc(100, 80, 80, Math.PI, 0);
    arch.stroke({ width: 5, color: 0x444444 });
    arch.fill({ color: 0x000000, alpha: 0.8 });
    this.tunnelEntrance.addChild(arch);

    // Стены тоннеля
    const walls = new Graphics();
    walls.rect(20, 80, 5, 100);
    walls.fill({ color: 0x444444 });
    walls.rect(175, 80, 5, 100);
    walls.fill({ color: 0x444444 });
    this.tunnelEntrance.addChild(walls);

    // Красный свет внутри
    const light = new Graphics();
    light.circle(100, 60, 20);
    light.fill({ color: 0xff0000, alpha: 0.3 });
    this.tunnelEntrance.addChild(light);

    // Знак тоннеля
    const tunnelSign = new Text({
      text: "ТОННЕЛЬ №7",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 10,
        fill: 0x888888,
      }),
    });
    tunnelSign.position.set(60, 20);
    this.tunnelEntrance.addChild(tunnelSign);

    // Предупреждение
    const warningSign = new Graphics();
    warningSign.triangle(100, 5, 95, 15, 105, 15);
    warningSign.fill({ color: 0xffaa00 });

    const warningText = new Text({
      text: "!",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 8,
        fill: 0x000000,
      }),
    });
    warningText.position.set(98, 6);

    this.tunnelEntrance.addChild(warningSign, warningText);

    this.addChild(this.tunnelEntrance);
  }

  /**
   * Создание зон поиска
   */
  private createSearchZones(): void {
    this.questItems.forEach((item) => {
      const zone = new Container();
      zone.position.set(item.location.x, item.location.y);
      zone.name = `search_zone_${item.id}`;

      // Маркер зоны поиска
      const marker = new Graphics();
      marker.circle(0, 0, 40);
      marker.stroke({ width: 2, color: 0xffff00, alpha: 0.3 });

      // Пульсирующий круг
      const pulse = new Graphics();
      pulse.circle(0, 0, 20);
      pulse.fill({ color: 0xffff00, alpha: 0.1 });

      zone.addChild(marker, pulse);

      this.searchZones.push(zone);
      this.addChild(zone);

      // Создаём спрайт предмета (заглушка)
      const itemSprite = this.createItemSprite(item);
      itemSprite.position.set(item.location.x, item.location.y);
      item.sprite = itemSprite;
      this.addChild(itemSprite);
    });
  }

  /**
   * Создание спрайта предмета
   */
  private createItemSprite(item: QuestItem): Container {
    const container = new Container();

    const graphics = new Graphics();

    switch (item.id) {
      case "medkit":
        graphics.rect(-8, -6, 16, 12);
        graphics.fill({ color: 0xffffff });
        graphics.stroke({ width: 1, color: 0xff0000 });
        // Красный крест
        graphics.rect(-2, -4, 4, 8);
        graphics.fill({ color: 0xff0000 });
        graphics.rect(-4, -2, 8, 4);
        graphics.fill({ color: 0xff0000 });
        break;

      case "ammo_box":
        graphics.rect(-10, -6, 20, 12);
        graphics.fill({ color: 0x556b2f });
        graphics.stroke({ width: 1, color: 0x8b7355 });
        // Пули
        for (let i = 0; i < 3; i++) {
          graphics.rect(-6 + i * 5, -4, 2, 6);
          graphics.fill({ color: 0xffaa00 });
        }
        break;

      case "radio_parts":
        graphics.rect(-8, -8, 16, 16);
        graphics.fill({ color: 0x444444 });
        graphics.stroke({ width: 1, color: 0x666666 });
        // Антенна
        graphics.moveTo(0, -8);
        graphics.lineTo(0, -18);
        graphics.stroke({ width: 1, color: 0x888888 });
        // Кнопки
        for (let i = 0; i < 4; i++) {
          graphics.circle(-3 + i * 3, 3, 1);
          graphics.fill({ color: 0x00ff00 });
        }
        break;

      case "water_supply":
        graphics.rect(-6, -10, 12, 20);
        graphics.fill({ color: 0x4488ff, alpha: 0.5 });
        graphics.stroke({ width: 1, color: 0x6688ff });
        // Крышка
        graphics.rect(-4, -12, 8, 3);
        graphics.fill({ color: 0xff0000 });
        break;

      case "fuel_canister":
        graphics.rect(-7, -10, 14, 20);
        graphics.fill({ color: 0xff4400 });
        graphics.stroke({ width: 1, color: 0xcc3300 });
        // Ручка
        graphics.rect(-3, -14, 6, 5);
        graphics.stroke({ width: 1, color: 0x666666 });
        // Огнеопасно
        graphics.rect(-4, 2, 8, 3);
        graphics.fill({ color: 0xffff00 });
        break;
    }

    container.addChild(graphics);

    // Подпись
    const label = new Text({
      text: item.name,
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 8,
        fill: 0xffffff,
      }),
    });
    label.anchor.set(0.5, 0);
    label.y = 15;
    container.addChild(label);

    return container;
  }

  /**
   * Создание игрока
   */
  private createPlayer(): void {
    this.player = new Player(this.eventBus);
    this.player.position.set(150, 500);
    this.addChild(this.player);
  }

  /**
   * Создание солдат
   */
  private createSoldiers(): void {
    this.soldierPositions = [
      { x: 350, y: 420 },
      { x: 400, y: 430 },
      { x: 320, y: 440 },
    ];

    // Лидер (сержант)
    this.soldierLeader = new Soldier(this.eventBus, "sergeant");
    this.soldierLeader.setPosition(
      this.soldierPositions[0].x,
      this.soldierPositions[0].y,
    );
    this.soldiers.push(this.soldierLeader);
    this.addChild(this.soldierLeader);

    // Рядовые
    for (let i = 1; i < this.soldierPositions.length; i++) {
      const soldier = new Soldier(this.eventBus, "private");
      soldier.setPosition(
        this.soldierPositions[i].x,
        this.soldierPositions[i].y,
      );
      this.soldiers.push(soldier);
      this.addChild(soldier);
    }
  }

  /**
   * Создание эффектов
   */
  private createEffects(): void {
    // Туман
    this.fogEffect = new Graphics();
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * this.levelWidth;
      const y = 300 + Math.random() * 200;
      this.fogEffect.circle(x, y, 50 + Math.random() * 100);
      this.fogEffect.fill({ color: 0x666666, alpha: 0.05 });
    }
    this.addChild(this.fogEffect);

    // Прожектор
    this.searchlightEffect = new Graphics();
    this.searchlightEffect.moveTo(350, 350);
    this.searchlightEffect.lineTo(500, 500);
    this.searchlightEffect.lineTo(200, 500);
    this.searchlightEffect.fill({ color: 0xffff00, alpha: 0.05 });
    this.addChild(this.searchlightEffect);

    // Частицы пыли
    for (let i = 0; i < 25; i++) {
      const particle = new Graphics();
      particle.circle(0, 0, Math.random() * 2 + 1);
      particle.fill({ color: 0x888888, alpha: Math.random() * 0.3 });
      particle.position.set(
        Math.random() * this.levelWidth,
        Math.random() * this.levelHeight,
      );
      this.dustParticles.push(particle);
      this.addChild(particle);
    }

    // Дождь (редкий)
    for (let i = 0; i < 50; i++) {
      const drop = new Graphics();
      drop.rect(0, 0, 1, Math.random() * 10 + 5);
      drop.fill({ color: 0x4488ff, alpha: Math.random() * 0.3 });
      drop.position.set(
        Math.random() * this.levelWidth,
        Math.random() * this.levelHeight,
      );
      this.rainDrops.push(drop);
      this.addChild(drop);
    }
  }

  /**
   * Создание HUD
   */
  private createHUD(): void {
    this.hudContainer = new Container();

    // Цель
    this.objectiveText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 12,
        fill: 0xff6600,
        wordWrap: true,
        wordWrapWidth: 500,
      }),
    });
    this.objectiveText.position.set(20, 20);

    // Счётчик предметов
    this.itemCountText = new Text({
      text: "Предметы: 0/3",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 14,
        fill: 0xffffff,
      }),
    });
    this.itemCountText.position.set(20, 60);

    // Подсказка взаимодействия
    this.interactionHint = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 10,
        fill: 0xffff00,
      }),
    });
    this.interactionHint.position.set(540, 680);
    this.interactionHint.anchor.set(0.5, 1);
    this.interactionHint.visible = false;

    this.hudContainer.addChild(
      this.objectiveText,
      this.itemCountText,
      this.interactionHint,
    );
    this.addChild(this.hudContainer);

    // Журнал квестов
    this.questLog = this.createQuestLog();
    this.questLog.visible = false;
    this.addChild(this.questLog);
  }

  /**
   * Создание журнала квестов
   */
  private createQuestLog(): Container {
    const container = new Container();
    container.position.set(340, 100);

    const bg = new Graphics();
    bg.roundRect(0, 0, 600, 400, 10);
    bg.fill({ color: 0x000000, alpha: 0.9 });
    bg.stroke({ width: 2, color: 0x888888 });
    container.addChild(bg);

    const title = new Text({
      text: "ЖУРНАЛ ЗАДАНИЙ",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 16,
        fill: 0xffff00,
      }),
    });
    title.position.set(150, 20);
    container.addChild(title);

    // Список предметов
    this.questItems.forEach((item, index) => {
      const itemText = new Text({
        text: `${item.name}: ${item.found ? (item.delivered ? "Доставлен" : "Найден") : "Не найден"}`,
        style: new TextStyle({
          fontFamily: "Press Start 2P",
          fontSize: 10,
          fill: item.delivered ? 0x00ff00 : item.found ? 0xffff00 : 0xff0000,
        }),
      });
      itemText.position.set(30, 60 + index * 25);
      itemText.label = `quest_item_${item.id}`;
      container.addChild(itemText);
    });

    const closeHint = new Text({
      text: "Нажмите I для закрытия",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 8,
        fill: 0x888888,
      }),
    });
    closeHint.position.set(200, 370);
    container.addChild(closeHint);

    return container;
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
   * Начало вступительного диалога
   */
  private async startIntroDialogue(): Promise<void> {
    this.isDialogActive = true;
    this.gamePhase = "dialogue";
    this.dialogBox.visible = true;

    for (const line of this.introductionDialogues) {
      if (!this.isDialogActive) break;

      await this.showDialogLine(line);
    }

    this.dialogBox.visible = false;
    this.isDialogActive = false;
    this.gamePhase = "search";

    this.eventBus.emit(GameEvent.DIALOG_END, { dialogueId: "soldier_intro" });
  }

  /**
   * Показ строки диалога
   */
  private async showDialogLine(line: {
    speaker: string;
    text: string;
    emotion?: string;
  }): Promise<void> {
    return new Promise((resolve) => {
      this.dialogBox.show(line.speaker, line.text, line.emotion as any, () => {
        setTimeout(resolve, 500);
      });
    });
  }

  /**
   * Движение игрока
   */
  private movePlayer(dx: number, dy: number): void {
    if (this.isPlayerDead || this.isLevelComplete || this.isDialogActive)
      return;

    const speed = 3;
    this.player.x += dx * speed;
    this.player.y += dy * speed;

    // Ограничение в пределах уровня
    this.player.x = Math.max(10, Math.min(this.levelWidth - 10, this.player.x));
    this.player.y = Math.max(
      300,
      Math.min(this.levelHeight - 30, this.player.y),
    );

    // Нельзя пройти через баррикаду
    if (this.player.x > 280 && this.player.x < 550 && this.player.y > 380) {
      if (this.gamePhase !== "complete") {
        this.player.x = dx > 0 ? 280 : 550;
        this.showInteractionHint("Солдаты не пропускают!");
      }
    }
  }

  /**
   * Взаимодействие игрока
   */
  private playerInteract(): void {
    if (this.isDialogActive) {
      this.dialogBox.skip();
      return;
    }

    // Проверка взаимодействия с солдатами
    if (this.isNearSoldiers()) {
      this.interactWithSoldiers();
      return;
    }

    // Проверка сбора предметов
    this.checkItemPickup();
  }

  /**
   * Проверка близости к солдатам
   */
  private isNearSoldiers(): boolean {
    const playerPos = this.player.getPosition();
    const leaderPos = this.soldierPositions[0];

    const distance = Math.sqrt(
      Math.pow(playerPos.x - leaderPos.x, 2) +
        Math.pow(playerPos.y - leaderPos.y, 2),
    );

    return distance < 80;
  }

  /**
   * Взаимодействие с солдатами
   */
  private interactWithSoldiers(): void {
    if (this.gamePhase === "search") {
      // Проверяем доставку предметов
      const hasItems = this.checkIfHoldingRequiredItems();

      if (hasItems) {
        this.startDeliveryDialogue();
      } else {
        this.showInteractionHint("Нужно принести все предметы!");
      }
    } else if (this.gamePhase === "complete") {
      this.enterTunnel();
    }
  }

  /**
   * Проверка наличия предметов у игрока
   */
  private checkIfHoldingRequiredItems(): boolean {
    return this.requiredItems.every((id) => {
      const item = this.questItems.find((i) => i.id === id);
      return item?.found && !item.delivered;
    });
  }

  /**
   * Начало диалога доставки
   */
  private async startDeliveryDialogue(): Promise<void> {
    this.isDialogActive = true;
    this.gamePhase = "delivery";
    this.dialogBox.visible = true;

    // Отмечаем предметы как доставленные
    this.requiredItems.forEach((id) => {
      const item = this.questItems.find((i) => i.id === id);
      if (item) {
        item.delivered = true;
        this.deliveredItems.add(id);
      }
    });

    for (const line of this.deliveryDialogues) {
      await this.showDialogLine(line);
    }

    this.dialogBox.visible = false;
    this.isDialogActive = false;
    this.gamePhase = "complete";

    // Открываем проход
    this.openTunnelPassage();

    this.eventBus.emit(GameEvent.DIALOG_END, {
      dialogueId: "soldier_delivery",
    });
  }

  /**
   * Открытие прохода в тоннель
   */
  private openTunnelPassage(): void {
    // Убираем невидимую стену
    this.showMessage("Проход открыт! Скорее в тоннель!", 0x00ff00);

    // Анимация открытия
    this.tunnelEntrance.alpha = 0.5;

    const pulseEffect = () => {
      this.tunnelEntrance.alpha = 0.5 + Math.sin(Date.now() * 0.005) * 0.3;
      if (this.gamePhase === "complete") {
        requestAnimationFrame(pulseEffect);
      } else {
        this.tunnelEntrance.alpha = 1;
      }
    };
    pulseEffect();
  }

  /**
   * Вход в тоннель
   */
  private enterTunnel(): void {
    if (this.isLevelComplete) return;
    this.isLevelComplete = true;

    this.audioManager.playSFX("tunnel-enter", { volume: 0.7 });

    // Анимация входа
    const fadeOut = () => {
      this.player.alpha -= 0.05;
      if (this.player.alpha > 0) {
        requestAnimationFrame(fadeOut);
      } else {
        this.completeGame();
      }
    };
    fadeOut();
  }

  /**
   * Завершение игры
   */
  private completeGame(): void {
    // Финальный экран
    const victoryText = new Text({
      text: "ПОЗДРАВЛЯЕМ!\n\nВы успешно покинули город\nчерез тоннель!",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 24,
        fill: 0x00ff00,
        align: "center",
        lineHeight: 40,
      }),
    });
    victoryText.anchor.set(0.5);
    victoryText.position.set(640, 300);
    this.addChild(victoryText);

    const creditsText = new Text({
      text: "SteelForce: Escape from Zone\n\nСпасибо за игру!",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 14,
        fill: 0xffffff,
        align: "center",
        lineHeight: 25,
      }),
    });
    creditsText.anchor.set(0.5);
    creditsText.position.set(640, 450);
    this.addChild(creditsText);

    this.eventBus.emit(GameEvent.GAME_OVER, {
      reason: "completed",
      score: this.deliveredItems.size * 100,
    });
  }

  /**
   * Проверка сбора предметов
   */
  private checkItemPickup(): void {
    const playerPos = this.player.getPosition();

    this.questItems.forEach((item) => {
      if (item.found) return;

      const distance = Math.sqrt(
        Math.pow(playerPos.x - item.location.x, 2) +
          Math.pow(playerPos.y - item.location.y, 2),
      );

      if (distance < 30) {
        item.found = true;

        if (item.sprite) {
          item.sprite.visible = false;
        }

        this.showInteractionHint(`Найдено: ${item.name}!`);
        this.audioManager.playSFX("item-pickup", { volume: 0.5 });

        this.eventBus.emit(GameEvent.ITEM_COLLECT, {
          type: "quest_item",
          alias: item.id,
        });

        // Обновляем журнал
        this.updateQuestLog();
      }
    });

    // Обновляем счётчик
    const foundCount = this.questItems.filter(
      (item) => item.found && !item.delivered,
    ).length;
    this.itemCountText.text = `Предметы: ${foundCount}/${this.requiredItems.length}`;
  }

  /**
   * Проверка условий доставки
   */
  private checkDeliveryConditions(): void {
    // Все предметы доставлены
    if (this.deliveredItems.size >= this.requiredItems.length) {
      this.updateObjectiveText();
    }
  }

  /**
   * Проверка взаимодействий
   */
  private checkInteractions(): void {
    const playerPos = this.player.getPosition();

    // Проверка близости к предметам
    const nearItem = this.questItems.find((item) => {
      if (item.found) return false;
      const distance = Math.sqrt(
        Math.pow(playerPos.x - item.location.x, 2) +
          Math.pow(playerPos.y - item.location.y, 2),
      );
      return distance < 50;
    });

    // Проверка близости к солдатам
    const nearSoldiers = this.isNearSoldiers();

    // Показываем подсказку
    if (nearItem) {
      this.showInteractionHint(`Нажмите E чтобы подобрать ${nearItem.name}`);
    } else if (nearSoldiers && this.gamePhase === "complete") {
      this.showInteractionHint("Нажмите E чтобы войти в тоннель");
    } else if (nearSoldiers && this.checkIfHoldingRequiredItems()) {
      this.showInteractionHint("Нажмите E чтобы передать предметы");
    } else {
      this.hideInteractionHint();
    }
  }

  /**
   * Обновление солдат
   */
  private updateSoldiers(delta: number): void {
    this.soldiers.forEach((soldier) => {
      soldier.update(delta);

      // Солдаты следят за игроком
      const playerPos = this.player.getPosition();
      const dx = playerPos.x - soldier.x;
      soldier.scale.x = dx > 0 ? 1 : -1;
    });

    // Анимация прожектора
    if (this.searchlightEffect) {
      this.searchlightEffect.alpha = 0.03 + Math.sin(Date.now() * 0.002) * 0.02;
    }
  }

  /**
   * Обновление таймера поиска
   */
  private updateSearchTimer(delta: number): void {
    this.searchTimer += delta;

    // Предупреждение когда осталось мало времени
    const remainingTime = this.searchTimeLimit - this.searchTimer;
    const remainingSeconds = Math.floor(remainingTime / 60);

    if (remainingSeconds <= 60 && remainingSeconds % 10 === 0) {
      this.showMessage(`Осталось ${remainingSeconds} секунд!`, 0xff0000);
    }

    // Время вышло
    if (this.searchTimer >= this.searchTimeLimit) {
      this.timeUp();
    }
  }

  /**
   * Время вышло
   */
  private timeUp(): void {
    this.showMessage("ВРЕМЯ ВЫШЛО! Солдаты взрывают тоннель!", 0xff0000);

    // Анимация взрыва
    setTimeout(() => {
      this.explodeTunnel();
    }, 2000);
  }

  /**
   * Взрыв тоннеля
   */
  private explodeTunnel(): void {
    // Эффект взрыва
    const explosion = new Graphics();
    explosion.circle(0, 0, 100);
    explosion.fill({ color: 0xff4400, alpha: 0.8 });
    explosion.position.set(2100, 380);
    this.addChild(explosion);

    this.audioManager.playSFX("explosion", { volume: 0.8 });

    // Тряска экрана
    const shake = () => {
      this.x = (Math.random() - 0.5) * 10;
      this.y = (Math.random() - 0.5) * 10;
      if (explosion.alpha > 0) {
        requestAnimationFrame(shake);
      }
    };
    shake();

    // Game Over
    setTimeout(() => {
      this.eventBus.emit(GameEvent.GAME_OVER, {
        reason: "time_up",
        score: 0,
      });
    }, 3000);
  }

  /**
   * Обновление эффектов
   */
  private updateEffects(delta: number): void {
    // Пыль
    this.dustParticles.forEach((particle) => {
      particle.y -= delta * 0.2;
      particle.x += Math.sin(Date.now() * 0.001 + particle.y) * delta * 0.1;

      if (particle.y < 200) {
        particle.y = this.levelHeight;
        particle.x = Math.random() * this.levelWidth;
      }
    });

    // Дождь
    this.rainDrops.forEach((drop) => {
      drop.y += delta * 2;

      if (drop.y > this.levelHeight) {
        drop.y = 200 + Math.random() * 100;
        drop.x = Math.random() * this.levelWidth;
      }
    });
  }

  /**
   * Обновление HUD
   */
  private updateHUD(): void {
    switch (this.gamePhase) {
      case "search":
        this.objectiveText.text =
          "Найдите и принесите требуемые предметы солдатам";
        const remainingTime = Math.floor(
          (this.searchTimeLimit - this.searchTimer) / 60,
        );
        const minutes = Math.floor(remainingTime / 60);
        const seconds = remainingTime % 60;
        this.objectiveText.text += `\nВремя: ${minutes}:${seconds.toString().padStart(2, "0")}`;
        break;

      case "delivery":
        this.objectiveText.text = "Передайте предметы сержанту";
        break;

      case "complete":
        this.objectiveText.text = "Войдите в тоннель!";
        break;

      default:
        this.objectiveText.text = "";
    }
  }

  /**
   * Обновление цели
   */
  private updateObjectiveText(): void {
    this.objectiveText.text = "Все предметы доставлены! Войдите в тоннель!";
    this.objectiveText.style.fill = 0x00ff00;
  }

  /**
   * Обновление журнала квестов
   */
  private updateQuestLog(): void {
    this.questItems.forEach((item) => {
      const textElement = this.questLog.getChildByLabel(
        `quest_item_${item.id}`,
      ) as Text;
      if (textElement) {
        textElement.text = `${item.name}: ${item.found ? (item.delivered ? "Доставлен" : "Найден") : "Не найден"}`;
        textElement.style.fill = item.delivered
          ? 0x00ff00
          : item.found
            ? 0xffff00
            : 0xff0000;
      }
    });
  }

  /**
   * Переключение журнала квестов
   */
  private toggleQuestLog(): void {
    this.questLog.visible = !this.questLog.visible;

    if (this.questLog.visible) {
      this.updateQuestLog();
    }
  }

  /**
   * Показ подсказки взаимодействия
   */
  private showInteractionHint(text: string): void {
    this.interactionHint.text = text;
    this.interactionHint.visible = true;
  }

  /**
   * Скрытие подсказки
   */
  private hideInteractionHint(): void {
    this.interactionHint.visible = false;
  }

  /**
   * Показ сообщения
   */
  private showMessage(text: string, color: number = 0xffffff): void {
    const message = new Text({
      text,
      style: new TextStyle({
        fontFamily: "Press Start 2P",
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
   * Обработчик сбора предмета
   */
  private onItemCollect(data: { type: string; alias: string }): void {
    if (data.type === "quest_item") {
      const item = this.questItems.find((i) => i.id === data.alias);
      if (item) {
        this.showMessage(`Получено: ${item.name}`, 0xffff00);
      }
    }
  }

  /**
   * Обработчик окончания диалога
   */
  private onDialogEnd(): void {
    // Дополнительная логика
  }

  /**
   * Обработчик смерти игрока
   */
  private onPlayerDeath(): void {
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
      this.sceneManager.switchTo("soldiers");
    }, 2000);
  }

  /**
   * Обработчик Escape
   */
  private onEscape(): void {
    if (this.questLog.visible) {
      this.toggleQuestLog();
    } else {
      this.eventBus.emit(GameEvent.GAME_PAUSE, { reason: "escape" });
    }
  }

  /**
   * Очистка сцены
   */
  public async cleanup(): Promise<void> {
    this.audioManager.stopAll(500);
    this.soldiers.forEach((s) => s.destroy());
    this.soldiers.length = 0;
    this.questItems.length = 0;
    this.dustParticles.length = 0;
    this.rainDrops.length = 0;

    await super.cleanup();
  }
}
