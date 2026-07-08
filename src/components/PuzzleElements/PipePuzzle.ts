import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { EventBus } from "../../core/EventBus";
import { GameEvent } from "../../core/EventBus";

export interface PuzzleNode {
  id: string;
  x: number;
  y: number;
  type: "start" | "end" | "junction" | "valve";
  connections: string[];
  isActive: boolean;
}

interface PipeConnection {
  from: string;
  to: string;
  isActive: boolean;
  isSelected: boolean;
  graphics: Graphics;
  flowGraphics: Graphics;
}

export class PipePuzzle extends Container {
  private readonly eventBus: EventBus;

  // Данные головоломки
  private nodes: PuzzleNode[] = [];
  private connections: PipeConnection[] = [];
  private selectedConnection: PipeConnection | null = null;

  // Визуальные элементы
  private background!: Graphics;
  private titleText!: Text;
  private instructionText!: Text;
  private nodeGraphics: Map<string, Graphics> = new Map();
  private flowAnimations: Map<string, number> = new Map();

  // Состояния
  private isPuzzleActive: boolean = false;
  private isPuzzleComplete: boolean = false;
  private isValidating: boolean = false;
  private moveCount: number = 0;
  private maxMoves: number = 10;

  // Конфигурация стилей
  private readonly colors = {
    background: 0x000000,
    border: 0x00ff00,
    node: {
      start: 0x00ff00,
      end: 0xff0000,
      junction: 0xffff00,
      valve: 0x0088ff,
      inactive: 0x444444,
    },
    pipe: {
      active: 0x00ff00,
      inactive: 0x333333,
      selected: 0xffff00,
      flow: 0x00ff88,
    },
    text: {
      primary: 0x00ff00,
      secondary: 0x888888,
      warning: 0xff0000,
      success: 0x00ff00,
    },
  };

  // Размеры
  private readonly gridSize: number = 80;
  private readonly nodeRadius: number = 20;
  private readonly pipeWidth: number = 4;

  constructor(eventBus: EventBus, nodes: PuzzleNode[]) {
    super();

    this.eventBus = eventBus;
    this.nodes = nodes;

    this.setup();
    this.createPuzzle();
  }

