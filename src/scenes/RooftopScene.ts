import { Container, Sprite, Text, TextStyle, Graphics } from "pixi.js";

import * as BaseScene from "./BaseScene";
import { GameEvent } from "../core/EventBus";
import { DialogBox } from "../components/DialogBox";
import type { SceneName } from "../core/SceneManager";

interface DialogueLine {
  speaker: string;
  text: string;
  emotion?: "neutral" | "scared" | "determined" | "hopeful" | "worried";
  pauseAfter?: number;
}

export class RooftopScene extends BaseScene.BaseScene {
  // Фоновые элементы
  private background!: Sprite;
  private skyGradient!: Graphics;
  private buildingsBackground!: Container;
  private rooftopForeground!: Container;

  // Персонажи
  private characterN!: Sprite;
  private characterM!: Sprite;
  private charactersContainer!: Container;

  // Радио
  private radioContainer!: Container;
  private radioSprite!: Sprite;
  private radioTextContainer!: Container;
  private radioTextLines: Text[] = [];
  private radioStaticEffect!: Graphics;

  // Диалог
  private dialogBox!: DialogBox;
  private textareaBackground!: Sprite;

  // Раскладка персонажей (заполняется в createCharacters, используется в createRadio)
  private readonly characterGapRatio: number = 0.05; // 5% ширины экрана между персонажами
  private charactersBaselineY: number = 0;
  private leftCharacterX: number = 0;

  // Эффекты
  private smokeParticles: Graphics[] = [];
  private windLines: Graphics[] = [];
  private vignette!: Graphics;
  private redSkyOverlay!: Graphics;

  // Состояния
  private isRadioPlaying: boolean = false;
  private isDialogActive: boolean = false;
  private isTransitioning: boolean = false;
  private time: number = 0;
  private windIntensity: number = 0;

  // Текст радио
  private readonly radioBroadcastLines: string[] = [
    "ВНИМАНИЕ! ЭКСТРЕННОЕ СООБЩЕНИЕ!",
    "16 ноября в ходе эксперимента по проверке",
    "сыворотки произошел несчастный случай..",
    "",
    "Погибло более двухсот человек,",
    "остальные подверглись воздействию",
    "вредных веществ и были...",
    "",
    "Армия получила приказ о нанесении",
    "удара термическими зарядами по",
    "поражённому городу в течении 24 часов",
    "с целью избавления от...",
    "",
    "ВСЕМ ГРАЖДАНАМ НЕМЕДЛЕННО",
    "ПОКИНУТЬ ГОРОД!",
  ];

  // Диалоги
  private readonly dialogues: DialogueLine[] = [
    {
      speaker: "Н",
      text: "Запасы заканчиваются и этот дым распространяется всё дальше..",
      emotion: "worried",
      pauseAfter: 1000,
    },
    {
      speaker: "М",
      text: "Кажется, на окраине города есть станция, от которой можно добраться до более безопасных районов.",
      emotion: "determined",
      pauseAfter: 1500,
    },
    {
      speaker: "М",
      text: "Возможно нам стоит попробовать туда добраться.",
      emotion: "hopeful",
      pauseAfter: 2000,
    },
    {
      speaker: "Н",
      text: "Это наш единственный шанс. Нужно идти прямо сейчас, пока не стемнело.",
      emotion: "determined",
      pauseAfter: 1500,
    },
  ];

  protected getSceneName(): SceneName {
    return "rooftop";
  }

  protected async preload(): Promise<void> {
    // Ресурсы загружены централизованно
  }

  protected setup(): void {
    this.createBackground();
    this.createSkyGradient();
    this.createCharacters();
    this.createRadio();
    this.createEffects();
    this.createRedSkyOverlay();
    this.createDialogBox();
    this.createControlHint();

    // Начальное состояние
    this.alpha = 0;
    this.radioTextContainer.alpha = 0;
  }

  protected bindEvents(): void {
    // Пропуск диалога
    this.eventMode = "static";
    this.on("pointerdown", this.onSkipDialog.bind(this));

    this.inputManager.onKeyDown(" ", (event) => {
      event?.preventDefault();
      this.onSkipDialog();
    });

    this.inputManager.onKeyDown("Enter", (event) => {
      event?.preventDefault();
      this.onSkipDialog();
    });

    this.inputManager.onKeyDown("Escape", this.onEscape.bind(this));

    // События диалога
    this.eventBus.on(GameEvent.DIALOG_END, this.onDialogEnd.bind(this));
    this.eventBus.on(GameEvent.DIALOG_NEXT, this.onDialogNext.bind(this));
  }

