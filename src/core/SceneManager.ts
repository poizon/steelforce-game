import { Application, Container } from "pixi.js";
import { EventBus } from "./EventBus";
import { InputManager } from "./InputManager";
import { AudioManager } from "./AudioManager";
import { AssetLoader } from "./AssetLoader";
import { BaseScene } from "../scenes/BaseScene";

export type SceneName =
  | "menu"
  | "news"
  | "rooftop"
  | "platform"
  | "elevator"
  | "assembly"
  | "chemical"
  | "soldiers";

export interface SceneTransitionOptions {
  duration?: number;
  type?: "fade" | "slide" | "none";
  direction?: "left" | "right" | "up" | "down";
}

export interface SceneParams {
  fromScene?: SceneName;
  inventory?: Record<string, unknown>;
  playerPosition?: { x: number; y: number };
  puzzleState?: Record<string, unknown>;
  dialogueState?: string[];
  customData?: Record<string, unknown>;
}

type SceneConstructor = new (
  app: Application,
  eventBus: EventBus,
  inputManager: InputManager,
  audioManager: AudioManager,
  assetLoader: AssetLoader,
) => BaseScene;

export class SceneManager {
  private readonly app: Application;
  private readonly eventBus: EventBus;
  private readonly inputManager: InputManager;
  private readonly audioManager: AudioManager;
  private readonly assetLoader: AssetLoader;

  private readonly scenes: Map<SceneName, SceneConstructor> = new Map();
  private currentScene: BaseScene | null = null;
  private nextScene: BaseScene | null = null;

  private isTransitioning: boolean = false;
  private isGamePaused: boolean = false;
  private transitionTimer: number = 0;
  private transitionDuration: number = 1000;
  private transitionType: SceneTransitionOptions["type"] = "fade";

  private readonly sceneHistory: Array<{
    name: SceneName;
    params: SceneParams;
  }> = [];

  private readonly maxHistorySize: number = 10;

  constructor(
    app: Application,
    eventBus: EventBus,
    inputManager: InputManager,
    audioManager: AudioManager,
    assetLoader: AssetLoader,
  ) {
    this.app = app;
    this.eventBus = eventBus;
    this.inputManager = inputManager;
    this.audioManager = audioManager;
    this.assetLoader = assetLoader;

    this.setupGlobalListeners();
  }

  /**
   * Регистрирует конструктор сцены
   */
  public register(name: SceneName, sceneClass: SceneConstructor): void {
    if (this.scenes.has(name)) {
      console.warn(`Scene "${name}" is already registered. Overwriting...`);
    }
    this.scenes.set(name, sceneClass);
    console.log(`Scene "${name}" registered successfully`);
  }

  /**
   * Переключает на указанную сцену
   */
  public async switchTo(
    name: SceneName,
    params: Record<string, unknown> = {},
    transition: SceneTransitionOptions = {},
  ): Promise<void> {
    if (this.isTransitioning) {
      console.warn("Scene transition already in progress");
      return;
    }

    const SceneClass = this.scenes.get(name);
    if (!SceneClass) {
      throw new Error(`Scene "${name}" is not registered!`);
    }

    try {
      this.isTransitioning = true;

      if (this.currentScene) {
        this.addToHistory(this.currentScene.name, this.currentScene.params);
      }

      this.eventBus.emit("scene:transition:start", {
        from: this.currentScene?.name,
        to: name,
        params,
      });

      const newScene = new SceneClass(
        this.app,
        this.eventBus,
        this.inputManager,
        this.audioManager,
        this.assetLoader,
      );

      // ВАЖНО: Устанавливаем ссылку на SceneManager
      newScene.setSceneManager(this);

      await newScene.init(params);
      await this.performTransition(newScene, transition);

      if (this.currentScene) {
        await this.currentScene.cleanup();
        this.app.stage.removeChild(this.currentScene);
        this.currentScene.destroy({ children: true });
      }

      this.currentScene = newScene;
      this.nextScene = null;
      this.app.stage.addChild(this.currentScene);
      await this.currentScene.enter();

      this.eventBus.emit("scene:transition:end", {
        scene: name,
        params,
      });
    } catch (error) {
      console.error(`Failed to switch to scene "${name}":`, error);

      if (this.currentScene) {
        this.app.stage.addChild(this.currentScene);
      }

      this.eventBus.emit("scene:transition:error", {
        scene: name,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    } finally {
      this.isTransitioning = false;
    }
  }

  /**
   * Выполняет анимацию перехода между сценами
   */
  private async performTransition(
    newScene: BaseScene,
    options: SceneTransitionOptions,
  ): Promise<void> {
    const type = options.type || "fade";
    const duration = options.duration || this.transitionDuration;

    if (type === "none" || !this.currentScene) {
      return;
    }

    switch (type) {
      case "fade":
        await this.fadeTransition(newScene, duration);
        break;
      case "slide":
        await this.slideTransition(
          newScene,
          duration,
          options.direction || "right",
        );
        break;
      default:
        await this.fadeTransition(newScene, duration);
    }
  }

  /**
   * Переход с затуханием
   */
  private async fadeTransition(
    newScene: BaseScene,
    duration: number,
  ): Promise<void> {
    if (!this.currentScene) return;

    // Устанавливаем начальную прозрачность новой сцены
    newScene.alpha = 0;
    this.app.stage.addChild(newScene);

    return new Promise((resolve) => {
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Применяем easing
        const easedProgress = this.easeInOutQuad(progress);

        if (this.currentScene) {
          this.currentScene.alpha = 1 - easedProgress;
        }
        newScene.alpha = easedProgress;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Убираем новую сцену (она будет добавлена после уничтожения старой)
          this.app.stage.removeChild(newScene);
          resolve();
        }
      };

      animate();
    });
  }

