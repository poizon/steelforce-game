import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { EventBus } from '../core/EventBus';
import { GameEvent } from '../core/EventBus';

export interface GearConfig {
  points: number;           // Очки за сбор
  rotationSpeed: number;    // Скорость вращения
  bobSpeed: number;         // Скорость покачивания
  bobHeight: number;        // Высота покачивания
  glowIntensity: number;    // Интенсивность свечения
  collectDuration: number;  // Длительность анимации сбора (мс)
  respawnTime: number;      // Время до респавна (мс, 0 = не респавнится)
}

export type GearType = 'standard' | 'golden' | 'rusty' | 'glowing' | 'large';
export type GearState = 'idle' | 'collected' | 'respawning';

export class Gear extends Container {
  private readonly eventBus: EventBus;

  // Конфигурация
  private readonly config: GearConfig;

  // Состояние
  private state: GearState = 'idle';
  private collected: boolean = false;
  private respawnTimer: number = 0;
  private animationPhase: number = 0;

  // Визуальные элементы
  private gearGraphic!: Graphics;
  private centerCircle!: Graphics;
  private glowEffect!: Graphics;
  private sparkles: Graphics[] = [];
  private collectEffect!: Container;

  // Текст
  private pointsText!: Text;

  // Тип шестерёнки
  private gearType: GearType;

  // Параметры анимации
  private rotation: number = 0;
  private bobOffset: number = 0;
  private currentScale: number = 1;
  private alphaTarget: number = 1;

  constructor(
    eventBus: EventBus,
    type: GearType = 'standard',
    config?: Partial<GearConfig>
  ) {
    super();

    this.eventBus = eventBus;
    this.gearType = type;

    // Настройки по умолчанию
    const defaultConfigs: Record<GearType, GearConfig> = {
      standard: {
        points: 10,
        rotationSpeed: 0.02,
        bobSpeed: 0.003,
        bobHeight: 5,
        glowIntensity: 0.3,
        collectDuration: 500,
        respawnTime: 0,
      },
      golden: {
        points: 50,
        rotationSpeed: 0.03,
        bobSpeed: 0.004,
        bobHeight: 7,
        glowIntensity: 0.6,
        collectDuration: 700,
        respawnTime: 0,
      },
      rusty: {
        points: 5,
        rotationSpeed: 0.01,
        bobSpeed: 0.002,
        bobHeight: 3,
        glowIntensity: 0.1,
        collectDuration: 400,
        respawnTime: 30000, // Респавнится через 30 секунд
      },
      glowing: {
        points: 25,
        rotationSpeed: 0.025,
        bobSpeed: 0.005,
        bobHeight: 6,
        glowIntensity: 0.8,
        collectDuration: 600,
        respawnTime: 0,
      },
      large: {
        points: 100,
        rotationSpeed: 0.015,
        bobSpeed: 0.002,
        bobHeight: 4,
        glowIntensity: 0.4,
        collectDuration: 1000,
        respawnTime: 0,
      },
    };

    this.config = { ...defaultConfigs[type], ...config };

    this.setup();
  }

  /**
   * Начальная настройка
   */
  private setup(): void {
    this.createGearGraphic();
    this.createGlowEffect();
    this.createCenterCircle();
    this.createSparkles();
    this.createCollectEffect();

    // Начальная фаза анимации
    this.animationPhase = Math.random() * Math.PI * 2;

    // Размер в зависимости от типа
    switch (this.gearType) {
      case 'large':
        this.currentScale = 1.5;
        break;
      case 'golden':
        this.currentScale = 1.2;
        break;
      default:
        this.currentScale = 1;
    }

    this.scale.set(this.currentScale);
    this.eventMode = 'static';
    this.cursor = 'pointer';
  }

