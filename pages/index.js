import { useState, useRef, useEffect, useCallback } from 'react';
import Head from 'next/head';

let RecordRTC;

const MODES = [
  { id: 'toggle', label: 'Переключение', hint_idle: 'Нажми пробел или кнопку', hint_rec: 'Нажми ещё раз — остановить' },
  { id: 'hold',   label: 'Удержание',    hint_idle: 'Зажми пробел или кнопку', hint_rec: 'Отпусти — остановить' },
];

const LANGS = [
  { id: 'ru-RU', label: 'RU' },
  { id: 'en-US', label: 'EN' },
];

const MAX_SECONDS = 58;
const STORAGE_KEY = 'speechkit_history';
const MIC_KEY = 'speechkit_mic';

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveHistory(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

function formatTime(date) {
  return new Date(date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}с`;
}

export default function Home() {
  const [mode, setMode] = useState('toggle');
  const [lang, setLang] = useState('ru-RU');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [accumulate, setAccumulate] = useState(false);
  const [autoCopy, setAutoCopy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [waveData, setWaveData] = useState(Array(32).fill(2));
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [micLevel, setMicLevel] = useState(0);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const timerRef = useRef(null);
  const isRecordingRef = useRef(false);
  const isLoadingRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const transcriptRef = useRef('');

  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { setHistory(loadHistory()); }, []);

  useEffect(() => {
    const loadDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const all = await navigator.mediaDevices.enumerateDevices();
        const mics = all.filter(d => d.kind === 'audioinput');
        setDevices(mics);
        const saved = localStorage.getItem(MIC_KEY);
        const found = saved && mics.find(d => d.deviceId === saved);
        setSelectedDevice(found ? saved : (mics.length > 0 ? mics[0].deviceId : ''));
      } catch {}
    };
    loadDevices();
    navigator.mediaDevices.addEventListener('devicechange', loadDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
  }, []);

  // Мониторинг уровня микрофона (вне записи)
  useEffect(() => {
    if (!selectedDevice || typeof window === 'undefined') return;

    let audioCtx, analyser, source, stream, raf;

    const start = async () => {
      try {
        const constraints = selectedDevice ? { deviceId: { exact: selectedDevice } } : true;
        stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((s, v) => s + v, 0) / data.length;
          setMicLevel(Math.min(100, avg * 2.5));
          raf = requestAnimationFrame(tick);
        };
        tick();
        micMonitorRef.current = { audioCtx, stream };
      } catch {}
    };

    start();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (audioCtx) audioCtx.close();
      setMicLevel(0);
    };
  }, [selectedDevice]);

  const startWaveAnimation = useCallback((stream) => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(dataArray);
      setWaveData(Array.from(dataArray.slice(0, 32)).map(v => Math.max(2, (v / 255) * 60)));
      animFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, []);

  const stopWaveAnimation = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setWaveData(Array(32).fill(2));
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current || isLoadingRef.current) return;
    setError('');
    setElapsed(0);
    try {
      if (!RecordRTC) RecordRTC = (await import('recordrtc')).default;
      const audioConstraints = selectedDevice ? { deviceId: { exact: selectedDevice } } : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      streamRef.current = stream;
      const recorder = new RecordRTC(stream, {
        type: 'audio', mimeType: 'audio/wav',
        recorderType: RecordRTC.StereoAudioRecorder,
        desiredSampRate: 16000, numberOfAudioChannels: 1,
      });
      recorder.startRecording();
      recorderRef.current = recorder;
      startWaveAnimation(stream);
      setIsRecording(true);

      // Таймер
      let sec = 0;
      timerRef.current = setInterval(() => {
        sec++;
        setElapsed(sec);
        if (sec >= MAX_SECONDS) stopRecordingFn();
      }, 1000);
    } catch {
      setError('Нет доступа к микрофону. Проверь разрешения браузера.');
    }
  }, [startWaveAnimation, selectedDevice]);

  const stopRecordingFn = useCallback(() => {
    if (!recorderRef.current || !isRecordingRef.current) return;
    clearInterval(timerRef.current);
    stopWaveAnimation();
    setIsRecording(false);
    setIsLoading(true);
    setElapsed(0);

    recorderRef.current.stopRecording(async () => {
      const blob = recorderRef.current.getBlob();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result.split(',')[1];
        try {
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: base64, lang }),
          });
          const data = await res.json();
          if (data.error) {
            setError(data.error);
          } else {
            const newText = data.result || '';
            if (!newText) return;

            // Накопительный режим
            const combined = accumulate && transcriptRef.current
              ? transcriptRef.current + ' ' + newText
              : newText;
            setTranscript(combined);

            // Автокопирование
            if (autoCopy) {
              navigator.clipboard.writeText(combined).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }

            // Сохраняем в историю
            const entry = { id: Date.now(), text: newText, lang, date: Date.now() };
            const updated = [entry, ...loadHistory()].slice(0, 50);
            saveHistory(updated);
            setHistory(updated);
          }
        } catch {
          setError('Ошибка при отправке запроса. Проверь подключение.');
        } finally {
          setIsLoading(false);
        }
      };
      reader.readAsDataURL(blob);
    });
  }, [stopWaveAnimation, lang, accumulate, autoCopy]);

  // Связываем stopRecording с ref чтобы использовать в таймере
  const stopRecordingRef = useRef(stopRecordingFn);
  useEffect(() => { stopRecordingRef.current = stopRecordingFn; }, [stopRecordingFn]);
  const stopRecording = useCallback(() => stopRecordingRef.current(), []);

  // Клавиатура
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== 'Space') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      if (isLoadingRef.current) return;
      if (mode === 'toggle') { if (isRecordingRef.current) stopRecording(); else startRecording(); }
      else { if (!spaceHeldRef.current && !isRecordingRef.current) { spaceHeldRef.current = true; startRecording(); } }
    };
    const onKeyUp = (e) => {
      if (e.code !== 'Space') return;
      if (mode === 'hold') { spaceHeldRef.current = false; if (isRecordingRef.current) stopRecording(); }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [mode, startRecording, stopRecording]);

  const handleBtnClick = () => { if (mode === 'toggle') { if (isRecording) stopRecording(); else startRecording(); } };
  const handleBtnMouseDown = () => { if (mode === 'hold') startRecording(); };
  const handleBtnMouseUp = () => { if (mode === 'hold') stopRecording(); };
  const handleBtnTouchStart = (e) => { e.preventDefault(); if (mode === 'hold') startRecording(); };
  const handleBtnTouchEnd = (e) => { e.preventDefault(); if (mode === 'hold') stopRecording(); };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcript).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const exportTxt = () => {
    const text = history.map(h => `[${formatTime(h.date)}] ${h.text}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `speechkit_${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
  };

  const clearHistory = () => { saveHistory([]); setHistory([]); };
  const deleteEntry = (id) => { const u = history.filter(h => h.id !== id); saveHistory(u); setHistory(u); };

  const currentMode = MODES.find(m => m.id === mode);
  const hint = isLoading ? 'Распознаю...' : isRecording ? currentMode.hint_rec : currentMode.hint_idle;
  const timerWarning = elapsed >= 45;

  return (
    <>
      <Head>
        <title>SpeechKit — голос в текст</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="container">
        <div className="bg-grid" />
        <div className="bg-glow" />

        <header className="header">
          <div className="logo"><span className="logo-dot" />SPEECHKIT</div>
          <div className="header-right">
            <button className={"icon-btn" + (showHistory ? ' active' : '')} onClick={() => setShowHistory(v => !v)} title="История">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3zm-1 5v5l4 2.5-.75 1.23L11 14V8h1z"/>
              </svg>
              {history.length > 0 && <span className="badge">{history.length}</span>}
            </button>
            <span className="logo-sub">Yandex Cloud</span>
          </div>
        </header>

        <main className="main">
          {/* Панель настроек */}
          <div className="settings-row">
            {/* Режим */}
            <div className="seg-group">
              {MODES.map(m => (
                <button key={m.id} className={"seg-btn" + (mode === m.id ? ' active' : '')}
                  onClick={() => { if (!isRecording && !isLoading) setMode(m.id); }}
                  disabled={isRecording || isLoading}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Язык */}
            <div className="seg-group">
              {LANGS.map(l => (
                <button key={l.id} className={"seg-btn" + (lang === l.id ? ' active' : '')}
                  onClick={() => { if (!isRecording && !isLoading) setLang(l.id); }}
                  disabled={isRecording || isLoading}>
                  {l.label}
                </button>
              ))}
            </div>

            {/* Тогглы + микрофон */}
            <div className="toggle-group">
              <button className={"toggle-btn" + (accumulate ? ' active' : '')} onClick={() => setAccumulate(v => !v)} title="Добавлять к предыдущему тексту">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                Накопление
              </button>
              <button className={"toggle-btn" + (autoCopy ? ' active' : '')} onClick={() => setAutoCopy(v => !v)} title="Копировать результат автоматически">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                Автокопия
              </button>
              {devices.length > 1 && (
                <label className={"toggle-btn mic-select-wrap" + (isRecording || isLoading ? " disabled" : "")}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style={{flexShrink:0}}><path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-7 10a7 7 0 0 0 14 0h2a9 9 0 0 1-8 8.94V22h-2v-2.06A9 9 0 0 1 3 11h2z"/></svg>
                  <select
                    className="mic-select"
                    value={selectedDevice}
                    onChange={e => { setSelectedDevice(e.target.value); localStorage.setItem(MIC_KEY, e.target.value); }}
                    disabled={isRecording || isLoading}
                  >
                    {devices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Микрофон ${d.deviceId.slice(0, 8)}`}
                      </option>
                    ))}
                  </select>
                  <div className="mic-meter">
                    <div className="mic-meter-fill" style={{ width: micLevel + "%" }} />
                  </div>
                </label>
              )}
            </div>
          </div>

          {/* Волна */}
          <div className={"waveform" + (isRecording ? ' active' : '')}>
            {waveData.map((h, i) => <div key={i} className="bar" style={{ height: h + 'px' }} />)}
          </div>

          {/* Кнопка */}
          <button
            className={"record-btn" + (isRecording ? ' recording' : '') + (isLoading ? ' loading' : '')}
            onClick={handleBtnClick} onMouseDown={handleBtnMouseDown} onMouseUp={handleBtnMouseUp}
            onTouchStart={handleBtnTouchStart} onTouchEnd={handleBtnTouchEnd} disabled={isLoading}
          >
            <div className="btn-ring" />
            <div className="btn-inner">
              {isLoading ? (
                <svg className="spinner" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
              ) : isRecording ? (
                <svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40">
                  <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-7 10a7 7 0 0 0 14 0h2a9 9 0 0 1-8 8.94V22h-2v-2.06A9 9 0 0 1 3 11h2z" />
                </svg>
              )}
            </div>
          </button>

          {/* Таймер + подсказка */}
          <div className="hint-wrap">
            {isRecording && (
              <div className={"timer" + (timerWarning ? ' warning' : '')}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.96 8.96 0 0 0 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.06-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
                {formatDuration(elapsed)} / 58с
                {timerWarning && ' — скоро конец!'}
              </div>
            )}
            <p className="hint">{hint}</p>
            <p className="hint-key"><kbd>Space</kbd> или кнопка</p>
          </div>

          {error && (
            <div className="error-box">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
              {error}
            </div>
          )}

          {transcript && (
            <div className="result-card">
              <div className="result-header">
                <span className="result-label">РЕЗУЛЬТАТ</span>
                <div className="result-actions">
                  <button className={"action-btn" + (copied ? ' success' : '')} onClick={copyToClipboard}>
                    {copied
                      ? <><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>Скопировано</>
                      : <><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>Копировать</>}
                  </button>
                  <button className="action-btn clear-btn" onClick={() => { setTranscript(''); setError(''); }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    Очистить
                  </button>
                </div>
              </div>
              <p className="result-text">{transcript}</p>
            </div>
          )}

          {/* История */}
          {showHistory && (
            <div className="history-card">
              <div className="result-header">
                <span className="result-label">ИСТОРИЯ ({history.length})</span>
                <div className="result-actions">
                  {history.length > 0 && (
                    <>
                      <button className="action-btn" onClick={exportTxt}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z"/></svg>
                        Скачать .txt
                      </button>
                      <button className="action-btn clear-btn" onClick={clearHistory}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                        Очистить всё
                      </button>
                    </>
                  )}
                </div>
              </div>
              {history.length === 0 ? (
                <p className="history-empty">Пока нет записей</p>
              ) : (
                <ul className="history-list">
                  {history.map(entry => (
                    <li key={entry.id} className="history-item">
                      <div className="history-meta">
                        <span className="history-date">{formatTime(entry.date)}</span>
                        <span className="history-lang">{entry.lang === 'ru-RU' ? 'RU' : 'EN'}</span>
                      </div>
                      <p className="history-text" onClick={() => setTranscript(entry.text)}>{entry.text}</p>
                      <button className="history-del" onClick={() => deleteEntry(entry.id)}>
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .container { min-height: 100vh; display: flex; flex-direction: column; align-items: center; position: relative; padding: 0 40px 100px; overflow: hidden; }
        .bg-grid { position: fixed; inset: 0; background-image: linear-gradient(rgba(0,229,200,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,200,0.03) 1px, transparent 1px); background-size: 48px 48px; pointer-events: none; z-index: 0; }
        .bg-glow { position: fixed; top: -250px; left: 50%; transform: translateX(-50%); width: 900px; height: 900px; background: radial-gradient(circle, rgba(0,229,200,0.07) 0%, transparent 70%); pointer-events: none; z-index: 0; }

        .header { position: relative; z-index: 1; width: 100%; max-width: 860px; display: flex; align-items: center; justify-content: space-between; padding: 44px 0 0; }
        .logo { font-family: var(--mono); font-size: 16px; font-weight: 700; color: var(--accent); letter-spacing: 0.2em; display: flex; align-items: center; gap: 12px; }
        .logo-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 14px var(--accent-glow); }
        .logo-sub { font-family: var(--mono); font-size: 13px; color: var(--text-muted); letter-spacing: 0.05em; }
        .header-right { display: flex; align-items: center; gap: 16px; }

        .icon-btn { position: relative; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border: 1px solid var(--border); border-radius: 10px; background: transparent; color: var(--text-muted); cursor: pointer; transition: all 0.2s ease; }
        .icon-btn:hover, .icon-btn.active { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
        .badge { position: absolute; top: -6px; right: -6px; background: var(--accent); color: var(--bg); font-family: var(--mono); font-size: 10px; font-weight: 700; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }

        .main { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 36px; width: 100%; max-width: 860px; padding-top: 60px; }

        /* Settings row */
        .settings-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center; row-gap: 8px; }
        .seg-group { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 4px; gap: 3px; }
        .seg-btn { padding: 9px 20px; border-radius: 7px; border: none; background: transparent; color: var(--text-muted); font-family: var(--mono); font-size: 13px; letter-spacing: 0.05em; cursor: pointer; transition: all 0.2s ease; white-space: nowrap; }
        .seg-btn:hover:not(:disabled) { color: var(--text); }
        .seg-btn.active { background: var(--accent-dim); color: var(--accent); border: 1px solid rgba(0,229,200,0.2); }
        .seg-btn:disabled { opacity: 0.4; cursor: default; }

        .toggle-group { display: flex; gap: 8px; }
        .toggle-btn { display: flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-family: var(--mono); font-size: 13px; cursor: pointer; transition: all 0.2s ease; white-space: nowrap; }
        .toggle-btn:hover { border-color: var(--accent); color: var(--text); }
        .toggle-btn.active { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
        .mic-select-wrap { gap: 8px; cursor: pointer; }
        .mic-select-wrap.disabled { opacity: 0.4; pointer-events: none; }
        .mic-select { background: transparent; border: none; color: var(--text-muted); font-family: var(--mono); font-size: 13px; outline: none; cursor: pointer; max-width: 160px; appearance: none; -webkit-appearance: none; }
        .mic-select option { background: #161c24; color: #e8edf2; }
        .mic-meter { width: 50px; height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; flex-shrink: 0; align-self: center; }
        .mic-meter-fill { height: 100%; border-radius: 2px; background: var(--accent); box-shadow: 0 0 4px var(--accent-glow); transition: width 0.05s ease; }

        /* Waveform */
        .waveform { display: flex; align-items: center; gap: 4px; height: 90px; }
        .bar { width: 5px; border-radius: 3px; background: var(--text-dim); transition: height 0.05s ease, background 0.3s ease; }
        .waveform.active .bar { background: var(--accent); box-shadow: 0 0 10px var(--accent-glow); }

        /* Record button */
        .record-btn { position: relative; width: 148px; height: 148px; border: none; background: none; cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent; user-select: none; }
        .record-btn:disabled { cursor: default; }
        .btn-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid var(--border); transition: all 0.3s ease; }
        .record-btn:not(:disabled):hover .btn-ring { border-color: var(--accent); box-shadow: 0 0 28px var(--accent-glow); transform: scale(1.08); }
        .record-btn.recording .btn-ring { border-color: var(--red); box-shadow: 0 0 40px var(--red-glow); animation: pulse 1.2s ease-in-out infinite; }
        .btn-inner { position: absolute; inset: 16px; border-radius: 50%; background: var(--surface2); display: flex; align-items: center; justify-content: center; color: var(--text-muted); transition: all 0.3s ease; border: 1px solid var(--border); }
        .record-btn:not(:disabled):hover .btn-inner { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }
        .record-btn.recording .btn-inner { background: rgba(255, 61, 90, 0.12); color: var(--red); border-color: var(--red); }
        .record-btn.loading .btn-inner { color: var(--accent); }
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.15); opacity: 0.7; } }
        .spinner { animation: spin 1s linear infinite; width: 34px; height: 34px; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* Timer & hint */
        .hint-wrap { display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .timer { display: flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 13px; color: var(--accent); background: var(--accent-dim); border: 1px solid rgba(0,229,200,0.2); border-radius: 24px; padding: 6px 16px; transition: all 0.3s ease; }
        .timer.warning { color: var(--red); background: rgba(255,61,90,0.1); border-color: rgba(255,61,90,0.3); }
        .hint { font-family: var(--mono); font-size: 14px; color: var(--text-muted); letter-spacing: 0.05em; text-align: center; }
        .hint-key { font-family: var(--mono); font-size: 13px; color: var(--text-dim); }
        kbd { display: inline-block; padding: 2px 10px; border: 1px solid var(--border); border-radius: 5px; background: var(--surface2); color: var(--text-muted); font-family: var(--mono); font-size: 12px; }

        /* Error */
        .error-box { width: 100%; background: rgba(255, 61, 90, 0.08); border: 1px solid rgba(255, 61, 90, 0.25); border-radius: 12px; padding: 18px 22px; color: var(--red); font-family: var(--mono); font-size: 14px; display: flex; align-items: flex-start; gap: 12px; line-height: 1.5; }

        /* Result card */
        .result-card { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; animation: slideUp 0.3s ease; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .result-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); background: var(--surface2); }
        .result-label { font-family: var(--mono); font-size: 12px; color: var(--accent); letter-spacing: 0.15em; }
        .result-actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .action-btn { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-family: var(--mono); font-size: 13px; cursor: pointer; transition: all 0.2s ease; letter-spacing: 0.02em; white-space: nowrap; }
        .action-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
        .action-btn.success { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
        .clear-btn:hover { border-color: var(--red); color: var(--red); background: rgba(255, 61, 90, 0.08); }
        .result-text { padding: 26px; font-family: var(--display); font-size: 20px; line-height: 1.75; color: var(--text); word-break: break-word; }

        /* History */
        .history-card { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; animation: slideUp 0.3s ease; }
        .history-empty { padding: 32px; font-family: var(--mono); font-size: 14px; color: var(--text-muted); text-align: center; }
        .history-list { list-style: none; max-height: 480px; overflow-y: auto; }
        .history-item { position: relative; padding: 18px 52px 18px 20px; border-bottom: 1px solid var(--border); cursor: default; transition: background 0.15s ease; }
        .history-item:last-child { border-bottom: none; }
        .history-item:hover { background: var(--surface2); }
        .history-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .history-date { font-family: var(--mono); font-size: 12px; color: var(--text-muted); }
        .history-lang { font-family: var(--mono); font-size: 11px; color: var(--accent); background: var(--accent-dim); border: 1px solid rgba(0,229,200,0.2); border-radius: 4px; padding: 2px 8px; }
        .history-text { font-family: var(--display); font-size: 16px; color: var(--text); line-height: 1.5; cursor: pointer; }
        .history-text:hover { color: var(--accent); }
        .history-del { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--text-dim); cursor: pointer; transition: all 0.15s ease; }
        .history-del:hover { border-color: rgba(255,61,90,0.3); color: var(--red); background: rgba(255,61,90,0.08); }
      `}</style>
    </>
  );
}