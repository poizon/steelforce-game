import {
  Container,
  Sprite,
  AnimatedSprite,
  Graphics,
  Text,
  Texture,
} from "pixi.js";
import { EventBus } from "../core/EventBus";
import { GameEvent } from "../core/EventBus";

export interface PlayerConfig {
  maxHealth: number;
  speed: number;
  jumpForce: number;
  invincibilityDuration: number; // в кадрах
}

export type PlayerState =
  "idle" | "running" | "jumping" | "falling" | "damaged" | "dead";
export type PlayerDirection = "left" | "right";

export class Player extends Container {
  private readonly eventBus: EventBus;

  // Конфигурация
  private readonly config: PlayerConfig = {
    maxHealth: 100,
    speed: 3,
    jumpForce: -12,
    invincibilityDuration: 60,
  };

  // Состояние
  private health: number;
  private _isAlive: boolean = true;
  private isInvincible: boolean = false;
  private invincibilityTimer: number = 0;
  private state: PlayerState = "idle";
  private direction: PlayerDirection = "right";
  private isMoving: boolean = false;

  // Анимации
  private sprite!: AnimatedSprite;
  private idleTextures: Texture[] = [];
  private runTextures: Texture[] = [];
  private jumpTextures: Texture[] = [];
  private fallTextures: Texture[] = [];
  private damageTextures: Texture[] = [];
  private deathTextures: Texture[] = [];

  // Визуальные эффекты
  private shadow!: Graphics;
  private damageEffect!: Graphics;
  private invincibilityShield!: Graphics;
  private dustParticles: Graphics[] = [];

  // Физика
  public velocityX: number = 0;
  public velocityY: number = 0;
  private isOnGround: boolean = false;
  private hasDoubleJump: boolean = false;
  private canDoubleJump: boolean = true;

  // Инвентарь
  private inventory: Map<string, number> = new Map();
  private keys: Set<string> = new Set();

  // Звуки
  private footstepsTimer: number = 0;
  private footstepsInterval: number = 20; // кадры между звуками шагов

  constructor(eventBus: EventBus, config?: Partial<PlayerConfig>) {
    super();

    this.eventBus = eventBus;

    if (config) {
      Object.assign(this.config, config);
    }

    this.health = this.config.maxHealth;

    this.setup();
    this.bindEvents();
  }

  /**
   * Начальная настройка
   */
  private setup(): void {
    this.createShadow();
    this.loadTextures();
    this.createSprite();
    this.createEffects();

    // Начальное состояние
    this.alpha = 1;
    this.scale.set(0.8);

    // Интерактивность
    this.eventMode = "static";
  }

  /**
   * Создание тени
   */
  private createShadow(): void {
    this.shadow = new Graphics();
    this.shadow.ellipse(0, 0, 20, 8);
    this.shadow.fill({ color: 0x000000, alpha: 0.3 });
    this.shadow.y = 25;
    this.addChild(this.shadow);
  }

  /**
   * Загрузка текстур для анимаций
   */
  private loadTextures(): void {
    // В реальном проекте текстуры загружаются из ассетов
    // Здесь создаём заглушки
    this.idleTextures = [this.createPlaceholderTexture(0x4488ff)];
    this.runTextures = [
      this.createPlaceholderTexture(0x4488ff),
      this.createPlaceholderTexture(0x5599ff),
    ];
    this.jumpTextures = [this.createPlaceholderTexture(0x66aaff)];
    this.fallTextures = [this.createPlaceholderTexture(0x3377ee)];
    this.damageTextures = [this.createPlaceholderTexture(0xff4444)];
    this.deathTextures = [this.createPlaceholderTexture(0x444444)];
  }

  /**
   * Создание заглушки текстуры
   */
  private createPlaceholderTexture(color: number): Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 64;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Тело
      ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
      ctx.fillRect(12, 20, 24, 32);

      // Голова
      ctx.fillStyle = "#ffcc99";
      ctx.fillRect(14, 4, 20, 18);

