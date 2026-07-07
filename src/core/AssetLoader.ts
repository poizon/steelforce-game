import { Assets, Texture, Spritesheet, Sound } from 'pixi.js';
import { EventBus } from './EventBus';

export interface AssetManifest {
  bundles: AssetBundle[];
}

export interface AssetBundle {
  name: string;
  assets: AssetDefinition[];
}

export interface AssetDefinition {
  alias: string;
  src: string;
  format?: string;
  loadType?: 'texture' | 'spritesheet' | 'sound' | 'font' | 'json';
  data?: Record<string, unknown>;
}

interface LoadProgress {
  bundleName: string;
  assetAlias: string;
  progress: number; // 0-1
  loadedCount: number;
  totalCount: number;
}

type ProgressCallback = (progress: number) => void;

export class AssetLoader {
  private eventBus: EventBus;

  private loadedAssets: Map<string, unknown> = new Map();
  private loadedBundles: Set<string> = new Set();
  private loadingPromises: Map<string, Promise<void>> = new Map();

  private _isLoading: boolean = false;
  private _totalAssets: number = 0;
  private _loadedAssetsCount: number = 0;

  public onProgress?: ProgressCallback;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Загружает полный манифест ресурсов
   */
  public async loadManifest(manifest: AssetManifest): Promise<void> {
    if (this._isLoading) {
      console.warn('Asset loading already in progress');
      return;
    }

    try {
      this._isLoading = true;
      this.eventBus.emit('assets:loading:start', { totalBundles: manifest.bundles.length });

      // Подсчитываем общее количество ресурсов
      this._totalAssets = manifest.bundles.reduce(
        (total, bundle) => total + bundle.assets.length,
        0
      );
      this._loadedAssetsCount = 0;

      // Загружаем бандлы последовательно
      for (const bundle of manifest.bundles) {
        await this.loadBundle(bundle);
      }

      this.eventBus.emit('assets:loading:complete', {
        totalLoaded: this._loadedAssetsCount,
        bundles: Array.from(this.loadedBundles),
      });

      console.log(`All assets loaded successfully. Total: ${this._loadedAssetsCount}`);

    } catch (error) {
      console.error('Failed to load manifest:', error);
      this.eventBus.emit('assets:loading:error', { error });
      throw error;
    } finally {
      this._isLoading = false;
    }
  }

  /**
   * Загружает отдельный бандл ресурсов
   */
  private async loadBundle(bundle: AssetBundle): Promise<void> {
    // Проверяем, не загружен ли уже этот бандл
    if (this.loadedBundles.has(bundle.name)) {
      console.log(`Bundle "${bundle.name}" already loaded, skipping...`);
      return;
    }

    // Проверяем, не загружается ли уже этот бандл
    const existingPromise = this.loadingPromises.get(bundle.name);
    if (existingPromise) {
      console.log(`Bundle "${bundle.name}" is already loading, waiting...`);
      return existingPromise;
    }

    const loadPromise = this.processBundle(bundle);
    this.loadingPromises.set(bundle.name, loadPromise);

    try {
      await loadPromise;
      this.loadedBundles.add(bundle.name);
      console.log(`Bundle "${bundle.name}" loaded successfully`);
    } finally {
      this.loadingPromises.delete(bundle.name);
    }
  }

  /**
   * Обрабатывает загрузку ресурсов бандла
   */
  private async processBundle(bundle: AssetBundle): Promise<void> {
    this.eventBus.emit('assets:bundle:start', {
      bundleName: bundle.name,
      assetCount: bundle.assets.length,
    });

    // Загружаем ресурсы параллельно в рамках бандла
    const loadPromises = bundle.assets.map(asset =>
      this.loadAsset(asset, bundle.name)
    );

    await Promise.all(loadPromises);

    this.eventBus.emit('assets:bundle:complete', {
      bundleName: bundle.name,
    });
  }

  /**
   * Загружает отдельный ресурс
   */
  private async loadAsset(
    asset: AssetDefinition,
    bundleName: string
  ): Promise<void> {
    try {
      // Проверяем, не загружен ли уже этот ресурс
      if (this.loadedAssets.has(asset.alias)) {
        console.warn(`Asset "${asset.alias}" already loaded`);
        this.updateProgress(bundleName, asset.alias);
        return;
      }

      const loadType = asset.loadType || this.detectLoadType(asset.src);

      let loadedAsset: unknown;

      switch (loadType) {
        case 'texture':
          loadedAsset = await this.loadTexture(asset);
          break;
        case 'spritesheet':
          loadedAsset = await this.loadSpritesheet(asset);
          break;
        case 'sound':
          loadedAsset = await this.loadSound(asset);
          break;
        case 'font':
          loadedAsset = await this.loadFont(asset);
          break;
        case 'json':
          loadedAsset = await this.loadJSON(asset);
          break;
        default:
          throw new Error(`Unknown load type: ${loadType}`);
      }

      // Сохраняем загруженный ресурс
      this.loadedAssets.set(asset.alias, loadedAsset);

      // Обновляем прогресс
      this.updateProgress(bundleName, asset.alias);

    } catch (error) {
      console.error(`Failed to load asset "${asset.alias}":`, error);

      this.eventBus.emit('assets:asset:error', {
        bundleName,
        assetAlias: asset.alias,
        error,
      });

      // Загружаем плейсхолдер вместо отсутствующего ресурса
      await this.loadPlaceholder(asset);
    }
  }

