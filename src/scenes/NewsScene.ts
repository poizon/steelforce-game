import { Container, Sprite, Text, TextStyle, Graphics } from "pixi.js";
import { BaseScene } from "./BaseScene";
import { GameEvent } from "../core/EventBus";
import type { SceneName } from "../core/SceneManager";

interface NewsArticle {
  text: string;
  delay?: number; // Задержка перед показом
  duration?: number; // Длительность показа
  style?: Partial<TextStyle>;
}

export class NewsScene extends BaseScene {
  // Элементы сцены
  private background!: Sprite;
  private newspaperContainer!: Container;
  private newsTextContainer!: Container;
  private headerText!: Text;
  private dateText!: Text;
  private dividerLines: Graphics[] = [];

  // Эффекты
  private scanlines!: Graphics;
  private noiseOverlay!: Graphics;
  private vignette!: Graphics;
  private glitchEffect!: Graphics;

  // Состояния
  private currentArticleIndex: number = 0;
  private isTyping: boolean = false;
  private isSkipping: boolean = false;
  private isTransitioning: boolean = false;
  private textAnimationTimer: number = 0;
  private charactersToShow: number = 0;
  private displayedText: string = "";

  // Конфигурация
  private readonly typingSpeed: number = 30; // мс на символ
  private readonly articlePause: number = 2000; // пауза между новостями
  private readonly textStartY: number = 150;
  private readonly textLineHeight: number = 28;
  private readonly maxLineWidth: number = 800;

  // Новостные статьи
  private newsArticles: NewsArticle[] = [
    {
      text: 'ЗАВОД "STEELFORCE" ВЫШЕЛ В ПЕРВЫЕ РЯДЫ СРЕДИ СВОИХ КОНКУРЕНТОВ ПО ПАРАМЕТРАМ ПРОИЗВОДСТВА...',
      style: {
        fontSize: 24,
        fill: 0xff6600,
        fontWeight: "bold",
      },
      duration: 3000,
    },
    {
      text: "...число рабочих в филиалах завода превысило отметку в 10 тысяч человек..",
      style: {
        fontSize: 22,
        fill: 0xcccccc,
      },
      duration: 2500,
    },
    {
      text: "......",
      delay: 1000,
      duration: 1000,
    },
    {
      text: "16 НОЯБРЯ 2077 ГОДА НА ЗАВОДЕ ЗАПЛАНИРОВАН ЭКСПЕРИМЕНТ, В ХОДЕ КОТОРОГО БУДЕТ ПРОВЕРЕНА НОВАЯ СЫВОРОТКА, УСКОРЯЮЩАЯ ПРОЦЕСС ОБРАБОТКИ МЕТАЛЛА И ПРОДЛЕВАЮЩАЯ ЖИЗНЬ ИЗГОТОВЛЕНИЯМ ИЗ НЕГО.",
      style: {
        fontSize: 20,
        fill: 0xffffff,
        lineHeight: 32,
      },
      duration: 5000,
    },
    {
      text: 'ЭКСПЕРИМЕНТ ИМЕЕТ ОБЩЕДОСТУПНЫЙ ХАРАКТЕР, И КАЖДЫЙ МОЖЕТ ПРИЙТИ И УВИДЕТЬ СВОИМИ ГЛАЗАМИ ПЕРСПЕКТИВЫ БУДУЩЕГО, КОТОРЫЕ ДАЁТ ЗАВОД "STEELFORCE"!!',
      style: {
        fontSize: 22,
        fill: 0xff6600,
        fontStyle: "italic",
        fontWeight: "bold",
      },
      duration: 4000,
    },
    {
      text: "......",
      delay: 2000,
      duration: 2000,
    },
  ];

  protected getSceneName(): SceneName {
    return "news";
  }

  protected async preload(): Promise<void> {
    // Ресурсы загружены централизованно
  }

  protected setup(): void {
    this.createBackground();
    this.createNewspaperContainer();
    this.createHeader();
    this.createDate();
    this.createDividers();
    this.createNewsTextContainer();
    this.createEffects();

    // Начальное состояние
    this.alpha = 0;
    this.newspaperContainer.alpha = 0;
  }

  protected bindEvents(): void {
    // Пропуск текста по клику или пробелу
    this.eventMode = "static";
    this.on("pointerdown", this.onSkipOrNext.bind(this));

    this.inputManager.onKeyDown(" ", (event) => {
      event?.preventDefault();
      this.onSkipOrNext();
    });

    this.inputManager.onKeyDown("Enter", (event) => {
      event?.preventDefault();
      this.onSkipOrNext();
    });

    this.inputManager.onKeyDown("Escape", this.onEscape.bind(this));

    // Обработка окончания диалога
    this.eventBus.on(GameEvent.DIALOG_END, this.onNewsComplete.bind(this));
  }

