/**
 * Типы событий в игре
 */
export enum GameEvent {
  // Системные события
  GAME_INIT = "game:init",
  GAME_START = "game:start",
  GAME_PAUSE = "game:pause",
  GAME_RESUME = "game:resume",
  GAME_OVER = "game:over",
  GAME_RESTART = "game:restart",
  GAME_QUIT = "game:quit",

  // События сцен
  SCENE_LOADING = "scene:loading",
  SCENE_READY = "scene:ready",
  SCENE_CHANGE = "scene:change",
  SCENE_TRANSITION_START = "scene:transition:start",
  SCENE_TRANSITION_END = "scene:transition:end",
  SCENE_TRANSITION_ERROR = "scene:transition:error",

  // События загрузки ресурсов
  ASSETS_LOADING_START = "assets:loading:start",
  ASSETS_LOADING_COMPLETE = "assets:loading:complete",
  ASSETS_LOADING_ERROR = "assets:loading:error",
  ASSETS_PROGRESS = "assets:progress",
  ASSETS_BUNDLE_START = "assets:bundle:start",
  ASSETS_BUNDLE_COMPLETE = "assets:bundle:complete",
  ASSETS_ASSET_ERROR = "assets:asset:error",

  // События аудио
  AUDIO_PLAY_STARTED = "audio:play:started",
  AUDIO_PLAY_STOPPED = "audio:play:stopped",
  AUDIO_PLAY_PAUSED = "audio:play:paused",
  AUDIO_PLAY_RESUMED = "audio:play:resumed",
  AUDIO_PLAY_COMPLETED = "audio:play:completed",
  AUDIO_ALL_PAUSED = "audio:all:paused",
  AUDIO_ALL_RESUMED = "audio:all:resumed",
  AUDIO_MUTED = "audio:muted",
  AUDIO_UNMUTED = "audio:unmuted",
  AUDIO_VOLUME_CHANGED = "audio:volume:changed",
  AUDIO_CONTEXT_INITIALIZED = "audio:context:initialized",

  // События игрока
  PLAYER_SPAWN = "player:spawn",
  PLAYER_MOVE = "player:move",
  PLAYER_DAMAGE = "player:damage",
  PLAYER_HEAL = "player:heal",
  PLAYER_DEATH = "player:death",
  PLAYER_RESPAWN = "player:respawn",
  PLAYER_INTERACT = "player:interact",

  // События предметов
  ITEM_COLLECT = "item:collect",
  ITEM_USE = "item:use",
  ITEM_DROP = "item:drop",

  // События головоломок
  PUZZLE_START = "puzzle:start",
  PUZZLE_PROGRESS = "puzzle:progress",
  PUZZLE_COMPLETE = "puzzle:complete",
  PUZZLE_FAIL = "puzzle:fail",
  PUZZLE_RESET = "puzzle:reset",

  // События монстров
  MONSTER_SPAWN = "monster:spawn",
  MONSTER_DETECT = "monster:detect",
  MONSTER_ATTACK = "monster:attack",
  MONSTER_DAMAGE = "monster:damage",
  MONSTER_DEATH = "monster:death",
  MONSTER_DESTROY = "monster:destroy",

  // События диалогов
  DIALOG_START = "dialog:start",
  DIALOG_NEXT = "dialog:next",
  DIALOG_END = "dialog:end",
  DIALOG_CHOICE = "dialog:choice",

  // События интерфейса
  UI_BUTTON_CLICK = "ui:button:click",
  UI_BUTTON_HOVER = "ui:button:hover",
  UI_MENU_OPEN = "ui:menu:open",
  UI_MENU_CLOSE = "ui:menu:close",
  UI_NOTIFICATION = "ui:notification",

  // События окна
  WINDOW_RESIZE = "window:resize",
  WINDOW_FOCUS = "window:focus",
  WINDOW_BLUR = "window:blur",
}

/**
 * Интерфейс для данных событий
 */
