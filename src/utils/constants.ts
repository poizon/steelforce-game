// Размеры игры
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

// Название игры
export const GAME_TITLE = 'SteelForce: Escape from Zone';
export const GAME_VERSION = '0.1.0';

// Настройки сцен
export const DIALOG_SPEED = 30; // мс на символ
export const SCENE_TRANSITION_DURATION = 1000; // мс

// Настройки игрока
export const PLAYER_SPEED = 3;
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_INVINCIBILITY_DURATION = 60; // кадры

// Настройки монстров
export const ZOMBIE_SPEED = 1.5;
export const ZOMBIE_DAMAGE = 20;
export const ZOMBIE_DETECTION_RADIUS = 150;

export const MUTANT_SPEED = 2;
export const MUTANT_DAMAGE = 30;
export const MUTANT_DETECTION_RADIUS = 200;

// Сцены
export const SCENES = {
  MENU: 'menu',
  NEWS: 'news',
  ROOFTOP: 'rooftop',
  PLATFORM: 'platform',
  ELEVATOR: 'elevator',
  ASSEMBLY: 'assembly',
  CHEMICAL: 'chemical',
  SOLDIERS: 'soldiers',
} as const;

// Пути к ресурсам
export const ASSET_PATHS = {
  BACKGROUNDS: 'assets/backgrounds/',
  SPRITES: 'assets/sprites/',
  SOUNDS: 'assets/sounds/',
  FONTS: 'assets/fonts/',
} as const;