      // Волосы (для различения персонажей)
      ctx.fillStyle = "#333333";
      ctx.fillRect(10, 2, 28, 8);

      // Глаза
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(16, 10, 6, 4);
      ctx.fillRect(26, 10, 6, 4);

      ctx.fillStyle = "#000000";
      ctx.fillRect(18, 11, 3, 3);
      ctx.fillRect(28, 11, 3, 3);

      // Ноги
      ctx.fillStyle = "#333333";
      ctx.fillRect(14, 52, 8, 12);
      ctx.fillRect(26, 52, 8, 12);

      // Руки
      ctx.fillStyle = "#ffcc99";
      ctx.fillRect(6, 22, 8, 20);
      ctx.fillRect(34, 22, 8, 20);
    }

    return Texture.from(canvas);
  }

  /**
   * Создание спрайта
   */
  private createSprite(): void {
    this.sprite = new AnimatedSprite(this.idleTextures);
    this.sprite.anchor.set(0.5);
    this.sprite.animationSpeed = 0.1;
    this.sprite.play();
    this.addChild(this.sprite);
  }

  /**
   * Создание эффектов
   */
  private createEffects(): void {
    // Эффект урона
    this.damageEffect = new Graphics();
    this.damageEffect.circle(0, 0, 30);
    this.damageEffect.fill({ color: 0xff0000, alpha: 0 });
    this.damageEffect.visible = false;
    this.addChild(this.damageEffect);

    // Щит неуязвимости
    this.invincibilityShield = new Graphics();
    this.invincibilityShield.circle(0, 0, 35);
    this.invincibilityShield.fill({ color: 0x00ff00, alpha: 0 });
    this.invincibilityShield.visible = false;
    this.addChild(this.invincibilityShield);

    // Частицы пыли при движении
    for (let i = 0; i < 5; i++) {
      const particle = this.createDustParticle();
      this.dustParticles.push(particle);
      this.addChild(particle);
    }
  }

  /**
   * Создание частицы пыли
   */
  private createDustParticle(): Graphics {
    const particle = new Graphics();
    particle.circle(0, 0, Math.random() * 2 + 1);
    particle.fill({ color: 0x888888, alpha: 0 });
    particle.y = 30;
    return particle;
  }

  /**
   * Привязка событий
   */
  private bindEvents(): void {
    // Слушаем события урона
    this.eventBus.on(
      GameEvent.PLAYER_DAMAGE,
      (data: { amount: number; source?: string }) => {
        this.takeDamage(data.amount, data.source);
      },
    );

    // Слушаем события лечения
    this.eventBus.on(GameEvent.PLAYER_HEAL, (data: { amount: number }) => {
      this.heal(data.amount);
    });
  }

  /**
   * Обновление игрока
   */
  public update(delta: number): void {
    if (!this._isAlive) return;

    this.updateState(delta);
    this.updateAnimation(delta);
    this.updateEffects(delta);
    this.updateInvincibility(delta);
    this.updateShadow();
    this.emitPositionEvent();
  }

  /**
   * Обновление состояния
   */
  private updateState(delta: number): void {
    // Определение состояния
    if (!this._isAlive) {
      this.state = "dead";
    } else if (this.isInvincible) {
      this.state = "damaged";
    } else if (!this.isOnGround && this.velocityY < 0) {
      this.state = "jumping";
    } else if (!this.isOnGround && this.velocityY > 0) {
      this.state = "falling";
    } else if (this.isMoving) {
      this.state = "running";
    } else {
      this.state = "idle";
    }

    // Обновление звуков шагов
    if (this.state === "running" && this.isOnGround) {
      this.footstepsTimer += delta;
      if (this.footstepsTimer >= this.footstepsInterval) {
        this.footstepsTimer = 0;
        // this.audioManager.playSFX('footstep', { volume: 0.1 });
      }
    }
  }

  /**
   * Обновление анимации
   */
  private updateAnimation(delta: number): void {
    let targetTextures: Texture[];

    switch (this.state) {
      case "idle":
        targetTextures = this.idleTextures;
        this.sprite.animationSpeed = 0.05;
        break;
      case "running":
        targetTextures = this.runTextures;
        this.sprite.animationSpeed = 0.15;
        break;
      case "jumping":
        targetTextures = this.jumpTextures;
        this.sprite.animationSpeed = 0.1;
        break;
      case "falling":
        targetTextures = this.fallTextures;
        this.sprite.animationSpeed = 0.1;
        break;
      case "damaged":
        targetTextures = this.damageTextures;
        this.sprite.animationSpeed = 0.2;
        break;
      case "dead":
        targetTextures = this.deathTextures;
        this.sprite.animationSpeed = 0.05;
        this.sprite.loop = false;
        break;
      default:
        targetTextures = this.idleTextures;
    }

    // Обновление текстур если изменились
    if (this.sprite.textures !== targetTextures) {
      this.sprite.textures = targetTextures;
      this.sprite.play();
    }

    // Направление спрайта
    this.sprite.scale.x = this.direction === "right" ? 0.8 : -0.8;
  }

  /**
   * Обновление эффектов
   */
  private updateEffects(delta: number): void {
    // Эффект пыли при приземлении
    this.dustParticles.forEach((particle) => {
      if (particle.alpha > 0) {
        particle.alpha -= delta * 0.01;
        particle.y -= delta * 0.5;
        particle.x += (Math.random() - 0.5) * delta;
      }
    });

    // Щит неуязвимости
    if (this.isInvincible) {
      this.invincibilityShield.visible = true;
      this.invincibilityShield.alpha = 0.3 + Math.sin(Date.now() * 0.01) * 0.1;
      this.invincibilityShield.scale.set(
        1 + Math.sin(Date.now() * 0.015) * 0.1,
      );
    } else {
      this.invincibilityShield.visible = false;
    }
  }

  /**
   * Обновление неуязвимости
   */
  private updateInvincibility(delta: number): void {
    if (this.isInvincible) {
      this.invincibilityTimer -= delta;

      // Мерцание спрайта
      this.sprite.alpha = Math.sin(Date.now() * 0.05) * 0.3 + 0.7;

      if (this.invincibilityTimer <= 0) {
        this.isInvincible = false;
        this.sprite.alpha = 1;
      }
    }
  }

  /**
   * Обновление тени
   */
  private updateShadow(): void {
    // Тень становится меньше при прыжке
    const heightFactor = 1 - Math.abs(this.velocityY) * 0.02;
    this.shadow.scale.set(Math.max(0.5, heightFactor));
    this.shadow.alpha = 0.2 + heightFactor * 0.2;
  }

  /**
   * Отправка события позиции
   */
  private emitPositionEvent(): void {
    this.eventBus.emit(GameEvent.PLAYER_MOVE, {
      position: { x: this.x, y: this.y },
      direction: this.direction,
    });
  }

  /**
   * Движение игрока
   */
  public move(dx: number, dy: number): void {
    if (!this._isAlive) return;

    this.velocityX = dx * this.config.speed;
    this.velocityY = dy * this.config.speed;

    this.x += this.velocityX;
    this.y += this.velocityY;

    // Определение направления
    if (dx !== 0) {
      this.direction = dx > 0 ? "right" : "left";
    }

    // Флаг движения
    this.isMoving = dx !== 0 || dy !== 0;
  }

  /**
   * Прыжок
   */
  public jump(): void {
    if (!this._isAlive) return;

    if (this.isOnGround) {
      this.velocityY = this.config.jumpForce;
      this.isOnGround = false;
      this.hasDoubleJump = true;
      this.emitJumpParticles();
    } else if (this.hasDoubleJump && this.canDoubleJump) {
      this.velocityY = this.config.jumpForce * 0.8;
      this.canDoubleJump = false;
      this.emitDoubleJumpParticles();
    }
  }

  /**
   * Приземление
   */
  public land(): void {
    if (!this._isAlive) return;

    this.isOnGround = true;
    this.hasDoubleJump = false;
    this.canDoubleJump = true;
    this.velocityY = 0;
    this.emitLandParticles();
  }

  /**
   * Получение урона
   */
  public takeDamage(amount: number, source?: string): void {
    if (!this._isAlive || this.isInvincible) return;

    this.health = Math.max(0, this.health - amount);
    this.makeInvincible();

    // Эффекты
    this.showDamageEffect();
    this.eventBus.emit(GameEvent.PLAYER_DAMAGE, {
      amount,
      currentHealth: this.health,
      source: source || "unknown",
    });

    // Проверка смерти
    if (this.health <= 0) {
      this.die(source || "unknown");
    }
  }

  /**
   * Лечение
   */
  public heal(amount: number): void {
    if (!this._isAlive) return;

    const oldHealth = this.health;
    this.health = Math.min(this.config.maxHealth, this.health + amount);
    const healedAmount = this.health - oldHealth;

    if (healedAmount > 0) {
      this.showHealEffect();
      this.eventBus.emit(GameEvent.PLAYER_HEAL, {
        amount: healedAmount,
        currentHealth: this.health,
      });
    }
  }

  /**
   * Смерть игрока
   */
  private die(cause: string): void {
    this._isAlive = false;
    this.state = "dead";

    this.eventBus.emit(GameEvent.PLAYER_DEATH, {
      cause,
      position: { x: this.x, y: this.y },
    });

    // Анимация смерти
    this.sprite.textures = this.deathTextures;
    this.sprite.loop = false;
    this.sprite.play();

    // Затухание
    const fadeOut = () => {
      this.alpha -= 0.02;
      if (this.alpha > 0) {
        requestAnimationFrame(fadeOut);
      } else {
        this.visible = false;
      }
    };

    setTimeout(fadeOut, 1000);
  }

  /**
   * Возрождение
   */
  public respawn(x: number, y: number): void {
    this.health = this.config.maxHealth;
    this._isAlive = true;
    this.isInvincible = true;
    this.invincibilityTimer = this.config.invincibilityDuration * 2;
    this.state = "idle";
    this.alpha = 1;
    this.visible = true;

    this.position.set(x, y);
    this.velocityX = 0;
    this.velocityY = 0;

    this.sprite.textures = this.idleTextures;
    this.sprite.loop = true;
    this.sprite.play();

    this.eventBus.emit(GameEvent.PLAYER_RESPAWN, {
      position: { x, y },
    });
  }

  /**
   * Включение неуязвимости
   */
  private makeInvincible(): void {
    this.isInvincible = true;
    this.invincibilityTimer = this.config.invincibilityDuration;
  }

  /**
   * Эффект получения урона
   */
  private showDamageEffect(): void {
    this.damageEffect.visible = true;
    this.damageEffect.alpha = 0.8;

    const fadeOut = () => {
      this.damageEffect.alpha -= 0.05;
      this.damageEffect.scale.set(1 + (0.8 - this.damageEffect.alpha) * 2);

      if (this.damageEffect.alpha > 0) {
        requestAnimationFrame(fadeOut);
      } else {
        this.damageEffect.visible = false;
      }
    };

    fadeOut();
  }

  /**
   * Эффект лечения
   */
  private showHealEffect(): void {
    const healEffect = new Graphics();
    healEffect.circle(0, 0, 30);
    healEffect.fill({ color: 0x00ff00, alpha: 0.5 });
    this.addChild(healEffect);

    const fadeOut = () => {
      healEffect.alpha -= 0.03;
      healEffect.scale.set(1 + (0.5 - healEffect.alpha) * 3);

      if (healEffect.alpha > 0) {
        requestAnimationFrame(fadeOut);
      } else {
        this.removeChild(healEffect);
        healEffect.destroy();
      }
    };

    fadeOut();
  }

  /**
   * Частицы при прыжке
   */
  private emitJumpParticles(): void {
    for (let i = 0; i < 8; i++) {
      const particle = this.getDustParticle();
      particle.x = (Math.random() - 0.5) * 20;
      particle.y = 25 + Math.random() * 5;
      particle.alpha = 0.6;
    }
  }

  /**
   * Частицы при двойном прыжке
   */
  private emitDoubleJumpParticles(): void {
    for (let i = 0; i < 12; i++) {
      const particle = this.getDustParticle();
      particle.x = (Math.random() - 0.5) * 30;
      particle.y = (Math.random() - 0.5) * 20;
      particle.alpha = 0.8;
    }
  }

  /**
   * Частицы при приземлении
   */
  private emitLandParticles(): void {
    for (let i = 0; i < 10; i++) {
      const particle = this.getDustParticle();
      particle.x = (Math.random() - 0.5) * 30;
      particle.y = 25;
      particle.alpha = 0.5;
    }
  }

  /**
   * Получение свободной частицы пыли
   */
  private getDustParticle(): Graphics {
    // Находим неактивную частицу
    const particle = this.dustParticles.find((p) => p.alpha <= 0);
    if (particle) {
      particle.visible = true;
      return particle;
    }

    // Создаём новую если все заняты
    const newParticle = this.createDustParticle();
    this.dustParticles.push(newParticle);
    this.addChild(newParticle);
    return newParticle;
  }

  /**
   * Сбор предмета
   */
  public collectItem(itemType: string, amount: number = 1): void {
    const current = this.inventory.get(itemType) || 0;
    this.inventory.set(itemType, current + amount);

    this.eventBus.emit(GameEvent.ITEM_COLLECT, {
      type: itemType,
      alias: itemType,
      total: current + amount,
    });
  }

  /**
   * Использование предмета
   */
  public useItem(itemType: string): boolean {
    const current = this.inventory.get(itemType) || 0;

    if (current > 0) {
      this.inventory.set(itemType, current - 1);
      this.eventBus.emit(GameEvent.ITEM_USE, {
        type: itemType,
        alias: itemType,
      });
      return true;
    }

    return false;
  }

  /**
   * Добавление ключа
   */
  public addKey(keyId: string): void {
    this.keys.add(keyId);
  }

  /**
   * Проверка ключа
   */
  public hasKey(keyId: string): boolean {
    return this.keys.has(keyId);
  }

  /**
   * Взаимодействие с объектом
   */
  public interact(target: string, type: string): void {
    this.eventBus.emit(GameEvent.PLAYER_INTERACT, {
      target,
      type,
    });
  }

  /**
   * Установка позиции
   */
  public setPosition(x: number, y: number): void {
    this.position.set(x, y);
  }

  /**
   * Получение позиции
   */
  public getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  /**
   * Установка состояния "на земле"
   */
  public setOnGround(value: boolean): void {
    if (value && !this.isOnGround) {
      this.land();
    }
    this.isOnGround = value;
  }

  /**
   * Сброс состояния
   */
  public reset(): void {
    this.health = this.config.maxHealth;
    this._isAlive = true;
    this.isInvincible = false;
    this.invincibilityTimer = 0;
    this.state = "idle";
    this.velocityX = 0;
    this.velocityY = 0;
    this.isOnGround = false;
    this.isMoving = false;
    this.alpha = 1;
    this.visible = true;

    this.inventory.clear();
    this.keys.clear();
  }

  /**
   * Уничтожение игрока
   */
  public destroy(options?: any): void {
    this.dustParticles.forEach((p) => p.destroy());
    this.dustParticles.length = 0;

    super.destroy(options);
  }

  // Геттеры
  get isAlive(): boolean {
    return this._isAlive;
  }

  get currentHealth(): number {
    return this.health;
  }

  get maxHealth(): number {
    return this.config.maxHealth;
  }

  get healthPercentage(): number {
    return this.health / this.config.maxHealth;
  }

  get currentState(): PlayerState {
    return this.state;
  }

  get currentDirection(): PlayerDirection {
    return this.direction;
  }

  get isPlayerOnGround(): boolean {
    return this.isOnGround;
  }

  get inventoryItems(): Map<string, number> {
    return new Map(this.inventory);
  }

  get playerKeys(): string[] {
    return Array.from(this.keys);
  }
}
