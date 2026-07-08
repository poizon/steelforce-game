import { Container, Sprite, Text, TextStyle, Graphics } from "pixi.js";
import { BaseScene } from "./BaseScene";
import type { SceneName } from "../core/SceneManager";

interface NewsArticle {
  text: string;
  delay?: number;
  duration?: number;
  style?: Partial<TextStyle>;
}

export class NewsScene extends BaseScene {
  private background!: Sprite;
  private newspaperContainer!: Container;
  private newsTextContainer!: Container;
  private headerText!: Text;
  private dateText!: Text;

  private scanlines!: Graphics;
  private noiseOverlay!: Graphics;
  private vignette!: Graphics;
  private glitchEffect!: Graphics;

  private isTyping: boolean = false;
  private isTransitioning: boolean = false;
  private currentArticleResolve: (() => void) | null = null;

  private readonly typingSpeed: number = 40;
  private readonly articlePause: number = 1500;
  private readonly textStartY: number = 180;
  private readonly textLineHeight: number = 32;
  private readonly maxLineWidth: number = 800;

  private newsArticles: NewsArticle[] = [
    {
      text: 'ЗАВОД "STEELFORCE" ВЫШЕЛ В ПЕРВЫЕ РЯДЫ СРЕДИ СВОИХ КОНКУРЕНТОВ ПО ПАРАМЕТРАМ ПРОИЗВОДСТВА...',
      style: { fontSize: 22, fill: 0xff6600, fontWeight: "bold" },
      duration: 2000,
    },
    {
      text: "...число рабочих в филиалах завода превысило отметку в 10 тысяч человек..",
      style: { fontSize: 20, fill: 0xcccccc },
      duration: 1500,
    },
    {
      text: "......",
      delay: 500,
      duration: 1000,
    },
    {
      text: "16 НОЯБРЯ 2077 ГОДА НА ЗАВОДЕ ЗАПЛАНИРОВАН ЭКСПЕРИМЕНТ, В ХОДЕ КОТОРОГО БУДЕТ ПРОВЕРЕНА НОВАЯ СЫВОРОТКА, УСКОРЯЮЩАЯ ПРОЦЕСС ОБРАБОТКИ МЕТАЛЛА И ПРОДЛЕВАЮЩАЯ ЖИЗНЬ ИЗДЕЛИЯМ ИЗ НЕГО.",
      style: { fontSize: 18, fill: 0xffffff, lineHeight: 34 },
      duration: 6000,
    },
    {
      text: 'ЭКСПЕРИМЕНТ ИМЕЕТ ОБЩЕДОСТУПНЫЙ ХАРАКТЕР, И КАЖДЫЙ МОЖЕТ ПРИЙТИ И УВИДЕТЬ СВОИМИ ГЛАЗАМИ ПЕРСПЕКТИВЫ БУДУЩЕГО, КОТОРЫЕ ДАЁТ ЗАВОД "STEELFORCE"!!!',
      style: {
        fontSize: 20,
        fill: 0xff6600,
        fontStyle: "italic",
        fontWeight: "bold",
      },
      duration: 3000,
    },
    {
      text: "......",
      delay: 500,
      duration: 1000,
    },
  ];

  private currentFullText: string = "";
  private typingStartTime: number = 0;
  private typingCharIndex: number = 0;

  protected getSceneName(): SceneName {
    return "news";
  }

  protected async preload(): Promise<void> {}

  protected setup(): void {
    this.createBackground();
    this.createNewspaperContainer();
    this.createHeader();
    this.createDate();
    this.createDividers();
    this.createNewsTextContainer();
    this.createEffects();
    this.alpha = 0;
    this.newspaperContainer.alpha = 0;
  }

  protected bindEvents(): void {
    this.eventMode = "static";
    this.on("pointerdown", () => this.onSkipOrNext());
    this.inputManager.onKeyDown("Space", (event) => {
      event?.preventDefault();
      this.onSkipOrNext();
    });
    this.inputManager.onKeyDown("Enter", (event) => {
      event?.preventDefault();
      this.onSkipOrNext();
    });
    this.inputManager.onKeyDown("Escape", () => this.onSkipAll());
  }

  protected async onEnter(): Promise<void> {
    this.audioManager.stopCategory("music");
    this.audioManager.playAmbient("factory-ambient", {
      volume: 0.15,
      fadeIn: 2000,
    });
    await this.fadeIn(1000);
    await this.animateNewspaperIn();
    await this.delay(500);
    await this.startNewsSequence();
  }

  public update(): void {
    this.updateEffects();
  }

  private createBackground(): void {
    this.background = new Sprite(
      this.assetLoader.getTexture("news-background"),
    );
    this.background.width = this.app.screen.width;
    this.background.height = this.app.screen.height;
    this.background.alpha = 0.3;
    this.addChild(this.background);
  }