  /**
   * Создание графики шестерёнки
   */
  private createGearGraphic(): void {
    this.gearGraphic = new Graphics();

    const colorMap: Record<GearType, number> = {
      standard: 0x888888,
      golden: 0xffaa00,
      rusty: 0x885533,
      glowing: 0x00ffaa,
      large: 0xcccccc,
    };

    const color = colorMap[this.gearType];
    const size = this.gearType === 'large' ? 24 : this.gearType === 'golden' ? 18 : 16;
    const teethCount = this.gearType === 'large' ? 12 : 8;
    const innerRadius = size * 0.5;
    const outerRadius = size * 0.8;
    const teethHeight = size * 0.3;

    // Рисуем зубья
    for (let i = 0; i < teethCount; i++) {
      const angle = (i / teethCount) * Math.PI * 2;
      const nextAngle = ((i + 0.5) / teethCount) * Math.PI * 2;

      this.gearGraphic.moveTo(
        Math.cos(angle) * innerRadius,
        Math.sin(angle) * innerRadius
      );
      this.gearGraphic.lineTo(
        Math.cos(angle) * outerRadius,
        Math.sin(angle) * outerRadius
      );
      this.gearGraphic.lineTo(
        Math.cos(nextAngle) * outerRadius,
        Math.sin(nextAngle) * outerRadius
      );
      this.gearGraphic.lineTo(
        Math.cos(nextAngle) * innerRadius,
        Math.sin(nextAngle) * innerRadius
      );
    }
    this.gearGraphic.fill({ color, alpha: 0.9 });
    this.gearGraphic.stroke({ width: 2, color: this.lightenColor(color, 0.3) });

    // Внутренняя окружность
    this.gearGraphic.circle(0, 0, innerRadius * 0.7);
    this.gearGraphic.fill({ color: this.darkenColor(color, 0.3), alpha: 0.8 });

    // Спицы
    const spokesCount = 4;
    for (let i = 0; i < spokesCount; i++) {
      const angle = (i / spokesCount) * Math.PI * 2;
      this.gearGraphic.moveTo(0, 0);
      this.gearGraphic.lineTo(
        Math.cos(angle) * innerRadius * 0.7,
        Math.sin(angle) * innerRadius * 0.7
      );
      this.gearGraphic.stroke({ width: 2, color: this.darkenColor(color, 0.2) });
    }

    this.addChild(this.gearGraphic);
  }

  /**
   * Создание эффекта свечения
   */
  private createGlowEffect(): void {
    this.glowEffect = new Graphics();

    const glowColorMap: Record<GearType, number> = {
      standard: 0xaaaaaa,
      golden: 0xffcc00,
      rusty: 0x664422,
      glowing: 0x00ff88,
      large: 0xdddddd,
    };

    const glowColor = glowColorMap[this.gearType];
    const size = this.gearType === 'large' ? 35 : 25;

    // Несколько слоёв свечения
    for (let i = 3; i >= 0; i--) {
      const radius = size + i * 5;
      const alpha = (0.1 + i * 0.05) * this.config.glowIntensity;
      this.glowEffect.circle(0, 0, radius);
      this.glowEffect.fill({ color: glowColor, alpha });
    }

    this.addChild(this.glowEffect);
  }

  /**
   * Создание центрального круга
   */
  private createCenterCircle(): void {
    this.centerCircle = new Graphics();

    const centerColorMap: Record<GearType, number> = {
      standard: 0x666666,
      golden: 0xff8800,
      rusty: 0x553311,
      glowing: 0x00cc66,
      large: 0x999999,
    };

    const centerColor = centerColorMap[this.gearType];
    const radius = this.gearType === 'large' ? 6 : 4;

    this.centerCircle.circle(0, 0, radius);
    this.centerCircle.fill({ color: centerColor });
    this.centerCircle.stroke({ width: 1, color: 0x000000, alpha: 0.3 });

    this.addChild(this.centerCircle);
  }

  /**
   * Создание искр
   */
  private createSparkles(): void {
    const sparkleColors: Record<GearType, number> = {
      standard: 0xffffff,
      golden: 0xffff00,
      rusty: 0xaa8855,
      glowing: 0x00ffcc,
      large: 0xeeeeee,
    };

    const sparkleColor = sparkleColors[this.gearType];
    const count = this.gearType === 'golden' ? 6 : this.gearType === 'glowing' ? 8 : 4;

    for (let i = 0; i < count; i++) {
      const sparkle = new Graphics();

      // Звездочка
      sparkle.moveTo(0, -3);
      sparkle.lineTo(1, -1);
      sparkle.lineTo(3, 0);
      sparkle.lineTo(1, 1);
      sparkle.lineTo(0, 3);
      sparkle.lineTo(-1, 1);
      sparkle.lineTo(-3, 0);
      sparkle.lineTo(-1, -1);
      sparkle.lineTo(0, -3);
      sparkle.fill({ color: sparkleColor, alpha: 0.8 });

      sparkle.alpha = 0;
      sparkle.visible = false;

      this.sparkles.push(sparkle);
      this.addChild(sparkle);
    }
  }

