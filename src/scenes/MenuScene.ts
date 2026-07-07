import { Container, Sprite, Text, TextStyle, Graphics, BlurFilter } from 'pixi.js';
import { BaseScene } from './BaseScene';
import { GameEvent } from '../core/EventBus';
import type { SceneName, SceneTransitionOptions } from '../core/SceneManager';

export class MenuScene extends BaseScene {
  // Элементы сцены
  private background!: Sprite;
  private logo!: Sprite;
  private titleText!: Text;
  private subtitleText!: Text;

  // Кнопки
  private buttons: Container[] = [];
  private selectedButtonIndex: number = 0;
  private isTransitioning: boolean = false;

  // Декоративные элементы
  private particles: Graphics[] = [];
  private smokeEffect!: Graphics;
  private vignette!: Graphics;

  // Анимации
  private logoFloatOffset: number = 0;
  private time: number = 0;
  private hasSaveGame: boolean = false;

  protected getSceneName(): SceneName {
    return 'menu';
  }

  protected async preload(): Promise<void> {
    // Проверяем наличие сохранения
    this.hasSaveGame = this.checkSaveGame();
    console.log('Has save game:', this.hasSaveGame);
  }

  protected setup(): void {
    // Проверяем, что все необходимые текстуры загружены
    const hasMenuBg = this.assetLoader.has('menu-background');
    const hasLogo = this.assetLoader.has('menu-logo');

    console.log('Menu assets loaded:', { hasMenuBg, hasLogo });

    this.createBackground();
    this.createVignette();
    this.createSmokeEffect();
    this.createParticles();
    this.createLogo();
    this.createTitle();
    this.createSubtitle();
    this.createButtons();
    this.createVersionText();

    // Начальное состояние
    this.alpha = 0;
  }

  protected bindEvents(): void {
    // Навигация по кнопкам с клавиатуры
    this.inputManager.onKeyDown('ArrowUp', () => this.selectPreviousButton());
    this.inputManager.onKeyDown('ArrowDown', () => this.selectNextButton());
    this.inputManager.onKeyDown('Enter', () => this.activateCurrentButton());
    this.inputManager.onKeyDown('Space', () => this.activateCurrentButton());
    this.inputManager.onKeyDown('Escape', () => this.onEscapePressed());

    // Обработка изменения размера окна
    this.eventBus.on(GameEvent.WINDOW_RESIZE, (data) => {
      this.onResize(data);
    });

    // Для отладки
    console.log('MenuScene events bound');
  }

  protected async onEnter(): Promise<void> {
    console.log('MenuScene entered');

    // Проверяем, что sceneManager доступен
    if (!this.sceneManager) {
      console.error('SceneManager is not available in MenuScene!');
    }

    // Запускаем музыку меню
    try {
      await this.audioManager.playMusic('menu-music', {
        volume: 0.4,
        fadeIn: 2000,
      });
    } catch (error) {
      console.warn('Failed to play menu music:', error);
    }

    // Анимация появления
    await this.fadeIn(1500);

    // Анимация появления элементов
    await this.animateElementsIn();

    // Фокусируем первую кнопку
    this.selectButton(0);
  }

  public update(delta: number): void {
    if (!this.isActive || this.isPaused) return;

    this.time += delta * 0.01;

    // Анимация логотипа
    this.animateLogo(delta);

    // Анимация частиц
    this.animateParticles(delta);

    // Анимация дыма
    this.animateSmoke(delta);

    // Пульсация выбранной кнопки
    this.animateSelectedButton(delta);
  }

  /**
   * Создание фона
   */
  private createBackground(): void {
    try {
      const texture = this.assetLoader.getTexture('menu-background');

      this.background = new Sprite(texture);
      this.background.width = this.app.screen.width;
      this.background.height = this.app.screen.height;

      // Добавляем фильтр размытия для глубины
      const blurFilter = new BlurFilter(2);
      this.background.filters = [blurFilter];

      this.addChild(this.background);
    } catch (error) {
      console.warn('Failed to load menu background, using fallback');
      // Создаём запасной фон
      const fallbackBg = new Graphics();
      fallbackBg.rect(0, 0, this.app.screen.width, this.app.screen.height);
      fallbackBg.fill({ color: 0x1a1a1a });
      this.addChild(fallbackBg);
    }
  }

