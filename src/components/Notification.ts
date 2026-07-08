import { Container, Text, Graphics, TextStyle } from "pixi.js";

export type NotificationType = "info" | "warning" | "error" | "success";

interface NotificationOptions {
  message: string;
  type?: NotificationType;
  duration?: number;
}

export class Notification extends Container {
  private background: Graphics | null = null;
  private messageText: Text | null = null;
  private hideTimeout: number | null = null;

  private readonly colors: Record<NotificationType, number> = {
    info: 0x3498db,
    warning: 0xf39c12,
    error: 0xe74c3c,
    success: 0x2ecc71,
  };

  private readonly icons: Record<NotificationType, string> = {
    info: "ℹ",
    warning: "⚠",
    error: "✖",
    success: "✓",
  };

  constructor() {
    super();
    this.visible = false;
    this.alpha = 0;
    this.scale.set(0);
  }

  private createNotification(message: string, type: NotificationType): void {
    // Удаляем старые элементы безопасно
    this.removeChildren().forEach((child) => child.destroy());

    // Создаем текст
    this.messageText = new Text({
      text: `${this.icons[type]} ${message}`,
      style: new TextStyle({
        fontFamily: "Press Start 2P, monospace",
        fontSize: 14,
        fill: 0xffffff,
        wordWrap: true,
        wordWrapWidth: 500,
        align: "center",
        lineHeight: 24,
      }),
    });
    this.messageText.anchor.set(0.5);
    this.addChild(this.messageText);

    // Вычисляем размеры фона
    const padding = 30;
    const textWidth = this.messageText.width + padding * 2;
    const textHeight = this.messageText.height + padding;

    // Создаем фон
    this.background = new Graphics();

    // Основной фон
    this.background.roundRect(
      -textWidth / 2,
      -textHeight / 2,
      textWidth,
      textHeight,
      10,
    );
    this.background.fill({ color: this.colors[type], alpha: 0.9 });

    // Обводка
    this.background.roundRect(
      -textWidth / 2,
      -textHeight / 2,
      textWidth,
      textHeight,
      10,
    );
    this.background.stroke({ width: 2, color: 0xffffff, alpha: 0.3 });

    // Добавляем фон перед текстом
    this.addChildAt(this.background, 0);
  }

  public show(options: NotificationOptions): void {
    // Очищаем предыдущий таймер
    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    const { message, type = "info", duration = 3000 } = options;

    // Создаем элементы
    this.createNotification(message, type);

    // Показываем (используем унаследованное свойство visible)
    this.visible = true;
    this.alpha = 0;
    this.scale.set(0.5);

    // Анимация появления
    this.animateIn();

    // Автоматически скрываем через duration
    if (duration > 0) {
      this.hideTimeout = window.setTimeout(() => {
        this.hide();
        this.hideTimeout = null;
      }, duration);
    }
  }

  public hide(): void {
    // Используем унаследованное свойство visible
    if (!this.visible) return;

    // Очищаем таймер
    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    this.animateOut(() => {
      this.visible = false;
      this.alpha = 0;
      this.scale.set(0);
    });
  }

  private animateIn(): void {
    const duration = 300;
    const startScale = 0.5;
    const targetScale = 1;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // EaseOutBack
      const c1 = 1.70158;
      const c3 = c1 + 1;
      const ease =
        1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2);

      this.scale.set(startScale + (targetScale - startScale) * ease);
      this.alpha = Math.min(1, progress * 2);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.scale.set(targetScale);
        this.alpha = 1;
      }
    };

    animate();
  }

  private animateOut(onComplete?: () => void): void {
    const duration = 200;
    const startAlpha = this.alpha;
    const startScale = this.scale.x;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // EaseInCubic
      const ease = progress * progress * progress;

      this.alpha = startAlpha * (1 - ease);
      this.scale.set(startScale * (1 - ease * 0.5));

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.alpha = 0;
        this.scale.set(0);
        onComplete?.();
      }
    };

    animate();
  }

  /**
   * Показывает уведомление и возвращает Promise, который разрешается после скрытия
   */
  public showAsync(options: NotificationOptions): Promise<void> {
    return new Promise((resolve) => {
      const originalDuration = options.duration || 3000;

      this.show({
        ...options,
        duration: originalDuration,
      });

      // Ждём завершения
      setTimeout(() => {
        resolve();
      }, originalDuration + 400); // +400ms на анимацию
    });
  }

  /**
   * Немедленно скрывает уведомление без анимации
   */
  public hideImmediately(): void {
    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    this.visible = false;
    this.alpha = 0;
    this.scale.set(0);
    this.removeChildren().forEach((child) => child.destroy());
  }

  /**
   * Проверяет, видимо ли уведомление
   */
  public isShown(): boolean {
    return this.visible;
  }

  /**
   * Уничтожает компонент
   */
  public destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.hideImmediately();
    super.destroy(options);
  }
}
