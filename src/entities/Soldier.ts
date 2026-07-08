// src/entities/Soldier.ts
import * as pixiJs from "pixi.js";
import { EventBus } from "../core/EventBus";

export type SoldierType = "sergeant" | "private";

export class Soldier extends pixiJs.Container {
  private eventBus: EventBus;
  private soldierType: SoldierType;
  private graphics: pixiJs.Graphics;
  private weaponGraphics: pixiJs.Graphics;

  constructor(eventBus: EventBus, type: SoldierType = "private") {
    super();
    this.eventBus = eventBus;
    this.soldierType = type;
    this.setup();
  }

  private setup(): void {
    this.graphics = new pixiJs.Graphics();

    // Униформа
    const uniformColor = this.soldierType === "sergeant" ? 0x445544 : 0x334433;

    // Тело
    this.graphics.rect(-8, 0, 16, 25);
    this.graphics.fill({ color: uniformColor });
    this.graphics.stroke({ width: 1, color: 0x556655 });

    // Голова
    this.graphics.circle(0, -8, 8);
    this.graphics.fill({ color: 0xccaa88 });

    // Каска
    this.graphics.arc(0, -6, 10, Math.PI, 0);
    this.graphics.fill({ color: 0x556655 });

    // Очки (у сержанта)
    if (this.soldierType === "sergeant") {
      this.graphics.rect(-5, -9, 4, 3);
      this.graphics.fill({ color: 0x000000 });
      this.graphics.rect(1, -9, 4, 3);
      this.graphics.fill({ color: 0x000000 });
    }

    // Ноги
    this.graphics.rect(-6, 25, 5, 15);
    this.graphics.fill({ color: 0x333333 });
    this.graphics.rect(1, 25, 5, 15);
    this.graphics.fill({ color: 0x333333 });

    // Бронежилет
    this.graphics.rect(-7, 5, 14, 15);
    this.graphics.fill({ color: 0x444444, alpha: 0.5 });
    this.graphics.stroke({ width: 1, color: 0x555555 });

    this.addChild(this.graphics);

    // Оружие
    this.weaponGraphics = new pixiJs.Graphics();
    this.weaponGraphics.rect(-2, 10, 3, 15);
    this.weaponGraphics.fill({ color: 0x333333 });
    this.weaponGraphics.rect(-3, 10, 5, 2);
    this.weaponGraphics.fill({ color: 0x444444 });
    this.weaponGraphics.position.set(10, 0);
    this.addChild(this.weaponGraphics);

    // Нашивка сержанта
    if (this.soldierType === "sergeant") {
      const stripes = new pixiJs.Graphics();
      stripes.moveTo(-5, 8);
      stripes.lineTo(5, 8);
      stripes.stroke({ width: 1, color: 0xffaa00 });
      stripes.moveTo(-5, 11);
      stripes.lineTo(5, 11);
      stripes.stroke({ width: 1, color: 0xffaa00 });
      stripes.moveTo(-5, 14);
      stripes.lineTo(5, 14);
      stripes.stroke({ width: 1, color: 0xffaa00 });
      this.addChild(stripes);
    }
  }

  public update(_delta: number): void {
    // Простая анимация дыхания
    this.graphics.y = Math.sin(Date.now() * 0.003) * 0.5;
  }

  public setPosition(x: number, y: number): void {
    this.position.set(x, y);
  }
}