  /**
   * Создание виньетки
   */
  private createVignette(): void {
    this.vignette = new Graphics();
    const { width, height } = this.app.screen;

    this.vignette.rect(0, 0, width, height);
    this.vignette.fill({ color: 0x000000, alpha: 0.3 });

    this.vignette.circle(width / 2, height / 2, Math.min(width, height) * 0.4);
    this.vignette.fill({ color: 0x000000, alpha: 0 });

    this.vignette.blendMode = 'multiply';
    this.addChild(this.vignette);
  }

  /**
   * Создание эффекта дыма
   */
  private createSmokeEffect(): void {
    this.smokeEffect = new Graphics();
    this.smokeEffect.alpha = 0.1;
    this.addChild(this.smokeEffect);
  }

  /**
   * Создание партиклов (летающие искры/пыль)
   */
  private createParticles(): void {
    const particleCount = 50;

    for (let i = 0; i < particleCount; i++) {
      const particle = new Graphics();
      particle.circle(0, 0, Math.random() * 2 + 1);
      particle.fill({ color: 0xff6600, alpha: 0.6 });

      particle.x = Math.random() * this.app.screen.width;
      particle.y = Math.random() * this.app.screen.height;
      particle.alpha = Math.random() * 0.5;

      this.particles.push(particle);
      this.addChild(particle);
    }
  }

  /**
   * Создание логотипа
   */
  private createLogo(): void {
    try {
      const texture = this.assetLoader.getTexture('menu-logo');
      this.logo = new Sprite(texture);
      this.logo.anchor.set(0.5);
      this.logo.x = this.app.screen.width / 2;
      this.logo.y = this.app.screen.height * 0.25;
      this.logo.scale.set(0.8);
      this.logo.alpha = 0;
      this.addChild(this.logo);
    } catch (error) {
      // Если логотип не загружен, создаём текстовый заголовок
      console.warn('Logo texture not found, using text fallback');
      this.logo = new Sprite(); // Пустой спрайт как заглушка
    }
  }

  /**
   * Создание заголовка
   */
  private createTitle(): void {
    this.titleText = new Text({
      text: 'SteelForce',
      style: new TextStyle({
        fontFamily: 'Press Start 2P, monospace',
        fontSize: 48,
        fill: 0xff6600,
        stroke: { color: 0x000000, width: 4 },
        dropShadow: {
          color: 0xff3300,
          blur: 10,
          distance: 3,
        },
        letterSpacing: 8,
      }),
    });

    this.titleText.anchor.set(0.5);
    this.titleText.x = this.app.screen.width / 2;
    this.titleText.y = this.app.screen.height * 0.35;
    this.titleText.alpha = 0;

    this.addChild(this.titleText);
  }

  /**
   * Создание подзаголовка
   */
  private createSubtitle(): void {
    this.subtitleText = new Text({
      text: 'Escape from Zone',
      style: new TextStyle({
        fontFamily: 'Press Start 2P, monospace',
        fontSize: 20,
        fill: 0xcccccc,
        letterSpacing: 4,
      }),
    });

    this.subtitleText.anchor.set(0.5);
    this.subtitleText.x = this.app.screen.width / 2;
    this.subtitleText.y = this.app.screen.height * 0.42;
    this.subtitleText.alpha = 0;

    this.addChild(this.subtitleText);
  }

  /**
   * Создание кнопок меню
   */
  private createButtons(): void {
    const buttonConfigs = [
      {
        text: 'Новая игра',
        y: 0.55,
        action: () => this.onStartGame(),
        disabled: false,
      },
      {
        text: 'Продолжить',
        y: 0.62,
        action: () => this.onContinue(),
        disabled: !this.hasSaveGame,
      },
      {
        text: 'Настройки',
        y: 0.69,
        action: () => this.onSettings(),
        disabled: false,
      },
      {
        text: 'Авторы',
        y: 0.76,
        action: () => this.onCredits(),
        disabled: false,
      },
    ];

    buttonConfigs.forEach((config, index) => {
      const button = this.createButton(config.text, config.y, config.disabled);
      button.eventMode = 'static';
      button.cursor = config.disabled ? 'default' : 'pointer';

      button.on('pointerover', () => {
        if (!config.disabled) {
          this.selectButton(index);
        }
      });

      button.on('pointerdown', () => {
        if (!config.disabled && !this.isTransitioning) {
          this.audioManager.playSFX('dialog-click', { volume: 0.5 }).catch(() => {});
          config.action();
        }
      });

      this.buttons.push(button);
      this.addChild(button);
    });

    // Кнопка "Продолжить" тусклая если нет сохранения
    if (!this.hasSaveGame) {
      this.buttons[1].alpha = 0.4;
    }
  }

