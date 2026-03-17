// pages/api/transcribe-voice.js
// Принимает file_id от Telegram, скачивает OGG, отправляет в Yandex SpeechKit

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Проверяем секретный токен
  const secret = req.headers['x-api-secret'];
  if (!secret || secret !== process.env.VOICE_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.YANDEX_API_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!apiKey || !folderId || !botToken) {
    return res.status(500).json({ error: 'Не заданы переменные окружения' });
  }

  const { file_id, lang = 'ru-RU' } = req.body;
  if (!file_id) {
    return res.status(400).json({ error: 'Не передан file_id' });
  }

  try {
    // 1. Получаем путь к файлу через Telegram Bot API
    const fileInfoRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${file_id}`
    );
    const fileInfo = await fileInfoRes.json();

    if (!fileInfo.ok) {
      return res.status(400).json({ error: 'Не удалось получить файл из Telegram' });
    }

    const filePath = fileInfo.result.file_path;

    // 2. Скачиваем OGG файл
    const audioRes = await fetch(
      `https://api.telegram.org/file/bot${botToken}/${filePath}`
    );
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    // 3. Отправляем OGG в Yandex SpeechKit (он нативно поддерживает OGG Opus)
    const url = new URL('https://stt.api.cloud.yandex.net/speech/v1/stt:recognize');
    url.searchParams.set('folderId', folderId);
    url.searchParams.set('lang', lang);
    url.searchParams.set('format', 'oggopus');

    const sttRes = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        'Content-Type': 'application/octet-stream',
      },
      body: audioBuffer,
    });

    const data = await sttRes.json();

    if (!sttRes.ok) {
      return res.status(sttRes.status).json({
        error: data.message || 'Ошибка Yandex SpeechKit',
      });
    }

    return res.status(200).json({ text: data.result || '' });
  } catch (error) {
    console.error('Voice transcription error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
