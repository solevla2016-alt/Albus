# 🚀 Albus — Modern Real-Time Chat

Современный real-time мессенджер уровня Telegram/Slack для команды **Albus**.
WebSocket-общение, медиа, голосовые с транскрипцией, аудио/видеозвонки,
демонстрация экрана и AI-ассистент — всё в одном.

![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat&logo=python&logoColor=white)
![Django](https://img.shields.io/badge/Django-5.1-092E20?style=flat&logo=django&logoColor=white)
![Channels](https://img.shields.io/badge/Django%20Channels-4.1-094b70?style=flat&logo=django&logoColor=white)
![Daphne](https://img.shields.io/badge/Daphne-ASGI-6fbbd3?style=flat)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?style=flat&logo=tailwindcss&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=flat&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-FF4438?style=flat&logo=redis&logoColor=white)
![State Manage](https://img.shields.io/badge/State%20Manage-Zustand-78350f?style=flat)
![License](https://img.shields.io/badge/License-MIT-green?style=flat)

## ✨ Возможности

**Общение**
- Real-time сообщения через WebSocket (Django Channels + Redis)
- Комнаты (публичные и приватные), создание/вступление/выход
- Ответы на сообщения (цитаты) и редактирование с флагом «изменено»
- Индикатор «печатает...» и онлайн-статус участников
- Счётчик непрочитанных сообщений в сайдбаре

**Звонки и демонстрация экрана**
- 📞 Аудио- и видеозвонки 1:1 (WebRTC) прямо в чате
- Кнопки звонка любому онлайн-участнику из списка участников комнаты
- Входящие/исходящие вызовы, «занято», отмена/отклонение/завершение, тишина микрофона
- 🖥 Демонстрация экрана участникам группы

**Модерация и роли**
- Роли: пользователь / модератор / администратор
- Назначение модератора прямо в UI (только у администраторов и staff)
- Блокировка/разблокировка участников в комнате, список банов
- Удаление сообщений по правам

**Медиа**
- Вложения: изображения, видео, файлы
- Запись голосовых сообщений прямо в чате (MediaRecorder)
- **Автотранскрипция голосовых в текст** (Google Web Speech API)

**Умные функции**
- **AI-ассистент** для разработки — `/ai ваш вопрос` (облачный GigaChat)
- Поиск по сообщениям в комнате
- Закрепление важных сообщений
- Реакции-эмодзи на сообщениях (👍 ❤️ 😂 🔥)

**Серверы и профиль**
- Серверы с приглашениями по токену и вступлением по ссылке
- Профиль: статус, аватар, дата рождения, настройки приватности сообщений

**Интерфейс**
- Тёмная и светлая темы (авто + ручное переключение)
- Glassmorphism, плавные анимации (Framer Motion)
- Мобильная адаптивность (Mobile First)

## 🏗 Архитектура

```
├── config/                 # Django 5.1 + Channels + Daphne
│   ├── asgi.py             # ASGI с WebSocket роутингом
│   ├── settings.py         # PostgreSQL, Redis, CORS, AI
│   └── urls.py             # REST API маршруты
├── users/                  # Кастомная модель User + Auth API
├── chat/                   # Core-приложение чата
│   ├── models.py           # ChatRoom, Message, Reaction, ReadStatus, RoomBan
│   ├── consumers.py        # WebSocket consumer (чат, presence, звонки, скрин)
│   ├── permissions.py      # Роли, модерация, баны
│   ├── serializers.py      # DRF сериализаторы
│   ├── api_views.py        # REST эндпоинты (upload, search, transcribe, bans)
│   ├── ai_service.py       # AI-ассистент (GigaChat)
│   └── speech_service.py   # Транскрипция голосовых
│
└── frontend/               # Next.js 14 + TypeScript + Tailwind
    └── src/
        ├── app/            # App Router страницы (chat, login, register)
        ├── components/     # MessageBubble, ChatInput, Sidebar, ChatWindow,
        │                   # CallPanel, MembersPanel, ScreenShareBar...
        ├── hooks/          # useIsMobile и др.
        └── lib/            # Zustand store, WebSocket hook, calls/ringtone API
```

## ⚙️ Технологии

**Backend**
- Python 3.11+, Django 5.1, Django Channels 4.1, Daphne
- PostgreSQL 15, Redis 7 (Channel Layer + звонки/presence)
- DRF, django-cors-headers, Poetry, Ruff, Pytest
- SpeechRecognition + pydub + imageio-ffmpeg (транскрипция)
- httpx + OpenRouter (AI)

**Frontend**
- Next.js 14 (App Router), TypeScript (strict)
- Tailwind CSS, Framer Motion, Zustand, Lucide Icons
- WebRTC (RTCPeerConnection) для звонков и демонстрации экрана

## 🚀 Быстрый старт

### 1. Инфраструктура (PostgreSQL + Redis)

```bash
docker compose up -d
```

### 2. Backend

```bash
poetry install
poetry shell

python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser

# Запуск ASGI-сервера с поддержкой WebSocket
daphne -b 0.0.0.0 -p 8000 config.asgi:application
# или
python manage.py runserver 8000
```

### 3. Frontend

```bash
cd frontend
npm install

# Windows: добавляем node в PATH
$env:Path = "C:\Users\<имя>\Documents\DEVTOOLS\nodejs-v20;" + $env:Path
npm run dev
```

Откройте **http://localhost:3000** в двух браузерах/вкладках и общайтесь!

### 4. AI-ассистент

Без ключа локального бота нет — AI отвечает только через облачный GigaChat. Для доступа задайте в `.env`
ключи из кабинета разработчиков Сбера (developers.sber.ru):
```bash
GIGACHAT_CLIENT_ID=...
GIGACHAT_CLIENT_SECRET=...
```

## 🤖 Как использовать AI

В поле ввода чата напишите:
```
/ai как создать модель в Django?
```
AI ответит прямо в чате зелёным пузырём.

## 🧭 API

| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/auth/register/` | Регистрация |
| POST | `/api/auth/login/` | Вход |
| POST | `/api/auth/logout/` | Выход |
| GET | `/api/auth/me/` | Текущий пользователь |
| GET | `/api/auth/users/` | Список пользователей |
| PATCH | `/api/auth/profile/` | Обновление профиля |
| POST | `/api/auth/avatar/` | Загрузка аватара |
| POST | `/api/auth/set-role/` | Назначение роли (admin/staff) |
| GET | `/api/chat/servers/` | Список серверов |
| POST | `/api/chat/servers/create/` | Создать сервер |
| GET | `/api/chat/servers/{id}/invite/` | Токен приглашения |
| POST | `/api/chat/servers/join/{token}/` | Вступить по токену |
| GET | `/api/chat/rooms/` | Список комнат (с непрочитанными) |
| POST | `/api/chat/rooms/create/` | Создать комнату |
| GET | `/api/chat/rooms/{id}/messages/` | История сообщений |
| DELETE | `/api/chat/rooms/{id}/messages/{message_id}/` | Удалить сообщение |
| GET | `/api/chat/rooms/{id}/search/?q=` | Поиск по сообщениям |
| GET | `/api/chat/rooms/{id}/bans/` | Список банов |
| POST | `/api/chat/rooms/{id}/bans/` | Заблокировать участника |
| DELETE | `/api/chat/rooms/{id}/bans/{user_id}/` | Разблокировать |
| POST | `/api/chat/rooms/{id}/join/` | Вступить в комнату |
| POST | `/api/chat/rooms/{id}/leave/` | Покинуть комнату |
| POST | `/api/chat/rooms/{id}/members/` | Добавить участника |
| POST | `/api/chat/rooms/{id}/upload/` | Загрузка вложения |
| POST | `/api/chat/rooms/{id}/transcribe/` | Транскрипция голосового |

**WebSocket:** `ws://localhost:8000/ws/chat/{room_name}/` — чат, онлайн-статус,
звонки и демонстрация экрана. Колл-сигналинг (offer/answer/candidate) идёт
тем же WS-каналом по полям `target`/`call_id`.

## 🚢 Деплой

Проект готов к деплою: `vercel.json` (фронтенд), `render.yaml` (бэкенд-блупринт),
поддержка `DATABASE_URL`/`REDIS_URL`. Пошаговая инструкция — в **`DEPLOY.md`**.

---

© 2026 Albus Team. Сделано с ❤️ для победы в конкурсе.
