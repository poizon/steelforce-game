// src/entities/MutatedWorker.ts (упрощённая версия)
import { Container, Graphics, AnimatedSprite, Texture } from "pixi.js";
import { EventBus } from "../core/EventBus";
import { GameEvent } from "../core/EventBus";
import type { Player } from "./Player";

export class MutatedWorker extends Container {
  private eventBus: EventBus;
  private player: Player;
  private sprite!: AnimatedSprite;
  private _isAlive: boolean = true;
  private health: number = 80;
  private speed: number = 2;
  private attackCooldown: number = 0;
  private state: "idle" | "chase" | "attack" = "idle";
  private detectionRadius: number = 250;
  private attackRange: number = 45;
  private damage: number = 15;

  constructor(eventBus: EventBus, player: Player) {
    super();
    this.eventBus = eventBus;
    this.player = player;
    this.setup();
  }

  private setup(): void {
    // Создание спрайта мутанта (заглушка)
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;

    // Мутировавшее тело (зелёное, искажённое)
    ctx.fillStyle = "#44aa44";
    ctx.fillRect(10, 18, 28, 30);

    // Наросты
    ctx.fillStyle = "#88ff00";
    ctx.fillRect(8, 20, 5, 8);
    ctx.fillRect(35, 25, 6, 10);
    ctx.fillRect(18, 45, 4, 6);

    // Голова (увеличенная)
    ctx.fillStyle = "#66bb66";
    ctx.fillRect(12, 2, 24, 20);

    // Светящиеся глаза
    ctx.fillStyle = "#ffff00";
    ctx.fillRect(14, 7, 6, 4);
    ctx.fillRect(28, 7, 6, 4);

    // Щупальца
    ctx.fillStyle = "#88ff00";
    ctx.fillRect(4, 22, 8, 3);
    ctx.fillRect(36, 22, 8, 3);

    const texture = Texture.from(canvas);
    this.sprite = new AnimatedSprite([texture]);
    this.sprite.anchor.set(0.5);
    this.sprite.animationSpeed = 0.1;
    this.sprite.play();
    this.addChild(this.sprite);
  }

  public update(delta: number): void {
    if (!this._isAlive) return;

    const playerPos = this.player.getPosition();
    const dx = playerPos.x - this.x;
    const dy = playerPos.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < this.detectionRadius) {
      this.state = "chase";

      if (distance < this.attackRange) {
        this.state = "attack";
      }
    } else {
      this.state = "idle";
    }

    switch (this.state) {
      case "chase":
        this.x += (dx / distance) * this.speed;
        this.y += (dy / distance) * this.speed;
        this.sprite.scale.x = dx > 0 ? 1 : -1;
        break;

      case "attack":
        this.attackCooldown -= delta;
        if (this.attackCooldown <= 0) {
          this.attackCooldown = 60;
          this.player.takeDamage(this.damage, "mutant");

          this.eventBus.emit(GameEvent.MONSTER_ATTACK, {
            id: `mutant_${Date.now()}`,
            targetId: "player",
            damage: this.damage,
          });
        }
        break;
    }
  }

  public takeDamage(amount: number, source?: string): void {
    if (!this._isAlive) return;

    this.health -= amount;

    this.eventBus.emit(GameEvent.MONSTER_DAMAGE, {
      id: `mutant_${Date.now()}`,
      amount,
      currentHealth: this.health,
    });

    if (this.health <= 0) {
      this.die();
    }
  }

  private die(): void {
    this._isAlive = false;

    this.eventBus.emit(GameEvent.MONSTER_DEATH, {
      id: `mutant_${Date.now()}`,
      type: "mutated_worker",
      position: { x: this.x, y: this.y },
    });

    setTimeout(() => {
      this.eventBus.emit(GameEvent.MONSTER_DESTROY, {
        id: `mutant_${Date.now()}`,
      });
      this.destroy({ children: true });
    }, 2000);
  }

  public canAttack(): boolean {
    return this._isAlive && this.state === "attack" && this.attackCooldown <= 0;
  }

  public setPosition(x: number, y: number): void {
    this.position.set(x, y);
  }

  get isAlive(): boolean {
    return this._isAlive;
  }
}