  private createNewspaperContainer(): void {
    this.newspaperContainer = new Container();
    const paperBg = new Graphics();
    paperBg.roundRect(0, 0, 1000, 600, 5);
    paperBg.fill({ color: 0x1a1a1a, alpha: 0.95 });
    paperBg.stroke({ width: 2, color: 0x444444 });
    this.newspaperContainer.addChild(paperBg);

    const newspaperTitle = new Text({
      text: "STEELFORCE TIMES",
      style: new TextStyle({
        fontFamily: "Press Start 2P, monospace",
        fontSize: 16,
        fill: 0x888888,
        letterSpacing: 4,
      }),
    });
    newspaperTitle.anchor.set(0.5, 0);
    newspaperTitle.x = 500;
    newspaperTitle.y = 20;
    this.newspaperContainer.addChild(newspaperTitle);

    const editionText = new Text({
      text: "СПЕЦИАЛЬНЫЙ ВЫПУСК • 15 НОЯБРЯ 2077",
      style: new TextStyle({
        fontFamily: "Press Start 2P, monospace",
        fontSize: 10,
        fill: 0x666666,
        letterSpacing: 2,
      }),
    });
    editionText.anchor.set(0.5, 0);
    editionText.x = 500;
    editionText.y = 42;
    this.newspaperContainer.addChild(editionText);

    this.newspaperContainer.x = (this.app.screen.width - 1000) / 2;
    this.newspaperContainer.y = (this.app.screen.height - 600) / 2;
    this.addChild(this.newspaperContainer);
  }