  protected async onEnter(): Promise<void> {
    // Музыка и эмбиент
    this.audioManager.stopCategory("music");
    this.audioManager.playAmbient("wind-ambient", { volume: 0.3 });

    // Анимация появления
    await this.fadeIn(1000);

    // Запуск сцены
    await this.playSceneSequence();
  }

  public update(delta: number): void {
    this.time += delta * 0.01;

    // Анимация ветра
    this.updateWind(delta);

    // Анимация дыма
    this.updateSmoke(delta);

    // Анимация радио помех
    if (this.isRadioPlaying) {
      this.updateRadioStatic();
    }

    // Анимация персонажей
    this.updateCharacters();

    // Обновление красного неба
    this.updateRedSky();
  }

  /**
   * Создание фона
   */
  private createBackground(): void {
    this.background = new Sprite(
      this.assetLoader.getTexture("rooftop-background"),
    );

    this.background.width = this.app.screen.width;
    this.background.height = this.app.screen.height;
    this.background.alpha = 0.8;

    this.addChild(this.background);
  }

  /**
   * Создание градиента неба
   */
  private createSkyGradient(): void {
    this.skyGradient = new Graphics();
    const { width, height } = this.app.screen;

    // Вечернее небо
    for (let i = 0; i < height * 0.6; i++) {
      const progress = i / (height * 0.6);
      const color = this.lerpColor(0xff6600, 0x1a0a2e, progress);
      this.skyGradient.rect(0, i, width, 1);
      this.skyGradient.fill({ color, alpha: 0.5 });
    }

    this.addChild(this.skyGradient);
  }

  /**
   * Создание персонажей
   */
  private createCharacters(): void {
    const { width, height } = this.app.screen;

    // Персонажи центрированы по горизонтали; высота от нижней границы экрана — 15%
    this.charactersBaselineY = height * 0.85;
    const halfGap = (width * this.characterGapRatio) / 2;

    this.charactersContainer = new Container();
    this.charactersContainer.x = width / 2;
    this.charactersContainer.y = this.charactersBaselineY - 20;

    // Персонаж Н (слева)
    this.characterN = new Sprite(this.assetLoader.getTexture("character-n"));
    this.characterN.anchor.set(0.5, 1);
    this.characterN.x = -halfGap - 100;
    this.characterN.scale.set(0.8);

    // Персонаж М (справа)
    this.characterM = new Sprite(this.assetLoader.getTexture("character-m"));
    this.characterM.anchor.set(0.5, 1);
    this.characterM.x = halfGap + 100;
    this.characterM.scale.set(0.8);

    this.charactersContainer.addChild(this.characterN, this.characterM);
    this.addChild(this.charactersContainer);

    // Абсолютная координата левого персонажа — нужна для позиционирования радио
    this.leftCharacterX = this.charactersContainer.x - halfGap;
  }

  /**
   * Создание радио
   */
  private createRadio(): void {
    const { width } = this.app.screen;

    this.radioContainer = new Container();
    // Радио размещаем левее персонажей с отступом от них в 5% ширины экрана
    this.radioContainer.x = this.leftCharacterX - width * 0.25;
    this.radioContainer.y = this.charactersBaselineY - 40;

    // Спрайт радио (тот же базовый уровень, что и у персонажей)
    this.radioSprite = new Sprite(this.assetLoader.getTexture("radio"));
    this.radioSprite.anchor.set(0.5, 1);
    this.radioSprite.scale.set(0.6);

    // Эффект помех
    this.radioStaticEffect = new Graphics();

    // Текст радио
    this.radioTextContainer = new Container();
    this.radioTextContainer.y = -100;

    this.radioContainer.addChild(
      this.radioSprite,
      this.radioStaticEffect,
      this.radioTextContainer,
    );
    this.addChild(this.radioContainer);
  }

