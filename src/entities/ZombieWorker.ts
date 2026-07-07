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
import type { Player } from "./Player";

export interface ZombieConfig {
  speed: number;
  patrolSpeed: number;
  chaseSpeed: number;
  damage: number;
  health: number;
  detectionRadius: number;
  attackRange: number;
  attackCooldown: number; // в кадрах
  patrolPauseDuration: number; // в кадрах
  stunDuration: number; // в кадрах
}

export type ZombieState =
  "idle" | "patrol" | "chase" | "attack" | "stunned" | "dead";
export type ZombieType = "worker" | "guard" | "engineer" | "heavy";

interface PatrolPoint {
  x: number;
  y: number;
  waitTime: number;
}

export class ZombieWorker extends Container {
  private readonly eventBus: EventBus;
  private readonly player: Player;

  // Конфигурация
  private readonly config: ZombieConfig = {
    speed: 1.5,
    patrolSpeed: 0.8,
    chaseSpeed: 2.5,
    damage: 20,
    health: 100,
    detectionRadius: 200,
    attackRange: 40,
    attackCooldown: 60,
    patrolPauseDuration: 120,
    stunDuration: 90,
  };

  // Состояние
  private state: ZombieState = "idle";
  private _isAlive: boolean = true;
  private health: number;
  private currentHealth: number;
  private direction: number = 1; // 1 = right, -1 = left
  private stateTimer: number = 0;
  private attackCooldownTimer: number = 0;
  private stunTimer: number = 0;

  // Патруль
  private patrolPath: PatrolPoint[] = [];
  private currentPatrolIndex: number = 0;
  private isWaitingAtPatrolPoint: boolean = false;

  // Анимации
  private sprite!: AnimatedSprite;
  private idleTextures: Texture[] = [];
  private walkTextures: Texture[] = [];
  private chaseTextures: Texture[] = [];
  private attackTextures: Texture[] = [];
  private stunTextures: Texture[] = [];
  private deathTextures: Texture[] = [];

  // Визуальные эффекты
  private detectionIndicator!: Graphics;
  private healthBar!: Container;
  private damageEffect!: Graphics;
  private bloodParticles: Graphics[] = [];
  private sparks: Graphics[] = [];

  // Звуковые таймеры
  private growlTimer: number = 0;
  private growlInterval: number = 180; // кадры между рычаниями
  private footstepTimer: number = 0;

  // Физика
  private velocityX: number = 0;
  private velocityY: number = 0;

  // Тип зомби
  private zombieType: ZombieType;

  constructor(
    eventBus: EventBus,
    player: Player,
    type: ZombieType = "worker",
    config?: Partial<ZombieConfig>,
  ) {
    super();

    this.eventBus = eventBus;
    this.player = player;
    this.zombieType = type;

    if (config) {
      Object.assign(this.config, config);
    }

    // Настройка характеристик в зависимости от типа
    this.configureByType();

    this.health = this.config.health;
    this.currentHealth = this.health;

    this.setup();
    this.generatePatrolPath();
  }

  /**
   * Настройка характеристик по типу
   */
  private configureByType(): void {
    switch (this.zombieType) {
      case "worker":
        // Стандартный рабочий
        break;

      case "guard":
        this.config.speed *= 0.7;
        this.config.health *= 1.5;
        this.config.damage *= 1.2;
        this.config.detectionRadius *= 1.3;
        break;

      case "engineer":
        this.config.speed *= 1.2;
        this.config.health *= 0.8;
        this.config.detectionRadius *= 1.5;
        this.config.attackCooldown *= 0.7;
        break;

      case "heavy":
        this.config.speed *= 0.5;
        this.config.health *= 2.5;
        this.config.damage *= 2;
        this.config.detectionRadius *= 0.8;
        this.config.attackRange *= 1.3;
        break;
    }
  }

  /**
   * Начальная настройка
   */
  private setup(): void {
    this.loadTextures();
    this.createSprite();
    this.createDetectionIndicator();
    this.createHealthBar();
    this.createEffects();

    this.eventMode = "static";
  }

