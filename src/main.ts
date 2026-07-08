import { Application } from "pixi.js";
import { SceneManager } from "./core/SceneManager";
import { AssetLoader } from "./core/AssetLoader";
import { InputManager } from "./core/InputManager";
import { AudioManager } from "./core/AudioManager";
import { EventBus, GameEvent } from "./core/EventBus";

// Сцены
import { MenuScene } from "./scenes/MenuScene";
import { NewsScene } from "./scenes/NewsScene";
import { RooftopScene } from "./scenes/RooftopScene";
import { PlatformScene } from "./scenes/PlatformScene";
import { ElevatorScene } from "./scenes/ElevatorScene";
import { AssemblyScene } from "./scenes/AssemblyScene";
import { ChemicalScene } from "./scenes/ChemicalScene";
import { SoldiersScene } from "./scenes/SoldiersScene";

// Константы
import { GAME_WIDTH, GAME_HEIGHT } from "./utils/constants";

class Game {
  private app!: Application;
  private sceneManager!: SceneManager;
  private assetLoader!: AssetLoader;
  private inputManager!: InputManager;
  private audioManager!: AudioManager;
  private eventBus!: EventBus;

  private isInitialized: boolean = false;

  constructor() {
    this.init().catch((error) => {
      console.error("Failed to initialize game:", error);
      this.showErrorScreen(
        "Не удалось загрузить игру. Пожалуйста, обновите страницу.",
      );
    });
  }

  private async init(): Promise<void> {
    // Показываем загрузочный экран
    this.showLoadingScreen();

    // Инициализируем EventBus первым, так как он нужен всем сервисам
    this.eventBus = new EventBus(import.meta.env.DEV);

    // Инициализируем сервисы
    this.inputManager = new InputManager();
    this.audioManager = new AudioManager(this.eventBus);
    // await this.audioManager.initialize(); // Инициализируем AudioContext
    this.assetLoader = new AssetLoader(this.eventBus);
    // Устанавливаем assetLoader в audioManager
    this.audioManager.setAssetLoader(this.assetLoader);

    // Настраиваем отслеживание прогресса загрузки
    this.assetLoader.onProgress = (progress: number) => {
      this.updateLoadingProgress(progress);
    };

    // Создаём Pixi Application
    this.app = new Application();

    await this.app.init({
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: 0x1a1a1a,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      resizeTo: window,
    });

    // Добавляем canvas на страницу
    const gameContainer = document.getElementById("game-container");
    if (!gameContainer) {
      throw new Error("Game container not found");
    }
    gameContainer.appendChild(this.app.canvas as HTMLCanvasElement);

    // Инициализируем SceneManager
    this.sceneManager = new SceneManager(
      this.app,
      this.eventBus,
      this.inputManager,
      this.audioManager,
      this.assetLoader,
    );

    // Загружаем ресурсы
    await this.loadAssets();

    // Регистрируем сцены
    this.registerScenes();

    // Настройка игрового цикла
    this.app.ticker.add((ticker) => {
      this.update(ticker.deltaTime, ticker.elapsedMS);
    });

    // Обработчики событий окна
    this.setupWindowHandlers();

    // Горячие клавиши
    this.setupHotkeys();

    // Запускаем игру
    this.startGame();

    // Скрываем загрузочный экран
    this.hideLoadingScreen();

    this.isInitialized = true;
  }

