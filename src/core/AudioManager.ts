import * as EventBus from "./EventBus";
import { AssetLoader } from "./AssetLoader";

export interface AudioConfig {
  volume: number;
  loop: boolean;
  playbackRate: number;
  fadeIn?: number;
  fadeOut?: number;
  category?: AudioCategory;
  priority?: number;
}

export type AudioCategory = "music" | "sfx" | "ambient" | "voice" | "ui";

export interface AudioState {
  alias: string;
  config: AudioConfig;
  instance: HTMLAudioElement;
  isPlaying: boolean;
  isPaused: boolean;
  id: string;
}

interface AudioChannel {
  volume: number;
  isMuted: boolean;
  activeSounds: Map<string, AudioState>;
  maxSimultaneous: number;
}

export class AudioManager {
  private readonly eventBus: EventBus.EventBus;

  private readonly channels: Map<AudioCategory, AudioChannel>;
  private readonly activeSounds: Map<string, AudioState>;
  private readonly waitingQueue: Array<{
    alias: string;
    config: AudioConfig;
    resolve: (state: AudioState | null) => void;
  }>;

  private masterVolume: number = 1.0;
  private isGlobalMuted: boolean = false;
  private audioContext: AudioContext | null = null;
  private isAudioContextInitialized: boolean = false;
  private soundIdCounter: number = 0;

  // Очередь звуков, ожидающих инициализации AudioContext
  private pendingPlays: Array<{
    alias: string;
    config: AudioConfig;
    resolve: (state: AudioState | null) => void;
  }> = [];

  private assetLoader?: AssetLoader;

  private readonly defaultCategoryConfig: Record<
    AudioCategory,
    Omit<AudioChannel, "activeSounds">
  > = {
    music: { volume: 0.7, isMuted: false, maxSimultaneous: 2 },
    sfx: { volume: 1.0, isMuted: false, maxSimultaneous: 8 },
    ambient: { volume: 0.5, isMuted: false, maxSimultaneous: 3 },
    voice: { volume: 1.0, isMuted: false, maxSimultaneous: 1 },
    ui: { volume: 0.8, isMuted: false, maxSimultaneous: 4 },
  };

  constructor(eventBus: EventBus.EventBus, assetLoader?: AssetLoader) {
    this.eventBus = eventBus;
    this.assetLoader = assetLoader;
    this.channels = new Map();
    this.activeSounds = new Map();
    this.waitingQueue = [];
    this.initChannels();
    this.setupEventListeners();
  }

  private initChannels(): void {
    for (const [category, config] of Object.entries(
      this.defaultCategoryConfig,
    )) {
      this.channels.set(category as AudioCategory, {
        ...config,
        activeSounds: new Map(),
      });
    }
  }