  /**
   * Загрузка текстур
   */
  private loadTextures(): void {
    // Заглушки текстур для разных типов
    const colorMap = {
      worker: 0x88aa88,
      guard: 0xaa8888,
      engineer: 0x8888aa,
      heavy: 0x888888,
    };

    const baseColor = colorMap[this.zombieType];

    this.idleTextures = [this.createZombieTexture(baseColor, "idle")];
    this.walkTextures = [
      this.createZombieTexture(baseColor, "walk1"),
      this.createZombieTexture(baseColor, "walk2"),
    ];
    this.chaseTextures = [
      this.createZombieTexture(baseColor, "chase1"),
      this.createZombieTexture(baseColor, "chase2"),
    ];
    this.attackTextures = [
      this.createZombieTexture(baseColor, "attack1"),
      this.createZombieTexture(baseColor, "attack2"),
    ];
    this.stunTextures = [this.createZombieTexture(baseColor, "stun")];
    this.deathTextures = [this.createZombieTexture(0x444444, "dead")];
  }

  /**
   * Создание текстуры зомби
   */
  private createZombieTexture(color: number, variant: string): Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 64;

    const ctx = canvas.getContext("2d");
    if (!ctx) return Texture.EMPTY;

    // Базовые параметры для анимации
    const legOffset = variant.includes("walk")
      ? Math.sin(Date.now() * 0.01) * 3
      : 0;
    const armRaised = variant.includes("attack");
    const isStunned = variant === "stun";
    const isDead = variant === "dead";

    // Тело (грязный комбинезон)
    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.fillRect(12, 20, 24, 28);

    // Пятна на комбинезоне
    ctx.fillStyle = "#663300";
    ctx.fillRect(15, 25, 5, 5);
    ctx.fillRect(28, 30, 4, 6);
    ctx.fillRect(18, 35, 8, 3);

    // Голова (бледная кожа)
    ctx.fillStyle = "#aabbaa";
    ctx.fillRect(14, 4, 20, 18);

    // Травмы на голове
    ctx.fillStyle = "#664444";
    ctx.fillRect(16, 6, 5, 3);
    ctx.fillRect(26, 12, 8, 2);

    // Глаза (светящиеся)
    ctx.fillStyle =
      variant === "chase1" || variant === "chase2" ? "#ff0000" : "#ffff00";
    ctx.fillRect(16, 9, 5, 3);
    ctx.fillRect(27, 9, 5, 3);

    // Рот (открыт при атаке)
    if (armRaised) {
      ctx.fillStyle = "#440000";
      ctx.fillRect(18, 14, 12, 5);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(20, 15, 2, 2);
      ctx.fillRect(24, 15, 2, 2);
    }

    // Ноги
    ctx.fillStyle = "#444444";
    ctx.fillRect(14 + legOffset, 48, 8, 12);
    ctx.fillRect(26 - legOffset, 48, 8, 12);

    // Руки
    ctx.fillStyle = "#aabbaa";
    if (armRaised) {
      // Руки подняты для атаки
      ctx.fillRect(6, 18, 8, 8);
      ctx.fillRect(6, 12, 12, 6);
      ctx.fillRect(34, 18, 8, 8);
      ctx.fillRect(30, 12, 12, 6);
    } else if (isStunned) {
      // Руки опущены
      ctx.fillRect(6, 22, 8, 20);
      ctx.fillRect(34, 22, 8, 20);
    } else if (isDead) {
      // Руки раскинуты
      ctx.fillRect(2, 24, 8, 6);
      ctx.fillRect(38, 24, 8, 6);
    } else {
      // Обычное положение
      ctx.fillRect(6, 22 + legOffset * 0.5, 8, 18);
      ctx.fillRect(34, 22 - legOffset * 0.5, 8, 18);
    }

