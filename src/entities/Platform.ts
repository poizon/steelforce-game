import { Container, Graphics } from "pixi.js";
import type { CollisionRect } from "./Player";

export type PlatformType = "normal" | "finish";

export interface PlatformConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  type?: PlatformType;
}

/**
 * Статичная платформа. Графика — Graphics-заглушка (прямоугольник),
 * замените на Sprite, когда появятся ассеты в манифесте.
 */
export class Platform {
  public readonly view: Container;
  public readonly x: number;
  public readonly y: number;
  public readonly width: number;
  public readonly height: number;
  public readonly type: PlatformType;

  constructor(config: PlatformConfig) {
    this.x = config.x;
    this.y = config.y;
    this.width = config.width;
    this.height = config.height;
    this.type = config.type ?? "normal";

    this.view = new Container();
    this.view.x = this.x;
    this.view.y = this.y;

    const body = new Graphics();
    const fillColor = this.type === "finish" ? 0xf59e0b : 0x475569;
    const topColor = this.type === "finish" ? 0xfbbf24 : 0x64748b;

    body.rect(0, 0, this.width, this.height);
    body.fill({ color: fillColor });

    // Декоративная светлая кромка сверху
    body.rect(0, 0, this.width, Math.min(6, this.height));
    body.fill({ color: topColor });

    this.view.addChild(body);

    if (this.type === "finish") {
      this.view.addChild(this.createFlag());
    }
  }

  private createFlag(): Graphics {
    const flag = new Graphics();
    const poleHeight = 46;

    flag.rect(this.width / 2 - 2, -poleHeight, 4, poleHeight);
    flag.fill({ color: 0x1e293b });

    flag.moveTo(this.width / 2 + 2, -poleHeight);
    flag.lineTo(this.width / 2 + 26, -poleHeight + 10);
    flag.lineTo(this.width / 2 + 2, -poleHeight + 20);
    flag.closePath();
    flag.fill({ color: 0xef4444 });

    return flag;
  }

  public getBounds(): CollisionRect {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  public destroy(): void {
    this.view.destroy({ children: true });
  }
}