export interface GameEventData {
  [GameEvent.GAME_INIT]: { timestamp: number };
  [GameEvent.GAME_START]: { scene: string };
  [GameEvent.GAME_PAUSE]: { reason?: string };
  [GameEvent.GAME_RESUME]: { timestamp: number };
  [GameEvent.GAME_OVER]: { reason: string; score?: number };
  [GameEvent.GAME_RESTART]: Record<string, never>;
  [GameEvent.GAME_QUIT]: Record<string, never>;

  [GameEvent.SCENE_LOADING]: { scene: string; progress: number };
  [GameEvent.SCENE_READY]: { scene: string };
  [GameEvent.SCENE_CHANGE]: { from?: string; to: string };
  [GameEvent.SCENE_TRANSITION_START]: {
    from?: string;
    to: string;
    type: string;
  };
  [GameEvent.SCENE_TRANSITION_END]: { scene: string };
  [GameEvent.SCENE_TRANSITION_ERROR]: { scene: string; error: Error };

  [GameEvent.ASSETS_LOADING_START]: { totalBundles: number };
  [GameEvent.ASSETS_LOADING_COMPLETE]: {
    totalLoaded: number;
    bundles: string[];
  };
  [GameEvent.ASSETS_LOADING_ERROR]: { error: Error };
  [GameEvent.ASSETS_PROGRESS]: { progress: number; currentAsset: string };
  [GameEvent.ASSETS_BUNDLE_START]: { bundleName: string; assetCount: number };
  [GameEvent.ASSETS_BUNDLE_COMPLETE]: { bundleName: string };
  [GameEvent.ASSETS_ASSET_ERROR]: {
    bundleName: string;
    assetAlias: string;
    error: Error;
  };

  [GameEvent.AUDIO_PLAY_STARTED]: {
    alias: string;
    id: string;
    category: string;
  };
  [GameEvent.AUDIO_PLAY_STOPPED]: { alias: string; id: string };
  [GameEvent.AUDIO_PLAY_PAUSED]: { alias: string; id: string };
  [GameEvent.AUDIO_PLAY_RESUMED]: { alias: string; id: string };
  [GameEvent.AUDIO_PLAY_COMPLETED]: { alias: string; id: string };
  [GameEvent.AUDIO_ALL_PAUSED]: Record<string, never>;
  [GameEvent.AUDIO_ALL_RESUMED]: Record<string, never>;
  [GameEvent.AUDIO_MUTED]: Record<string, never>;
  [GameEvent.AUDIO_UNMUTED]: Record<string, never>;
  [GameEvent.AUDIO_VOLUME_CHANGED]: { volume: number };
  [GameEvent.AUDIO_CONTEXT_INITIALIZED]: Record<string, never>;

  [GameEvent.PLAYER_SPAWN]: { position: { x: number; y: number } };
  [GameEvent.PLAYER_MOVE]: {
    position: { x: number; y: number };
    direction: string;
  };
  [GameEvent.PLAYER_DAMAGE]: {
    amount: number;
    currentHealth: number;
    source?: string;
  };
  [GameEvent.PLAYER_HEAL]: { amount: number; currentHealth: number };
  [GameEvent.PLAYER_DEATH]: {
    cause: string;
    position: { x: number; y: number };
  };
  [GameEvent.PLAYER_RESPAWN]: { position: { x: number; y: number } };
  [GameEvent.PLAYER_INTERACT]: { target: string; type: string };

  [GameEvent.ITEM_COLLECT]: { type: string; alias: string; total?: number };
  [GameEvent.ITEM_USE]: { type: string; alias: string };
  [GameEvent.ITEM_DROP]: { type: string; alias: string };

  [GameEvent.PUZZLE_START]: { puzzleId: string; type: string };
  [GameEvent.PUZZLE_PROGRESS]: { puzzleId: string; progress: number };
  [GameEvent.PUZZLE_COMPLETE]: { puzzleId: string; reward?: string };
  [GameEvent.PUZZLE_FAIL]: { puzzleId: string; reason?: string };
  [GameEvent.PUZZLE_RESET]: { puzzleId: string };