  /**
   * Создание диалогового окна
   */
  private createDialogBox(): void {
    const { width, height } = this.app.screen;

    const boxWidth = width * 0.9;
    const boxHeight = height * 0.22;
    const boxX = (width - boxWidth) / 2;
    const marginBottom = height * 0.01; // отступ 1% от нижней границы экрана
    const boxY = height - marginBottom - boxHeight;

    // Блок, в который выводится текст (текстура textarea)
    this.textareaBackground = new Sprite(
      this.assetLoader.getTexture("textarea"),
    );
    this.textareaBackground.x = boxX;
    this.textareaBackground.y = boxY;
    this.textareaBackground.width = boxWidth;
    this.textareaBackground.height = boxHeight;
    this.addChild(this.textareaBackground);

    this.dialogBox = new DialogBox(this.eventBus, {
      width: boxWidth,
      height: boxHeight,
    });
    this.dialogBox.setPosition(boxX, boxY);
    this.dialogBox.visible = false;
    this.addChild(this.dialogBox);
  }

  /**
   * Создание визуальных эффектов
   */
  private createEffects(): void {
    // Виньетка
    this.vignette = new Graphics();
    const { width, height } = this.app.screen;
    this.vignette.rect(0, 0, width, height);
    this.vignette.fill({ color: 0x000000, alpha: 0.3 });
    this.vignette.circle(width / 2, height / 2, Math.min(width, height) * 0.6);
    this.vignette.fill({ color: 0x000000, alpha: 0 });
    this.addChild(this.vignette);

    // Частицы дыма
    for (let i = 0; i < 20; i++) {
      const smoke = this.createSmokeParticle(
        Math.random() * this.app.screen.width,
        Math.random() * this.app.screen.height,
      );
      this.smokeParticles.push(smoke);
      this.addChild(smoke);
    }

    // Линии ветра
    for (let i = 0; i < 10; i++) {
      const windLine = new Graphics();
      windLine.alpha = 0;
      this.windLines.push(windLine);
      this.addChild(windLine);
    }
  }

  /**
   * Создание перекрытия красного неба
   */
  private createRedSkyOverlay(): void {
    this.redSkyOverlay = new Graphics();
    this.redSkyOverlay.alpha = 0;
    this.addChild(this.redSkyOverlay);
  }