  protected async onEnter(): Promise<void> {
    // Останавливаем музыку меню
    this.audioManager.stopCategory("music", 1000);

    // Запускаем эмбиент
    this.audioManager.playAmbient("factory-ambient", {
      volume: 0.2,
      fadeIn: 2000,
    });

    // Анимация появления
    await this.fadeIn(1000);
    await this.animateNewspaperIn();

    // Начинаем показ новостей
    await this.startNewsSequence();
  }

  public update(delta: number): void {
    // Анимация печати текста
    if (this.isTyping) {
      this.textAnimationTimer += delta;

      const charsToShow = Math.floor(
        this.textAnimationTimer / (this.typingSpeed / 16.67),
      );

      if (charsToShow > this.charactersToShow) {
        const article = this.newsArticles[this.currentArticleIndex];
        if (article) {
          const fullText = article.text;
          this.charactersToShow = Math.min(
            this.charactersToShow + 1,
            fullText.length,
          );
          this.updateDisplayedText(
            fullText.substring(0, this.charactersToShow),
          );

          if (this.charactersToShow >= fullText.length) {
            this.isTyping = false;
            this.onArticleComplete();
          }
        }
      }
    }

    // Анимация эффектов
    this.updateEffects(delta);
  }

  /**
   * Создание фона
   */
  private createBackground(): void {
    this.background = new Sprite(
      this.assetLoader.getTexture("news-background"),
    );

    this.background.width = this.app.screen.width;
    this.background.height = this.app.screen.height;
    this.background.alpha = 0.3;

    this.addChild(this.background);
  }

