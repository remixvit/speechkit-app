# 🎙️ SpeechKit App — голос в текст

Веб-приложение для транскрибации речи с микрофона через Yandex SpeechKit.  
Разворачивается на Vercel за 5 минут.

---

## Быстрый старт

### 1. Настройка Yandex Cloud

**Получить Folder ID:**
1. Зайди на [console.cloud.yandex.ru](https://console.cloud.yandex.ru)
2. Выбери каталог → скопируй ID из URL (вида `b1g...`)

**Создать API-ключ:**
1. В консоли: IAM → Сервисные аккаунты → Создать аккаунт
2. Назначь роль `ai.speechkit.user`
3. Создай API-ключ для аккаунта → скопируй

### 2. Локальный запуск

```bash
# Установи зависимости
npm install

# Создай файл с переменными окружения
cp .env.local.example .env.local
# Заполни YANDEX_API_KEY и YANDEX_FOLDER_ID в .env.local

# Запусти
npm run dev
```

Открой [http://localhost:3000](http://localhost:3000)

### 3. Деплой на Vercel

```bash
# Установи Vercel CLI
npm i -g vercel

# Задеплой
vercel

# Добавь переменные окружения
vercel env add YANDEX_API_KEY
vercel env add YANDEX_FOLDER_ID

# Передеплой с переменными
vercel --prod
```

Либо через интерфейс Vercel:
1. Залей репозиторий на GitHub
2. Подключи в [vercel.com/new](https://vercel.com/new)
3. В Settings → Environment Variables добавь `YANDEX_API_KEY` и `YANDEX_FOLDER_ID`

---

## Как пользоваться

- **Зажми** большую кнопку и говори
- **Отпусти** — речь уйдёт на распознавание
- **Копировать** — скопирует текст в буфер обмена

---

## Технологии

- **Next.js 14** — фреймворк
- **RecordRTC** — запись аудио в браузере (WAV, 16kHz моно)
- **Yandex SpeechKit** — распознавание речи
- **Vercel** — хостинг

---

## Тарификация SpeechKit

Первые **125 000 единиц в месяц** бесплатно (1 единица = 1 секунда аудио).  
Подробнее: [cloud.yandex.ru/prices/speechkit](https://cloud.yandex.ru/prices/speechkit)
