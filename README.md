# DndCrime Landing Page

Лендинг [DndCrime](https://dnd-crime.gistrec.cloud) — портала для офлайн D&D-партий.
Standalone-версия страницы: тёмный нуар-фэнтези с золотым акцентом, canvas-анимации
(интерактивный d20, угли, созвездия дракона/бехолдера/черепа, поле парящих рун-костей),
self-hosted шрифты.

## Стек

Vite + React 18 + TypeScript + Tailwind CSS 4. Canvas-эффекты — свой rAF-координатор
(pause offscreen, prefers-reduced-motion, DPR ≤ 2), без сторонних анимационных библиотек.

## Команды

```bash
yarn          # установка зависимостей
yarn dev      # dev-сервер на :5173
yarn build    # tsc -b && vite build → dist/
yarn lint     # eslint
```

## Настройка темы

Все параметры — константы в `src/landing/accent.ts`:

- `LANDING_ACCENT` — акцентный цвет (перекрашивает CSS-палитру и canvas-частицы);
- `LANDING_TEXTURE` — фоновая текстура: `hex` / `grid` / `dots` / `none`;
- `LANDING_EMBERS` — угли в hero-секции.