  /**
   * Переход со сдвигом
   */
  private async slideTransition(
    newScene: BaseScene,
    duration: number,
    direction: "left" | "right" | "up" | "down",
  ): Promise<void> {
    if (!this.currentScene) return;

    const { width, height } = this.app.screen;

    // Устанавливаем начальную позицию новой сцены
    switch (direction) {
      case "right":
        newScene.x = width;
        break;
      case "left":
        newScene.x = -width;
        break;
      case "down":
        newScene.y = height;
        break;
      case "up":
        newScene.y = -height;
        break;
    }

    this.app.stage.addChild(newScene);

    return new Promise((resolve) => {
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = this.easeInOutQuad(progress);

        switch (direction) {
          case "right":
            newScene.x = width * (1 - easedProgress);
            if (this.currentScene) {
              this.currentScene.x = -width * easedProgress;
            }
            break;
          case "left":
            newScene.x = -width * (1 - easedProgress);
            if (this.currentScene) {
              this.currentScene.x = width * easedProgress;
            }
            break;
          case "down":
            newScene.y = height * (1 - easedProgress);
            if (this.currentScene) {
              this.currentScene.y = -height * easedProgress;
            }
            break;
          case "up":
            newScene.y = -height * (1 - easedProgress);
            if (this.currentScene) {
              this.currentScene.y = height * easedProgress;
            }
            break;
        }

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          this.app.stage.removeChild(newScene);
          if (this.currentScene) {
            this.currentScene.x = 0;
            this.currentScene.y = 0;
          }
          newScene.x = 0;
          newScene.y = 0;
          resolve();
        }
      };

      animate();
    });
  }

  /**
   * Возвращается к предыдущей сцене
   */
  public async goBack(params: SceneParams = {}): Promise<void> {
    if (this.sceneHistory.length === 0) {
      console.warn("No previous scene in history");
      return;
    }

    const previous = this.sceneHistory.pop()!;
    await this.switchTo(previous.name, {
      ...previous.params,
      ...params,
    });
  }

  /**
   * Добавляет сцену в историю
   */
  private addToHistory(name: SceneName, params: SceneParams): void {
    this.sceneHistory.push({ name, params });

    // Ограничиваем размер истории
    if (this.sceneHistory.length > this.maxHistorySize) {
      this.sceneHistory.shift();
    }
  }

  /**
   * Обновляет текущую сцену
   */
  public update(delta: number): void {
    if (this.isGamePaused || this.isTransitioning) return;

    this.currentScene?.update(delta);
  }

  /**
   * Ставит игру на паузу
   */
  public pause(): void {
    if (this.isGamePaused) return;

    this.isGamePaused = true;
    this.currentScene?.onPause();
    this.eventBus.emit("game:paused");
  }

  /**
   * Снимает игру с паузы
   */
  public resume(): void {
    if (!this.isGamePaused) return;

    this.isGamePaused = false;
    this.currentScene?.onResume();
    this.eventBus.emit("game:resumed");
  }

  /**
   * Проверяет, на паузе ли игра
   */
  public isPaused(): boolean {
    return this.isGamePaused;
  }

  /**
   * Получает текущую сцену
   */
  public getCurrentScene(): BaseScene | null {
    return this.currentScene;
  }

  /**
   * Получает имя текущей сцены
   */
  public getCurrentSceneName(): SceneName | null {
    return this.currentScene?.name || null;
  }

  /**
   * Проверяет, зарегистрирована ли сцена
   */
  public hasScene(name: SceneName): boolean {
    return this.scenes.has(name);
  }

  /**
   * Получает список зарегистрированных сцен
   */
  public getRegisteredScenes(): SceneName[] {
    return Array.from(this.scenes.keys());
  }

  /**
   * Очищает историю сцен
   */
  public clearHistory(): void {
    this.sceneHistory.length = 0;
  }

  /**
   * Устанавливает длительность перехода по умолчанию
   */
  public setDefaultTransitionDuration(duration: number): void {
    this.transitionDuration = duration;
  }

  /**
   * Устанавливает тип перехода по умолчанию
   */
  public setDefaultTransitionType(type: SceneTransitionOptions["type"]): void {
    this.transitionType = type;
  }

  /**
   * Настройка глобальных слушателей
   */
  private setupGlobalListeners(): void {
    // Слушаем команды навигации
    this.eventBus.on(
      "scene:go",
      (data: { scene: SceneName; params?: SceneParams }) => {
        this.switchTo(data.scene, data.params);
      },
    );

    this.eventBus.on("scene:back", (params?: SceneParams) => {
      this.goBack(params);
    });

    // Автосохранение при смене сцены
    this.eventBus.on("scene:transition:end", (data: { scene: SceneName }) => {
      this.autoSave(data.scene);
    });
  }

  /**
   * Автосохранение прогресса
   */
  private autoSave(currentScene: SceneName): void {
    try {
      const saveData = {
        currentScene,
        timestamp: Date.now(),
        sceneHistory: this.sceneHistory.map((h) => h.name),
        // Здесь можно добавить другие данные для сохранения
      };

      localStorage.setItem("steelforce_autosave", JSON.stringify(saveData));
    } catch (error) {
      console.warn("Failed to autosave:", error);
    }
  }

  /**
   * Загружает сохранение
   */
  public async loadSave(): Promise<boolean> {
    try {
      const saveData = localStorage.getItem("steelforce_autosave");
      if (!saveData) return false;

      const data = JSON.parse(saveData);

      if (data.currentScene && this.hasScene(data.currentScene)) {
        await this.switchTo(data.currentScene);
        return true;
      }

      return false;
    } catch (error) {
      console.error("Failed to load save:", error);
      return false;
    }
  }

  /**
   * Функция плавности для анимаций
   */
  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  /**
   * Уничтожает менеджер сцен и все активные сцены
   */
  public destroy(): void {
    // Очищаем текущую сцену
    if (this.currentScene) {
      this.currentScene.cleanup();
      this.app.stage.removeChild(this.currentScene);
      this.currentScene.destroy({ children: true });
      this.currentScene = null;
    }

    // Очищаем nextScene если есть
    if (this.nextScene) {
      this.nextScene.destroy({ children: true });
      this.nextScene = null;
    }

    // Очищаем историю и зарегистрированные сцены
    this.sceneHistory.length = 0;
    this.scenes.clear();

    // Сбрасываем состояние
    this.isTransitioning = false;
    this.isGamePaused = false;
  }

  /**
   * Для отладки: логирует состояние менеджера сцен
   */
  public debug(): void {
    console.group("SceneManager Debug");
    console.log("Current scene:", this.currentScene?.name);
    console.log("Is paused:", this.isGamePaused);
    console.log("Is transitioning:", this.isTransitioning);
    console.log(
      "History:",
      this.sceneHistory.map((h) => h.name),
    );
    console.log("Registered scenes:", this.getRegisteredScenes());
    console.log("Stage children:", this.app.stage.children.length);
    console.groupEnd();
  }
}