  private async loadAssets(): Promise<void> {
    const manifest = {
      bundles: [
        {
          name: "common",
          assets: [
            {
              alias: "font-main",
              src: "assets/fonts/PressStart2P.ttf",
              loadType: "font" as const,
            },
          ],
        },
        {
          name: "menu",
          assets: [
            { alias: "menu-background", src: "assets/backgrounds/menu-bg.png" },
            { alias: "menu-logo", src: "assets/sprites/logo.png" },
            { alias: "btn-start", src: "assets/sprites/btn-start.png" },
            {
              alias: "btn-start-hover",
              src: "assets/sprites/btn-start-hover.png",
            },
          ],
        },
        {
          name: "news",
          assets: [
            { alias: "news-background", src: "assets/backgrounds/news-bg.png" },
          ],
        },
        {
          name: "rooftop",
          assets: [
            {
              alias: "rooftop-background",
              src: "assets/backgrounds/rooftop-bg.png",
            },
            { alias: "character-n", src: "assets/sprites/character-n.png" },
            { alias: "character-m", src: "assets/sprites/character-m.png" },
          ],
        },
        // {
        //   name: 'platform',
        //   assets: [
        //     { alias: 'platform-background', src: 'assets/backgrounds/platform-bg.png' },
        //     { alias: 'platform-tiles', src: 'assets/sprites/platform-tiles.png' },
        //     { alias: 'player-sprite', src: 'assets/sprites/player-sprite.json', loadType: 'spritesheet' as const },
        //   ],
        // },
        // {
        //   name: 'elevator',
        //   assets: [
        //     { alias: 'elevator-background', src: 'assets/backgrounds/elevator-bg.png' },
        //     { alias: 'elevator-platform', src: 'assets/sprites/elevator-platform.png' },
        //   ],
        // },
        // {
        //   name: 'assembly',
        //   assets: [
        //     { alias: 'assembly-background', src: 'assets/backgrounds/assembly-bg.png' },
        //     { alias: 'zombie-worker', src: 'assets/sprites/zombie-worker.png' },
        //     { alias: 'gear', src: 'assets/sprites/gear.png' },
        //     { alias: 'conveyor', src: 'assets/sprites/conveyor.png' },
        //   ],
        // },
        // {
        //   name: 'chemical',
        //   assets: [
        //     { alias: 'chemical-background', src: 'assets/backgrounds/chemical-bg.png' },
        //     { alias: 'mutated-worker', src: 'assets/sprites/mutated-worker.png' },
        //     { alias: 'gas-effect', src: 'assets/sprites/gas-effect.png' },
        //   ],
        // },
        // {
        //   name: 'soldiers',
        //   assets: [
        //     { alias: 'street-background', src: 'assets/backgrounds/street-bg.png' },
        //     { alias: 'soldier', src: 'assets/sprites/soldier.png' },
        //   ],
        // },
        {
          name: "audio",
          assets: [
            {
              alias: "menu-music",
              src: "assets/sounds/menu-music.mp3",
              loadType: "sound" as const,
            },
            {
              alias: "gameplay-music",
              src: "assets/sounds/gameplay-music.mp3",
              loadType: "sound" as const,
            },
            {
              alias: "radio-broadcast",
              src: "assets/sounds/radio-broadcast.mp3",
              loadType: "sound" as const,
            },
            {
              alias: "zombie-growl",
              src: "assets/sounds/zombie-growl.mp3",
              loadType: "sound" as const,
            },
            {
              alias: "gear-collect",
              src: "assets/sounds/gear-collect.mp3",
              loadType: "sound" as const,
            },
            {
              alias: "dialog-click",
              src: "assets/sounds/dialog-click.mp3",
              loadType: "sound" as const,
            },
          ],
        },
      ],
    };

    await this.assetLoader.loadManifest(manifest);
  }

  private registerScenes(): void {
    this.sceneManager.register("menu", MenuScene);
    this.sceneManager.register("news", NewsScene);
    this.sceneManager.register("rooftop", RooftopScene);
    this.sceneManager.register("platform", PlatformScene);
    this.sceneManager.register("elevator", ElevatorScene);
    this.sceneManager.register("assembly", AssemblyScene);
    this.sceneManager.register("chemical", ChemicalScene);
    this.sceneManager.register("soldiers", SoldiersScene);
  }

  private startGame(): void {
    // Подписываемся на глобальные события
    this.eventBus.on(GameEvent.GAME_RESTART, () => {
      this.restartGame();
    });

    this.eventBus.on(GameEvent.GAME_PAUSE, () => {
      this.pauseGame();
    });

    this.eventBus.on(GameEvent.GAME_RESUME, () => {
      this.resumeGame();
    });

    this.eventBus.on(GameEvent.GAME_OVER, (data) => {
      this.onGameOver(data);
    });

    // Запускаем первую сцену
    this.sceneManager.switchTo("menu").catch((error) => {
      console.error("Failed to start game:", error);
    });

    // Запускаем фоновую музыку
    try {
      this.audioManager.playMusic("menu-music", {
        loop: true,
        volume: 0.5,
      });
    } catch (error) {
      console.warn("Failed to play menu music:", error);
    }
  }

  private update(deltaTime: number, _elapsedMs: number): void {
    this.inputManager.update();
    this.sceneManager.update(deltaTime);
  }

  private setupWindowHandlers(): void {
    window.addEventListener("resize", () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.eventBus.emit(GameEvent.WINDOW_RESIZE, { width, height });
    });

    window.addEventListener("blur", () => {
      if (!this.sceneManager.isPaused()) {
        this.eventBus.emit(GameEvent.GAME_PAUSE, { reason: "window_blur" });
      }
      this.audioManager.mute();
      this.eventBus.emit(GameEvent.WINDOW_BLUR, {});
    });

    window.addEventListener("focus", () => {
      this.audioManager.unmute();
      this.eventBus.emit(GameEvent.WINDOW_FOCUS, {});
    });

