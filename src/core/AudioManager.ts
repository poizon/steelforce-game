import { AssetLoader } from "./AssetLoader";

type AudioCategory = "music" | "sfx" | "ambient" | "voice" | "ui";

interface AudioConfig {
  volume?: number;
  loop?: boolean;
  category?: AudioCategory;
  playbackRate?: number;
}

interface ActiveSound {
  id: number;
  audio: HTMLAudioElement;
  alias: string;
  config: AudioConfig;
}

export class AudioManager {
  private loader: AssetLoader | null = null;
  private masterVolume: number = 1.0;
  private isMuted: boolean = false;
  private isAudioContextReady: boolean = false;
  private soundIdCounter: number = 0;
  private activeSounds: Map<number, ActiveSound> = new Map();
  private categoryVolume: Record<AudioCategory, number> = {
    music: 0.7,
    sfx: 1.0,
    ambient: 0.5,
    voice: 1.0,
    ui: 0.8,
  };

  constructor(loader?: AssetLoader) {
    if (loader) {
      this.loader = loader;
    }
  }

  setAssetLoader(loader: AssetLoader): void {
    this.loader = loader;
    this.initAudioContext();
  }

  private initAudioContext(): void {
    if (this.isAudioContextReady) return;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
    this.isAudioContextReady = true;
  }

  private getAudio(alias: string): HTMLAudioElement | null {
    if (!this.loader) return null;
    
    try {
      const sound = this.loader.get(alias);
      if (sound instanceof HTMLAudioElement) {
        return sound;
      }
      if (typeof sound === "object" && sound !== null && "htmlElement" in sound) {
        const elem = (sound as { htmlElement?: HTMLAudioElement }).htmlElement;
        if (elem instanceof HTMLAudioElement) {
          return elem;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  private calculateVolume(config: AudioConfig): number {
    if (this.isMuted) return 0;
    const category = config.category || "sfx";
    return this.masterVolume * this.categoryVolume[category] * (config.volume ?? 1.0);
  }

  play(alias: string, config: Partial<AudioConfig> = {}): number | null {
    this.initAudioContext();
    
    const audio = this.getAudio(alias);
    if (!audio) return null;

    const audioCopy = audio.cloneNode() as HTMLAudioElement;
    const volume = this.calculateVolume(config);
    audioCopy.volume = volume;
    audioCopy.loop = config.loop ?? false;
    audioCopy.playbackRate = config.playbackRate ?? 1.0;

    audioCopy.play().catch(() => {});

    const id = ++this.soundIdCounter;
    this.activeSounds.set(id, {
      id,
      audio: audioCopy,
      alias,
      config: { ...config } as AudioConfig,
    });

    // Удаляем из активных по завершению
    audioCopy.onended = () => {
      this.activeSounds.delete(id);
    };

    return id;
  }

  playMusic(alias: string, config: Partial<AudioConfig> = {}): number | null {
    this.stopCategory("music");
    return this.play(alias, { loop: true, volume: 0.7, category: "music", ...config });
  }

  playSFX(alias: string, config: Partial<AudioConfig> = {}): number | null {
    return this.play(alias, { loop: false, volume: 1.0, category: "sfx", ...config });
  }

  playAmbient(alias: string, config: Partial<AudioConfig> = {}): number | null {
    return this.play(alias, { loop: true, volume: 0.5, category: "ambient", ...config });
  }

  stop(idOrAlias: string | number): void {
    let sound: ActiveSound | undefined;
    
    // Ищем по id или alias
    if (typeof idOrAlias === "number") {
      sound = this.activeSounds.get(idOrAlias);
    } else {
      for (const s of this.activeSounds.values()) {
        if (s.alias === idOrAlias) {
          sound = s;
          break;
        }
      }
    }

    if (!sound) return;

    sound.audio.pause();
    sound.audio.onended = null;
    this.activeSounds.delete(sound.id);
  }

  stopAll(): void {
    for (const sound of this.activeSounds.values()) {
      sound.audio.pause();
      sound.audio.onended = null;
    }
    this.activeSounds.clear();
  }

  stopCategory(category: AudioCategory): void {
    for (const [id, sound] of this.activeSounds.entries()) {
      if (sound.config.category === category) {
        sound.audio.pause();
        sound.audio.onended = null;
        this.activeSounds.delete(id);
      }
    }
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  setCategoryVolume(category: AudioCategory, volume: number): void {
    this.categoryVolume[category] = Math.max(0, Math.min(1, volume));
  }

  mute(): void {
    this.isMuted = true;
  }

  unmute(): void {
    this.isMuted = false;
  }

  pauseAll(): void {
    for (const sound of this.activeSounds.values()) {
      sound.audio.pause();
    }
  }

  resumeAll(): void {
    for (const sound of this.activeSounds.values()) {
      if (sound.config.loop || sound.audio.currentTime < sound.audio.duration) {
        sound.audio.play().catch(() => {});
      }
    }
  }

  destroy(): void {
    this.stopAll();
    this.isAudioContextReady = false;
  }

  isPlaying(idOrAlias: string | number): boolean {
    if (typeof idOrAlias === "number") {
      return this.activeSounds.has(idOrAlias);
    }
    for (const sound of this.activeSounds.values()) {
      if (sound.alias === idOrAlias && !sound.audio.paused) {
        return true;
      }
    }
    return false;
  }

  debug(): void {
    console.log("AudioManager: volume=", this.masterVolume, "muted=", this.isMuted);
  }
}