  /**
   * Создание эффекта сбора
   */
  private createCollectEffect(): void {
    this.collectEffect = new Container();
    this.collectEffect.visible = false;

    // Круги расширения
    for (let i = 0; i < 3; i++) {
      const circle = new Graphics();
      circle.circle(0, 0, 10);
      circle.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
      circle.label = `collectCircle_${i}`;
      this.collectEffect.addChild(circle);
    }

    // Текст с очками
    this.pointsText = new Text({
      text: '',
      style: {
        fontFamily: 'Press Start 2P',
        fontSize: 12,
        fill: 0xffff00,
        fontWeight: 'bold',
      },
    });
    this.pointsText.anchor.set(0.5);
    this.collectEffect.addChild(this.pointsText);

    this.addChild(this.collectEffect);
  }

  /**
   * Обновление шестерёнки
   */
  public update(delta: number): void {
    if (this.state === 'collected') {
      this.updateCollectAnimation(delta);
      return;
    }

    if (this.state === 'respawning') {
      this.updateRespawn(delta);
      return;
    }

    this.updateIdleAnimation(delta);
    this.updateSparkles(delta);
  }

  /**
   * Анимация в состоянии ожидания
   */
  private updateIdleAnimation(delta: number): void {
    // Вращение
    this.rotation += this.config.rotationSpeed * delta;

    // Покачивание
    this.animationPhase += this.config.bobSpeed * delta;
    this.bobOffset = Math.sin(this.animationPhase) * this.config.bobHeight;

    // Применяем смещение
    this.gearGraphic.y = this.bobOffset;
    this.centerCircle.y = this.bobOffset;
    this.glowEffect.y = this.bobOffset;

    // Пульсация свечения
    const glowPulse = 1 + Math.sin(this.animationPhase * 2) * 0.1;
    this.glowEffect.scale.set(glowPulse);
    this.glowEffect.alpha = (0.5 + Math.sin(this.animationPhase * 2) * 0.3) * this.config.glowIntensity;

    // Для светящихся - дополнительная пульсация
    if (this.gearType === 'glowing') {
      const extraGlow = 1 + Math.sin(this.animationPhase * 3) * 0.2;
      this.gearGraphic.scale.set(extraGlow);
    }
  }

  /**
   * Обновление искр
   */
  private updateSparkles(delta: number): void {
    this.sparkles.forEach((sparkle, index) => {
      if (sparkle.visible) {
        sparkle.alpha -= delta * 0.005;
        sparkle.scale.set(sparkle.scale.x + delta * 0.001);

        if (sparkle.alpha <= 0) {
          sparkle.visible = false;
        }
      } else if (Math.random() < 0.02) {
        // Случайное появление искры
        const angle = Math.random() * Math.PI * 2;
        const distance = 15 + Math.random() * 20;
        sparkle.x = Math.cos(angle) * distance;
        sparkle.y = Math.sin(angle) * distance + this.bobOffset;
        sparkle.alpha = 0.8 + Math.random() * 0.2;
        sparkle.scale.set(0.5 + Math.random() * 0.5);
        sparkle.visible = true;
      }
    });
  }

  /**
   * Анимация сбора
   */
  private updateCollectAnimation(delta: number): void {
    // Расширяющиеся круги
    this.collectEffect.children.forEach(child => {
      if (child instanceof Graphics && child.label?.startsWith('collectCircle')) {
        child.scale.set(child.scale.x + delta * 0.01);
        child.alpha -= delta * 0.005;
      }
    });

    // Текст с очками поднимается вверх
    this.pointsText.y -= delta * 0.5;
    this.pointsText.alpha -= delta * 0.003;

    // Завершение анимации
    if (this.pointsText.alpha <= 0) {
      this.collectEffect.visible = false;
      this.state = 'idle';

      // Респавн если нужно
      if (this.config.respawnTime > 0) {
        this.startRespawn();
      }
    }
  }

  /**
   * Обновление респавна
   */
  private updateRespawn(delta: number): void {
    this.respawnTimer -= delta * 16.67; // Конвертируем кадры в мс

    if (this.respawnTimer <= 0) {
      this.respawn();
    }
  }

  /**
   * Сбор шестерёнки
   */
  public collect(): void {
    if (this.collected) return;

    this.collected = true;
    this.state = 'collected';

    // Запускаем эффект сбора
    this.startCollectEffect();

    // Скрываем основную графику
    this.gearGraphic.visible = false;
    this.centerCircle.visible = false;
    this.glowEffect.visible = false;
    this.sparkles.forEach(s => s.visible = false);

    // Отправляем событие
    this.eventBus.emit(GameEvent.ITEM_COLLECT, {
      type: 'gear',
      alias: this.gearType,
      total: this.config.points,
    });
  }

