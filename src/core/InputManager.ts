type KeyCallback = (event: KeyboardEvent) => void;

interface KeyCallbackEntry {
  callback: KeyCallback;
  priority: number;
  id: string;
}

export class InputManager {
  private keysDown: Set<string> = new Set();
  private keysPressed: Set<string> = new Set();
  private keysReleased: Set<string> = new Set();
  private keyCallbacks: Map<string, KeyCallbackEntry[]> = new Map();
  private enabled: boolean = true;

  // Привязки для корректного удаления
  private boundHandleKeyDown: (event: KeyboardEvent) => void;
  private boundHandleKeyUp: (event: KeyboardEvent) => void;
  private boundHandleBlur: () => void;

  // Для предотвращения повторных нажатий при удержании
  private keyRepeatTimers: Map<string, number> = new Map();
  private keyRepeatDelay: number = 300;
  private keyRepeatInterval: number = 50;

  constructor() {
    // Сохраняем привязанные функции
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleKeyUp = this.handleKeyUp.bind(this);
    this.boundHandleBlur = this.handleBlur.bind(this);

    window.addEventListener("keydown", this.boundHandleKeyDown);
    window.addEventListener("keyup", this.boundHandleKeyUp);
    window.addEventListener("blur", this.boundHandleBlur);
  }

  /**
   * Внутренний обработчик нажатия клавиши
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.enabled) return;

    const code = event.code;

    if (this.shouldPreventDefault(code)) {
      event.preventDefault();
    }

    const isRepeat = this.keysDown.has(code);

    if (!isRepeat) {
      this.keysPressed.add(code);
      this.keysDown.add(code);

      this.triggerCallbacks(code, event);
      this.startKeyRepeat(code, event);
    }
  }

  /**
   * Внутренний обработчик отпускания клавиши
   */
  private handleKeyUp(event: KeyboardEvent): void {
    if (!this.enabled) return;

    const code = event.code;
    this.keysDown.delete(code);
    this.keysReleased.add(code);

    this.stopKeyRepeat(code);
  }

  /**
   * Внутренний обработчик потери фокуса
   */
  private handleBlur(): void {
    this.keysDown.clear();
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.keyRepeatTimers.forEach((timer) => clearTimeout(timer));
    this.keyRepeatTimers.clear();
  }

  /**
   * Проверяет, нужно ли предотвращать стандартное поведение
   */
  private shouldPreventDefault(code: string): boolean {
    const preventedKeys = [
      "Space",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Tab",
      "Backspace",
      "F1",
      "F2",
      "F3",
      "F4",
      "F5",
      "F6",
      "F7",
      "F8",
      "F9",
      "F10",
      "F11",
      "F12",
    ];

    return preventedKeys.includes(code);
  }

  /**
   * Запускает повтор нажатия при удержании клавиши
   */
  private startKeyRepeat(code: string, event: KeyboardEvent): void {
    this.stopKeyRepeat(code);

    const timer = window.setTimeout(() => {
      const interval = window.setInterval(() => {
        if (this.keysDown.has(code)) {
          this.triggerCallbacks(code, event);
        } else {
          this.stopKeyRepeat(code);
        }
      }, this.keyRepeatInterval);

      this.keyRepeatTimers.set(code, interval);
    }, this.keyRepeatDelay);

    this.keyRepeatTimers.set(code, timer);
  }

  /**
   * Останавливает повтор нажатия
   */
  private stopKeyRepeat(code: string): void {
    const timer = this.keyRepeatTimers.get(code);
    if (timer) {
      clearTimeout(timer);
      clearInterval(timer);
      this.keyRepeatTimers.delete(code);
    }
  }

  /**
   * Вызывает коллбэки для клавиши с учётом приоритета
   */
  private triggerCallbacks(code: string, event: KeyboardEvent): void {
    const entries = this.keyCallbacks.get(code);
    if (!entries || entries.length === 0) return;

    const sorted = [...entries].sort((a, b) => b.priority - a.priority);

    for (const entry of sorted) {
      try {
        entry.callback(event);
      } catch (error) {
        console.error(`Error in key callback for "${code}":`, error);
      }
    }
  }