  /**
   * Начальная настройка
   */
  private setup(): void {
    // Фон
    this.background = new Graphics();
    this.background.roundRect(0, 0, 800, 500, 10);
    this.background.fill({ color: this.colors.background, alpha: 0.95 });
    this.background.stroke({ width: 2, color: this.colors.border });
    this.addChild(this.background);

    // Заголовок
    this.titleText = new Text({
      text: "СХЕМА ТРУБОПРОВОДА",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 18,
        fill: this.colors.text.primary,
        letterSpacing: 3,
      }),
    });
    this.titleText.position.set(200, 15);
    this.addChild(this.titleText);

    // Инструкция
    this.instructionText = new Text({
      text: "Проведите маршрут от начала до конца,\nперекрывая ненужные трубы",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 10,
        fill: this.colors.text.secondary,
        align: "center",
        lineHeight: 16,
      }),
    });
    this.instructionText.position.set(150, 60);
    this.addChild(this.instructionText);

    // Интерактивность
    this.eventMode = "static";
    this.on("pointerdown", this.onClick.bind(this));
  }

  /**
   * Создание головоломки
   */
  private createPuzzle(): void {
    // Создаём соединения между узлами
    this.createConnections();

    // Создаём визуальные элементы узлов
    this.createNodeGraphics();

    // Создаём визуальные элементы труб
    this.createPipeGraphics();

    // Создаём легенду
    this.createLegend();

    // Создаём счётчик ходов
    this.createMoveCounter();

    // Создаём кнопки управления
    this.createControlButtons();
  }

  /**
   * Создание соединений
   */
  private createConnections(): void {
    const connectionSet = new Set<string>();

    this.nodes.forEach((node) => {
      node.connections.forEach((connectedId) => {
        // Избегаем дублирования соединений
        const connKey = [node.id, connectedId].sort().join("-");

        if (!connectionSet.has(connKey)) {
          connectionSet.add(connKey);

          const targetNode = this.nodes.find((n) => n.id === connectedId);
          if (!targetNode) return;

          this.connections.push({
            from: node.id,
            to: connectedId,
            isActive: node.isActive && targetNode.isActive,
            isSelected: false,
            graphics: new Graphics(),
            flowGraphics: new Graphics(),
          });
        }
      });
    });
  }

  /**
   * Создание графики узлов
   */
  private createNodeGraphics(): void {
    this.nodes.forEach((node) => {
      const graphics = new Graphics();

      // Основной круг узла
      graphics.circle(0, 0, this.nodeRadius);

      switch (node.type) {
        case "start":
          graphics.fill({ color: this.colors.node.start, alpha: 0.8 });
          graphics.stroke({ width: 2, color: 0x00cc00 });
          break;
        case "end":
          graphics.fill({ color: this.colors.node.end, alpha: 0.8 });
          graphics.stroke({ width: 2, color: 0xcc0000 });
          break;
        case "junction":
          graphics.fill({ color: this.colors.node.junction, alpha: 0.8 });
          graphics.stroke({ width: 2, color: 0xcccc00 });
          break;
        case "valve":
          graphics.fill({ color: this.colors.node.valve, alpha: 0.8 });
          graphics.stroke({ width: 2, color: 0x0066cc });
          break;
      }

      // Если неактивен - затемняем
      if (!node.isActive && node.type !== "start" && node.type !== "end") {
        graphics.tint = 0x444444;
      }

      // Внутренний круг
      graphics.circle(0, 0, this.nodeRadius * 0.5);
      graphics.fill({ color: 0x000000, alpha: 0.5 });

      // Метка узла
      const label = new Text({
        text:
          node.type === "start"
            ? "▶"
            : node.type === "end"
              ? "🏁"
              : node.type === "valve"
                ? "⚙"
                : "●",
        style: new TextStyle({
          fontFamily: "Press Start 2P",
          fontSize: 12,
          fill: 0xffffff,
        }),
      });
      label.anchor.set(0.5);
      graphics.addChild(label);

      graphics.position.set(node.x, node.y);
      graphics.eventMode = "static";
      graphics.cursor = "pointer";

      // Сохраняем id узла в graphics
      (graphics as any).nodeId = node.id;

      graphics.on("pointerover", () => {
        if (node.type === "valve") {
          graphics.scale.set(1.1);
        }
      });

      graphics.on("pointerout", () => {
        graphics.scale.set(1);
      });

      this.nodeGraphics.set(node.id, graphics);
      this.addChild(graphics);
    });
  }

  /**
   * Создание графики труб
   */
  private createPipeGraphics(): void {
    this.connections.forEach((connection) => {
      const fromNode = this.nodes.find((n) => n.id === connection.from);
      const toNode = this.nodes.find((n) => n.id === connection.to);

      if (!fromNode || !toNode) return;

      // Основная труба
      this.drawPipe(connection.graphics, fromNode, toNode, this.pipeWidth);
      connection.graphics.eventMode = "static";
      connection.graphics.cursor = "pointer";

      // Сохраняем данные соединения
      (connection.graphics as any).connectionFrom = connection.from;
      (connection.graphics as any).connectionTo = connection.to;

      connection.graphics.on("pointerover", () => {
        if (!this.isPuzzleComplete) {
          this.highlightConnection(connection);
        }
      });

      connection.graphics.on("pointerout", () => {
        if (connection !== this.selectedConnection) {
          this.unhighlightConnection(connection);
        }
      });

      connection.graphics.on("pointerdown", () => {
        this.toggleConnection(connection);
      });

      // Труба с потоком (анимированная)
      this.drawPipe(
        connection.flowGraphics,
        fromNode,
        toNode,
        this.pipeWidth - 2,
      );
      connection.flowGraphics.visible = false;

      this.addChild(connection.graphics);
      this.addChild(connection.flowGraphics);

      this.updatePipeAppearance(connection);
    });
  }

  /**
   * Отрисовка трубы между узлами
   */
  private drawPipe(
    graphics: Graphics,
    from: PuzzleNode,
    to: PuzzleNode,
    width: number,
  ): void {
    graphics.clear();

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    // const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    // Смещение от центра узла
    const offsetX = Math.cos(angle) * this.nodeRadius;
    const offsetY = Math.sin(angle) * this.nodeRadius;

    // Рисуем трубу
    graphics.moveTo(from.x + offsetX, from.y + offsetY);
    graphics.lineTo(to.x - offsetX, to.y - offsetY);
    graphics.stroke({ width, color: this.colors.pipe.inactive });

    // Добавляем соединительные круги на концах
    graphics.circle(from.x + offsetX, from.y + offsetY, width);
    graphics.fill({ color: this.colors.pipe.inactive });

    graphics.circle(to.x - offsetX, to.y - offsetY, width);
    graphics.fill({ color: this.colors.pipe.inactive });

    // Добавляем маркеры направления (маленькие треугольники)
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;

    graphics.moveTo(midX, midY);
    graphics.lineTo(
      midX + Math.cos(angle + 2.5) * 8,
      midY + Math.sin(angle + 2.5) * 8,
    );
    graphics.lineTo(
      midX + Math.cos(angle - 2.5) * 8,
      midY + Math.sin(angle - 2.5) * 8,
    );
    graphics.closePath();
    graphics.fill({ color: this.colors.pipe.inactive });
  }

  /**
   * Обновление внешнего вида трубы
   */
  private updatePipeAppearance(connection: PipeConnection): void {
    const color = connection.isActive
      ? connection.isSelected
        ? this.colors.pipe.selected
        : this.colors.pipe.active
      : this.colors.pipe.inactive;

    const width = connection.isSelected ? this.pipeWidth + 2 : this.pipeWidth;

    const fromNode = this.nodes.find((n) => n.id === connection.from);
    const toNode = this.nodes.find((n) => n.id === connection.to);

    if (!fromNode || !toNode) return;

    // Перерисовываем трубу
    connection.graphics.clear();
    this.drawPipe(connection.graphics, fromNode, toNode, width);

    // Применяем цвет
    connection.graphics.tint = color;

    // Анимация потока для активных труб
    if (connection.isActive) {
      this.startFlowAnimation(connection);
    } else {
      this.stopFlowAnimation(connection);
    }
  }

  /**
   * Подсветка соединения
   */
  private highlightConnection(connection: PipeConnection): void {
    connection.graphics.alpha = 0.8;
    connection.graphics.scale.set(1.05);
  }

  /**
   * Снятие подсветки
   */
  private unhighlightConnection(connection: PipeConnection): void {
    connection.graphics.alpha = 1;
    connection.graphics.scale.set(1);
  }

  /**
   * Переключение состояния соединения
   */
  private toggleConnection(connection: PipeConnection): void {
    if (this.isPuzzleComplete || this.isValidating) return;

    // Проверяем, можно ли переключить это соединение
    const fromNode = this.nodes.find((n) => n.id === connection.from);
    const toNode = this.nodes.find((n) => n.id === connection.to);

    if (!fromNode || !toNode) return;

    // Нельзя отключить соединения от start и end
    if (fromNode.type === "start" || toNode.type === "end") {
      if (fromNode.type === "start" || toNode.type === "start") {
        return; // Нельзя отключить от start
      }
    }

    // Переключаем состояние
    connection.isActive = !connection.isActive;

    // Обновляем узлы
    fromNode.isActive = connection.isActive;
    toNode.isActive = connection.isActive;

    // Обновляем все связанные соединения
    this.updateConnectedPipes(connection.from);
    this.updateConnectedPipes(connection.to);

    // Обновляем внешний вид
    this.updatePipeAppearance(connection);
    this.updateNodeAppearance(fromNode);
    this.updateNodeAppearance(toNode);

    // Увеличиваем счётчик ходов
    this.moveCount++;
    this.updateMoveCounter();

    // Звук переключения
    // this.audioManager.playSFX('pipe-toggle', { volume: 0.3 });

    // Проверяем решение
    this.validateSolution();

    // Проверяем лимит ходов
    if (this.moveCount >= this.maxMoves) {
      this.onMaxMovesReached();
    }
  }

  /**
   * Обновление связанных труб
   */
  private updateConnectedPipes(nodeId: string): void {
    this.connections.forEach((connection) => {
      if (connection.from === nodeId || connection.to === nodeId) {
        const fromNode = this.nodes.find((n) => n.id === connection.from);
        const toNode = this.nodes.find((n) => n.id === connection.to);

        if (fromNode && toNode) {
          connection.isActive = fromNode.isActive && toNode.isActive;
          this.updatePipeAppearance(connection);
        }
      }
    });
  }

  /**
   * Обновление внешнего вида узла
   */
  private updateNodeAppearance(node: PuzzleNode): void {
    const graphics = this.nodeGraphics.get(node.id);
    if (!graphics) return;

    if (node.isActive) {
      switch (node.type) {
        case "start":
          graphics.tint = this.colors.node.start;
          break;
        case "end":
          graphics.tint = this.colors.node.end;
          break;
        case "junction":
          graphics.tint = this.colors.node.junction;
          break;
        case "valve":
          graphics.tint = this.colors.node.valve;
          break;
      }
    } else {
      graphics.tint = this.colors.node.inactive;
    }
  }

  /**
   * Запуск анимации потока
   */
  private startFlowAnimation(connection: PipeConnection): void {
    connection.flowGraphics.visible = true;

    // Анимация будет обновляться в update
    this.flowAnimations.set(`${connection.from}-${connection.to}`, 0);
  }

  /**
   * Остановка анимации потока
   */
  private stopFlowAnimation(connection: PipeConnection): void {
    connection.flowGraphics.visible = false;
    this.flowAnimations.delete(`${connection.from}-${connection.to}`);
  }

  /**
   * Проверка решения
   */
  private validateSolution(): void {
    this.isValidating = true;

    // BFS от start к end
    const visited = new Set<string>();
    const queue: string[] = ["start"];
    let pathFound = false;
    const path: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current === "end") {
        pathFound = true;
        break;
      }

      if (visited.has(current)) continue;
      visited.add(current);
      path.push(current);

      const node = this.nodes.find((n) => n.id === current);
      if (!node || !node.isActive) continue;

      // Проверяем все соединения
      this.connections.forEach((connection) => {
        if (connection.from === current && connection.isActive) {
          if (!visited.has(connection.to)) {
            queue.push(connection.to);
          }
        } else if (connection.to === current && connection.isActive) {
          if (!visited.has(connection.from)) {
            queue.push(connection.from);
          }
        }
      });
    }

    if (pathFound) {
      this.onPuzzleSolved();
    }

    this.isValidating = false;
  }

  /**
   * Головоломка решена
   */
  private onPuzzleSolved(): void {
    if (this.isPuzzleComplete) return;

    this.isPuzzleComplete = true;

    // Анимация успеха
    this.showSuccessAnimation();

    // Обновляем заголовок
    this.titleText.text = "МАРШРУТ ПОСТРОЕН!";
    this.titleText.style.fill = this.colors.text.success;

    // Отправляем событие
    this.eventBus.emit(GameEvent.PUZZLE_COMPLETE, {
      puzzleId: "pipe_system",
      reward: "route_configured",
    });
  }

  /**
   * Анимация успеха
   */
  private showSuccessAnimation(): void {
    // Подсвечиваем все активные трубы зелёным
    this.connections.forEach((connection) => {
      if (connection.isActive) {
        const fromNode = this.nodes.find((n) => n.id === connection.from);
        const toNode = this.nodes.find((n) => n.id === connection.to);

        if (fromNode && toNode) {
          const glowGraphics = new Graphics();
          glowGraphics.lineStyle(8, 0x00ff00, 0.5);
          glowGraphics.moveTo(fromNode.x, fromNode.y);
          glowGraphics.lineTo(toNode.x, toNode.y);
          glowGraphics.stroke();
          this.addChild(glowGraphics);

          // Анимация затухания свечения
          const fadeOut = () => {
            glowGraphics.alpha -= 0.02;
            if (glowGraphics.alpha > 0) {
              requestAnimationFrame(fadeOut);
            } else {
              this.removeChild(glowGraphics);
              glowGraphics.destroy();
            }
          };
          fadeOut();
        }
      }
    });

    // Текст успеха
    const successText = new Text({
      text: "✓ ГОТОВО!",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 24,
        fill: 0x00ff00,
      }),
    });
    successText.anchor.set(0.5);
    successText.position.set(400, 450);
    this.addChild(successText);

    setTimeout(() => {
      this.removeChild(successText);
      successText.destroy();
    }, 2000);
  }

  /**
   * Достигнут лимит ходов
   */
  private onMaxMovesReached(): void {
    // Сбрасываем головоломку
    this.resetPuzzle();

    // Показываем предупреждение
    const warningText = new Text({
      text: "Слишком много попыток!\nСхема сброшена.",
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 14,
        fill: 0xff0000,
        align: "center",
        lineHeight: 20,
      }),
    });
    warningText.anchor.set(0.5);
    warningText.position.set(400, 450);
    this.addChild(warningText);

    setTimeout(() => {
      this.removeChild(warningText);
      warningText.destroy();
    }, 2000);

    this.eventBus.emit(GameEvent.PUZZLE_FAIL, {
      puzzleId: "pipe_system",
      reason: "max_moves",
    });
  }

  /**
   * Сброс головоломки
   */
  private resetPuzzle(): void {
    this.isPuzzleComplete = false;
    this.isValidating = false;
    this.moveCount = 0;
    this.selectedConnection = null;

    // Сбрасываем все узлы (кроме start и end)
    this.nodes.forEach((node) => {
      if (node.type !== "start" && node.type !== "end") {
        node.isActive = false;
      }
    });

    // Сбрасываем все соединения
    this.connections.forEach((connection) => {
      const fromNode = this.nodes.find((n) => n.id === connection.from);
      const toNode = this.nodes.find((n) => n.id === connection.to);

      if (fromNode && toNode) {
        connection.isActive = fromNode.isActive && toNode.isActive;
        connection.isSelected = false;
        this.updatePipeAppearance(connection);
      }
    });

    // Обновляем внешний вид узлов
    this.nodes.forEach((node) => {
      this.updateNodeAppearance(node);
    });

    // Сбрасываем заголовок
    this.titleText.text = "СХЕМА ТРУБОПРОВОДА";
    this.titleText.style.fill = this.colors.text.primary;

    // Сбрасываем счётчик
    this.updateMoveCounter();
  }

  /**
   * Создание легенды
   */
  private createLegend(): void {
    const legend = new Container();
    legend.position.set(30, 400);

    const legendItems = [
      { color: this.colors.node.start, label: "Начало" },
      { color: this.colors.node.end, label: "Конец" },
      { color: this.colors.node.valve, label: "Вентиль" },
      { color: this.colors.pipe.active, label: "Активная труба" },
      { color: this.colors.pipe.inactive, label: "Неактивная труба" },
    ];

    legendItems.forEach((item, index) => {
      const y = index * 20;

      // Цветной квадрат
      const colorBox = new Graphics();
      colorBox.rect(0, y, 12, 12);
      colorBox.fill({ color: item.color });
      colorBox.stroke({ width: 1, color: 0xffffff });
      legend.addChild(colorBox);

      // Подпись
      const label = new Text({
        text: item.label,
        style: new TextStyle({
          fontFamily: "Press Start 2P",
          fontSize: 8,
          fill: 0x888888,
        }),
      });
      label.position.set(18, y + 2);
      legend.addChild(label);
    });

    this.addChild(legend);
  }

  /**
   * Создание счётчика ходов
   */
  private createMoveCounter(): void {
    const counter = new Container();
    counter.position.set(580, 400);
    counter.name = "moveCounter";

    const bg = new Graphics();
    bg.roundRect(0, 0, 180, 40, 5);
    bg.fill({ color: 0x000000, alpha: 0.7 });
    bg.stroke({ width: 1, color: 0x444444 });
    counter.addChild(bg);

    const text = new Text({
      text: `Ходы: 0/${this.maxMoves}`,
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 12,
        fill: 0xffffff,
      }),
    });
    text.position.set(15, 12);
    text.name = "moveText";
    counter.addChild(text);

    this.addChild(counter);
  }

  /**
   * Создание кнопок управления
   */
  private createControlButtons(): void {
    // Кнопка сброса
    const resetButton = this.createButton("СБРОС", 580, 460, () => {
      this.resetPuzzle();
    });
    this.addChild(resetButton);

    // Кнопка подсказки
    const hintButton = this.createButton("ПОДСКАЗКА", 680, 460, () => {
      this.showHint();
    });
    this.addChild(hintButton);
  }

  /**
   * Создание кнопки
   */
  private createButton(
    text: string,
    x: number,
    y: number,
    onClick: () => void,
  ): Container {
    const button = new Container();
    button.position.set(x, y);

    const bg = new Graphics();
    bg.roundRect(0, 0, 90, 30, 5);
    bg.fill({ color: 0x222222 });
    bg.stroke({ width: 1, color: 0x00ff00 });
    button.addChild(bg);

    const label = new Text({
      text,
      style: new TextStyle({
        fontFamily: "Press Start 2P",
        fontSize: 10,
        fill: 0x00ff00,
      }),
    });
    label.anchor.set(0.5);
    label.position.set(45, 15);
    button.addChild(label);

    button.eventMode = "static";
    button.cursor = "pointer";

    button.on("pointerover", () => {
      bg.tint = 0x444444;
    });

    button.on("pointerout", () => {
      bg.tint = 0xffffff;
    });

    button.on("pointerdown", onClick);

    return button;
  }

  /**
   * Показ подсказки
   */
  private showHint(): void {
    // Находим путь и подсвечиваем первую неактивную трубу на пути
    const visited = new Set<string>();
    const queue: string[] = ["start"];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current)) continue;
      visited.add(current);

      const node = this.nodes.find((n) => n.id === current);
      if (!node) continue;

      // Проверяем соединения
      for (const connection of this.connections) {
        let nextNode: string | null = null;

        if (connection.from === current) {
          nextNode = connection.to;
        } else if (connection.to === current) {
          nextNode = connection.from;
        }

        if (nextNode && !visited.has(nextNode)) {
          if (!connection.isActive) {
            // Подсвечиваем это соединение
            this.highlightHintConnection(connection);
            return;
          }
          queue.push(nextNode);
        }
      }
    }
  }

  /**
   * Подсветка подсказанного соединения
   */
  private highlightHintConnection(connection: PipeConnection): void {
    const originalColor = connection.graphics.tint;

    // Мигание жёлтым
    let flashes = 0;
    const maxFlashes = 6;

    const flash = () => {
      if (flashes >= maxFlashes) {
        connection.graphics.tint = originalColor;
        return;
      }

      connection.graphics.tint =
        connection.graphics.tint === 0xffff00 ? originalColor : 0xffff00;

      flashes++;
      setTimeout(flash, 300);
    };

    flash();
  }

  /**
   * Обновление счётчика ходов
   */
  private updateMoveCounter(): void {
    const counter = this.getChildByName("moveCounter") as Container;
    if (!counter) return;

    const text = counter.getChildByName("moveText") as Text;
    if (!text) return;

    text.text = `Ходы: ${this.moveCount}/${this.maxMoves}`;

    if (this.moveCount >= this.maxMoves) {
      text.style.fill = 0xff0000;
    } else if (this.moveCount >= this.maxMoves * 0.7) {
      text.style.fill = 0xffaa00;
    } else {
      text.style.fill = 0xffffff;
    }
  }

  /**
   * Обработчик клика
   */
  private onClick(event: any): void {
    // Обработка кликов по трубам происходит в их собственных обработчиках
  }

  /**
   * Обновление узлов (вызывается извне)
   */
  public updateNodes(newNodes: PuzzleNode[]): void {
    this.nodes = newNodes;

    // Обновляем внешний вид узлов
    newNodes.forEach((node) => {
      this.updateNodeAppearance(node);
    });

    // Обновляем соединения
    this.connections.forEach((connection) => {
      const fromNode = newNodes.find((n) => n.id === connection.from);
      const toNode = newNodes.find((n) => n.id === connection.to);

      if (fromNode && toNode) {
        connection.isActive = fromNode.isActive && toNode.isActive;
        this.updatePipeAppearance(connection);
      }
    });

    // Проверяем решение
    this.validateSolution();
  }

  /**
   * Обновление анимаций
   */
  public update(delta: number): void {
    if (!this.isPuzzleActive) return;

    // Обновление анимаций потока
    this.flowAnimations.forEach((phase, key) => {
      const [from, to] = key.split("-");
      const connection = this.connections.find(
        (c) => c.from === from && c.to === to,
      );

      if (!connection || !connection.isActive) return;

      // Обновляем фазу анимации
      const newPhase = phase + delta * 0.05;
      this.flowAnimations.set(key, newPhase);

      // Анимация движущихся точек по трубе
      const fromNode = this.nodes.find((n) => n.id === connection.from);
      const toNode = this.nodes.find((n) => n.id === connection.to);

      if (!fromNode || !toNode) return;

      connection.flowGraphics.clear();

      // Рисуем движущиеся частицы
      for (let i = 0; i < 3; i++) {
        const particlePhase = (newPhase + i * 0.33) % 1;

        const x = fromNode.x + (toNode.x - fromNode.x) * particlePhase;
        const y = fromNode.y + (toNode.y - fromNode.y) * particlePhase;

        connection.flowGraphics.circle(x, y, 2);
        connection.flowGraphics.fill({
          color: 0x00ff88,
          alpha: 1 - particlePhase * 0.5,
        });
      }
    });
  }

  /**
   * Активация головоломки
   */
  public activate(): void {
    this.isPuzzleActive = true;
    this.visible = true;
  }

  /**
   * Деактивация головоломки
   */
  public deactivate(): void {
    this.isPuzzleActive = false;
    this.visible = false;
  }

  /**
   * Проверка, решена ли головоломка
   */
  public isComplete(): boolean {
    return this.isPuzzleComplete;
  }

  /**
   * Получение количества ходов
   */
  public getMoveCount(): number {
    return this.moveCount;
  }

  /**
   * Уничтожение головоломки
   */
  public destroy(options?: any): void {
    this.flowAnimations.clear();
    this.nodeGraphics.clear();
    this.connections.length = 0;
    this.nodes.length = 0;

    super.destroy(options);
  }
}
