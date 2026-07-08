import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { EventBus } from "../core/EventBus";
import { GameEvent } from "../core/EventBus";

export type Emotion =
  | "neutral"
  | "scared"
  | "determined"
  | "hopeful"
  | "worried"
  | "angry"
  | "sad"
  | "surprised";

interface DialogBoxConfig {
  width?: number;
  height?: number;
  padding?: number;
  typingSpeed?: number;
  fontSize?: number;
  fontFamily?: string;
}

export class DialogBox extends Container {
  private readonly eventBus: EventBus;

  // Конфигурация
  private readonly config: Required<DialogBoxConfig>;

  // Графические элементы
  private background!: Graphics;
  private border!: Graphics;
  private speakerNameBg!: Graphics;
  private speakerNameText!: Text;
  private dialogText!: Text;
  private continueIndicator!: Text;
  private emotionIcon!: Container;
  private portraitContainer!: Container;

  // Состояния
  private isTyping: boolean = false;
  private isWaitingForInput: boolean = false;
  private currentText: string = "";
  private displayedText: string = "";
  private charactersToShow: number = 0;
  private typingTimer: number = 0;
  private onCompleteCallback?: () => void;
  private currentSpeaker: string = "";
  private currentEmotion: Emotion = "neutral";

  // Анимации
  private pulsePhase: number = 0;
  private shakeIntensity: number = 0;

  // Стили для эмоций
  private readonly emotionColors: Record<Emotion, number> = {
    neutral: 0x00ff00,
    scared: 0xff6666,
    determined: 0x66ff66,
    hopeful: 0x66ccff,
    worried: 0xffcc66,
    angry: 0xff3333,
    sad: 0x6699cc,
    surprised: 0xff66ff,
  };

  private readonly emotionIcons: Record<Emotion, string> = {
    neutral: "😐",
    scared: "😨",
    determined: "💪",
    hopeful: "✨",
    worried: "😟",
    angry: "😠",
    sad: "😢",
    surprised: "😲",
  };

  constructor(eventBus: EventBus, config: DialogBoxConfig = {}) {
    super();

    this.eventBus = eventBus;

    // Настройки по умолчанию
    this.config = {
      width: config.width ?? 900,
      height: config.height ?? 180,
      padding: config.padding ?? 20,
      typingSpeed: config.typingSpeed ?? 30,
      fontSize: config.fontSize ?? 16,
      fontFamily: config.fontFamily ?? "Press Start 2P",
    };

    this.setup();
  }

  /**
   * Начальная настройка компонента
   */
  private setup(): void {
    this.createBackground();
    this.createSpeakerName();
    this.createDialogText();
    this.createContinueIndicator();
    this.createPortrait();
    this.createEmotionIcon();

    // Позиционирование
    this.position.set(this.config.width / 2, 600);

    // Интерактивность
    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointerdown", this.onClick.bind(this));

    // Начальное состояние
    this.visible = false;
    this.alpha = 0;
  }

  /**
   * Создание фона диалогового окна
   */
  private createBackground(): void {
    this.background = new Graphics();

    // Основной фон с градиентом
    this.background.roundRect(0, 0, this.config.width, this.config.height, 8);
    this.background.fill({ color: 0x000000, alpha: 0.85 });

    // Внутренняя тень
    this.background.roundRect(
      2,
      2,
      this.config.width - 4,
      this.config.height - 4,
      6,
    );
    this.background.fill({ color: 0x111111, alpha: 0.3 });

    // Граница
    this.border = new Graphics();
    this.border.roundRect(0, 0, this.config.width, this.config.height, 8);
    this.border.stroke({ width: 2, color: 0x444444 });

    // Декоративная линия сверху
    const topLine = new Graphics();
    topLine.moveTo(10, 3);
    topLine.lineTo(this.config.width - 10, 3);
    topLine.stroke({ width: 1, color: 0x666666 });

    this.addChild(this.background, this.border, topLine);
  }

