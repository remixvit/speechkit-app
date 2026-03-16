export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.YANDEX_API_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;
  if (!apiKey || !folderId) return res.status(500).json({ error: 'Не заданы переменные окружения' });

  try {
    const { audio, lang = 'ru-RU' } = req.body;
    if (!audio) return res.status(400).json({ error: 'Нет аудио данных' });

    const audioBuffer = Buffer.from(audio, 'base64');
    const pcmData = audioBuffer.slice(44);

    const url = new URL('https://stt.api.cloud.yandex.net/speech/v1/stt:recognize');
    url.searchParams.set('folderId', folderId);
    url.searchParams.set('lang', lang);
    url.searchParams.set('format', 'lpcm');
    url.searchParams.set('sampleRateHertz', '16000');

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { Authorization: `Api-Key ${apiKey}`, 'Content-Type': 'application/octet-stream' },
      body: pcmData,
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Ошибка Yandex SpeechKit' });
    return res.status(200).json({ result: data.result });
  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