  private setupEventListeners(): void {
    // Автоматическая пауза при сворачивании окна
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.pauseAll();
      } else {
        this.resumeAll();
      }
    });

    // Инициализация AudioContext при ПЕРВОМ взаимодействии пользователя
    const initOnInteraction = () => {
      this.initAudioContext();
    };

    // Слушаем разные типы взаимодействий
    document.addEventListener("click", initOnInteraction, { once: true });
    document.addEventListener("keydown", initOnInteraction, { once: true });
    document.addEventListener("touchstart", initOnInteraction, { once: true });
    document.addEventListener("mousedown", initOnInteraction, { once: true });
  }

  /**
   * Устанавливает assetLoader (если не был передан в конструктор)
   */
  public setAssetLoader(assetLoader: AssetLoader): void {
    this.assetLoader = assetLoader;
  }

  /**
   * Инициализирует AudioContext (должен вызываться после взаимодействия пользователя)
   */
  private async initAudioContext(): Promise<void> {
    if (this.isAudioContextInitialized) return;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioContextClass) {
        console.warn("AudioContext not supported in this browser");
        return;
      }

      this.audioContext = new AudioContextClass();

      // Если контекст в состоянии suspended, пробуем возобновить
      if (this.audioContext.state === "suspended") {
        try {
          await this.audioContext.resume();
        } catch (error) {
          console.warn("Could not resume AudioContext:", error);
          // Не устанавливаем флаг инициализации, чтобы попробовать позже
          return;
        }
      }

      this.isAudioContextInitialized = true;
      console.log("AudioContext initialized successfully");

      this.eventBus.emit("audio:context:initialized", {});

      // Воспроизводим все ожидающие звуки
      await this.processPendingPlays();
    } catch (error) {
      console.error("Failed to initialize AudioContext:", error);
    }
  }

  /**
   * Обрабатывает очередь ожидающих воспроизведения звуков
   */
  private async processPendingPlays(): Promise<void> {
    const pending = [...this.pendingPlays];
    this.pendingPlays = [];

    for (const { alias, config, resolve } of pending) {
      try {
        const state = await this.play(alias, config);
        resolve(state);
      } catch (error) {
        console.error(`Failed to play pending sound "${alias}":`, error);
        resolve(null);
      }
    }
  }

  /**
   * Воспроизводит звук по алиасу
   */
  public async play(
    alias: string,
    config: Partial<AudioConfig> = {},
  ): Promise<AudioState | null> {
    // Если AudioContext ещё не инициализирован, добавляем в очередь
    if (!this.isAudioContextInitialized) {
      console.log(`AudioContext not ready, queuing sound: "${alias}"`);

      return new Promise((resolve) => {
        this.pendingPlays.push({
          alias,
          config: this.mergeConfig(config),
          resolve,
        });
      });
    }

    // Проверяем, не заблокирован ли звук глобально
    if (this.isGlobalMuted) return null;

    // Проверяем, что assetLoader загружен
    if (!this.assetLoader) {
      console.warn("AssetLoader not initialized, queuing sound: " + alias);
      return new Promise((resolve) => {
        this.pendingPlays.push({
          alias,
          config: this.mergeConfig(config),
          resolve,
        });
      });
    }

    try {
      // Получаем аудио из AssetLoader
      const soundAsset = this.assetLoader.get(alias);

      if (!soundAsset) {
        console.warn(`Sound "${alias}" not found in assets`);
        return null;
      }

      // Проверяем, является ли это HTMLAudioElement
      let audioElement: HTMLAudioElement | undefined = undefined;

      if (soundAsset instanceof HTMLAudioElement) {
        audioElement = soundAsset;
      } else if (
        typeof soundAsset === "object" &&
        soundAsset !== null &&
        "htmlElement" in soundAsset
      ) {
        const htmlElement = (soundAsset as { htmlElement?: HTMLAudioElement })
          .htmlElement;
        if (htmlElement instanceof HTMLAudioElement) {
          audioElement = htmlElement;
        }
      } else if (
        typeof soundAsset === "object" &&
        soundAsset !== null &&
        "play" in soundAsset
      ) {
        // Это Sound объект PixiJS, пытаемся получить htmlElement
        try {
          // В PixiJS v8 Sound имеет htmlElement как getter
          const htmlElement = (soundAsset as { htmlElement?: HTMLAudioElement })
            .htmlElement;
          if (htmlElement instanceof HTMLAudioElement) {
            audioElement = htmlElement;
          }
        } catch {
          // Игнорируем ошибки
        }
      }

      if (!audioElement) {
        console.warn(
          `Sound "${alias}" is not a valid HTMLAudioElement or Sound with htmlElement`,
        );
        return null;
      }

      const mergedConfig = this.mergeConfig(config);
      const category = mergedConfig.category || "sfx";
      const channel = this.channels.get(category);

      if (!channel) {
        console.warn(`Channel "${category}" not found`);
        return null;
      }

      if (channel.isMuted) return null;

      // Проверка лимита одновременных звуков
      if (channel.activeSounds.size >= channel.maxSimultaneous) {
        if (mergedConfig.priority && mergedConfig.priority > 50) {
          this.stopLowestPriority(category);
        } else {
          return this.addToQueue(alias, mergedConfig);
        }
      }

      const state = await this.createAudioState(
        audioElement,
        alias,
        mergedConfig,
      );
      await this.startPlayback(state);

      return state;
    } catch (error) {
      console.error(`Failed to play sound "${alias}":`, error);
      return null;
    }
  }

  /**
   * Создаёт состояние звука
   */
  private async createAudioState(
    instance: HTMLAudioElement,
    alias: string,
    config: AudioConfig,
  ): Promise<AudioState> {
    const id = `sound_${++this.soundIdCounter}_${alias}`;

    // Клонируем для множественного воспроизведения
    const soundInstance = instance.cloneNode() as HTMLAudioElement;

    const state: AudioState = {
      alias,
      config,
      instance: soundInstance,
      isPlaying: false,
      isPaused: false,
      id,
    };

    soundInstance.volume = config.fadeIn ? 0 : this.calculateVolume(config);
    soundInstance.loop = config.loop;
    soundInstance.playbackRate = config.playbackRate;
    soundInstance.preload = "auto";

    this.setupSoundHandlers(state);

    return state;
  }

  /**
   * Начинает воспроизведение
   */
  private async startPlayback(state: AudioState): Promise<void> {
    const { instance, config, alias } = state;
    const category = config.category || "sfx";
    const channel = this.channels.get(category)!;

    try {
      // Сбрасываем время для не-зацикленных звуков
      if (!config.loop) {
        instance.currentTime = 0;
      }

      // Используем play() с обработкой ошибок
      try {
        await instance.play();
      } catch (playError) {
        // Если не удалось воспроизвести, пробуем ещё раз после инициализации контекста
        if (!this.isAudioContextInitialized) {
          await this.initAudioContext();
          await instance.play();
        } else {
          throw playError;
        }
      }

      state.isPlaying = true;
      state.isPaused = false;

      this.activeSounds.set(state.id, state);
      channel.activeSounds.set(state.id, state);

      // Применяем fade-in
      if (config.fadeIn) {
        this.fadeInSound(state, config.fadeIn);
      }

      this.eventBus.emit("audio:play:started", {
        alias,
        id: state.id,
        category,
      });
    } catch (error) {
      console.error(`Failed to start playback for "${alias}":`, error);
      this.removeFromActive(state);
      throw error;
    }
  }

  /**
   * Останавливает воспроизведение
   */
  public stop(aliasOrId: string, fadeOut?: number): void {
    let state = this.activeSounds.get(aliasOrId);

    if (!state) {
      for (const sound of this.activeSounds.values()) {
        if (sound.alias === aliasOrId) {
          state = sound;
          break;
        }
      }
    }

    if (!state) return;

    if (fadeOut && fadeOut > 0) {
      this.fadeOutSound(state, fadeOut, () => {
        this.forceStop(state!);
      });
    } else {
      this.forceStop(state);
    }
  }

  /**
   * Принудительная остановка звука
   */
  private forceStop(state: AudioState): void {
    const { instance, id, alias } = state;

    try {
      instance.pause();
      instance.currentTime = 0;

      // Удаляем обработчики
      instance.onended = null;
      instance.onerror = null;

      this.removeFromActive(state);

      this.eventBus.emit("audio:play:stopped", { alias, id });
      this.processQueue();
    } catch (error) {
      console.error(`Failed to stop sound "${alias}":`, error);
    }
  }

  /**
   * Ставит звук на паузу
   */
  public pause(id: string): void {
    const state = this.activeSounds.get(id);
    if (!state || state.isPaused) return;

    state.instance.pause();
    state.isPaused = true;
    state.isPlaying = false;

    this.eventBus.emit("audio:play:paused", { id, alias: state.alias });
  }

  /**
   * Возобновляет воспроизведение
   */
  public async resume(id: string): Promise<void> {
    const state = this.activeSounds.get(id);
    if (!state || !state.isPaused) return;

    try {
      await state.instance.play();
      state.isPaused = false;
      state.isPlaying = true;
      this.eventBus.emit("audio:play:resumed", { id, alias: state.alias });
    } catch (error) {
      console.error(`Failed to resume sound "${state.alias}":`, error);
    }
  }

  /**
   * Воспроизводит фоновую музыку
   */
  public async playMusic(
    alias: string,
    config: Partial<AudioConfig> = {},
  ): Promise<AudioState | null> {
    // Останавливаем текущую музыку перед запуском новой
    this.stopCategory("music", 500);

    return this.play(alias, {
      category: "music",
      loop: true,
      volume: 0.7,
      fadeIn: 1000,
      priority: 100,
      ...config,
    });
  }

  /**
   * Воспроизводит звуковой эффект
   */
  public async playSFX(
    alias: string,
    config: Partial<AudioConfig> = {},
  ): Promise<AudioState | null> {
    return this.play(alias, {
      category: "sfx",
      loop: false,
      volume: 1.0,
      ...config,
    });
  }

  /**
   * Воспроизводит звук окружения
   */
  public async playAmbient(
    alias: string,
    config: Partial<AudioConfig> = {},
  ): Promise<AudioState | null> {
    return this.play(alias, {
      category: "ambient",
      loop: true,
      volume: 0.5,
      fadeIn: 2000,
      ...config,
    });
  }

  /**
   * Воспроизводит озвучку/диалог
   */
  public async playVoice(
    alias: string,
    config: Partial<AudioConfig> = {},
  ): Promise<AudioState | null> {
    return this.play(alias, {
      category: "voice",
      loop: false,
      volume: 1.0,
      priority: 90,
      ...config,
    });
  }

  /**
   * Ставит на паузу все звуки
   */
  public pauseAll(): void {
    for (const state of this.activeSounds.values()) {
      this.pause(state.id);
    }
    this.eventBus.emit("audio:all:paused", {});
  }

  /**
   * Возобновляет все звуки
   */
  public async resumeAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const state of this.activeSounds.values()) {
      if (state.isPaused) {
        promises.push(this.resume(state.id));
      }
    }

    await Promise.allSettled(promises);
    this.eventBus.emit("audio:all:resumed", {});
  }

  /**
   * Останавливает все звуки
   */
  public stopAll(fadeOut?: number): void {
    const states = Array.from(this.activeSounds.values());

    if (fadeOut && fadeOut > 0) {
      states.forEach((state) => this.stop(state.id, fadeOut));
    } else {
      states.forEach((state) => this.forceStop(state));
    }
  }

  /**
   * Останавливает все звуки в категории
   */
  public stopCategory(category: AudioCategory, fadeOut?: number): void {
    const channel = this.channels.get(category);
    if (!channel) return;

    const states = Array.from(channel.activeSounds.values());

    if (fadeOut && fadeOut > 0) {
      states.forEach((state) => this.stop(state.id, fadeOut));
    } else {
      states.forEach((state) => this.forceStop(state));
    }
  }

  /**
   * Глобальное отключение звука
   */
  public mute(): void {
    this.isGlobalMuted = true;

    for (const state of this.activeSounds.values()) {
      state.instance.volume = 0;
    }

    this.eventBus.emit("audio:muted", {});
  }

  /**
   * Включение звука
   */
  public unmute(): void {
    this.isGlobalMuted = false;

    for (const state of this.activeSounds.values()) {
      state.instance.volume = this.calculateVolume(state.config);
    }

    this.eventBus.emit("audio:unmuted", {});
  }

  /**
   * Отключает категорию звуков
   */
  public muteCategory(category: AudioCategory): void {
    const channel = this.channels.get(category);
    if (!channel) return;

    channel.isMuted = true;

    const states = Array.from(channel.activeSounds.values());
    states.forEach((state) => this.forceStop(state));
  }

  /**
   * Включает категорию звуков
   */
  public unmuteCategory(category: AudioCategory): void {
    const channel = this.channels.get(category);
    if (!channel) return;

    channel.isMuted = false;
  }

  /**
   * Устанавливает общую громкость
   */
  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));

    for (const state of this.activeSounds.values()) {
      state.instance.volume = this.calculateVolume(state.config);
    }

    this.eventBus.emit("audio:volume:changed", { volume: this.masterVolume });
  }

  /**
   * Устанавливает громкость категории
   */
  public setCategoryVolume(category: AudioCategory, volume: number): void {
    const channel = this.channels.get(category);
    if (!channel) return;

    channel.volume = Math.max(0, Math.min(1, volume));

    for (const state of channel.activeSounds.values()) {
      state.instance.volume = this.calculateVolume(state.config);
    }
  }

  /**
   * Рассчитывает итоговую громкость
   */
  private calculateVolume(config: AudioConfig): number {
    if (this.isGlobalMuted) return 0;

    const category = config.category || "sfx";
    const channel = this.channels.get(category);

    if (!channel || channel.isMuted) return 0;

    return this.masterVolume * channel.volume * config.volume;
  }

  /**
   * Плавное увеличение громкости
   */
  private fadeInSound(state: AudioState, duration: number): void {
    const targetVolume = this.calculateVolume(state.config);
    const startTime = Date.now();

    const fade = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      state.instance.volume = targetVolume * eased;

      if (progress < 1 && state.isPlaying) {
        requestAnimationFrame(fade);
      }
    };

    fade();
  }

  /**
   * Плавное уменьшение громкости
   */
  private fadeOutSound(
    state: AudioState,
    duration: number,
    onComplete: () => void,
  ): void {
    const startVolume = state.instance.volume;
    const startTime = Date.now();

    const fade = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      state.instance.volume = startVolume * (1 - eased);

      if (progress < 1) {
        requestAnimationFrame(fade);
      } else {
        state.instance.volume = 0;
        onComplete();
      }
    };

    fade();
  }

  /**
   * Добавляет звук в очередь ожидания
   */
  private addToQueue(
    alias: string,
    config: AudioConfig,
  ): Promise<AudioState | null> {
    return new Promise((resolve) => {
      this.waitingQueue.push({ alias, config, resolve });
    });
  }

  /**
   * Обрабатывает очередь ожидания
   */
  private processQueue(): void {
    if (this.waitingQueue.length === 0) return;

    const next = this.waitingQueue.shift()!;
    this.play(next.alias, next.config).then((state) => {
      next.resolve(state);
    });
  }

  /**
   * Останавливает звук с наименьшим приоритетом в категории
   */
  private stopLowestPriority(category: AudioCategory): void {
    const channel = this.channels.get(category);
    if (!channel) return;

    let lowestPriority = Infinity;
    let lowestState: AudioState | null = null;

    for (const state of channel.activeSounds.values()) {
      const priority = state.config.priority ?? 0;
      if (priority < lowestPriority) {
        lowestPriority = priority;
        lowestState = state;
      }
    }

    if (lowestState) {
      this.forceStop(lowestState);
    }
  }

  /**
   * Удаляет звук из активных
   */
  private removeFromActive(state: AudioState): void {
    const category = state.config.category || "sfx";
    const channel = this.channels.get(category);

    state.isPlaying = false;
    state.isPaused = false;

    this.activeSounds.delete(state.id);

    if (channel) {
      channel.activeSounds.delete(state.id);
    }
  }

  /**
   * Настройка обработчиков завершения звука
   */
  private setupSoundHandlers(state: AudioState): void {
    state.instance.onended = () => {
      if (state.config.loop) {
        state.instance.currentTime = 0;
        state.instance.play().catch((error) => {
          console.error(`Failed to loop sound "${state.alias}":`, error);
        });
      } else {
        this.removeFromActive(state);
        this.eventBus.emit("audio:play:completed", {
          alias: state.alias,
          id: state.id,
        });
        this.processQueue();
      }
    };

    state.instance.onerror = (error) => {
      console.error(`Audio error for "${state.alias}":`, error);
      this.removeFromActive(state);
      this.processQueue();
    };
  }

  /**
   * Мёржит конфигурацию с настройками по умолчанию
   */
  private mergeConfig(config: Partial<AudioConfig>): AudioConfig {
    return {
      volume: config.volume ?? 1.0,
      loop: config.loop ?? false,
      playbackRate: config.playbackRate ?? 1.0,
      fadeIn: config.fadeIn,
      fadeOut: config.fadeOut,
      category: config.category || "sfx",
      priority: config.priority || 0,
    };
  }

  /**
   * Получает информацию о текущем состоянии звуков
   */
  public getAudioState(): {
    masterVolume: number;
    isMuted: boolean;
    activeCount: number;
    audioContextReady: boolean;
    pendingCount: number;
  } {
    return {
      masterVolume: this.masterVolume,
      isMuted: this.isGlobalMuted,
      activeCount: this.activeSounds.size,
      audioContextReady: this.isAudioContextInitialized,
      pendingCount: this.pendingPlays.length,
    };
  }

  /**
   * Проверяет, воспроизводится ли звук
   */
  public isPlaying(aliasOrId: string): boolean {
    const state =
      this.activeSounds.get(aliasOrId) ||
      Array.from(this.activeSounds.values()).find((s) => s.alias === aliasOrId);

    return state?.isPlaying ?? false;
  }

  /**
   * Очищает все ресурсы
   */
  public destroy(): void {
    this.stopAll();
    this.waitingQueue.length = 0;
    this.pendingPlays.length = 0;
    this.activeSounds.clear();

    for (const channel of this.channels.values()) {
      channel.activeSounds.clear();
    }

    this.channels.clear();

    if (this.audioContext) {
      this.audioContext.close().catch(console.error);
      this.audioContext = null;
    }

    this.isAudioContextInitialized = false;
  }

  /**
   * Для отладки
   */
  public debug(): void {
    console.group("AudioManager Debug");
    console.log("Master volume:", this.masterVolume);
    console.log("Global muted:", this.isGlobalMuted);
    console.log("AudioContext ready:", this.isAudioContextInitialized);
    console.log("Active sounds:", this.activeSounds.size);
    console.log("Pending plays:", this.pendingPlays.length);
    console.log("Queue size:", this.waitingQueue.length);

    console.group("Active sounds:");
    for (const [id, state] of this.activeSounds.entries()) {
      console.log(
        `${id}: alias=${state.alias}, playing=${state.isPlaying}, paused=${state.isPaused}`,
      );
    }
    console.groupEnd();

    console.groupEnd();
  }
}