  /**
   * Создание отдельной кнопки
   */
  private createButton(text: string, yPercent: number, disabled: boolean): Container {
    const container = new Container();
    container.x = this.app.screen.width / 2;
    container.y = this.app.screen.height * yPercent;
    container.alpha = 0;

    // Фон кнопки
    const bg = new Graphics();
    bg.rect(-150, -20, 300, 40);
    bg.fill({ color: 0x000000, alpha: 0.5 });
    bg.stroke({ width: 1, color: disabled ? 0x444444 : 0xff6600 });
    container.addChild(bg);

    // Текст кнопки
    const buttonText = new Text({
      text,
      style: new TextStyle({
        fontFamily: 'Press Start 2P, monospace',
        fontSize: 16,
        fill: disabled ? 0x666666 : 0xffffff,
        letterSpacing: 2,
      }),
    });
    buttonText.anchor.set(0.5);
    container.addChild(buttonText);

    // Индикатор выбора (стрелка слева)
    const indicator = new Text({
      text: '▸',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 16,
        fill: 0xff6600,
      }),
    });
    indicator.anchor.set(0.5);
    indicator.x = -170;
    indicator.alpha = 0;
    indicator.name = 'indicator';
    container.addChild(indicator);

    return container;
  }

  /**
   * Создание текста версии
   */
  private createVersionText(): void {
    const versionText = new Text({
      text: 'v0.1.0 alpha',
      style: new TextStyle({
        fontFamily: 'Press Start 2P, monospace',
        fontSize: 10,
        fill: 0x666666,
      }),
    });

    versionText.x = 10;
    versionText.y = this.app.screen.height - 25;
    versionText.alpha = 0.7;

    this.addChild(versionText);
  }

  /**
   * Анимация появления элементов
   */
  private async animateElementsIn(): Promise<void> {
    // Логотип
    const logoTween = this.createTween(this.logo, { alpha: 1, scaleX: 1, scaleY: 1 }, 1000);
    await this.delay(300);

    // Заголовок
    const titleTween = this.createTween(this.titleText, { alpha: 1 }, 800);
    await this.delay(200);

    // Подзаголовок
    const subtitleTween = this.createTween(this.subtitleText, { alpha: 1 }, 800);

    // Кнопки появляются последовательно
    for (let i = 0; i < this.buttons.length; i++) {
      await this.delay(150);
      this.createTween(this.buttons[i], { alpha: 1 }, 500);
    }

    await Promise.all([logoTween, titleTween, subtitleTween]);
  }

  /**
   * Анимация логотипа
   */
  private animateLogo(delta: number): void {
    if (!this.logo) return;

    this.logoFloatOffset += delta * 0.02;
    this.logo.y = this.app.screen.height * 0.25 + Math.sin(this.logoFloatOffset) * 10;
    this.logo.rotation = Math.sin(this.logoFloatOffset * 0.5) * 0.02;
  }

  /**
   * Анимация частиц
   */
  private animateParticles(delta: number): void {
    for (const particle of this.particles) {
      particle.y -= delta * 0.5;
      particle.x += Math.sin(this.time + particle.x) * delta * 0.3;
      particle.alpha = 0.3 + Math.sin(this.time + particle.y * 0.01) * 0.2;

      if (particle.y < -10) {
        particle.y = this.app.screen.height + 10;
        particle.x = Math.random() * this.app.screen.width;
      }
    }
  }

  /**
   * Анимация дыма
   */
  private animateSmoke(delta: number): void {
    this.smokeEffect.clear();

    for (let i = 0; i < 5; i++) {
      const x = this.app.screen.width * 0.2 + Math.sin(this.time + i) * this.app.screen.width * 0.3;
      const y = this.app.screen.height * 0.8 + i * 30;

      this.smokeEffect.circle(x, y, 50 + i * 20);
      this.smokeEffect.fill({ color: 0x666666, alpha: 0.05 });
    }
  }

  /**
   * Анимация выбранной кнопки
   */
  private animateSelectedButton(_delta: number): void {
    for (let i = 0; i < this.buttons.length; i++) {
      const button = this.buttons[i];
      const bg = button.children[0] as Graphics;
      const indicator = button.getChildByName('indicator') as Text;

      if (!bg || !indicator) continue;

      if (i === this.selectedButtonIndex && !this.isButtonDisabled(button)) {
        const pulse = Math.sin(this.time * 3) * 0.2 + 0.8;
        bg.alpha = pulse;
        indicator.alpha = Math.sin(this.time * 4) * 0.5 + 0.5;

        bg.clear();
        bg.rect(-150, -20, 300, 40);
        bg.fill({ color: 0x000000, alpha: 0.7 });
        bg.stroke({ width: 2, color: 0xff6600 });
      } else {
        bg.alpha = this.isButtonDisabled(button) ? 0.3 : 0.5;
        indicator.alpha = 0;

        bg.clear();
        bg.rect(-150, -20, 300, 40);
        bg.fill({ color: 0x000000, alpha: 0.5 });
        bg.stroke({ width: 1, color: this.isButtonDisabled(button) ? 0x444444 : 0x666666 });
      }
    }
  }

  /**
   * Выбор следующей кнопки
   */
  private selectNextButton(): void {
    let nextIndex = this.selectedButtonIndex + 1;
    while (nextIndex < this.buttons.length) {
      if (!this.isButtonDisabled(this.buttons[nextIndex])) {
        this.selectButton(nextIndex);
        this.audioManager.playSFX('dialog-click', { volume: 0.3 }).catch(() => {});
        return;
      }
      nextIndex++;
    }
  }

  /**
   * Выбор предыдущей кнопки
   */
  private selectPreviousButton(): void {
    let prevIndex = this.selectedButtonIndex - 1;
    while (prevIndex >= 0) {
      if (!this.isButtonDisabled(this.buttons[prevIndex])) {
        this.selectButton(prevIndex);
        this.audioManager.playSFX('dialog-click', { volume: 0.3 }).catch(() => {});
        return;
      }
      prevIndex--;
    }
  }

  /**
   * Выбор кнопки по индексу
   */
  private selectButton(index: number): void {
    if (index >= 0 && index < this.buttons.length) {
      this.selectedButtonIndex = index;
    }
  }

  /**
   * Активация текущей выбранной кнопки
   */
  private activateCurrentButton(): void {
    if (this.isTransitioning) return;

    const button = this.buttons[this.selectedButtonIndex];
    if (button && !this.isButtonDisabled(button)) {
      button.emit('pointerdown');
    }
  }

  /**
   * Обработчик кнопки "Новая игра"
   */
  private async onStartGame(): Promise<void> {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    console.log('Starting new game...');

    try {
      await this.animateButtonPress(this.buttons[0]);
      await this.fadeOut(800);

      // Проверяем, что sceneManager доступен
      if (!this.sceneManager) {
        console.error('SceneManager is not available!');
        this.isTransitioning = false;
        return;
      }

      // Переход к сцене новостей
      await this.sceneManager.switchTo('news', {}, {
        type: 'fade',
        duration: 1000,
      });

      console.log('Switched to news scene');
    } catch (error) {
      console.error('Failed to start new game:', error);
      this.isTransitioning = false;
    }
  }

  /**
   * Обработчик кнопки "Продолжить"
   */
  private async onContinue(): Promise<void> {
    if (this.isTransitioning || !this.hasSaveGame) return;
    this.isTransitioning = true;

    console.log('Continuing game...');

    try {
      await this.animateButtonPress(this.buttons[1]);

      if (!this.sceneManager) {
        console.error('SceneManager is not available!');
        this.isTransitioning = false;
        return;
      }

      const loaded = await this.sceneManager.loadSave();

      if (!loaded) {
        this.isTransitioning = false;
        console.warn('Failed to load save game');
      }
    } catch (error) {
      console.error('Failed to continue game:', error);
      this.isTransitioning = false;
    }
  }

  /**
   * Обработчик кнопки "Настройки"
   */
  private async onSettings(): Promise<void> {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    await this.animateButtonPress(this.buttons[2]);

    this.eventBus.emit(GameEvent.UI_MENU_OPEN, { menuId: 'settings' });
    this.eventBus.emit(GameEvent.UI_NOTIFICATION, {
      message: 'Настройки будут доступны в следующей версии',
      type: 'info',
    });

    await this.delay(500);
    this.isTransitioning = false;
  }

  /**
   * Обработчик кнопки "Авторы"
   */
  private async onCredits(): Promise<void> {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    await this.animateButtonPress(this.buttons[3]);

    this.eventBus.emit(GameEvent.UI_NOTIFICATION, {
      message: 'SteelForce: Escape from Zone\nСоздано командой разработчиков',
      type: 'info',
    });

    await this.delay(500);
    this.isTransitioning = false;
  }

  /**
   * Обработчик клавиши Escape
   */
  private onEscapePressed(): void {
    this.eventBus.emit(GameEvent.UI_NOTIFICATION, {
      message: 'Нажмите Alt+F4 для выхода',
      type: 'info',
    });
  }

  /**
   * Анимация нажатия кнопки
   */
  private async animateButtonPress(button: Container): Promise<void> {
    const originalScale = button.scale.x;
    const duration = 150;
    const startTime = Date.now();

    return new Promise(resolve => {
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        if (progress < 0.5) {
          button.scale.set(originalScale * (1 - progress * 0.2));
        } else {
          button.scale.set(originalScale * (0.9 + (progress - 0.5) * 0.2));
        }

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          button.scale.set(originalScale);
          resolve();
        }
      };
      animate();
    });
  }

  /**
   * Обработчик изменения размера окна
   */
  private onResize(data: { width: number; height: number }): void {
    if (!data) return;

    this.background.width = data.width;
    this.background.height = data.height;

    this.logo.x = data.width / 2;
    this.logo.y = data.height * 0.25;

    this.titleText.x = data.width / 2;
    this.titleText.y = data.height * 0.35;

    this.subtitleText.x = data.width / 2;
    this.subtitleText.y = data.height * 0.42;

    this.buttons.forEach((button, index) => {
      button.x = data.width / 2;
      button.y = data.height * (0.55 + index * 0.07);
    });

    this.vignette.clear();
    this.vignette.rect(0, 0, data.width, data.height);
    this.vignette.fill({ color: 0x000000, alpha: 0.3 });
    this.vignette.circle(data.width / 2, data.height / 2, Math.min(data.width, data.height) * 0.4);
    this.vignette.fill({ color: 0x000000, alpha: 0 });
  }

  /**
   * Создание анимации (твин)
   */
  private createTween(
    target: Container,
    props: Record<string, number>,
    duration: number
  ): Promise<void> {
    const startProps: Record<string, number> = {};
    const startTime = Date.now();

    for (const key in props) {
      startProps[key] = (target as any)[key];
    }

    return new Promise(resolve => {
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = this.easeOutCubic(progress);

        for (const key in props) {
          (target as any)[key] = startProps[key] + (props[key] - startProps[key]) * eased;
        }

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
   * Проверка наличия сохранения
   */
  private checkSaveGame(): boolean {
    try {
      const saveData = localStorage.getItem('steelforce_autosave');
      return saveData !== null;
    } catch {
      return false;
    }
  }

  /**
   * Проверка, заблокирована ли кнопка
   */
  private isButtonDisabled(button: Container): boolean {
    return button.alpha <= 0.4;
  }

  /**
   * Функция плавности
   */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * Очистка сцены
   */
  public async cleanup(): Promise<void> {
    // Останавливаем музыку меню с затуханием
    try {
      this.audioManager.stopCategory('music', 500);
    } catch (error) {
      console.warn('Failed to stop music:', error);
    }

    // Очищаем частицы
    this.particles.length = 0;

    await super.cleanup();
  }
}