  [GameEvent.MONSTER_SPAWN]: {
    type: string;
    id: string;
    position: { x: number; y: number };
  };
  [GameEvent.MONSTER_DETECT]: { id: string; targetId: string };
  [GameEvent.MONSTER_ATTACK]: { id: string; targetId: string; damage: number };
  [GameEvent.MONSTER_DAMAGE]: {
    id: string;
    amount: number;
    currentHealth: number;
  };
  [GameEvent.MONSTER_DEATH]: {
    id: string;
    type: string;
    position: { x: number; y: number };
  };
  [GameEvent.MONSTER_DESTROY]: { id: string };

  [GameEvent.DIALOG_START]: { npcId: string; dialogueId: string };
  [GameEvent.DIALOG_NEXT]: { dialogueId: string; lineIndex: number };
  [GameEvent.DIALOG_END]: { dialogueId: string };
  [GameEvent.DIALOG_CHOICE]: {
    dialogueId: string;
    choiceId: string;
    choiceIndex: number;
  };

  [GameEvent.UI_BUTTON_CLICK]: { buttonId: string };
  [GameEvent.UI_BUTTON_HOVER]: { buttonId: string; isHovered: boolean };
  [GameEvent.UI_MENU_OPEN]: { menuId: string };
  [GameEvent.UI_MENU_CLOSE]: { menuId: string };
  [GameEvent.UI_NOTIFICATION]: {
    message: string;
    type: "info" | "warning" | "error" | "success";
  };

  [GameEvent.WINDOW_RESIZE]: { width: number; height: number };
  [GameEvent.WINDOW_FOCUS]: Record<string, never>;
  [GameEvent.WINDOW_BLUR]: Record<string, never>;
}

/**
 * Тип для callback функции с правильной типизацией
 */
type EventCallback<K extends GameEvent = GameEvent> = (
  data: GameEventData[K],
) => void | Promise<void>;

/**
 * Опции для подписки на события
 */
interface SubscriptionOptions {
  once?: boolean;
  priority?: number;
  context?: string;
}

/**
 * Внутреннее представление подписки
 */
interface Subscription<T extends GameEvent = GameEvent> {
  callback: EventCallback<T>;
  options: Required<SubscriptionOptions>;
  id: string;
}

/**
 * Шина событий для игры
 */
export class EventBus {
  private readonly listeners: Map<GameEvent, Subscription[]>;
  private readonly debugMode: boolean;
  private readonly eventHistory: Array<{
    event: GameEvent;
    data: unknown;
    timestamp: number;
  }>;
  private readonly maxHistorySize: number = 100;
  private enabled: boolean = true;

  constructor(debugMode: boolean = false) {
    this.listeners = new Map();
    this.debugMode = debugMode;
    this.eventHistory = [];

    // Инициализируем массивы для всех типов событий
    for (const event of Object.values(GameEvent)) {
      this.listeners.set(event, []);
    }
  }

  /**
   * Подписка на событие
   */
  public on<K extends GameEvent>(
    event: K,
    callback: EventCallback<K>,
    options: SubscriptionOptions = {},
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const subscription: Subscription<K> = {
      callback,
      options: {
        once: options.once ?? false,
        priority: options.priority ?? 0,
        context: options.context ?? "global",
      },
      id: this.generateSubscriptionId(event),
    };

    const eventListeners = this.listeners.get(event)!;

    // Вставка с учётом приоритета
    const insertIndex = eventListeners.findIndex(
      (s) => s.options.priority < subscription.options.priority,
    );

    if (insertIndex === -1) {
      eventListeners.push(subscription);
    } else {
      eventListeners.splice(insertIndex, 0, subscription);
    }

    if (this.debugMode) {
      console.log(
        `[EventBus] Subscribed to "${event}" (id: ${subscription.id}, priority: ${subscription.options.priority})`,
      );
    }

    // Возвращаем функцию для отписки
    return () => {
      this.off(event, subscription.id);
    };
  }