  private createHeader(): void {
    this.headerText = new Text({
      text: "ПРОРЫВ В МЕТАЛЛУРГИИ",
      style: new TextStyle({
        fontFamily: "Press Start 2P, monospace",
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

  private createDate(): void {
    this.dateText = new Text({
      text: "15.11.2077",
      style: new TextStyle({
        fontFamily: "Press Start 2P, monospace",
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

  private createDividers(): void {
    for (let i = 0; i < 2; i++) {
      const line = new Graphics();
      line.moveTo(50, 130 + i * 20);
      line.lineTo(950, 130 + i * 20);
      line.stroke({ width: 1, color: 0x444444 });
      this.newspaperContainer.addChild(line);
    }
  }

  private createNewsTextContainer(): void {
    this.newsTextContainer = new Container();
    this.newsTextContainer.x = 80;
    this.newsTextContainer.y = this.textStartY;
    this.newspaperContainer.addChild(this.newsTextContainer);
  }

  private createEffects(): void {
    this.scanlines = this.createScanlines();
    this.addChild(this.scanlines);
    this.noiseOverlay = this.createNoiseOverlay();
    this.addChild(this.noiseOverlay);
    this.vignette = this.createVignette();
    this.addChild(this.vignette);
    this.glitchEffect = new Graphics();
    this.glitchEffect.alpha = 0;
    this.addChild(this.glitchEffect);
  }

  private createScanlines(): Graphics {
    const graphics = new Graphics();
    const { width, height } = this.app.screen;
    for (let y = 0; y < height; y += 4) {
      graphics.rect(0, y, width, 2);
      graphics.fill({ color: 0x000000, alpha: 0.08 });
    }
    return graphics;
  }

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

  private createVignette(): Graphics {
    const graphics = new Graphics();
    const { width, height } = this.app.screen;
    graphics.rect(0, 0, width, height);
    graphics.fill({ color: 0x000000, alpha: 0.4 });
    graphics.rect(100, 100, width - 200, height - 200);
    graphics.fill({ color: 0x000000, alpha: 0 });
    return graphics;
  }

  private async animateNewspaperIn(): Promise<void> {
    const duration = 1500;
    const startTime = Date.now();
    this.newspaperContainer.scale.set(1.2);
    this.newspaperContainer.alpha = 0;

    return new Promise((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        this.newspaperContainer.scale.set(1.2 - 0.2 * eased);
        this.newspaperContainer.alpha = eased;
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      animate();
    });
  }

  private async startNewsSequence(): Promise<void> {
    for (let i = 0; i < this.newsArticles.length; i++) {
      if (this.isTransitioning) break;
      const article = this.newsArticles[i];
      if (article.delay) {
        await this.delay(article.delay);
      }
      await this.showArticle(article);
      if (i < this.newsArticles.length - 1 && !this.isTransitioning) {
        await this.delay(this.articlePause);
      }
    }
    if (!this.isTransitioning) {
      await this.onAllNewsComplete();
    }
  }

  private async showArticle(article: NewsArticle): Promise<void> {
    return new Promise((resolve) => {
      this.newsTextContainer.removeChildren();
      const textStyle = new TextStyle({
        fontFamily: "Press Start 2P, monospace",
        fontSize: 20,
        fill: 0xffffff,
        wordWrap: true,
        wordWrapWidth: this.maxLineWidth,
        lineHeight: this.textLineHeight,
        letterSpacing: 1,
        ...article.style,
      });
      const textObject = new Text({ text: "", style: textStyle });
      textObject.alpha = 0;
      this.newsTextContainer.addChild(textObject);

      // Плавное появление
      const fadeInDuration = 300;
      const fadeStartTime = Date.now();
      const fadeIn = () => {
        const elapsed = Date.now() - fadeStartTime;
        const progress = Math.min(elapsed / fadeInDuration, 1);
        textObject.alpha = progress;
        if (progress < 1) {
          requestAnimationFrame(fadeIn);
        } else {
          this.startTypingArticle(article.text, resolve, article.duration);
        }
      };
      fadeIn();
    });
  }

  private startTypingArticle(
    text: string,
    resolve: () => void,
    duration?: number,
  ): void {
    this.currentFullText = text;
    this.typingStartTime = Date.now();
    this.typingCharIndex = 0;
    this.isTyping = true;

    this.currentArticleResolve = () => {
      if (duration) {
        setTimeout(resolve, duration);
      } else {
        resolve();
      }
    };

    // Запускаем автономную анимацию
    this.animateTyping();
  }

  private animateTyping(): void {
    if (!this.isTyping || !this.currentFullText) return;

    const elapsed = Date.now() - this.typingStartTime;
    const totalChars = this.currentFullText.length;
    const targetChars = Math.floor(elapsed / this.typingSpeed);

    if (targetChars > this.typingCharIndex) {
      this.typingCharIndex = Math.min(targetChars, totalChars);
      let displayText = this.currentFullText.substring(0, this.typingCharIndex);

      if (this.typingCharIndex < totalChars) {
        displayText += Math.floor(Date.now() / 400) % 2 === 0 ? "▌" : " ";
      }

      this.updateDisplayedText(displayText);

      if (this.typingCharIndex >= totalChars) {
        this.isTyping = false;
        this.updateDisplayedText(this.currentFullText);
        this.onArticleTypingComplete();
        return;
      }
    }

    requestAnimationFrame(() => this.animateTyping());
  }

  private updateDisplayedText(text: string): void {
    if (this.newsTextContainer.children.length > 0) {
      const textObject = this.newsTextContainer.children[0] as Text;
      textObject.text = text;
    }
  }

  private onArticleTypingComplete(): void {
    if (this.currentArticleResolve) {
      const callback = this.currentArticleResolve;
      this.currentArticleResolve = null;
      callback();
    }
  }

  private onSkipOrNext(): void {
    if (this.isTransitioning) return;
    if (this.isTyping) {
      this.isTyping = false;
      this.updateDisplayedText(this.currentFullText);
      this.onArticleTypingComplete();
    }
  }

  private onSkipAll(): void {
    if (this.isTransitioning) return;
    this.isTyping = false;
    this.onAllNewsComplete();
  }

  private async onAllNewsComplete(): Promise<void> {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    await this.triggerGlitchEffect();
    await this.fadeOut(1500);
    this.sceneManager.switchTo("rooftop", {}, { type: "fade", duration: 1000 });
  }

  private async triggerGlitchEffect(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      this.drawGlitchLine();
      await this.delay(50);
    }
    this.glitchEffect.clear();
    this.glitchEffect.rect(0, 0, this.app.screen.width, this.app.screen.height);
    this.glitchEffect.fill({ color: 0xff0000, alpha: 0.3 });
    this.glitchEffect.alpha = 1;
    await this.delay(100);
    this.glitchEffect.alpha = 0;
    this.glitchEffect.clear();
  }

  private drawGlitchLine(): void {
    this.glitchEffect.clear();
    const y = Math.random() * this.app.screen.height;
    const height = Math.random() * 20 + 5;
    const offset = (Math.random() - 0.5) * 100;
    this.glitchEffect.rect(0, y, this.app.screen.width, height);
    this.glitchEffect.fill({ color: 0x00ff00, alpha: 0.3 });
    this.glitchEffect.rect(offset, y - 2, this.app.screen.width, height);
    this.glitchEffect.fill({ color: 0xff00ff, alpha: 0.2 });
    this.glitchEffect.alpha = 0.5 + Math.random() * 0.5;
  }

  private updateEffects(): void {
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
    if (this.headerText) {
      this.headerText.alpha = 0.8 + Math.sin(Date.now() * 0.003) * 0.2;
    }
  }

  public async cleanup(): Promise<void> {
    this.audioManager.stopCategory("ambient");
    await super.cleanup();
  }
}
