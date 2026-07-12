import { Application } from "pixi.js";
import { EventBus, GameEvent } from "./EventBus";
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

export type SceneParams = Record<string, unknown>;

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

  private isTransitioning: boolean = false;
  private isGamePaused: boolean = false;
  private transitionDuration: number = 1000;

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

    this.resubscribeGlobalListeners();
  }

  public register(name: SceneName, sceneClass: SceneConstructor): void {
    if (this.scenes.has(name)) {
      console.warn(`Scene "${name}" is already registered. Overwriting...`);
    }
    this.scenes.set(name, sceneClass);
    console.log(`Scene "${name}" registered successfully`);
  }

  public async switchTo(
    name: SceneName,
    params: SceneParams = {},
    transition: SceneTransitionOptions = {},
  ): Promise<void> {
    console.log(`[SceneManager] Switching to scene "${name}"`);

    if (this.isTransitioning) {
      console.warn("[SceneManager] Scene transition already in progress");
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

      this.eventBus.emit(GameEvent.SCENE_TRANSITION_START, {
        from: this.currentScene?.name,
        to: name,
        type: transition.type || "fade",
      });

      const newScene = new SceneClass(
        this.app,
        this.eventBus,
        this.inputManager,
        this.audioManager,
        this.assetLoader,
      );

      // Устанавливаем ссылку на SceneManager
      // Используем type assertion для вызова setSceneManager если он существует
      const sceneWithManager = newScene as BaseScene & {
        setSceneManager?: (manager: SceneManager) => void;
      };
      if (sceneWithManager.setSceneManager) {
        sceneWithManager.setSceneManager(this);
      }

      await newScene.init(params);
      await this.performTransition(newScene, transition);

      if (this.currentScene) {
        await this.currentScene.cleanup();
        this.app.stage.removeChild(this.currentScene);
        this.currentScene.destroy({ children: true });
      }

      this.currentScene = newScene;
      this.app.stage.addChild(this.currentScene);
      this.isTransitioning = false;
      await this.currentScene.enter();

      this.eventBus.emit(GameEvent.SCENE_TRANSITION_END, {
        scene: name,
      });

      console.log(`[SceneManager] Successfully switched to "${name}"`);
    } catch (error) {
      console.error(
        `[SceneManager] Failed to switch to scene "${name}":`,
        error,
      );

      if (this.currentScene) {
        this.app.stage.addChild(this.currentScene);
      }

      this.eventBus.emit(GameEvent.SCENE_TRANSITION_ERROR, {
        scene: name,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    } finally {
      this.isTransitioning = false;
    }
  }

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

  private async fadeTransition(
    newScene: BaseScene,
    duration: number,
  ): Promise<void> {
    if (!this.currentScene) return;

    newScene.alpha = 0;
    this.app.stage.addChild(newScene);

    return new Promise((resolve) => {
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = this.easeInOutQuad(progress);

        if (this.currentScene) {
          this.currentScene.alpha = 1 - easedProgress;
        }
        newScene.alpha = easedProgress;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          this.app.stage.removeChild(newScene);
          resolve();
        }
      };

      animate();
    });
  }

  private async slideTransition(
    newScene: BaseScene,
    duration: number,
    direction: "left" | "right" | "up" | "down",
  ): Promise<void> {
    if (!this.currentScene) return;

    const { width, height } = this.app.screen;

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

  public async goBack(params: SceneParams = {}): Promise<void> {
    if (this.sceneHistory.length === 0) {
      console.warn("[SceneManager] No previous scene in history");
      return;
    }

    const previous = this.sceneHistory.pop()!;
    await this.switchTo(previous.name, {
      ...previous.params,
      ...params,
    });
  }

  private addToHistory(name: SceneName, params: SceneParams): void {
    this.sceneHistory.push({ name, params });

    if (this.sceneHistory.length > this.maxHistorySize) {
      this.sceneHistory.shift();
    }
  }

  public update(delta: number): void {
    if (this.isGamePaused || this.isTransitioning) return;
    this.currentScene?.update(delta);
  }

  public pause(): void {
    if (this.isGamePaused) return;

    this.isGamePaused = true;
    this.currentScene?.onPause();
    this.eventBus.emit(GameEvent.GAME_PAUSE, { reason: "manual" });
  }

  public resume(): void {
    if (!this.isGamePaused) return;

    this.isGamePaused = false;
    this.currentScene?.onResume();
    this.eventBus.emit(GameEvent.GAME_RESUME, { timestamp: Date.now() });
  }

  public isPaused(): boolean {
    return this.isGamePaused;
  }

  public getCurrentScene(): BaseScene | null {
    return this.currentScene;
  }

  public getCurrentSceneName(): SceneName | null {
    return this.currentScene?.name || null;
  }

  public hasScene(name: SceneName): boolean {
    return this.scenes.has(name);
  }

  public getRegisteredScenes(): SceneName[] {
    return Array.from(this.scenes.keys());
  }

  public clearHistory(): void {
    this.sceneHistory.length = 0;
  }

  public setDefaultTransitionDuration(duration: number): void {
    this.transitionDuration = duration;
  }

  /**
   * Подписывает SceneManager на глобальные события EventBus.
   * Вызывается из конструктора, а также должна вызываться повторно,
   * если кто-то снаружи очистил все подписки через `EventBus.offAll()`
   * (например, при рестарте игры), иначе автосохранение и переключение
   * сцен через событие SCENE_CHANGE перестанут работать.
   */
  public resubscribeGlobalListeners(): void {
    this.eventBus.on(
      GameEvent.SCENE_CHANGE,
      (data: { to: string; from?: string }) => {
        this.switchTo(data.to as SceneName);
      },
    );

    // Автосохранение при смене сцены
    this.eventBus.on(
      GameEvent.SCENE_TRANSITION_END,
      (data: { scene: string }) => {
        this.autoSave(data.scene as SceneName);
      },
    );
  }

  private autoSave(currentScene: SceneName): void {
    try {
      const saveData = {
        currentScene,
        timestamp: Date.now(),
        sceneHistory: this.sceneHistory.map((h) => h.name),
      };

      localStorage.setItem("steelforce_autosave", JSON.stringify(saveData));
    } catch (error) {
      console.warn("[SceneManager] Failed to autosave:", error);
    }
  }

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
      console.error("[SceneManager] Failed to load save:", error);
      return false;
    }
  }

  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  public destroy(): void {
    if (this.currentScene) {
      this.currentScene.cleanup().catch(console.error);
      this.app.stage.removeChild(this.currentScene);
      this.currentScene.destroy({ children: true });
      this.currentScene = null;
    }

    this.sceneHistory.length = 0;
    this.scenes.clear();
    this.isTransitioning = false;
    this.isGamePaused = false;
  }

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