  /**
   * Загружает текстуру
   */
  private async loadTexture(asset: AssetDefinition): Promise<Texture> {
    const texture = await Assets.load(asset.src);

    if (!texture) {
      throw new Error(`Failed to load texture: ${asset.src}`);
    }

    return texture;
  }

  /**
   * Загружает спрайтшит (атлас)
   */
  private async loadSpritesheet(asset: AssetDefinition): Promise<Spritesheet> {
    const spritesheet = await Assets.load(asset.src);

    if (!spritesheet) {
      throw new Error(`Failed to load spritesheet: ${asset.src}`);
    }

    return spritesheet;
  }

  /**
   * Загружает звуковой файл
   */
  private async loadSound(asset: AssetDefinition): Promise<Sound> {
    const sound = await Assets.load({
      src: asset.src,
      loadParser: 'loadSound',
      ...asset.data,
    });

    if (!sound) {
      throw new Error(`Failed to load sound: ${asset.src}`);
    }

    // Предзагружаем аудио для быстрого воспроизведения
    if (sound instanceof HTMLAudioElement) {
      sound.preload = 'auto';
      sound.load();
    }

    return sound;
  }

  /**
   * Загружает шрифт
   */
  private async loadFont(asset: AssetDefinition): Promise<FontFace> {
    const fontName = asset.alias;

    // Проверяем, загружен ли уже шрифт
    const existingFont = document.fonts.check(`1em ${fontName}`);
    if (existingFont) {
      return document.fonts.values().next().value;
    }

    const font = new FontFace(fontName, `url(${asset.src})`);
    const loadedFont = await font.load();
    document.fonts.add(loadedFont);

    return loadedFont;
  }

  /**
   * Загружает JSON файл
   */
  private async loadJSON(asset: AssetDefinition): Promise<unknown> {
    const response = await fetch(asset.src);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    return json;
  }

  /**
   * Загружает плейсхолдер для отсутствующего ресурса
   */
  private async loadPlaceholder(asset: AssetDefinition): Promise<void> {
    // Создаём простой цветной квадрат как плейсхолдер
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Рисуем предупреждающий узор
      ctx.fillStyle = '#FF00FF'; // Яркий мадженов цвет
      ctx.fillRect(0, 0, 64, 64);

      ctx.fillStyle = '#000000';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('MISSING', 32, 32);
    }