  /**
   * Создание подсказки управления
   */
  private createControlHint(): void {
    const hintContainer = new Container();
    hintContainer.alpha = 0;
    hintContainer.label = "controlHint";

    const bg = new Graphics();
    bg.roundRect(0, 0, 600, 80, 5);
    bg.fill({ color: 0x000000, alpha: 0.7 });
    bg.stroke({ width: 1, color: 0xff6600 });
    hintContainer.addChild(bg);

    const hintText = new Text({
      text: "⚠ Опасайтесь монстров и доберитесь до станции до заката солнца",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 12,
        fill: 0xff6600,
        wordWrap: true,
        wordWrapWidth: 560,
        align: "center",
        lineHeight: 20,
      }),
    });
    hintText.anchor.set(0.5);
    hintText.x = 300;
    hintText.y = 40;
    hintContainer.addChild(hintText);

    hintContainer.x = (this.app.screen.width - 600) / 2;
    hintContainer.y = this.app.screen.height - 120;

    this.addChild(hintContainer);
  }

  /**
   * Создание частицы дыма
   */
  private createSmokeParticle(x: number, y: number): Graphics {
    const particle = new Graphics();
    particle.circle(0, 0, Math.random() * 20 + 10);
    particle.fill({ color: 0x444444, alpha: 0.3 });
    particle.x = x;
    particle.y = y;
    // particle.speed = Math.random() * 0.5 + 0.2;
    // particle.offset = Math.random() * Math.PI * 2;
    return particle;
  }

  /**
   * Основная последовательность сцены
   */
  private async playSceneSequence(): Promise<void> {
    // 1. Показываем крышу и персонажей
    await this.delay(1000);

    // 2. Включаем радио
    await this.playRadioBroadcast();

    // 3. Показываем диалог
    await this.playDialogue();

    // 4. Показываем подсказку
    await this.showControlHint();

    // 5. Пауза перед переходом
    await this.delay(2000);

    // 6. Переход к следующей сцене
    await this.transitionToNextScene();
  }

  /**
   * Воспроизведение радио
   */
  private async playRadioBroadcast(): Promise<void> {
    this.isRadioPlaying = true;

    // Звук помех
    this.audioManager.playSFX("radio-static", {
      volume: 0.3,
      loop: true,
    });

    // Показываем радио текст
    await this.fadeInRadioText();

    // Показываем строки радио
    for (let i = 0; i < this.radioBroadcastLines.length; i++) {
      if (this.isTransitioning) break;

      await this.showRadioLine(i);
      await this.delay(800);
    }

    // Затухание радио
    await this.delay(2000);
    this.audioManager.stop("radio-static");
    await this.fadeOutRadioText();

    this.isRadioPlaying = false;
  }

  /**
   * Показ строки радио текста
   */
  private async showRadioLine(index: number): Promise<void> {
    const line = this.radioBroadcastLines[index];

    const textStyle = new TextStyle({
      fontFamily: "Press Start 2P",
      fontSize: 10,
      fill: 0x00ff00,
      wordWrap: true,
      wordWrapWidth: 200,
      align: "left",
    });

    const textObject = new Text({
      text: line || " ",
      style: textStyle,
    });
    textObject.alpha = 0;

    // Позиционируем текст
    textObject.y = this.radioTextLines.length * 14;
    this.radioTextContainer.addChild(textObject);
    this.radioTextLines.push(textObject);

    // Анимация появления
    await this.fadeInText(textObject);
  }

  /**
   * Воспроизведение диалога
   */
  private async playDialogue(): Promise<void> {
    this.isDialogActive = true;
    this.dialogBox.visible = true;

    for (const line of this.dialogues) {
      if (this.isTransitioning) break;

      await this.showDialogueLine(line);
    }

    this.isDialogActive = false;
    this.dialogBox.visible = false;

    this.eventBus.emit(GameEvent.DIALOG_END, { dialogueId: "rooftop_intro" });
  }

  /**
   * Показ одной строки диалога
   */
  private async showDialogueLine(line: DialogueLine): Promise<void> {
    return new Promise((resolve) => {
      // Подсветка говорящего персонажа
      this.highlightSpeaker(line.speaker);

      this.dialogBox.show(line.speaker, line.text, line.emotion, () => {
        if (line.pauseAfter) {
          setTimeout(resolve, line.pauseAfter);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Подсветка говорящего персонажа
   */
  private highlightSpeaker(speaker: string): void {
    // Сбрасываем подсветку
    this.characterN.alpha = 0.7;
    this.characterM.alpha = 0.7;

    // Подсвечиваем говорящего
    if (speaker === "Н") {
      this.characterN.alpha = 1;
      this.characterN.scale.set(0.85);
    } else if (speaker === "М") {
      this.characterM.alpha = 1;
      this.characterM.scale.set(0.85);
    }

    // Возвращаем через небольшую задержку
    setTimeout(() => {
      this.characterN.scale.set(0.8);
      this.characterM.scale.set(0.8);
    }, 300);
  }

  /**
   * Показ подсказки управления
   */
  private async showControlHint(): Promise<void> {
    const hint = this.getChildByLabel("controlHint") as Container;
    if (!hint) return;

    const duration = 1000;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        hint.alpha = progress;

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
   * Переход к следующей сцене
   */
  private async transitionToNextScene(): Promise<void> {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    // Затемнение
    await this.fadeOut(1500);

    // Эмитим событие смены сцены
    this.eventBus.emit(GameEvent.SCENE_CHANGE, {
      from: "rooftop",
      to: "platform",
    });

    // Переключаем сцену
    this.sceneManager.switchTo(
      "platform",
      {},
      {
        type: "fade",
        duration: 1500,
      },
    );
  }

  /**
   * Пропуск диалога
   */
  private onSkipDialog(): void {
    if (this.isTransitioning) return;

    if (this.isRadioPlaying) {
      // Пропускаем радио
      this.skipRadioBroadcast();
    } else if (this.isDialogActive) {
      // Пропускаем текущую реплику
      this.dialogBox.skip();
    }
  }

  /**
   * Пропуск радио трансляции
   */
  private skipRadioBroadcast(): void {
    this.isRadioPlaying = false;
    this.audioManager.stop("radio-static");

    // Показываем весь текст сразу
    this.radioTextLines.forEach((line, index) => {
      line.text = this.radioBroadcastLines[index] || "";
      line.alpha = 1;
    });

    // Быстро завершаем радио
    setTimeout(() => {
      this.fadeOutRadioText();
    }, 1000);
  }

  /**
   * Обработчик Escape
   */
  private onEscape(): void {
    if (this.isTransitioning) return;

    // Пропускаем всю сцену
    this.isRadioPlaying = false;
    this.isDialogActive = false;
    this.audioManager.stopAll();
    this.transitionToNextScene();
  }

  /**
   * Обработчик окончания диалога
   */
  private onDialogEnd(): void {
    // Дополнительная логика при необходимости
  }

  /**
   * Обработчик следующей реплики
   */
  private onDialogNext(): void {
    // Дополнительная логика при необходимости
  }

  /**
   * Анимация появления радио текста
   */
  private async fadeInRadioText(): Promise<void> {
    this.radioTextContainer.alpha = 0;
    const startTime = Date.now();
    const duration = 500;

    return new Promise((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        this.radioTextContainer.alpha = progress;

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
   * Анимация исчезновения радио текста
   */
  private async fadeOutRadioText(): Promise<void> {
    const startTime = Date.now();
    const duration = 500;

    return new Promise((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        this.radioTextContainer.alpha = 1 - progress;

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
   * Анимация появления текста
   */
  private async fadeInText(text: Text): Promise<void> {
    const startTime = Date.now();
    const duration = 300;

    return new Promise((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        text.alpha = progress;

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
   * Обновление эффектов ветра
   */
  private updateWind(delta: number): void {
    this.windIntensity = 0.3 + Math.sin(this.time * 0.5) * 0.2;

    // Анимация линий ветра
    this.windLines.forEach((line) => {
      if (Math.random() < 0.02) {
        line.clear();
        const y = Math.random() * this.app.screen.height;
        const length = Math.random() * 100 + 50;

        line.moveTo(-50, y);
        line.lineTo(-50 + length, y + (Math.random() - 0.5) * 30);
        line.stroke({ width: 1, color: 0xffffff, alpha: 0.1 });
        line.alpha = 0.3;
      }

      line.alpha -= delta * 0.01;
      line.x += delta * 2;

      if (line.x > this.app.screen.width + 50) {
        line.x = -100;
        line.alpha = 0;
      }
    });
  }

  /**
   * Обновление дыма
   */
  private updateSmoke(delta: number): void {
    this.smokeParticles.forEach((particle) => {
      particle.y -= delta * this.windIntensity;
      particle.x += Math.sin(this.time) * delta * 0.3;
      particle.alpha = 0.1 + Math.sin(this.time * 0.5) * 0.05;

      // Респавн
      if (particle.y < -50) {
        particle.y = this.app.screen.height + 50;
        particle.x = Math.random() * this.app.screen.width;
      }
    });
  }

  /**
   * Обновление помех радио
   */
  private updateRadioStatic(): void {
    this.radioStaticEffect.clear();

    for (let i = 0; i < 5; i++) {
      const x = -50 + Math.random() * 100;
      const y = -20 + Math.random() * 40;
      const width = Math.random() * 30 + 10;
      const height = Math.random() * 2 + 1;

      this.radioStaticEffect.rect(x, y, width, height);
      this.radioStaticEffect.fill({
        color: 0x00ff00,
        alpha: Math.random() * 0.3,
      });
    }
  }

  /**
   * Обновление персонажей
   */
  private updateCharacters(): void {
    // Лёгкое дыхание
    const breath = Math.sin(this.time * 0.5) * 0.02;
    this.characterN.scale.y = 0.8 + breath;
    this.characterM.scale.y = 0.8 + breath * 0.7;
  }

  /**
   * Обновление красного неба (предвещает опасность)
   */
  private updateRedSky(): void {
    // Постепенно усиливаем красный оттенок
    if (this.time > 10) {
      const intensity = Math.min((this.time - 10) * 0.01, 0.3);
      this.redSkyOverlay.clear();
      this.redSkyOverlay.rect(
        0,
        0,
        this.app.screen.width,
        this.app.screen.height * 0.4,
      );
      this.redSkyOverlay.fill({ color: 0xff0000, alpha: intensity });
      this.redSkyOverlay.alpha = intensity;
    }
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
    this.audioManager.stopAll();
    this.smokeParticles.length = 0;
    this.windLines.length = 0;
    this.radioTextLines.length = 0;

    await super.cleanup();
  }
}
