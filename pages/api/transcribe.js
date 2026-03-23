export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

// Находим offset PCM-данных в WAV файле по сигнатуре "data" чанка
function findPcmOffset(buffer) {
  // WAV структура: RIFF header (12 bytes) + chunks
  // Ищем чанк "data" и возвращаем offset данных после его заголовка
  let offset = 12; // пропускаем RIFF header
  while (offset < buffer.length - 8) {
    const chunkId = buffer.slice(offset, offset + 4).toString('ascii');
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      return offset + 8; // после ID (4) + size (4)
    }
    offset += 8 + chunkSize;
    // выравнивание на 2 байта
    if (chunkSize % 2 !== 0) offset++;
  }
  // Fallback: стандартный 44-байтный заголовок
  return 44;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.YANDEX_API_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;
  if (!apiKey || !folderId) return res.status(500).json({ error: 'Не заданы переменные окружения' });

  try {
    const { audio, lang = 'ru-RU' } = req.body;
    if (!audio) return res.status(400).json({ error: 'Нет аудио данных' });

    const audioBuffer = Buffer.from(audio, 'base64');
    const pcmOffset = findPcmOffset(audioBuffer);
    const pcmData = audioBuffer.slice(pcmOffset);

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
    console.error('Transcribe error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}