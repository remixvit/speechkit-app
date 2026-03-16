import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push('/');
      } else {
        setError(data.error || 'Неверный пароль');
      }
    } catch {
      setError('Ошибка подключения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Вход — SpeechKit</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="container">
        <div className="bg-grid" />
        <div className="bg-glow" />

        <div className="card">
          <div className="logo">
            <span className="logo-dot" />
            SPEECHKIT
          </div>

          <p className="subtitle">Введи пароль для доступа</p>

          <form onSubmit={handleSubmit} className="form">
            <div className={`input-wrap ${error ? 'has-error' : ''}`}>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoFocus
                className="input"
              />
            </div>

            {error && (
              <div className="error">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                {error}
              </div>
            )}

            <button type="submit" className="btn" disabled={loading || !password}>
              {loading ? (
                <svg className="spinner" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
              ) : 'Войти'}
            </button>
          </form>
        </div>
      </div>

      <style jsx>{`
        .container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          padding: 24px;
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
        }

        .card {
          position: relative;
          z-index: 1;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 48px 40px;
          width: 100%;
          max-width: 380px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
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

        .subtitle {
          font-family: var(--mono);
          font-size: 12px;
          color: var(--text-muted);
          letter-spacing: 0.05em;
          text-align: center;
        }

        .form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .input-wrap {
          width: 100%;
        }

        .input {
          width: 100%;
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px 16px;
          color: var(--text);
          font-family: var(--mono);
          font-size: 16px;
          letter-spacing: 0.1em;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-dim);
        }

        .input::placeholder {
          color: var(--text-dim);
          letter-spacing: 0.2em;
        }

        .input-wrap.has-error .input {
          border-color: var(--red);
        }

        .error {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--red);
          font-family: var(--mono);
          font-size: 12px;
          padding: 10px 14px;
          background: rgba(255, 61, 90, 0.08);
          border: 1px solid rgba(255, 61, 90, 0.2);
          border-radius: 8px;
        }

        .btn {
          width: 100%;
          padding: 14px;
          background: var(--accent-dim);
          border: 1px solid var(--accent);
          border-radius: 10px;
          color: var(--accent);
          font-family: var(--mono);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.15em;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .btn:hover:not(:disabled) {
          background: rgba(0, 229, 200, 0.2);
          box-shadow: 0 0 20px var(--accent-glow);
        }

        .btn:disabled {
          opacity: 0.4;
          cursor: default;
        }

        .spinner {
          animation: spin 1s linear infinite;
          width: 18px;
          height: 18px;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
