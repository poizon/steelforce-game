import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { BaseScene } from "./BaseScene";
import type { SceneName } from "../core/SceneManager";
import { GameEvent } from "../core/EventBus";
import { GAME_WIDTH, GAME_HEIGHT } from "../utils/constants";
import { Player } from "../entities/Player";
import { Platform, type PlatformConfig } from "../entities/Platform";

/** Y-координата "земли" (верх стартовой платформы) */
const GROUND_Y = GAME_HEIGHT - 80;
/** Насколько ниже экрана падение считается смертью */
const FALL_DEATH_MARGIN = 150;
/** Общая ширина уровня (для камеры и фона) */
const LEVEL_WIDTH = 3200;
/** Следующая сцена после прохождения уровня */
const NEXT_SCENE: SceneName = "elevator";

const LEVEL_LAYOUT: PlatformConfig[] = [
  { x: 0, y: GROUND_Y, width: 260, height: 40 },
  { x: 340, y: GROUND_Y - 40, width: 140, height: 24 },
  { x: 560, y: GROUND_Y - 100, width: 120, height: 24 },
  { x: 760, y: GROUND_Y - 40, width: 160, height: 24 },
  { x: 1010, y: GROUND_Y - 130, width: 110, height: 24 },
  { x: 1210, y: GROUND_Y - 60, width: 110, height: 24 },
  { x: 1400, y: GROUND_Y - 160, width: 110, height: 24 },
  { x: 1600, y: GROUND_Y - 60, width: 200, height: 24 },
  { x: 1900, y: GROUND_Y - 120, width: 100, height: 24 },
  { x: 2080, y: GROUND_Y - 200, width: 100, height: 24 },
  { x: 2260, y: GROUND_Y - 120, width: 100, height: 24 },
  { x: 2460, y: GROUND_Y - 60, width: 160, height: 24 },
  { x: 2720, y: GROUND_Y - 140, width: 130, height: 24 },
  { x: 2960, y: GROUND_Y - 80, width: 220, height: 40, type: "finish" },
];

export class PlatformScene extends BaseScene {
  private worldContainer!: Container;
  private uiContainer!: Container;
  private hudText!: Text;

  private player!: Player;
  private platforms: Platform[] = [];
  private readonly startPosition = { x: 60, y: GROUND_Y };

  private isLevelComplete = false;
  private isGameOver = false;

  private readonly inputUnsubscribes: Array<() => void> = [];

  protected getSceneName(): SceneName {
    return "platform";
  }

  protected async preload(): Promise<void> {
    // Визуал сцены сейчас на Graphics-заглушках (см. Player/Platform),
    // спрайты из assetLoader не требуются. Когда появятся ассеты в
    // manifest ("platform" bundle в main.ts сейчас закомментирован),
    // здесь можно дождаться их: await this.assetLoader.preloadScene("platform")
    // (или снять комментарий с бандла в main.ts, он грузится вместе с common).
  }

  protected setup(): void {
    this.isLevelComplete = false;
    this.isGameOver = false;
    this.platforms = [];

    this.worldContainer = new Container();
    this.uiContainer = new Container();
    this.addChild(this.worldContainer, this.uiContainer);

    this.buildBackground();
    this.buildLevel();
    this.buildPlayer();
    this.buildHud();
  }

  protected bindEvents(): void {
    // Рестарт уровня по R — отдельно от глобального Ctrl+R в main.ts
    const unsubRestart = this.inputManager.onKeyDown("KeyR", () => {
      if (!this.isGameOver && !this.isLevelComplete) {
        this.resetPlayer();
      }
    });
    this.inputUnsubscribes.push(unsubRestart);
  }

  protected onEnter(): void {
    try {
      this.audioManager.playMusic("gameplay-music", { loop: true, volume: 0.4 });
    } catch (error) {
      console.warn("[PlatformScene] Не удалось запустить музыку уровня:", error);
    }
  }

  public update(delta: number): void {
    if (this.isGameOver || this.isLevelComplete) return;

    const platformBounds = this.platforms.map((p) => p.getBounds());
    this.player.update(delta, platformBounds);

    this.updateCamera();
    this.checkFinish();
    this.checkFall();
  }