  /**
   * Подписка на событие с однократным срабатыванием
   */
  public once<K extends GameEvent>(
    event: K,
    callback: EventCallback<K>,
    options: Omit<SubscriptionOptions, "once"> = {},
  ): () => void {
    return this.on(event, callback, { ...options, once: true });
  }

  /**
   * Отписка от события
   */
  public off<K extends GameEvent>(
    event: K,
    callbackOrId: EventCallback<K> | string,
  ): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;

    if (typeof callbackOrId === "string") {
      // Отписка по id
      const index = listeners.findIndex((s) => s.id === callbackOrId);
      if (index !== -1) {
        listeners.splice(index, 1);
        if (this.debugMode) {
          console.log(
            `[EventBus] Unsubscribed from "${event}" (id: ${callbackOrId})`,
          );
        }
      }
    } else {
      // Отписка по callback
      const index = listeners.findIndex((s) => s.callback === callbackOrId);
      if (index !== -1) {
        const subscription = listeners[index];
        listeners.splice(index, 1);
        if (this.debugMode) {
          console.log(
            `[EventBus] Unsubscribed from "${event}" (id: ${subscription.id})`,
          );
        }
      }
    }
  }

  /**
   * Отписка всех слушателей от события
   */
  public offAll(event?: GameEvent): void {
    if (event) {
      this.listeners.set(event, []);
      if (this.debugMode) {
        console.log(`[EventBus] Cleared all listeners for "${event}"`);
      }
    } else {
      this.listeners.clear();
      if (this.debugMode) {
        console.log("[EventBus] Cleared all listeners");
      }
    }
  }

  /**
   * Отписка по контексту
   */
  public offContext(context: string): void {
    let removedCount = 0;

    for (const [event, listeners] of this.listeners.entries()) {
      const filtered = listeners.filter((s) => {
        if (s.options.context === context) {
          removedCount++;
          return false;
        }
        return true;
      });
      this.listeners.set(event, filtered);
    }

    if (this.debugMode) {
      console.log(
        `[EventBus] Removed ${removedCount} listeners for context "${context}"`,
      );
    }
  }

  /**
   * Публикация события
   */
  public async emit<K extends GameEvent>(
    event: K,
    data?: GameEventData[K],
  ): Promise<void> {
    if (!this.enabled) {
      if (this.debugMode) {
        console.log(`[EventBus] EventBus is disabled, skipping "${event}"`);
      }
      return;
    }

    // Добавляем в историю
    this.addToHistory(event, data);

    const listeners = this.listeners.get(event);
    if (!listeners || listeners.length === 0) {
      if (this.debugMode) {
        console.log(`[EventBus] No listeners for "${event}"`);
      }
      return;
    }

    if (this.debugMode) {
      console.log(
        `[EventBus] Emitting "${event}" to ${listeners.length} listeners`,
        data,
      );
    }

    // Копируем массив слушателей, так как он может измениться во время выполнения
    const listenersToExecute = [...listeners];

    for (const subscription of listenersToExecute) {
      try {
        const result = subscription.callback(data as GameEventData[K]);

        // Поддержка асинхронных коллбэков
        if (result instanceof Promise) {
          await result;
        }

        // Удаляем подписку если она одноразовая
        if (subscription.options.once) {
          const index = this.listeners.get(event)?.indexOf(subscription);
          if (index !== undefined && index !== -1) {
            this.listeners.get(event)?.splice(index, 1);
          }
        }
      } catch (error) {
        console.error(
          `[EventBus] Error in listener for "${event}" (id: ${subscription.id}):`,
          error,
        );

        // Эмитим событие об ошибке
        if (event !== GameEvent.GAME_QUIT) {
          this.emitError({
            event,
            subscriptionId: subscription.id,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    }
  }

  /**
   * Публикация события с ожиданием завершения всех обработчиков
   */
  public async emitAsync<K extends GameEvent>(
    event: K,
    data?: GameEventData[K],
  ): Promise<void> {
    await this.emit(event, data);
  }

  /**
   * Создаёт цепочку обработчиков для события
   */
  public pipe(
    sourceEvent: GameEvent,
    targetEvent: GameEvent,
    transform?: (data: unknown) => unknown,
  ): () => void {
    return this.on(sourceEvent, (data: unknown) => {
      const transformedData = transform ? transform(data) : data;
      this.emit(
        targetEvent,
        transformedData as GameEventData[typeof targetEvent],
      );
    });
  }

  /**
   * Ожидание события (Promise-based)
   */
  public waitFor<K extends GameEvent>(
    event: K,
    timeout?: number,
  ): Promise<GameEventData[K]> {
    return new Promise((resolve, reject) => {
      let timeoutId: number | undefined;

      const unsubscribe = this.once(event, (data: GameEventData[K]) => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
        }
        resolve(data);
      });

      if (timeout) {
        timeoutId = window.setTimeout(() => {
          unsubscribe();
          reject(new Error(`Timeout waiting for event "${event}"`));
        }, timeout);
      }
    });
  }

  /**
   * Включает/выключает шину событий
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    if (this.debugMode) {
      console.log(`[EventBus] ${enabled ? "Enabled" : "Disabled"}`);
    }
  }

  /**
   * Получает историю событий
   */
  public getHistory(filter?: {
    event?: GameEvent;
    fromTimestamp?: number;
    limit?: number;
  }): Array<{ event: GameEvent; data: unknown; timestamp: number }> {
    let history = [...this.eventHistory];

    if (filter?.event) {
      history = history.filter((h) => h.event === filter.event);
    }
    if (filter?.fromTimestamp) {
      history = history.filter((h) => h.timestamp >= filter.fromTimestamp);
    }
    if (filter?.limit) {
      history = history.slice(-filter.limit);
    }

    return history;
  }

  /**
   * Очищает историю событий
   */
  public clearHistory(): void {
    this.eventHistory.length = 0;
  }

  /**
   * Получает количество слушателей для события
   */
  public listenerCount(event?: GameEvent): number {
    if (event) {
      return this.listeners.get(event)?.length ?? 0;
    }

    let total = 0;
    for (const listeners of this.listeners.values()) {
      total += listeners.length;
    }
    return total;
  }

  /**
   * Получает список активных событий (у которых есть слушатели)
   */
  public getActiveEvents(): GameEvent[] {
    return Array.from(this.listeners.entries())
      .filter(([, listeners]) => listeners.length > 0)
      .map(([event]) => event);
  }

  /**
   * Уничтожает шину событий
   */
  public destroy(): void {
    this.listeners.clear();
    this.eventHistory.length = 0;
    this.enabled = false;
  }

  /**
   * Добавляет событие в историю
   */
  private addToHistory(event: GameEvent, data?: unknown): void {
    this.eventHistory.push({
      event,
      data,
      timestamp: Date.now(),
    });

    // Ограничиваем размер истории
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Эмитит событие об ошибке
   */
  private emitError(errorData: {
    event: GameEvent;
    subscriptionId: string;
    error: Error;
  }): void {
    if (this.debugMode) {
      console.error("[EventBus] Listener error:", errorData);
    }
  }

  /**
   * Генерирует уникальный id для подписки
   */
  private generateSubscriptionId(event: GameEvent): string {
    return `${event}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Дебаг информация
   */
  public debug(): void {
    console.group("EventBus Debug");
    console.log("Enabled:", this.enabled);
    console.log("Debug mode:", this.debugMode);
    console.log("Total listeners:", this.listenerCount());
    console.log("History size:", this.eventHistory.length);

    console.group("Active events:");
    const activeEvents = this.getActiveEvents();
    activeEvents.forEach((event) => {
      console.log(`  ${event}: ${this.listenerCount(event)} listeners`);
    });
    console.groupEnd();

    if (activeEvents.length > 0) {
      console.group("Last 5 events:");
      const lastEvents = this.eventHistory.slice(-5);
      lastEvents.forEach((h) => {
        console.log(
          `  [${new Date(h.timestamp).toLocaleTimeString()}] ${h.event}`,
          h.data,
        );
      });
      console.groupEnd();
    }

    console.groupEnd();
  }
}
