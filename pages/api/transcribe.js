// pages/api/transcribe.js
// Принимает WAV аудио, отрезает заголовок и отправляет в Yandex SpeechKit

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.YANDEX_API_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;

  if (!apiKey || !folderId) {
    return res.status(500).json({
      error: 'Не заданы переменные окружения YANDEX_API_KEY и YANDEX_FOLDER_ID',
    });
  }

  try {
    // Получаем base64 аудио из тела запроса
    const { audio } = req.body;
    if (!audio) {
      return res.status(400).json({ error: 'Нет аудио данных' });
    }

    // Декодируем base64 → Buffer
    const audioBuffer = Buffer.from(audio, 'base64');

    // WAV файл: первые 44 байта — заголовок, остальное — сырой PCM
    // RecordRTC пишет стандартный WAV 44-байтный заголовок
    const pcmData = audioBuffer.slice(44);

    // Отправляем в Yandex SpeechKit REST API
    const url = new URL('https://stt.api.cloud.yandex.net/speech/v1/stt:recognize');
    url.searchParams.set('folderId', folderId);
    url.searchParams.set('lang', 'ru-RU');
    url.searchParams.set('format', 'lpcm');
    url.searchParams.set('sampleRateHertz', '16000');

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Api-Key ${apiKey}`,
        'Content-Type': 'application/octet-stream',
      },
      body: pcmData,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Yandex SpeechKit error:', data);
      return res.status(response.status).json({
        error: data.message || 'Ошибка Yandex SpeechKit',
      });
    }

    return res.status(200).json({ result: data.result });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