  protected unbindEvents(): void {
    for (const unsubscribe of this.inputUnsubscribes) unsubscribe();
    this.inputUnsubscribes.length = 0;
  }

  protected onCleanup(): void {
    this.player?.destroy();

    for (const platform of this.platforms) platform.destroy();
    this.platforms = [];

    // removeChildren() в BaseScene.cleanup() уже отсоединил worldContainer/
    // uiContainer от сцены — здесь освобождаем их собственные ресурсы
    // (фон, HUD-текст и т.д.), которые ещё не были уничтожены выше.
    this.worldContainer?.destroy({ children: true });
    this.uiContainer?.destroy({ children: true });
  }

  // ---- Построение сцены ----

  private buildBackground(): void {
    const bg = new Graphics();
    bg.rect(0, 0, LEVEL_WIDTH, GAME_HEIGHT);
    bg.fill({ color: 0x1e293b });
    this.worldContainer.addChildAt(bg, 0);

    // Простые "облака"-заглушки для ощущения глубины при движении камеры
    for (let i = 0; i < 14; i++) {
      const cloud = new Graphics();
      cloud.circle(0, 0, 26);
      cloud.circle(28, -8, 20);
      cloud.circle(-26, -6, 18);
      cloud.fill({ color: 0x334155, alpha: 0.6 });
      cloud.x = i * 260 + 80;
      cloud.y = 60 + (i % 3) * 40;
      this.worldContainer.addChildAt(cloud, 1);
    }
  }

  private buildLevel(): void {
    this.platforms = LEVEL_LAYOUT.map((config) => new Platform(config));
    for (const platform of this.platforms) {
      this.worldContainer.addChild(platform.view);
    }
  }

  private buildPlayer(): void {
    this.player = new Player(this.inputManager, this.startPosition.x, this.startPosition.y);
    this.worldContainer.addChild(this.player.view);
  }

  private buildHud(): void {
    const style = new TextStyle({
      fontFamily: ["font-main", "monospace"],
      fontSize: 14,
      fill: 0xf1f5f9,
    });

    this.hudText = new Text({
      text: "Стрелки/A-D — движение, Space — прыжок, R — заново",
      style,
    });
    this.hudText.x = 16;
    this.hudText.y = 12;
    this.uiContainer.addChild(this.hudText);
  }

  // ---- Игровой цикл ----

  private updateCamera(): void {
    const halfWidth = GAME_WIDTH / 2;
    const targetX = -(this.player.view.x - halfWidth);
    const minX = -(LEVEL_WIDTH - GAME_WIDTH);
    const maxX = 0;

    this.worldContainer.x = Math.max(minX, Math.min(maxX, targetX));
  }

  private checkFinish(): void {
    const finish = this.platforms.find((p) => p.type === "finish");
    if (!finish || !this.player.isGrounded) return;

    const bounds = this.player.getBounds();
    const finishBounds = finish.getBounds();

    const overlaps =
      bounds.x < finishBounds.x + finishBounds.width &&
      bounds.x + bounds.width > finishBounds.x &&
      bounds.y < finishBounds.y + finishBounds.height &&
      bounds.y + bounds.height > finishBounds.y;

    if (overlaps) {
      this.completeLevel();
    }
  }

  private checkFall(): void {
    if (this.player.view.y > GAME_HEIGHT + FALL_DEATH_MARGIN) {
      this.triggerGameOver("fall");
    }
  }

  // ---- Состояния уровня ----

  private completeLevel(): void {
    if (this.isLevelComplete) return;
    this.isLevelComplete = true;
    this.player.isDead = true;

    this.sceneManager.switchTo(NEXT_SCENE).catch((error) => {
      console.error(`[PlatformScene] Не удалось переключиться на "${NEXT_SCENE}":`, error);
    });
  }

  private triggerGameOver(reason: string): void {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.player.isDead = true;

    this.eventBus.emit(GameEvent.GAME_OVER, { reason });
  }

  private resetPlayer(): void {
    this.player.reset(this.startPosition.x, this.startPosition.y);
  }
}