  /**
   * Создание контейнера газеты
   */
  private createNewspaperContainer(): void {
    this.newspaperContainer = new Container();

    // Фон газеты
    const paperBg = new Graphics();
    paperBg.roundRect(0, 0, 1000, 600, 5);
    paperBg.fill({ color: 0x1a1a1a, alpha: 0.9 });
    paperBg.stroke({ width: 2, color: 0x444444 });
    this.newspaperContainer.addChild(paperBg);

    // Заголовок газеты
    const newspaperTitle = new Text({
      text: "STEELFORCE TIMES",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 16,
        fill: 0x888888,
        letterSpacing: 4,
      }),
    });
    newspaperTitle.anchor.set(0.5, 0);
    newspaperTitle.x = 500;
    newspaperTitle.y = 20;
    this.newspaperContainer.addChild(newspaperTitle);

    // Подзаголовок
    const editionText = new Text({
      text: "СПЕЦИАЛЬНЫЙ ВЫПУСК • 15 НОЯБРЯ 2077",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 10,
        fill: 0x666666,
        letterSpacing: 2,
      }),
    });
    editionText.anchor.set(0.5, 0);
    editionText.x = 500;
    editionText.y = 42;
    this.newspaperContainer.addChild(editionText);

    // Центрируем контейнер
    this.newspaperContainer.x = (this.app.screen.width - 1000) / 2;
    this.newspaperContainer.y = (this.app.screen.height - 600) / 2;

    this.addChild(this.newspaperContainer);
  }

  /**
   * Создание заголовка новости
   */
  private createHeader(): void {
    this.headerText = new Text({
      text: "ПРОРЫВ В МЕТАЛЛУРГИИ",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 28,
        fill: 0xff4444,
        fontWeight: "bold",
        letterSpacing: 3,
        wordWrap: true,
        wordWrapWidth: 900,
        align: "center",
      }),
    });

    this.headerText.anchor.set(0.5, 0);
    this.headerText.x = 500;
    this.headerText.y = 70;

    this.newspaperContainer.addChild(this.headerText);
  }

  /**
   * Создание даты
   */
  private createDate(): void {
    this.dateText = new Text({
      text: "15.11.2077",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 12,
        fill: 0x888888,
        letterSpacing: 2,
      }),
    });

    this.dateText.anchor.set(1, 0);
    this.dateText.x = 950;
    this.dateText.y = 110;

    this.newspaperContainer.addChild(this.dateText);
  }

  /**
   * Создание разделительных линий
   */
  private createDividers(): void {
    for (let i = 0; i < 2; i++) {
      const line = new Graphics();
      line.moveTo(50, 130 + i * 20);
      line.lineTo(950, 130 + i * 20);
      line.stroke({ width: 1, color: 0x444444 });

      this.dividerLines.push(line);
      this.newspaperContainer.addChild(line);
    }
  }

  /**
   * Создание контейнера для текста новостей
   */
  private createNewsTextContainer(): void {
    this.newsTextContainer = new Container();
    this.newsTextContainer.x = 100;
    this.newsTextContainer.y = this.textStartY;

    this.newspaperContainer.addChild(this.newsTextContainer);
  }

  /**
   * Создание визуальных эффектов
   */
  private createEffects(): void {
    // Сканлайны
    this.scanlines = this.createScanlines();
    this.addChild(this.scanlines);

    // Шум
    this.noiseOverlay = this.createNoiseOverlay();
    this.addChild(this.noiseOverlay);

    // Виньетка
    this.vignette = this.createVignette();
    this.addChild(this.vignette);

    // Эффект глитча
    this.glitchEffect = new Graphics();
    this.glitchEffect.alpha = 0;
    this.addChild(this.glitchEffect);
  }

  /**
   * Создание эффекта сканлайнов
   */
  private createScanlines(): Graphics {
    const graphics = new Graphics();
    const { width, height } = this.app.screen;

    for (let y = 0; y < height; y += 4) {
      graphics.rect(0, y, width, 2);
      graphics.fill({ color: 0x000000, alpha: 0.1 });
    }

    return graphics;
  }

  /**
   * Создание эффекта шума
   */
  private createNoiseOverlay(): Graphics {
    const graphics = new Graphics();
    const { width, height } = this.app.screen;

    for (let i = 0; i < 100; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = Math.random() * 3;

      graphics.rect(x, y, size, size);
      graphics.fill({ color: 0xffffff, alpha: Math.random() * 0.05 });
    }

    return graphics;
  }

  /**
   * Создание виньетки
   */
  private createVignette(): Graphics {
    const graphics = new Graphics();
    const { width, height } = this.app.screen;

    graphics.rect(0, 0, width, height);
    graphics.fill({ color: 0x000000, alpha: 0.4 });

    // Светлая область в центре
    graphics.rect(100, 100, width - 200, height - 200);
    graphics.fill({ color: 0x000000, alpha: 0 });

    return graphics;
  }

  /**
   * Анимация появления газеты
   */
  private async animateNewspaperIn(): Promise<void> {
    const startScale = 1.5;
    const startAlpha = 0;
    const duration = 1500;
    const startTime = Date.now();

    this.newspaperContainer.scale.set(startScale);
    this.newspaperContainer.alpha = startAlpha;

    // Звук разворачивающейся газеты
    this.audioManager.playSFX("newspaper-rustle", { volume: 0.3 });

    return new Promise((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);

        this.newspaperContainer.scale.set(
          startScale + (1 - startScale) * eased,
        );
        this.newspaperContainer.alpha = startAlpha + (1 - startAlpha) * eased;

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
   * Запуск последовательности новостей
   */
  private async startNewsSequence(): Promise<void> {
    for (let i = 0; i < this.newsArticles.length; i++) {
      this.currentArticleIndex = i;
      const article = this.newsArticles[i];

      // Задержка перед показом
      if (article.delay) {
        await this.delay(article.delay);
      }

      // Показываем статью
      await this.showArticle(article);

      // Пауза между статьями
      if (i < this.newsArticles.length - 1) {
        await this.delay(this.articlePause);
      }
    }

    // Все новости показаны
    await this.onAllNewsComplete();
  }

  /**
   * Показ отдельной статьи
   */
  private async showArticle(article: NewsArticle): Promise<void> {
    return new Promise((resolve) => {
      // Очищаем контейнер текста
      this.newsTextContainer.removeChildren();

      // Создаём текст
      const textStyle = new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 20,
        fill: 0xffffff,
        wordWrap: true,
        wordWrapWidth: this.maxLineWidth,
        lineHeight: this.textLineHeight,
        letterSpacing: 1,
        ...article.style,
      });

      const textObject = new Text({
        text: "",
        style: textStyle,
      });

      this.newsTextContainer.addChild(textObject);

      // Начинаем анимацию печати
      this.isTyping = true;
      this.charactersToShow = 0;
      this.textAnimationTimer = 0;
      this.displayedText = "";

      // Звук печати
      this.startTypingSound();

      // Когда печать завершена
      const onComplete = () => {
        this.stopTypingSound();
        if (article.duration) {
          setTimeout(resolve, article.duration);
        } else {
          resolve();
        }
      };

      // Переопределяем обработчик завершения статьи
      this.currentOnArticleComplete = onComplete;
    });
  }

  private currentOnArticleComplete: (() => void) | null = null;

  /**
   * Обновление отображаемого текста
   */
  private updateDisplayedText(text: string): void {
    if (this.newsTextContainer.children.length > 0) {
      const textObject = this.newsTextContainer.children[0] as Text;
      textObject.text = text;
    }
  }

  /**
   * Обработчик завершения печати статьи
   */
  private onArticleComplete(): void {
    if (this.currentOnArticleComplete) {
      const callback = this.currentOnArticleComplete;
      this.currentOnArticleComplete = null;
      callback();
    }
  }

  /**
   * Запуск звука печати
   */
  private startTypingSound(): void {
    // Можно использовать звук печатной машинки
    this.audioManager.playAmbient("typing-sound", {
      volume: 0.1,
      fadeIn: 100,
    });
  }

  /**
   * Остановка звука печати
   */
  private stopTypingSound(): void {
    this.audioManager.stopCategory("ambient", 200);
  }

  /**
   * Пропуск или переход к следующей статье
   */
  private onSkipOrNext(): void {
    if (this.isTransitioning) return;

    if (this.isTyping) {
      // Пропускаем анимацию печати
      this.isTyping = false;
      const article = this.newsArticles[this.currentArticleIndex];
      if (article) {
        this.updateDisplayedText(article.text);
        this.onArticleComplete();
      }
      this.stopTypingSound();
      this.audioManager.playSFX("click-sound", { volume: 0.3 });
    } else {
      // Переходим к следующей статье (если есть)
      this.audioManager.playSFX("click-sound", { volume: 0.3 });
      // Автоматически перейдёт в startNewsSequence
    }
  }

  /**
   * Обработчик завершения всех новостей
   */
  private async onAllNewsComplete(): Promise<void> {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    // Эффект глитча
    await this.triggerGlitchEffect();

    // Затемнение
    await this.fadeOut(1500);

    // Переход к следующей сцене
    this.eventBus.emit(GameEvent.SCENE_CHANGE, {
      from: "news",
      to: "rooftop",
    });

    this.sceneManager.switchTo(
      "rooftop",
      {},
      {
        type: "fade",
        duration: 1000,
      },
    );
  }

  /**
   * Обработчик события окончания новостей
   */
  private onNewsComplete(): void {
    // Дополнительная логика при необходимости
  }

  /**
   * Обработчик Escape
   */
  private onEscape(): void {
    if (this.isTransitioning) return;

    // Пропускаем все новости
    this.isTyping = false;
    this.stopTypingSound();
    this.onAllNewsComplete();
  }

  /**
   * Эффект глитча
   */
  private async triggerGlitchEffect(): Promise<void> {
    this.audioManager.playSFX("glitch-sound", { volume: 0.5 });

    // Создаём несколько случайных полос
    for (let i = 0; i < 5; i++) {
      this.drawGlitchLine();
      await this.delay(50);
    }

    // Заполняем экран красным на мгновение
    this.glitchEffect.clear();
    this.glitchEffect.rect(0, 0, this.app.screen.width, this.app.screen.height);
    this.glitchEffect.fill({ color: 0xff0000, alpha: 0.3 });
    this.glitchEffect.alpha = 1;

    await this.delay(100);

    this.glitchEffect.alpha = 0;
    this.glitchEffect.clear();
  }

  /**
   * Отрисовка линии глитча
   */
  private drawGlitchLine(): void {
    this.glitchEffect.clear();

    const y = Math.random() * this.app.screen.height;
    const height = Math.random() * 20 + 5;
    const offset = (Math.random() - 0.5) * 100;

    this.glitchEffect.rect(0, y, this.app.screen.width, height);
    this.glitchEffect.fill({ color: 0x00ff00, alpha: 0.3 });

    // Смещённая копия
    this.glitchEffect.rect(offset, y - 2, this.app.screen.width, height);
    this.glitchEffect.fill({ color: 0xff00ff, alpha: 0.2 });

    this.glitchEffect.alpha = 0.5 + Math.random() * 0.5;
  }

  /**
   * Обновление визуальных эффектов
   */
  private updateEffects(delta: number): void {
    // Обновление шума
    if (Math.random() < 0.1) {
      this.noiseOverlay.clear();
      const { width, height } = this.app.screen;

      for (let i = 0; i < 100; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const size = Math.random() * 3;

        this.noiseOverlay.rect(x, y, size, size);
        this.noiseOverlay.fill({
          color: 0xffffff,
          alpha: Math.random() * 0.05,
        });
      }
    }

    // Мерцание заголовка
    if (this.headerText) {
      this.headerText.alpha = 0.8 + Math.sin(Date.now() * 0.003) * 0.2;
    }
  }

  /**
   * Очистка сцены
   */
  public async cleanup(): Promise<void> {
    this.stopTypingSound();
    this.audioManager.stopCategory("ambient", 500);

    await super.cleanup();
  }
}
