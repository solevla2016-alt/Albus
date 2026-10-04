# Как задеплоить Albus и получить ссылку для коллег

Проект готов к деплою. Есть два варианта — рекомендуемый (Railway для бэкенда + Vercel для фронта) и альтернативный (Render).

---

## ВАРИАНТ 1 (Рекомендуемый): Railway (бэкенд) + Vercel (фронт)

Показывает чат по ссылке, WebSocket работает полноценно.

### Шаг 1. Деплой бэкенда на Railway

1. Зайди на https://railway.app и войди (GitHub)
2. Нажми **New Project** → **Deploy from GitHub repo**
3. Выбери репозиторий `Albus`
4. Railway сам найдёт `Dockerfile.backend`. Root directory оставь пустым (авто)
5. Нажми **Deploy**. Подожди сборку (~3-5 мин)

6. Добавь **PostgreSQL**:
   - *New* → *Database* → *PostgreSQL* → *Add*
   - Скопируй из настроек базы значение `DATABASE_URL`

7. Добавь **Redis**:
   - *New* → *Database* → *Redis* → *Add*
   - Скопируй `REDIS_URL` (или `REDIS_PUBLIC_URL`)

8. Настрой переменные окружения (Variables) у сервиса **backend**:
   ```
   DJANGO_SECRET_KEY=придумай длинный секрет
   DJANGO_DEBUG=False
   DJANGO_ALLOWED_HOSTS=.up.railway.app
   DATABASE_URL=<из шага 6>
   REDIS_URL=<из шага 7>
   CORS_ALLOWED_ORIGINS=https://<твой-домен>.vercel.app
   CSRF_TRUSTED_ORIGINS=https://<твой-домен>.vercel.app
   ```

9. На вкладке **Settings** → *Networking* → *Generate Domain* для backend.
   Запиши домен: например `albus-backend.up.railway.app`

10. После первого деплоя запусти миграции:
    - Вкладка *Deployments* → у твоего сервиса → *...* → *Redeploy* после добавления переменных,
    - либо нажми *Console* и выполни:
      ```
      python manage.py migrate
      python manage.py createsuperuser
      ```

### Шаг 2. Деплой фронтенда на Vercel

1. Зайди на https://vercel.com и войди (GitHub)
2. **Add New Project** → выбери репозиторий
3. Root Directory выбери `frontend`
4. Framework: **Next.js**
5. Переменные окружения (Environment Variables):
   ```
   NEXT_PUBLIC_API_URL=https://albus-backend.up.railway.app/api
   NEXT_PUBLIC_WS_URL=wss://albus-backend.up.railway.app/ws/chat
   ```
6. Нажми **Deploy**

### Шаг 3. Обнови переменные бэкенда доменом Vercel

После деплоя Vercel у тебя будет домен вида `https://albus-<xxx>.vercel.app`.
Вернись в Railway → Variables → обнови:
```
CORS_ALLOWED_ORIGINS=https://albus-<xxx>.vercel.app
CSRF_TRUSTED_ORIGINS=https://albus-<xxx>.vercel.app
```
И Redeploy бэкенда.

---

## ВАРИАНТ 2: Всё на Render

Для бэкенда есть готовый `render.yaml` blueprint.

1. Зайди на https://render.com → **New** → **Blueprint**
2. Выбери репозиторий. Render автоматически поднимет web + PostgreSQL + Redis
3. Переменные задай те же, что в Шаге 1.8
4. Фронтенд — тоже на Vercel (как в Шаге 2)

---

## Куда войдут коллеги

Готовая ссылка для коллег — это **домен Vercel**:
```
https://albus-<xxx>.vercel.app
```

---

## Важно для работы AI и голосовых

- **AI-ассистент** работает даже без ключа (локальный бот). С ключами `GIGACHAT_CLIENT_ID`/`GIGACHAT_CLIENT_SECRET` — облачный GigaChat (бесплатно для разработчиков).
- **Транскрипция голосовых** использует Google Web Speech — работает только если на сервере есть интернет (на Railway/Render есть).
- **Вложения/файлы** хранятся локально на диске (`/media/`). На бесплатных Railway/Render они могут очищаться при редеплое — для конкурса достаточно.

---

## Проверка после деплоя

1. Открой ссылку Vercel
2. Войди (создай пользователя или админа через `createsuperuser`)
3. Отправь сообщение
4. Пиши `/ai вопрос` — проверить AI
5. Нажми 🎤 — записать и транскрибировать голосовое