  /**
   * Запуск эффекта сбора
   */
  private startCollectEffect(): void {
    this.collectEffect.visible = true;

    // Сбрасываем круги
    this.collectEffect.children.forEach(child => {
      if (child instanceof Graphics && child.label?.startsWith('collectCircle')) {
        child.scale.set(1);
        child.alpha = 0.8;
      }
    });

    // Настраиваем текст
    this.pointsText.text = `+${this.config.points}`;
    this.pointsText.y = 0;
    this.pointsText.alpha = 1;

    // Цвет текста в зависимости от типа
    const textColors: Record<GearType, number> = {
      standard: 0xffffff,
      golden: 0xffaa00,
      rusty: 0x886644,
      glowing: 0x00ffaa,
      large: 0xffff00,
    };
    this.pointsText.style.fill = textColors[this.gearType];
  }

  /**
   * Начало респавна
   */
  private startRespawn(): void {
    this.state = 'respawning';
    this.respawnTimer = this.config.respawnTime;
    this.alpha = 0.3;
    this.scale.set(this.currentScale * 0.5);
  }

  /**
   * Респавн шестерёнки
   */
  private respawn(): void {
    this.collected = false;
    this.state = 'idle';

    // Восстанавливаем видимость
    this.gearGraphic.visible = true;
    this.centerCircle.visible = true;
    this.glowEffect.visible = true;

    // Анимация появления
    const fadeIn = () => {
      this.alpha += 0.05;
      this.scale.set(this.scale.x + 0.02);

      if (this.alpha < 1) {
        requestAnimationFrame(fadeIn);
      } else {
        this.alpha = 1;
        this.scale.set(this.currentScale);
      }
    };
    fadeIn();
  }

  /**
   * Проверка столкновения с объектом
   */
  public isCollidingWith(other: Container): boolean {
    if (this.collected) return false;

    const bounds = this.getBounds();
    const otherBounds = other.getBounds();

    // Небольшое уменьшение хитбокса для удобства сбора
    const margin = 5;

    return bounds.x + margin < otherBounds.x + otherBounds.width &&
           bounds.x + bounds.width - margin > otherBounds.x &&
           bounds.y + margin < otherBounds.y + otherBounds.height &&
           bounds.y + bounds.height - margin > otherBounds.y;
  }

  /**
   * Установка позиции
   */
  public setPosition(x: number, y: number): void {
    this.position.set(x, y);
  }

  /**
   * Сброс состояния
   */
  public reset(): void {
    this.collected = false;
    this.state = 'idle';
    this.rotation = 0;
    this.animationPhase = Math.random() * Math.PI * 2;
    this.alpha = 1;
    this.scale.set(this.currentScale);

    this.gearGraphic.visible = true;
    this.centerCircle.visible = true;
    this.glowEffect.visible = true;
    this.collectEffect.visible = false;

    this.gearGraphic.y = 0;
    this.centerCircle.y = 0;
    this.glowEffect.y = 0;
  }

  /**
   * Осветление цвета
   */
  private lightenColor(color: number, amount: number): number {
    const r = Math.min(255, ((color >> 16) & 0xff) + Math.floor(255 * amount));
    const g = Math.min(255, ((color >> 8) & 0xff) + Math.floor(255 * amount));
    const b = Math.min(255, (color & 0xff) + Math.floor(255 * amount));
    return (r << 16) | (g << 8) | b;
  }

  /**
   * Затемнение цвета
   */
  private darkenColor(color: number, amount: number): number {
    const r = Math.max(0, ((color >> 16) & 0xff) - Math.floor(255 * amount));
    const g = Math.max(0, ((color >> 8) & 0xff) - Math.floor(255 * amount));
    const b = Math.max(0, (color & 0xff) - Math.floor(255 * amount));
    return (r << 16) | (g << 8) | b;
  }

  /**
   * Уничтожение шестерёнки
   */
  public destroy(options?: any): void {
    this.sparkles.forEach(s => s.destroy());
    this.sparkles.length = 0;

    super.destroy(options);
  }

  // Геттеры
  get isCollected(): boolean {
    return this.collected;
  }

  get currentState(): GearState {
    return this.state;
  }

  get gearTypeName(): GearType {
    return this.gearType;
  }

  get pointValue(): number {
    return this.config.points;
  }

  get canRespawn(): boolean {
    return this.config.respawnTime > 0;
  }
}