  /**
   * Проверяет, зажата ли клавиша
   */
  public isKeyDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  /**
   * Проверяет, была ли клавиша нажата в этом кадре
   */
  public isKeyPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  /**
   * Проверяет, была ли клавиша отпущена в этом кадре
   */
  public isKeyReleased(code: string): boolean {
    return this.keysReleased.has(code);
  }

  /**
   * Проверяет комбинацию клавиш
   */
  public isComboPressed(...codes: string[]): boolean {
    return codes.every((code) => this.keysDown.has(code));
  }

  /**
   * Проверяет, зажата ли любая из указанных клавиш
   */
  public isAnyKeyDown(...codes: string[]): boolean {
    return codes.some((code) => this.keysDown.has(code));
  }

  /**
   * Подписка на нажатие клавиши
   */
  public onKeyDown(
    code: string,
    callback: KeyCallback,
    priority: number = 0,
  ): () => void {
    if (!this.keyCallbacks.has(code)) {
      this.keyCallbacks.set(code, []);
    }

    const id = `kc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const entry: KeyCallbackEntry = { callback, priority, id };

    this.keyCallbacks.get(code)!.push(entry);

    return () => {
      this.offKeyDown(code, id);
    };
  }

  /**
   * Подписка на однократное нажатие клавиши
   */
  public onceKeyDown(
    code: string,
    callback: KeyCallback,
    priority: number = 0,
  ): void {
    const unsubscribe = this.onKeyDown(
      code,
      (event) => {
        unsubscribe();
        callback(event);
      },
      priority,
    );
  }

  /**
   * Отписка от нажатия клавиши по id или callback
   */
  public offKeyDown(code: string, callbackOrId: KeyCallback | string): void {
    const entries = this.keyCallbacks.get(code);
    if (!entries) return;

    if (typeof callbackOrId === "string") {
      const index = entries.findIndex((e) => e.id === callbackOrId);
      if (index !== -1) {
        entries.splice(index, 1);
      }
    } else {
      const index = entries.findIndex((e) => e.callback === callbackOrId);
      if (index !== -1) {
        entries.splice(index, 1);
      }
    }

    if (entries.length === 0) {
      this.keyCallbacks.delete(code);
    }
  }

  /**
   * Отписка от всех коллбэков для клавиши
   */
  public offAllKeyDown(code: string): void {
    this.keyCallbacks.delete(code);
  }

  /**
   * Отписка от всех коллбэков
   */
  public offAll(): void {
    this.keyCallbacks.clear();
  }

  /**
   * Обновление состояния (вызывается каждый кадр)
   */
  public update(): void {
    this.keysPressed.clear();
    this.keysReleased.clear();
  }

  /**
   * Включение обработки ввода
   */
  public enable(): void {
    this.enabled = true;
  }

  /**
   * Отключение обработки ввода
   */
  public disable(): void {
    this.enabled = false;
    this.reset();
  }

  /**
   * Сброс состояния
   */
  public reset(): void {
    this.keysDown.clear();
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.keyRepeatTimers.forEach((timer) => clearTimeout(timer));
    this.keyRepeatTimers.clear();
  }

  /**
   * Настройка интервалов повтора клавиш
   */
  public setKeyRepeat(delay: number, interval: number): void {
    this.keyRepeatDelay = delay;
    this.keyRepeatInterval = interval;
  }

  /**
   * Получение списка зажатых клавиш
   */
  public getKeysDown(): string[] {
    return Array.from(this.keysDown);
  }

  /**
   * Уничтожение менеджера ввода
   */
  public destroy(): void {
    window.removeEventListener("keydown", this.boundHandleKeyDown);
    window.removeEventListener("keyup", this.boundHandleKeyUp);
    window.removeEventListener("blur", this.boundHandleBlur);

    this.keyCallbacks.clear();
    this.reset();
  }

  /**
   * Для отладки
   */
  public debug(): void {
    console.group("InputManager Debug");
    console.log("Enabled:", this.enabled);
    console.log("Keys down:", Array.from(this.keysDown));
    console.log("Keys pressed:", Array.from(this.keysPressed));
    console.log("Keys released:", Array.from(this.keysReleased));
    console.log("Registered callbacks:", this.keyCallbacks.size);

    console.group("Callbacks:");
    for (const [key, entries] of this.keyCallbacks.entries()) {
      console.log(`  ${key}: ${entries.length} callbacks`);
    }
    console.groupEnd();

    console.groupEnd();
  }
}