  /**
   * Создание имени говорящего
   */
  private createSpeakerName(): void {
    // Фон для имени
    this.speakerNameBg = new Graphics();
    this.speakerNameBg.roundRect(15, -12, 200, 24, 4);
    this.speakerNameBg.fill({ color: 0x000000 });
    this.speakerNameBg.stroke({ width: 1, color: 0x00ff00 });

    // Текст имени
    this.speakerNameText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: this.config.fontFamily,
        fontSize: 14,
        fill: 0x00ff00,
        fontWeight: "bold",
        letterSpacing: 2,
      }),
    });
    this.speakerNameText.position.set(25, -9);

    this.addChild(this.speakerNameBg, this.speakerNameText);
  }

  /**
   * Создание текста диалога
   */
  private createDialogText(): void {
    this.dialogText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: this.config.fontFamily,
        fontSize: this.config.fontSize,
        fill: 0xffffff,
        wordWrap: true,
        wordWrapWidth: this.config.width - this.config.padding * 2 - 120,
        lineHeight: this.config.fontSize * 1.5,
        letterSpacing: 1,
        breakWords: true,
      }),
    });

    this.dialogText.position.set(
      this.config.padding + 100,
      this.config.padding + 10,
    );

    this.addChild(this.dialogText);
  }

  /**
   * Создание индикатора продолжения
   */
  private createContinueIndicator(): void {
    this.continueIndicator = new Text({
      text: "▼",
      style: new TextStyle({
        fontFamily: this.config.fontFamily,
        fontSize: 12,
        fill: 0xffffff,
      }),
    });

    this.continueIndicator.anchor.set(0.5);
    this.continueIndicator.position.set(
      this.config.width - 30,
      this.config.height - 25,
    );
    this.continueIndicator.visible = false;

    this.addChild(this.continueIndicator);
  }

  /**
   * Создание портрета персонажа
   */
  private createPortrait(): void {
    this.portraitContainer = new Container();
    this.portraitContainer.position.set(
      this.config.padding,
      this.config.padding + 10,
    );

    // Рамка портрета
    const frame = new Graphics();
    frame.rect(0, 0, 80, 80);
    frame.stroke({ width: 2, color: 0x444444 });
    frame.fill({ color: 0x000000, alpha: 0.5 });

    this.portraitContainer.addChild(frame);
    this.addChild(this.portraitContainer);
  }

  /**
   * Создание иконки эмоции
   */
  private createEmotionIcon(): void {
    this.emotionIcon = new Container();
    this.emotionIcon.position.set(this.config.width - 50, 10);
    this.emotionIcon.visible = false;

    this.addChild(this.emotionIcon);
  }

  /**
   * Показ диалога
   */
  public show(
    speaker: string,
    text: string,
    emotion: Emotion = "neutral",
    onComplete?: () => void,
  ): void {
    // Сбрасываем состояние
    this.resetState();

    // Сохраняем параметры
    this.currentSpeaker = speaker;
    this.currentText = text;
    this.currentEmotion = emotion;
    this.onCompleteCallback = onComplete;

    // Настраиваем отображение
    this.updateSpeakerDisplay();
    this.updateEmotionDisplay();
    this.updatePortrait(speaker);

    // Показываем окно
    this.showBox();

    // Начинаем печать текста
    this.startTyping();

    // Эмитим событие
    this.eventBus.emit(GameEvent.DIALOG_START, {
      npcId: speaker,
      dialogueId: `dialogue_${Date.now()}`,
    });
  }

  /**
   * Обновление отображения имени говорящего
   */
  private updateSpeakerDisplay(): void {
    this.speakerNameText.text = this.currentSpeaker;

    // Цвет имени в зависимости от эмоции
    const color = this.emotionColors[this.currentEmotion];
    this.speakerNameText.style.fill = color;

    // Обновляем цвет рамки
    this.speakerNameBg.clear();
    this.speakerNameBg.roundRect(
      15,
      -12,
      this.speakerNameText.width + 20,
      24,
      4,
    );
    this.speakerNameBg.fill({ color: 0x000000 });
    this.speakerNameBg.stroke({ width: 1, color });
  }

  /**
   * Обновление отображения эмоции
   */
  private updateEmotionDisplay(): void {
    this.emotionIcon.removeChildren();

    // Иконка эмоции
    const icon = new Text({
      text: this.emotionIcons[this.currentEmotion],
      style: new TextStyle({
        fontSize: 24,
      }),
    });
    icon.anchor.set(0.5);
    this.emotionIcon.addChild(icon);

    // Пульсирующий круг
    const circle = new Graphics();
    circle.circle(0, 0, 15);
    circle.fill({ color: this.emotionColors[this.currentEmotion], alpha: 0.2 });
    this.emotionIcon.addChild(circle);

    this.emotionIcon.visible = true;
  }

  /**
   * Обновление портрета
   */
  private updatePortrait(speaker: string): void {
    this.portraitContainer.removeChildren();

    // Рамка
    const frame = new Graphics();
    frame.rect(0, 0, 80, 80);
    frame.stroke({ width: 2, color: this.emotionColors[this.currentEmotion] });
    frame.fill({ color: 0x000000, alpha: 0.5 });
    this.portraitContainer.addChild(frame);

    // Здесь можно добавить загрузку портрета персонажа
    // Пока используем цветной квадрат с инициалами
    const initials = new Text({
      text: speaker,
      style: new TextStyle({
        fontFamily: this.config.fontFamily,
        fontSize: 24,
        fill: this.emotionColors[this.currentEmotion],
      }),
    });
    initials.anchor.set(0.5);
    initials.position.set(40, 40);
    this.portraitContainer.addChild(initials);
  }

  /**
   * Показ окна с анимацией
   */
  private showBox(): void {
    this.visible = true;

    // Анимация появления
    const duration = 300;
    const startTime = Date.now();
    const startY = this.y + 20;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      this.alpha = eased;
      this.y = startY - 20 * eased;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  /**
   * Скрытие окна с анимацией
   */
  public hide(onComplete?: () => void): void {
    const duration = 200;
    const startTime = Date.now();
    const startAlpha = this.alpha;
    const startY = this.y;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = Math.pow(progress, 3);

      this.alpha = startAlpha * (1 - eased);
      this.y = startY + 10 * eased;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.visible = false;
        this.resetState();
        onComplete?.();
      }
    };

    animate();
  }

  /**
   * Начало анимации печати текста
   */
  private startTyping(): void {
    this.isTyping = true;
    this.charactersToShow = 0;
    this.displayedText = "";
    this.typingTimer = 0;

    // Звук печати (опционально)
    // this.audioManager.playSFX('typing', { volume: 0.1, loop: true });
  }

  /**
   * Сброс состояния
   */
  private resetState(): void {
    this.isTyping = false;
    this.isWaitingForInput = false;
    this.currentText = "";
    this.displayedText = "";
    this.charactersToShow = 0;
    this.typingTimer = 0;
    this.onCompleteCallback = undefined;
    this.dialogText.text = "";
    this.continueIndicator.visible = false;
    this.shakeIntensity = 0;

    // Останавливаем звук печати
    // this.audioManager.stop('typing');
  }

  /**
   * Пропуск анимации печати
   */
  public skip(): void {
    if (this.isTyping) {
      // Показываем весь текст сразу
      this.isTyping = false;
      this.dialogText.text = this.currentText;
      this.displayedText = this.currentText;
      this.showContinueIndicator();

      // Останавливаем звук печати
      // this.audioManager.stop('typing');
    } else if (this.isWaitingForInput) {
      // Завершаем диалог
      this.completeDialog();
    }
  }

  /**
   * Показ индикатора продолжения
   */
  private showContinueIndicator(): void {
    this.isWaitingForInput = true;
    this.continueIndicator.visible = true;
  }

  /**
   * Завершение диалога
   */
  private completeDialog(): void {
    this.isWaitingForInput = false;

    const callback = this.onCompleteCallback;
    this.hide(() => {
      callback?.();
    });

    this.eventBus.emit(GameEvent.DIALOG_NEXT, {
      dialogueId: `dialogue_${Date.now()}`,
      lineIndex: 0,
    });
  }

  /**
   * Обработчик клика
   */
  private onClick(): void {
    if (this.isTyping) {
      this.skip();
    } else if (this.isWaitingForInput) {
      this.completeDialog();
    }
  }

  /**
   * Обновление компонента
   */
  public update(delta: number): void {
    if (this.isTyping) {
      this.updateTyping(delta);
    }

    if (this.isWaitingForInput) {
      this.updateContinueIndicator(delta);
    }

    // Обновление эффекта тряски
    if (this.shakeIntensity > 0) {
      this.updateShake(delta);
    }

    // Обновление иконки эмоции
    this.updateEmotionPulse(delta);
  }

  /**
   * Обновление анимации печати
   */
  private updateTyping(delta: number): void {
    this.typingTimer += delta;

    const charsToShow = Math.floor(
      this.typingTimer / (this.config.typingSpeed / 16.67),
    );

    if (charsToShow > this.charactersToShow) {
      this.charactersToShow = Math.min(
        this.charactersToShow + 1,
        this.currentText.length,
      );

      this.displayedText = this.currentText.substring(0, this.charactersToShow);
      this.dialogText.text = this.displayedText;

      // Добавляем эффект мерцающего курсора
      if (this.charactersToShow < this.currentText.length) {
        this.dialogText.text += "|";
      }

      // Завершение печати
      if (this.charactersToShow >= this.currentText.length) {
        this.isTyping = false;
        this.showContinueIndicator();

        // Останавливаем звук печати
        // this.audioManager.stop('typing');
      }
    }
  }

  /**
   * Обновление индикатора продолжения
   */
  private updateContinueIndicator(delta: number): void {
    this.pulsePhase += delta * 0.05;

    // Пульсация индикатора
    const scale = 1 + Math.sin(this.pulsePhase) * 0.1;
    this.continueIndicator.scale.set(scale);
    this.continueIndicator.alpha = 0.5 + Math.sin(this.pulsePhase) * 0.5;
  }

  /**
   * Обновление пульсации иконки эмоции
   */
  private updateEmotionPulse(): void {
    if (!this.emotionIcon.visible) return;

    const circle = this.emotionIcon.children[1] as Graphics;
    if (circle) {
      const scale = 1 + Math.sin(this.pulsePhase * 0.5) * 0.3;
      circle.scale.set(scale);
      circle.alpha = 0.1 + Math.sin(this.pulsePhase * 0.5) * 0.1;
    }
  }

  /**
   * Обновление эффекта тряски
   */
  private updateShake(): void {
    this.shakeIntensity *= 0.9;

    if (this.shakeIntensity < 0.01) {
      this.shakeIntensity = 0;
      this.x = this.config.width / 2;
      return;
    }

    this.x =
      this.config.width / 2 + (Math.random() - 0.5) * this.shakeIntensity * 10;
  }

  /**
   * Эффект тряски (для страшных/эмоциональных моментов)
   */
  public shake(intensity: number = 1): void {
    this.shakeIntensity = Math.min(intensity, 1);
  }

  /**
   * Изменение текста динамически (для выбора/ветвления диалогов)
   */
  public updateText(text: string, emotion?: Emotion): void {
    this.currentText = text;
    if (emotion) {
      this.currentEmotion = emotion;
      this.updateSpeakerDisplay();
      this.updateEmotionDisplay();
    }
    this.startTyping();
  }

  /**
   * Показ выбора в диалоге
   */
  public showChoices(choices: string[]): Promise<number> {
    return new Promise((resolve) => {
      // Очищаем текущий текст
      this.dialogText.text = "";

      // Создаём кнопки выбора
      const choiceContainer = new Container();
      choiceContainer.position.set(
        this.config.padding + 100,
        this.config.padding + 10,
      );

      choices.forEach((choice, index) => {
        const choiceBg = new Graphics();
        choiceBg.roundRect(0, index * 35, 400, 30, 4);
        choiceBg.fill({ color: 0x333333, alpha: 0.8 });
        choiceBg.stroke({ width: 1, color: 0x666666 });

        const choiceText = new Text({
          text: `${index + 1}. ${choice}`,
          style: new TextStyle({
            fontFamily: this.config.fontFamily,
            fontSize: 12,
            fill: 0xffffff,
          }),
        });
        choiceText.position.set(10, index * 35 + 5);

        choiceContainer.addChild(choiceBg, choiceText);

        // Интерактивность
        choiceBg.eventMode = "static";
        choiceBg.cursor = "pointer";

        choiceBg.on("pointerover", () => {
          choiceBg.clear();
          choiceBg.roundRect(0, index * 35, 400, 30, 4);
          choiceBg.fill({ color: 0x555555, alpha: 0.8 });
          choiceBg.stroke({ width: 2, color: 0x00ff00 });
        });

        choiceBg.on("pointerout", () => {
          choiceBg.clear();
          choiceBg.roundRect(0, index * 35, 400, 30, 4);
          choiceBg.fill({ color: 0x333333, alpha: 0.8 });
          choiceBg.stroke({ width: 1, color: 0x666666 });
        });

        choiceBg.on("pointerdown", () => {
          this.removeChild(choiceContainer);
          resolve(index);
        });
      });

      this.addChild(choiceContainer);

      // Также поддерживаем выбор с клавиатуры
      const keyHandler = (event: KeyboardEvent) => {
        const num = parseInt(event.key);
        if (num >= 1 && num <= choices.length) {
          window.removeEventListener("keydown", keyHandler);
          this.removeChild(choiceContainer);
          resolve(num - 1);
        }
      };

      window.addEventListener("keydown", keyHandler);
    });
  }

  /**
   * Установка позиции диалогового окна
   */
  public setPosition(x: number, y: number): void {
    this.position.set(x, y);
  }

  /**
   * Изменение размеров окна
   */
  public resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;

    // Пересоздаём фон
    this.background.clear();
    this.background.roundRect(0, 0, width, height, 8);
    this.background.fill({ color: 0x000000, alpha: 0.85 });

    this.border.clear();
    this.border.roundRect(0, 0, width, height, 8);
    this.border.stroke({ width: 2, color: 0x444444 });

    // Обновляем размер текстового поля
    this.dialogText.style.wordWrapWidth = width - this.config.padding * 2 - 120;
  }

  /**
   * Получение состояния диалога
   */
  public getState(): {
    isTyping: boolean;
    isWaitingForInput: boolean;
    currentSpeaker: string;
    currentEmotion: Emotion;
  } {
    return {
      isTyping: this.isTyping,
      isWaitingForInput: this.isWaitingForInput,
      currentSpeaker: this.currentSpeaker,
      currentEmotion: this.currentEmotion,
    };
  }

  /**
   * Очистка компонента
   */
  public destroy(options?: any): void {
    this.resetState();
    this.removeAllListeners();
    super.destroy(options);
  }
}