    return Texture.from(canvas);
  }

  /**
   * Создание спрайта
   */
  private createSprite(): void {
    this.sprite = new AnimatedSprite(this.idleTextures);
    this.sprite.anchor.set(0.5, 0.5);
    this.sprite.animationSpeed = 0.1;
    this.sprite.play();

    // Размер зависит от типа
    switch (this.zombieType) {
      case "heavy":
        this.sprite.scale.set(1.3);
        break;
      case "engineer":
        this.sprite.scale.set(0.9);
        break;
      default:
        this.sprite.scale.set(1);
    }

    this.addChild(this.sprite);
  }

  /**
   * Создание индикатора обнаружения
   */
  private createDetectionIndicator(): void {
    this.detectionIndicator = new Graphics();
    this.detectionIndicator.circle(0, 0, this.config.detectionRadius);
    this.detectionIndicator.stroke({ width: 1, color: 0xff0000, alpha: 0.1 });
    this.detectionIndicator.visible = false;
    this.addChild(this.detectionIndicator);
  }

  /**
   * Создание полосы здоровья
   */
  private createHealthBar(): void {
    this.healthBar = new Container();
    this.healthBar.y = -35;

    const bg = new Graphics();
    bg.rect(-15, -2, 30, 4);
    bg.fill({ color: 0x333333 });
    bg.stroke({ width: 1, color: 0x666666 });

    const fill = new Graphics();
    fill.rect(-15, -2, 30, 4);
    fill.fill({ color: 0xff0000 });
    fill.label = "healthFill";

    this.healthBar.addChild(bg, fill);
    this.healthBar.visible = false;
    this.addChild(this.healthBar);
  }

  /**
   * Создание эффектов
   */
  private createEffects(): void {
    // Эффект урона
    this.damageEffect = new Graphics();
    this.damageEffect.circle(0, 0, 25);
    this.damageEffect.fill({ color: 0xff0000, alpha: 0 });
    this.damageEffect.visible = false;
    this.addChild(this.damageEffect);

    // Частицы крови
    for (let i = 0; i < 8; i++) {
      const particle = new Graphics();
      particle.circle(0, 0, Math.random() * 2 + 1);
      particle.fill({ color: 0x880000, alpha: 0 });
      this.bloodParticles.push(particle);
      this.addChild(particle);
    }

    // Искры (для инженеров)
    if (this.zombieType === "engineer") {
      for (let i = 0; i < 5; i++) {
        const spark = new Graphics();
        spark.rect(0, 0, 2, 2);
        spark.fill({ color: 0x00ffff, alpha: 0 });
        this.sparks.push(spark);
        this.addChild(spark);
      }
    }
  }

  /**
   * Генерация пути патрулирования
   */
  private generatePatrolPath(): void {
    const centerX = this.x;
    const centerY = this.y;

    // Создаём 3-5 точек патрулирования
    const pointCount = 3 + Math.floor(Math.random() * 3);

    for (let i = 0; i < pointCount; i++) {
      const angle = (i / pointCount) * Math.PI * 2;
      const distance = 50 + Math.random() * 100;

      this.patrolPath.push({
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance * 0.5,
        waitTime: 60 + Math.random() * 120, // 1-3 секунды ожидания
      });
    }
  }

  /**
   * Обновление зомби
   */
  public update(delta: number): void {
    if (!this._isAlive) return;

    this.updateState(delta);
    this.updateBehavior(delta);
    this.updateAnimation(delta);
    this.updateEffects(delta);
    this.updateTimers(delta);
  }

  /**
   * Обновление состояния
   */
  private updateState(delta: number): void {
    const distanceToPlayer = this.getDistanceToPlayer();

    switch (this.state) {
      case "idle":
      case "patrol":
        // Проверка обнаружения игрока
        if (distanceToPlayer <= this.config.detectionRadius) {
          this.enterChaseState();
        } else if (this.state === "idle" && this.stateTimer <= 0) {
          this.enterPatrolState();
        }
        break;

      case "chase":
        // Потеря игрока
        if (distanceToPlayer > this.config.detectionRadius * 1.5) {
          this.enterPatrolState();
        }
        // Вход в радиус атаки
        else if (distanceToPlayer <= this.config.attackRange) {
          this.enterAttackState();
        }
        break;

      case "attack":
        // Игрок отошёл
        if (distanceToPlayer > this.config.attackRange * 1.2) {
          this.enterChaseState();
        }
        break;

      case "stunned":
        this.stunTimer -= delta;
        if (this.stunTimer <= 0) {
          this.enterPatrolState();
        }
        break;
    }
  }

  /**
   * Обновление поведения
   */
  private updateBehavior(delta: number): void {
    switch (this.state) {
      case "patrol":
        this.updatePatrolBehavior(delta);
        break;

      case "chase":
        this.updateChaseBehavior(delta);
        break;

      case "attack":
        this.updateAttackBehavior(delta);
        break;

      case "stunned":
        this.updateStunnedBehavior(delta);
        break;
    }
  }

  /**
   * Поведение патрулирования
   */
  private updatePatrolBehavior(delta: number): void {
    if (this.isWaitingAtPatrolPoint) {
      this.stateTimer -= delta;
      if (this.stateTimer <= 0) {
        this.isWaitingAtPatrolPoint = false;
        this.currentPatrolIndex =
          (this.currentPatrolIndex + 1) % this.patrolPath.length;
      }
      return;
    }

    const target = this.patrolPath[this.currentPatrolIndex];
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 5) {
      // Достигли точки, ждём
      this.isWaitingAtPatrolPoint = true;
      this.stateTimer = target.waitTime;
      this.velocityX = 0;
      this.velocityY = 0;
    } else {
      // Движемся к точке
      const speed = this.config.patrolSpeed;
      this.velocityX = (dx / distance) * speed;
      this.velocityY = (dy / distance) * speed;
      this.direction = this.velocityX > 0 ? 1 : -1;
    }

    this.x += this.velocityX;
    this.y += this.velocityY;
  }

  /**
   * Поведение преследования
   */
  private updateChaseBehavior(delta: number): void {
    const playerPos = this.player.getPosition();
    const dx = playerPos.x - this.x;
    const dy = playerPos.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      const speed = this.config.chaseSpeed;
      this.velocityX = (dx / distance) * speed;
      this.velocityY = (dy / distance) * speed;
      this.direction = this.velocityX > 0 ? 1 : -1;
    }

    this.x += this.velocityX;
    this.y += this.velocityY;

    // Рычание при преследовании
    this.growlTimer -= delta;
    if (this.growlTimer <= 0) {
      this.growlTimer = this.growlInterval + Math.random() * 60;
      // this.audioManager.playSFX('zombie-growl', { volume: 0.3 });
    }
  }

  /**
   * Поведение атаки
   */
  private updateAttackBehavior(delta: number): void {
    // Останавливаемся для атаки
    this.velocityX = 0;
    this.velocityY = 0;

    // Кулдаун атаки
    this.attackCooldownTimer -= delta;

    if (this.attackCooldownTimer <= 0) {
      this.performAttack();
      this.attackCooldownTimer = this.config.attackCooldown;
    }

    // Поворачиваемся к игроку
    const playerPos = this.player.getPosition();
    this.direction = playerPos.x > this.x ? 1 : -1;
  }

  /**
   * Поведение при оглушении
   */
  private updateStunnedBehavior(delta: number): void {
    // Лёгкое покачивание
    this.x += Math.sin(Date.now() * 0.01) * 0.3;
    this.sprite.rotation = Math.sin(Date.now() * 0.02) * 0.1;
  }

  /**
   * Выполнение атаки
   */
  private performAttack(): void {
    if (!this.canAttack()) return;

    const distance = this.getDistanceToPlayer();

    if (distance <= this.config.attackRange) {
      // Наносим урон игроку
      this.eventBus.emit(GameEvent.PLAYER_DAMAGE, {
        amount: this.config.damage,
        source: `zombie_${this.zombieType}`,
      });

      this.eventBus.emit(GameEvent.MONSTER_ATTACK, {
        id: `zombie_${Date.now()}`,
        targetId: "player",
        damage: this.config.damage,
      });

      // Эффект атаки
      this.showAttackEffect();

      // Звук атаки
      // this.audioManager.playSFX('zombie-attack', { volume: 0.5 });
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
      case "patrol":
        targetTextures = this.walkTextures;
        this.sprite.animationSpeed = 0.08;
        break;
      case "chase":
        targetTextures = this.chaseTextures;
        this.sprite.animationSpeed = 0.15;
        break;
      case "attack":
        targetTextures = this.attackTextures;
        this.sprite.animationSpeed = 0.2;
        break;
      case "stunned":
        targetTextures = this.stunTextures;
        this.sprite.animationSpeed = 0.02;
        break;
      case "dead":
        targetTextures = this.deathTextures;
        this.sprite.animationSpeed = 0.05;
        this.sprite.loop = false;
        break;
      default:
        targetTextures = this.idleTextures;
    }

    if (this.sprite.textures !== targetTextures) {
      this.sprite.textures = targetTextures;
      this.sprite.play();
    }

    // Поворот спрайта
    if (this.state !== "stunned") {
      this.sprite.scale.x =
        (this.direction === 1 ? 1 : -1) *
        (this.zombieType === "heavy"
          ? 1.3
          : this.zombieType === "engineer"
            ? 0.9
            : 1);
    }
  }

  /**
   * Обновление эффектов
   */
  private updateEffects(delta: number): void {
    // Индикатор обнаружения
    if (this.state === "chase" || this.state === "attack") {
      this.detectionIndicator.visible = true;
      this.detectionIndicator.alpha = 0.1 + Math.sin(Date.now() * 0.005) * 0.05;
    } else {
      this.detectionIndicator.visible = false;
    }

    // Полоса здоровья
    if (this.currentHealth < this.health) {
      this.healthBar.visible = true;
      const fill = this.healthBar.getChildByLabel("healthFill") as Graphics;
      if (fill) {
        fill.clear();
        const percentage = this.currentHealth / this.health;
        fill.rect(-15, -2, 30 * percentage, 4);
        fill.fill({
          color:
            percentage > 0.5
              ? 0xff0000
              : percentage > 0.25
                ? 0xff6600
                : 0xff0000,
        });
      }
    } else {
      this.healthBar.visible = false;
    }

    // Частицы крови
    this.bloodParticles.forEach((particle) => {
      if (particle.alpha > 0) {
        particle.alpha -= delta * 0.01;
        particle.y -= delta * 0.5;
        particle.x += (Math.random() - 0.5) * delta;
      }
    });

    // Искры для инженеров
    if (this.zombieType === "engineer" && this.state === "chase") {
      this.sparks.forEach((spark) => {
        if (Math.random() < 0.1) {
          spark.x = (Math.random() - 0.5) * 40;
          spark.y = -20 + Math.random() * 10;
          spark.alpha = 0.8;
        }
        spark.alpha -= delta * 0.02;
        spark.y -= delta * 2;
      });
    }
  }

  /**
   * Обновление таймеров
   */
  private updateTimers(delta: number): void {
    this.stateTimer -= delta;
  }

  /**
   * Вход в состояние патрулирования
   */
  private enterPatrolState(): void {
    this.state = "patrol";
    this.detectionIndicator.visible = false;
  }

  /**
   * Вход в состояние преследования
   */
  private enterChaseState(): void {
    if (this.state === "chase") return;

    this.state = "chase";
    this.detectionIndicator.visible = true;

    // Уведомляем игрока
    this.eventBus.emit(GameEvent.MONSTER_DETECT, {
      id: `zombie_${Date.now()}`,
      targetId: "player",
    });

    // Звук обнаружения
    // this.audioManager.playSFX('zombie-detect', { volume: 0.4 });
  }

  /**
   * Вход в состояние атаки
   */
  private enterAttackState(): void {
    this.state = "attack";
    this.attackCooldownTimer = 15; // Небольшая задержка перед первой атакой
  }

  /**
   * Получение урона
   */
  public takeDamage(amount: number, source?: string): void {
    if (!this._isAlive) return;

    this.currentHealth -= amount;
    this.showDamageEffect();

    this.eventBus.emit(GameEvent.MONSTER_DAMAGE, {
      id: `zombie_${Date.now()}`,
      amount,
      currentHealth: this.currentHealth,
    });

    // Шанс оглушения при сильном уроне
    if (amount >= 30 && Math.random() < 0.4) {
      this.stun();
    }

    // Переход в преследование при атаке
    if (this.state !== "chase" && this.state !== "attack") {
      this.enterChaseState();
    }

    // Проверка смерти
    if (this.currentHealth <= 0) {
      this.die();
    }
  }

  /**
   * Оглушение
   */
  private stun(): void {
    this.state = "stunned";
    this.stunTimer = this.config.stunDuration;

    this.eventBus.emit(GameEvent.MONSTER_DAMAGE, {
      id: `zombie_${Date.now()}`,
      amount: 0,
      currentHealth: this.currentHealth,
    });
  }

  /**
   * Смерть зомби
   */
  private die(): void {
    this._isAlive = false;
    this.state = "dead";
    this.currentHealth = 0;

    this.eventBus.emit(GameEvent.MONSTER_DEATH, {
      id: `zombie_${Date.now()}`,
      type: this.zombieType,
      position: { x: this.x, y: this.y },
    });

    // Анимация смерти
    this.sprite.textures = this.deathTextures;
    this.sprite.loop = false;
    this.sprite.play();

    // Эффект смерти
    this.showDeathEffect();

    // Удаление через время
    setTimeout(() => {
      this.eventBus.emit(GameEvent.MONSTER_DESTROY, {
        id: `zombie_${Date.now()}`,
      });

      const fadeOut = () => {
        this.alpha -= 0.05;
        if (this.alpha > 0) {
          requestAnimationFrame(fadeOut);
        } else {
          this.destroy({ children: true });
        }
      };
      fadeOut();
    }, 2000);
  }

  /**
   * Эффект получения урона
   */
  private showDamageEffect(): void {
    this.damageEffect.visible = true;
    this.damageEffect.alpha = 0.8;

    // Частицы крови
    this.bloodParticles.forEach((particle) => {
      particle.x = (Math.random() - 0.5) * 30;
      particle.y = (Math.random() - 0.5) * 20;
      particle.alpha = 0.8;
    });

    const fadeOut = () => {
      this.damageEffect.alpha -= 0.05;
      if (this.damageEffect.alpha > 0) {
        requestAnimationFrame(fadeOut);
      } else {
        this.damageEffect.visible = false;
      }
    };
    fadeOut();
  }

  /**
   * Эффект атаки
   */
  private showAttackEffect(): void {
    const attackEffect = new Graphics();
    attackEffect.moveTo(this.direction * 20, -5);
    attackEffect.lineTo(this.direction * 35, 0);
    attackEffect.lineTo(this.direction * 20, 5);
    attackEffect.fill({ color: 0xff4444, alpha: 0.6 });
    this.addChild(attackEffect);

    setTimeout(() => {
      this.removeChild(attackEffect);
      attackEffect.destroy();
    }, 200);
  }

  /**
   * Эффект смерти
   */
  private showDeathEffect(): void {
    // Частицы крови во все стороны
    for (let i = 0; i < 12; i++) {
      const particle = new Graphics();
      particle.circle(0, 0, Math.random() * 3 + 1);
      particle.fill({ color: 0x880000, alpha: 0.8 });
      particle.x = (Math.random() - 0.5) * 40;
      particle.y = (Math.random() - 0.5) * 30;
      this.addChild(particle);

      const animate = () => {
        particle.alpha -= 0.02;
        particle.y -= 0.5;
        particle.x += (Math.random() - 0.5) * 2;

        if (particle.alpha > 0) {
          requestAnimationFrame(animate);
        } else {
          this.removeChild(particle);
          particle.destroy();
        }
      };
      animate();
    }
  }

  /**
   * Проверка возможности атаки
   */
  public canAttack(): boolean {
    return (
      this._isAlive && this.state === "attack" && this.attackCooldownTimer <= 0
    );
  }

  /**
   * Проверка столкновения с объектом
   */
  public isCollidingWith(other: Container): boolean {
    const bounds = this.getBounds();
    const otherBounds = other.getBounds();

    return (
      bounds.x < otherBounds.x + otherBounds.width &&
      bounds.x + bounds.width > otherBounds.x &&
      bounds.y < otherBounds.y + otherBounds.height &&
      bounds.y + bounds.height > otherBounds.y
    );
  }

  /**
   * Получение расстояния до игрока
   */
  private getDistanceToPlayer(): number {
    const playerPos = this.player.getPosition();
    const dx = playerPos.x - this.x;
    const dy = playerPos.y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Установка пути патрулирования
   */
  public setPatrolPath(points: PatrolPoint[]): void {
    this.patrolPath = points;
    this.currentPatrolIndex = 0;
  }

  /**
   * Установка позиции
   */
  public setPosition(x: number, y: number): void {
    this.position.set(x, y);
    // Перегенерируем путь патрулирования
    this.generatePatrolPath();
  }

  /**
   * Сброс состояния
   */
  public reset(): void {
    this.state = "idle";
    this._isAlive = true;
    this.currentHealth = this.health;
    this.velocityX = 0;
    this.velocityY = 0;
    this.alpha = 1;
    this.visible = true;
    this.sprite.rotation = 0;

    this.sprite.textures = this.idleTextures;
    this.sprite.loop = true;
    this.sprite.play();

    this.generatePatrolPath();
  }

  /**
   * Уничтожение зомби
   */
  public destroy(options?: any): void {
    this.bloodParticles.forEach((p) => p.destroy());
    this.bloodParticles.length = 0;
    this.sparks.forEach((s) => s.destroy());
    this.sparks.length = 0;

    super.destroy(options);
  }

  // Геттеры
  get isAlive(): boolean {
    return this._isAlive;
  }

  get currentState(): ZombieState {
    return this.state;
  }

  get type(): ZombieType {
    return this.zombieType;
  }

  get damage(): number {
    return this.config.damage;
  }

  get healthPercentage(): number {
    return this.currentHealth / this.health;
  }
}
