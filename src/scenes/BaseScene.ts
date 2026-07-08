// src/scenes/BaseScene.ts
import { Container, Application } from "pixi.js";
import { EventBus } from "../core/EventBus";
import { InputManager } from "../core/InputManager";
import { AudioManager } from "../core/AudioManager";
import { AssetLoader } from "../core/AssetLoader";
import type { SceneManager, SceneName } from "../core/SceneManager";

export abstract class BaseScene extends Container {
  protected readonly app: Application;
  protected readonly eventBus: EventBus;
  protected readonly inputManager: InputManager;
  protected readonly audioManager: AudioManager;
  protected readonly assetLoader: AssetLoader;
  protected sceneManager!: SceneManager; // Будет установлен SceneManager'ом

  public readonly name: SceneName;
  public params: Record<string, unknown> = {};

  private _isActive: boolean = false;
  private _isPaused: boolean = false;

  constructor(
    app: Application,
    eventBus: EventBus,
    inputManager: InputManager,
    audioManager: AudioManager,
    assetLoader: AssetLoader,
  ) {
    super();

    this.app = app;
    this.eventBus = eventBus;
    this.inputManager = inputManager;
    this.audioManager = audioManager;
    this.assetLoader = assetLoader;

    this.name = this.getSceneName();
    this.sortableChildren = true;
    this.visible = false;
  }

  /**
   * Установка ссылки на SceneManager (вызывается SceneManager'ом)
   */
  public setSceneManager(sceneManager: SceneManager): void {
    this.sceneManager = sceneManager;
  }

  protected abstract getSceneName(): SceneName;

  public async init(params: Record<string, unknown> = {}): Promise<void> {
    this.params = params;
    await this.preload();
    this.setup();
    this.bindEvents();
  }

  public async enter(): Promise<void> {
    this._isActive = true;
    this.visible = true;
    await this.onEnter();
  }

  protected abstract preload(): Promise<void>;
  protected abstract setup(): void;
  protected abstract bindEvents(): void;
  protected abstract onEnter(): Promise<void> | void;
  public abstract update(delta: number): void;

  public onPause(): void {
    this._isPaused = true;
  }

  public onResume(): void {
    this._isPaused = false;
  }

  public async cleanup(): Promise<void> {
    this._isActive = false;
    this.visible = false;
    this.unbindEvents();
    this.removeChildren();
    this.onCleanup();
  }

  protected onCleanup(): void {
    // Переопределяется при необходимости
  }

  protected unbindEvents(): void {
    // Переопределяется при необходимости
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected async fadeIn(duration: number = 500): Promise<void> {
    this.alpha = 0;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        this.alpha = eased;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      animate();
    });
  }

  protected async fadeOut(duration: number = 500): Promise<void> {
    this.alpha = 1;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = Math.pow(progress, 3);
        this.alpha = 1 - eased;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      animate();
    });
  }

  get isActive(): boolean {
    return this._isActive;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }
}
