import { Container, Graphics } from "pixi.js";
import { InputManager } from "../core/InputManager";
import { PLAYER_SPEED } from "../utils/constants";

/**
 * Физические константы прыжковой механики.
 * PLAYER_SPEED берём из utils/constants.ts, остальное — параметры фила
 * прыжка/гравитации, подбирайте под свой вкус.
 */
const ACCELERATION = 0.6;
const FRICTION = 0.75; // множитель затухания vx за "тик" при отсутствии ввода
const AIR_CONTROL = 0.6; // доля ACCELERATION, доступная в воздухе
const GRAVITY = 0.55;
const MAX_FALL_SPEED = 14;
const JUMP_FORCE = 11.5;
const COYOTE_TIME_FRAMES = 6; // сколько "тиков" после схода с платформы ещё можно прыгнуть
const JUMP_BUFFER_FRAMES = 6; // сколько "тиков" помнить нажатие прыжка до приземления

export interface CollisionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Игрок для платформенной сцены.
 * Позиция (view.x, view.y) — нижняя середина хитбокса (точка "ног"),
 * это удобно для приземления: при коллизии сверху платформы
 * достаточно поставить view.y = platform.y.
 */
export class Player {
  public readonly view: Container;
  public vx = 0;
  public vy = 0;
  public width = 28;
  public height = 40;
  public isGrounded = false;
  public isDead = false;

  private readonly body: Graphics;
  private readonly inputManager: InputManager;
  private readonly unsubscribeJump: () => void;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private facing: 1 | -1 = 1;

  constructor(inputManager: InputManager, x: number, y: number) {
    this.inputManager = inputManager;

    this.view = new Container();
    this.view.x = x;
    this.view.y = y;

    this.body = new Graphics();
    this.view.addChild(this.body);
    this.drawBody();

    // Прыжок обрабатываем через onKeyDown-коллбэк, а НЕ через isKeyPressed().
    // Причина: в main.ts вызов идёт как
    //   this.inputManager.update();       // сбрасывает "нажатия этого кадра"
    //   this.sceneManager.update(deltaTime);
    // т.е. update() чистит keysPressed ДО того, как сцена успевает его
    // прочитать — isKeyPressed("Space") внутри сцены всегда будет false.
    // onKeyDown же триггерится непосредственно в момент события клавиатуры,
    // так что это надёжный способ поймать нажатие прыжка.
    this.unsubscribeJump = this.inputManager.onKeyDown("Space", () => {
      this.jumpBufferTimer = JUMP_BUFFER_FRAMES;
    });
  }

  private drawBody(): void {
    this.body.clear();

    this.body.roundRect(-this.width / 2, -this.height, this.width, this.height, 4);
    this.body.fill({ color: 0x4fd1c5 });
    this.body.stroke({ width: 2, color: 0x0f766e });

    // Простой "глаз", чтобы было видно направление движения
    const eyeOffsetX = this.facing === 1 ? this.width / 2 - 10 : -this.width / 2 + 6;
    this.body.rect(eyeOffsetX, -this.height + 10, 4, 4);
    this.body.fill({ color: 0x0f172a });
  }

  /**
   * @param deltaTime - значение из ticker (тики, ~1.0 при 60 FPS)
   * @param platforms - AABB всех платформ уровня в мировых координатах
   */
  public update(deltaTime: number, platforms: CollisionRect[]): void {
    if (this.isDead) return;

    this.handleInput(deltaTime);
    this.applyGravity(deltaTime);

    // Сбрасываем флаг приземления — он будет выставлен в moveAxis("y", ...),
    // если в этом кадре произошла коллизия снизу.
    this.isGrounded = false;

    this.moveAxis("x", this.vx * deltaTime, platforms);
    this.moveAxis("y", this.vy * deltaTime, platforms);

    this.updateTimers(deltaTime);
  }

  private handleInput(deltaTime: number): void {
    const left = this.inputManager.isAnyKeyDown("ArrowLeft", "KeyA");
    const right = this.inputManager.isAnyKeyDown("ArrowRight", "KeyD");

    const accel = ACCELERATION * (this.isGrounded ? 1 : AIR_CONTROL);

    if (left && !right) {
      this.vx -= accel * deltaTime;
      this.facing = -1;
    } else if (right && !left) {
      this.vx += accel * deltaTime;
      this.facing = 1;
    } else {
      this.vx *= Math.pow(FRICTION, deltaTime);
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    }

    this.vx = Math.max(-PLAYER_SPEED * 1.4, Math.min(PLAYER_SPEED * 1.4, this.vx));

    const canJump = this.isGrounded || this.coyoteTimer > 0;
    if (this.jumpBufferTimer > 0 && canJump) {
      this.vy = -JUMP_FORCE;
      this.isGrounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
    }

    this.drawBody();
  }

  private applyGravity(deltaTime: number): void {
    this.vy = Math.min(this.vy + GRAVITY * deltaTime, MAX_FALL_SPEED);
  }

  private moveAxis(axis: "x" | "y", delta: number, platforms: CollisionRect[]): void {
    if (delta === 0 && axis === "x") return;

    if (axis === "x") {
      this.view.x += delta;
    } else {
      this.view.y += delta;
    }

    for (const platform of platforms) {
      const bounds = this.getBounds();
      if (!this.intersects(bounds, platform)) continue;

      if (axis === "x") {
        if (delta > 0) {
          this.view.x = platform.x - this.width / 2;
        } else if (delta < 0) {
          this.view.x = platform.x + platform.width + this.width / 2;
        }
        this.vx = 0;
      } else {
        if (delta > 0) {
          // падаем — приземляемся на платформу
          this.view.y = platform.y;
          this.vy = 0;
          this.isGrounded = true;
          this.coyoteTimer = COYOTE_TIME_FRAMES;
        } else if (delta < 0) {
          // ударились головой снизу о платформу
          this.view.y = platform.y + platform.height + this.height;
          this.vy = 0;
        }
      }
    }
  }

  private updateTimers(deltaTime: number): void {
    if (!this.isGrounded && this.coyoteTimer > 0) {
      this.coyoteTimer -= deltaTime;
    }
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer -= deltaTime;
    }
  }

  private intersects(a: CollisionRect, b: CollisionRect): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  public getBounds(): CollisionRect {
    return {
      x: this.view.x - this.width / 2,
      y: this.view.y - this.height,
      width: this.width,
      height: this.height,
    };
  }

  public reset(x: number, y: number): void {
    this.view.x = x;
    this.view.y = y;
    this.vx = 0;
    this.vy = 0;
    this.isGrounded = false;
    this.isDead = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
  }

  public destroy(): void {
    this.unsubscribeJump();
    this.view.destroy({ children: true });
  }
}