    const texture = Texture.from(canvas);
    this.loadedAssets.set(asset.alias, texture);
  }

  /**
   * Определяет тип загрузки по расширению файла
   */
  private detectLoadType(src: string): AssetDefinition['loadType'] {
    const extension = src.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp':
        return 'texture';
      case 'json':
        return src.includes('spritesheet') ? 'spritesheet' : 'json';
      case 'mp3':
      case 'wav':
      case 'ogg':
      case 'm4a':
        return 'sound';
      case 'ttf':
      case 'otf':
      case 'woff':
      case 'woff2':
        return 'font';
      default:
        return 'texture'; // По умолчанию считаем текстурой
    }
  }

  /**
   * Обновляет прогресс загрузки
   */
  private updateProgress(bundleName: string, assetAlias: string): void {
    this._loadedAssetsCount++;
    const progress = this._loadedAssetsCount / this._totalAssets;

    const progressData: LoadProgress = {
      bundleName,
      assetAlias,
      progress,
      loadedCount: this._loadedAssetsCount,
      totalCount: this._totalAssets,
    };

    // Вызываем коллбэк прогресса
    this.onProgress?.(progress);

    // Эмитим событие прогресса
    this.eventBus.emit('assets:progress', progressData);
  }

  /**
   * Получает загруженный ресурс по алиасу
   */
  public get<T = unknown>(alias: string): T {
    const asset = this.loadedAssets.get(alias);

    if (!asset) {
      console.warn(`Asset "${alias}" not found. Returning null.`);
      return null as T;
    }

    return asset as T;
  }

  /**
   * Получает текстуру по алиасу
   */
  public getTexture(alias: string): Texture {
    const asset = this.get<Texture>(alias);

    if (!asset) {
      console.warn(`Texture "${alias}" not found. Returning empty texture.`);
      return Texture.EMPTY;
    }

    return asset;
  }

  /**
   * Получает звук по алиасу
   */
  public getSound(alias: string): Sound {
    const asset = this.get<Sound>(alias);

    if (!asset) {
      throw new Error(`Sound "${alias}" not found`);
    }

    return asset;
  }

  /**
   * Проверяет, загружен ли ресурс
   */
  public has(alias: string): boolean {
    return this.loadedAssets.has(alias);
  }

  /**
   * Проверяет, загружен ли бандл
   */
  public isBundleLoaded(bundleName: string): boolean {
    return this.loadedBundles.has(bundleName);
  }

  /**
   * Выгружает ресурс из памяти
   */
  public unload(alias: string): void {
    const asset = this.loadedAssets.get(alias);

    if (asset instanceof Texture) {
      asset.destroy(true);
    }

    this.loadedAssets.delete(alias);
  }

  /**
   * Выгружает бандл ресурсов
   */
  public async unloadBundle(bundleName: string): Promise<void> {
    if (!this.loadedBundles.has(bundleName)) {
      return;
    }

    // Находим все ресурсы бандла и выгружаем их
    for (const [alias, asset] of this.loadedAssets.entries()) {
      if (asset && typeof asset === 'object' && 'bundleName' in asset) {
        if ((asset as any).bundleName === bundleName) {
          this.unload(alias);
        }
      }
    }

    this.loadedBundles.delete(bundleName);
  }

  /**
   * Выгружает все ресурсы
   */
  public unloadAll(): void {
    for (const [alias, asset] of this.loadedAssets.entries()) {
      if (asset instanceof Texture) {
        asset.destroy(true);
      }
    }

    this.loadedAssets.clear();
    this.loadedBundles.clear();
    this._loadedAssetsCount = 0;
    this._totalAssets = 0;
  }

  /**
   * Предзагружает ресурсы для определённой сцены
   */
  public async preloadScene(sceneName: string): Promise<void> {
    const sceneBundle = `${sceneName}-assets`;

    if (this.isBundleLoaded(sceneBundle)) {
      console.log(`Assets for scene "${sceneName}" already loaded`);
      return;
    }

    // Загружаем ресурсы сцены
    const sceneAssets = this.getSceneAssets(sceneName);
    await Promise.all(
      sceneAssets.map(asset => this.loadAsset(asset, sceneBundle))
    );
  }

  /**
   * Получает список ресурсов для сцены
   */
  private getSceneAssets(sceneName: string): AssetDefinition[] {
    // Можно хранить маппинг сцен на ресурсы в конфигурации
    const sceneAssetsMap: Record<string, AssetDefinition[]> = {
      menu: [
        { alias: 'menu-bg', src: '/assets/backgrounds/menu-bg.png' },
        { alias: 'btn-start', src: '/assets/sprites/btn-start.png' },
      ],
      assembly: [
        { alias: 'assembly-bg', src: '/assets/backgrounds/assembly-bg.png' },
        { alias: 'zombie-worker', src: '/assets/sprites/zombie-worker.png' },
        { alias: 'gear', src: '/assets/sprites/gear.png' },
      ],
      // Добавляем ресурсы для других сцен
    };

    return sceneAssetsMap[sceneName] || [];
  }

  /**
   * Получает статистику загрузки
   */
  public getStats() {
    return {
      totalAssets: this._totalAssets,
      loadedAssets: this._loadedAssetsCount,
      loadedBundles: this.loadedBundles.size,
      isLoading: this._isLoading,
      progress: this._totalAssets > 0
        ? this._loadedAssetsCount / this._totalAssets
        : 0,
      memoryUsage: this.calculateMemoryUsage(),
    };
  }

  /**
   * Примерный подсчёт использования памяти
   */
  private calculateMemoryUsage(): string {
    let totalSize = 0;

    for (const asset of this.loadedAssets.values()) {
      if (asset instanceof Texture) {
        totalSize += asset.width * asset.height * 4; // Примерно 4 байта на пиксель
      } else if (asset instanceof HTMLAudioElement) {
        totalSize += asset.duration * 16000; // Примерный размер аудио
      }
    }

    // Конвертируем в читаемый формат
    if (totalSize > 1024 * 1024) {
      return `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
    } else if (totalSize > 1024) {
      return `${(totalSize / 1024).toFixed(2)} KB`;
    } else {
      return `${totalSize} bytes`;
    }
  }

  /**
   * Для отладки: выводит список загруженных ресурсов
   */
  public debug(): void {
    console.group('AssetLoader Debug');
    console.log('Total assets:', this._totalAssets);
    console.log('Loaded assets:', this._loadedAssetsCount);
    console.log('Loaded bundles:', Array.from(this.loadedBundles));
    console.log('Is loading:', this._isLoading);
    console.log('Memory usage:', this.calculateMemoryUsage());

    console.group('Loaded assets:');
    for (const [alias, asset] of this.loadedAssets.entries()) {
      const type = asset instanceof Texture ? 'Texture' :
                   asset instanceof HTMLAudioElement ? 'Audio' :
                   asset instanceof FontFace ? 'Font' :
                   typeof asset;
      console.log(`  ${alias}: ${type}`);
    }
    console.groupEnd();

    console.groupEnd();
  }
}
