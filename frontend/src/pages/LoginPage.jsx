import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const LoginPage = ({ onLoginSuccess }) => {
  const [creds, setCreds] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCreds((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const data = await api.login(creds.username, creds.password);
      if (data.access_token && data.refresh_token) {
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        onLoginSuccess(data.user);
        navigate('/dashboard');
        return;
      }

      setError(data.error || 'Invalid username or password');
    } catch (err) {
      setError(err?.response?.data?.error || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-root">
      <style>{`
        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background:
            radial-gradient(circle at top, rgba(59, 130, 246, 0.12), transparent 28%),
            linear-gradient(180deg, #0b1220 0%, #111827 100%);
        }

        .login-card {
          width: 100%;
          max-width: 500px;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: var(--shadow);
          overflow: hidden;
          position: relative;
        }

        .login-header {
          padding: 24px;
          border-bottom: 1px solid var(--border);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent);
        }

        .login-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          margin-bottom: 16px;
          border-radius: 999px;
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.35);
        }

        .login-badge-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--primary);
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
        }

        .login-badge-text {
          color: var(--text-primary);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .login-title {
          margin: 0 0 6px;
          color: var(--text-primary);
          font-family: var(--mono);
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .login-subtitle {
          margin: 0;
          color: var(--text-muted);
          font-size: 13px;
          font-weight: 500;
        }

        .login-body {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .field-label {
          color: var(--text-muted);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        .field-input {
          width: 100%;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--surface);
          color: var(--text-primary);
          padding: 12px 14px;
          font-family: var(--mono);
          font-size: 13px;
          outline: none;
          transition: border-color 0.15s ease, background 0.15s ease;
        }

        .field-input::placeholder {
          color: #6b7280;
        }

        .field-input:focus {
          border-color: var(--primary);
          background: #0f172a;
        }

        .error-box {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 6px;
          border: 1px solid rgba(248, 113, 113, 0.35);
          background: rgba(248, 113, 113, 0.12);
        }

        .error-icon {
          color: var(--danger);
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .error-text {
          color: var(--danger);
          font-family: var(--mono);
          font-size: 12px;
          line-height: 1.5;
        }

        .submit-btn {
          width: 100%;
          border: 1px solid transparent;
          border-radius: 6px;
          background: var(--primary);
          color: #fff;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          transition: filter 0.15s ease, background 0.15s ease;
        }

        .submit-btn:hover:not(:disabled) {
          filter: brightness(1.1);
        }

        .submit-btn:disabled {
          cursor: not-allowed;
          opacity: 0.72;
        }

        .spinner {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.25);
          border-top-color: #fff;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .login-footer {
          padding: 0 24px 24px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .footer-line {
          flex: 1;
          height: 1px;
          background: var(--border);
        }

        .footer-text {
          color: var(--text-muted);
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .corner-mark {
          position: absolute;
          bottom: -1px;
          right: -1px;
          width: 14px;
          height: 14px;
          border-top: 1px solid var(--border);
          border-left: 1px solid var(--border);
        }
      `}</style>

      <div className="login-card">
        <div className="login-header">
          <div className="login-badge">
            <span className="login-badge-dot" />
            <span className="login-badge-text">Secure Access</span>
          </div>
          <h1 className="login-title">Reconfiguring Identity</h1>
          <p className="login-subtitle">Authorized personnel only</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="login-body">
            <div className="field-group">
              <label className="field-label">Username</label>
              <input
                type="text"
                name="username"
                required
                value={creds.username}
                className="field-input"
                placeholder="enter username"
                onChange={handleChange}
              />
            </div>

            <div className="field-group">
              <label className="field-label">Password</label>
              <input
                type="password"
                name="password"
                required
                value={creds.password}
                className="field-input"
                placeholder="••••••••"
                onChange={handleChange}
              />
            </div>

            {error && (
              <div className="error-box">
                <span className="error-icon">!</span>
                <span className="error-text">{error}</span>
              </div>
            )}

            <button type="submit" disabled={isLoading} className="submit-btn">
              {isLoading ? (
                <>
                  <span className="spinner" />
                  <span>Loading</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </div>
        </form>

        <div className="login-footer">
          <div className="footer-line" />
          <span className="footer-text">encrypted · 256-bit</span>
          <div className="footer-line" />
        </div>

        <div className="corner-mark" />
      </div>
    </div>
  );
};

export default LoginPage;
