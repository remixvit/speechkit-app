import { useState, useRef, useEffect, useCallback } from 'react';
import Head from 'next/head';

// Динамически импортируем RecordRTC только на клиенте
let RecordRTC;

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [waveData, setWaveData] = useState(Array(32).fill(2));

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);

  // Анимация волны
  const startWaveAnimation = useCallback((stream) => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    analyserRef.current = analyser;

    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      analyser.getByteFrequencyData(dataArray);
      const bars = Array.from(dataArray.slice(0, 32)).map(v => Math.max(2, (v / 255) * 60));
      setWaveData(bars);
      animFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, []);

  const stopWaveAnimation = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setWaveData(Array(32).fill(2));
  }, []);

  const startRecording = async () => {
    setError('');
    try {
      if (!RecordRTC) {
        RecordRTC = (await import('recordrtc')).default;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/wav',
        recorderType: RecordRTC.StereoAudioRecorder,
        desiredSampRate: 16000,
        numberOfAudioChannels: 1,
      });

      recorder.startRecording();
      recorderRef.current = recorder;

      startWaveAnimation(stream);
      setIsRecording(true);
    } catch (err) {
      setError('Нет доступа к микрофону. Проверь разрешения браузера.');
    }
  };

  const stopRecording = () => {
    if (!recorderRef.current) return;

    stopWaveAnimation();
    setIsRecording(false);
    setIsLoading(true);

    recorderRef.current.stopRecording(async () => {
      const blob = recorderRef.current.getBlob();

      // Останавливаем треки микрофона
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      // Конвертируем в base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result.split(',')[1];
        try {
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: base64 }),
          });

          const data = await res.json();
          if (data.error) {
            setError(data.error);
          } else {
            setTranscript(data.result || '(тишина)');
          }
        } catch (err) {
          setError('Ошибка при отправке запроса. Проверь подключение.');
        } finally {
          setIsLoading(false);
        }
      };
      reader.readAsDataURL(blob);
    });
  };

  const copyToClipboard = () => {
    if (!transcript) return;
    navigator.clipboard.writeText(transcript).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const clearTranscript = () => {
    setTranscript('');
    setError('');
  };

  return (
    <>
      <Head>
        <title>SpeechKit — голос в текст</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="container">
        {/* Фоновые элементы */}
        <div className="bg-grid" />
        <div className="bg-glow" />

        {/* Шапка */}
        <header className="header">
          <div className="logo">
            <span className="logo-dot" />
            SPEECHKIT
          </div>
          <span className="logo-sub">powered by Yandex Cloud</span>
        </header>

        {/* Основная область */}
        <main className="main">
          {/* Визуализатор волны */}
          <div className={`waveform ${isRecording ? 'active' : ''}`}>
            {waveData.map((h, i) => (
              <div
                key={i}
                className="bar"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>

          {/* Кнопка записи */}
          <button
            className={`record-btn ${isRecording ? 'recording' : ''} ${isLoading ? 'loading' : ''}`}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={isLoading}
          >
            <div className="btn-ring" />
            <div className="btn-inner">
              {isLoading ? (
                <svg className="spinner" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
              ) : isRecording ? (
                <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                  <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-7 10a7 7 0 0 0 14 0h2a9 9 0 0 1-8 8.94V22h-2v-2.06A9 9 0 0 1 3 11h2z" />
                </svg>
              )}
            </div>
          </button>

          {/* Подпись кнопки */}
          <p className="hint">
            {isLoading
              ? 'Распознаю...'
              : isRecording
              ? 'Отпусти, чтобы остановить'
              : 'Зажми и говори'}
          </p>

          {/* Ошибка */}
          {error && (
            <div className="error-box">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              {error}
            </div>
          )}

          {/* Результат */}
          {transcript && (
            <div className="result-card">
              <div className="result-header">
                <span className="result-label">РЕЗУЛЬТАТ</span>
                <div className="result-actions">
                  <button className={`action-btn ${copied ? 'success' : ''}`} onClick={copyToClipboard}>
                    {copied ? (
                      <>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                        Скопировано
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                          <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                        </svg>
                        Копировать
                      </>
                    )}
                  </button>
                  <button className="action-btn clear-btn" onClick={clearTranscript}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                    Очистить
                  </button>
                </div>
              </div>
              <p className="result-text">{transcript}</p>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          padding: 0 24px 80px;
          overflow: hidden;
        }

        .bg-grid {
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,229,200,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,229,200,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
          z-index: 0;
        }

        .bg-glow {
          position: fixed;
          top: -200px;
          left: 50%;
          transform: translateX(-50%);
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(0,229,200,0.06) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }

        .header {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 600px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 32px 0 0;
        }

        .logo {
          font-family: var(--mono);
          font-size: 13px;
          font-weight: 700;
          color: var(--accent);
          letter-spacing: 0.2em;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .logo-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 0 12px var(--accent-glow);
        }

        .logo-sub {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--text-muted);
          letter-spacing: 0.05em;
        }

        .main {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
          width: 100%;
          max-width: 600px;
          padding-top: 80px;
        }

        /* Волна */
        .waveform {
          display: flex;
          align-items: center;
          gap: 3px;
          height: 64px;
        }

        .bar {
          width: 4px;
          border-radius: 2px;
          background: var(--text-dim);
          transition: height 0.05s ease, background 0.3s ease;
        }

        .waveform.active .bar {
          background: var(--accent);
          box-shadow: 0 0 8px var(--accent-glow);
        }

        /* Кнопка записи */
        .record-btn {
          position: relative;
          width: 100px;
          height: 100px;
          border: none;
          background: none;
          cursor: pointer;
          outline: none;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
        }

        .record-btn:disabled {
          cursor: default;
        }

        .btn-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1.5px solid var(--border);
          transition: all 0.3s ease;
        }

        .record-btn:not(:disabled):hover .btn-ring {
          border-color: var(--accent);
          box-shadow: 0 0 20px var(--accent-glow);
          transform: scale(1.08);
        }

        .record-btn.recording .btn-ring {
          border-color: var(--red);
          box-shadow: 0 0 30px var(--red-glow);
          animation: pulse 1.2s ease-in-out infinite;
        }

        .btn-inner {
          position: absolute;
          inset: 12px;
          border-radius: 50%;
          background: var(--surface2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          transition: all 0.3s ease;
          border: 1px solid var(--border);
        }

        .record-btn:not(:disabled):hover .btn-inner {
          background: var(--accent-dim);
          color: var(--accent);
          border-color: var(--accent);
        }

        .record-btn.recording .btn-inner {
          background: rgba(255, 61, 90, 0.12);
          color: var(--red);
          border-color: var(--red);
        }

        .record-btn.loading .btn-inner {
          color: var(--accent);
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.7; }
        }

        .spinner {
          animation: spin 1s linear infinite;
          width: 24px;
          height: 24px;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .hint {
          font-family: var(--mono);
          font-size: 12px;
          color: var(--text-muted);
          letter-spacing: 0.05em;
          text-align: center;
        }

        /* Ошибка */
        .error-box {
          width: 100%;
          background: rgba(255, 61, 90, 0.08);
          border: 1px solid rgba(255, 61, 90, 0.25);
          border-radius: 10px;
          padding: 14px 18px;
          color: var(--red);
          font-family: var(--mono);
          font-size: 12px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          line-height: 1.5;
        }

        /* Результат */
        .result-card {
          width: 100%;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          overflow: hidden;
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .result-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          background: var(--surface2);
        }

        .result-label {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--accent);
          letter-spacing: 0.15em;
        }

        .result-actions {
          display: flex;
          gap: 8px;
        }

        .action-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text-muted);
          font-family: var(--mono);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s ease;
          letter-spacing: 0.02em;
        }

        .action-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-dim);
        }

        .action-btn.success {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-dim);
        }

        .clear-btn:hover {
          border-color: var(--red);
          color: var(--red);
          background: rgba(255, 61, 90, 0.08);
        }

        .result-text {
          padding: 20px;
          font-family: var(--display);
          font-size: 17px;
          line-height: 1.7;
          color: var(--text);
          word-break: break-word;
        }
      `}</style>
    </>
  );
}
