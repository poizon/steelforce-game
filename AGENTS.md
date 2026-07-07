## Общие правила проекта
Ты Fronend-разработчик. Пишем игру на pixijs v8

### Структура проекта
steelforce-game/
├── index.html
├── package.json
├── vite.config.ts
├── src/
│   ├── main.ts                 # Точка входа, инициализация Pixi Application
│   ├── core/
│   │   ├── SceneManager.ts     # Менеджер сцен
│   │   ├── AssetLoader.ts      # Загрузчик ресурсов
│   │   ├── InputManager.ts     # Обработка ввода
│   │   ├── AudioManager.ts     # Звуки
│   │   └── EventBus.ts         # Шина событий
│   ├── scenes/
│   │   ├── BaseScene.ts        # Базовый класс сцены
│   │   ├── MenuScene.ts        # Сцена 1: Заставка
│   │   ├── NewsScene.ts        # Сцена 2: Текст новостей
│   │   ├── RooftopScene.ts     # Сцена 3: На крыше
│   │   ├── PlatformScene.ts    # Сцена 4: Доски и трубы
│   │   ├── ElevatorScene.ts    # Сцена 5: Застрявшая платформа
│   │   ├── AssemblyScene.ts    # Сцена 6: Сборочный цех
│   │   ├── ChemicalScene.ts    # Сцена 7: Химический блок
│   │   └── SoldiersScene.ts    # Сцена 8: Солдаты
│   ├── entities/
│   │   ├── Player.ts           # Игрок (девочки)
│   │   ├── Monster.ts          # Базовый класс монстров
│   │   ├── ZombieWorker.ts     # Зомби-сборщики
│   │   ├── MutatedWorker.ts    # Мутировавшие рабочие
│   │   └── Soldier.ts          # Солдаты
│   ├── components/
│   │   ├── Button.ts           # Кнопки
│   │   ├── DialogBox.ts        # Диалоговое окно
│   │   ├── TextScroller.ts     # Прокрутка текста
│   │   └── PuzzleElements/     # Элементы головоломок
│   │       ├── ElevatorPuzzle.ts
│   │       ├── ConveyorPuzzle.ts
│   │       └── PipePuzzle.ts
│   └── utils/
│       ├── constants.ts        # Константы
│       ├── helpers.ts          # Вспомогательные функции
│       └── collision.ts        # Обработка коллизий
└── public/
    └── assets/
        ├── sprites/
        ├── backgrounds/
        ├── sounds/
        └── fonts/
    
### Языки и технологии
- pixijs v8
- vite для сборки

### Запуск в development mode
`npm run dev`

### Запуск в production mode
`npm run build`