    // Предотвращаем нежелательные действия браузера
    window.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
  }

  private setupHotkeys(): void {
    // Пауза на Escape
    this.inputManager.onKeyDown("Escape", () => {
      if (this.sceneManager.isPaused()) {
        this.eventBus.emit(GameEvent.GAME_RESUME, { timestamp: Date.now() });
      } else {
        this.eventBus.emit(GameEvent.GAME_PAUSE, { reason: "escape_key" });
      }
    });

    // Полный экран на F11
    this.inputManager.onKeyDown("F11", (event) => {
      event?.preventDefault();
      this.toggleFullscreen();
    });

    // Скриншот на F12
    this.inputManager.onKeyDown("F12", (event) => {
      event?.preventDefault();
      this.takeScreenshot();
    });

    // Быстрый рестарт на Ctrl+R (игровой, не браузерный)
    this.inputManager.onKeyDown("KeyR", (event) => {
      if (event?.ctrlKey) {
        event.preventDefault();
        this.restartGame();
      }
    });
  }

  private pauseGame(): void {
    this.app.ticker.stop();
    this.sceneManager.pause();
    this.audioManager.pauseAll();
    this.showPauseMenu();
  }

  private resumeGame(): void {
    this.app.ticker.start();
    this.sceneManager.resume();
    this.audioManager.resumeAll();
    this.hidePauseMenu();
  }

  private restartGame(): void {
    // Очищаем текущее состояние
    this.sceneManager.destroy();
    this.eventBus.offAll();
    this.audioManager.stopAll();

    // Запускаем заново
    this.startGame();
  }

  private onGameOver(data: { reason: string; score?: number }): void {
    console.log("Game Over:", data);

    // Можно показать экран окончания игры
    setTimeout(() => {
      this.showErrorScreen(
        `Игра окончена!\nПричина: ${data.reason}\n` +
          (data.score ? `Очки: ${data.score}` : ""),
      );
    }, 2000);
  }

  private showPauseMenu(): void {
    const pauseOverlay = document.getElementById("pause-menu");
    if (pauseOverlay) {
      pauseOverlay.style.display = "flex";
    }
  }

  private hidePauseMenu(): void {
    const pauseOverlay = document.getElementById("pause-menu");
    if (pauseOverlay) {
      pauseOverlay.style.display = "none";
    }
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("Failed to toggle fullscreen:", error);
    }
  }

  private async takeScreenshot(): Promise<void> {
    try {
      const canvas = this.app.canvas as HTMLCanvasElement;
      const dataUrl = canvas.toDataURL("image/png");

      const link = document.createElement("a");
      link.download = `steelforce-screenshot-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Failed to take screenshot:", error);
    }
  }

  private showLoadingScreen(): void {
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      loadingScreen.style.display = "flex";
    }
  }

  private updateLoadingProgress(progress: number): void {
    const progressBar = document.getElementById("loading-progress");
    if (progressBar) {
      progressBar.style.width = `${Math.floor(progress * 100)}%`;
    }

    const progressText = document.getElementById("loading-text");
    if (progressText) {
      progressText.textContent = `Загрузка: ${Math.floor(progress * 100)}%`;
    }
  }

  private hideLoadingScreen(): void {
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      loadingScreen.style.opacity = "0";
      loadingScreen.style.transition = "opacity 0.5s ease-out";

      setTimeout(() => {
        loadingScreen.style.display = "none";
      }, 500);
    }
  }

  private showErrorScreen(message: string): void {
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      loadingScreen.innerHTML = `
        <div class="error-container">
          <h1>Ошибка</h1>
          <p>${message.replace(/\n/g, "<br>")}</p>
          <button onclick="location.reload()">Обновить</button>
        </div>
      `;
      loadingScreen.style.display = "flex";
      loadingScreen.style.opacity = "1";
    }
  }

  /**
   * Для отладки
   */
  public debug(): void {
    console.group("Game Debug");
    console.log("Initialized:", this.isInitialized);
    console.log("Current scene:", this.sceneManager?.getCurrentSceneName());
    console.log("Is paused:", this.sceneManager?.isPaused());
    console.log("Audio state:", this.audioManager?.getAudioState());
    console.log("Assets loaded:", this.assetLoader?.getStats());
    console.groupEnd();
  }
}

// Запуск игры после загрузки DOM
document.addEventListener("DOMContentLoaded", () => {
  new Game();
});

// Экспорт для отладки в консоли
if (import.meta.env.DEV) {
  (window as any).__GAME_DEBUG__ = {
    Game,
    getInstance: () => (window as any).__gameInstance,
  };
}

// Обработка необработанных ошибок
window.addEventListener("error", (event) => {
  console.error("Unhandled error:", event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});
