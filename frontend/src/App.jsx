import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import api from './services/api';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import RagLab from './pages/RagLab';
import AlertsPage from './pages/AlertsPage';

const isAdminUser = (user) => user?.roles?.some((role) => role?.toLowerCase() === 'admin');

const MainLayout = ({ user, handleLogout, children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = isAdminUser(user);

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div className="nav-container">
          <div className="nav-logo-group">
            <div className="nav-logo-icon">S</div>
            <span className="nav-logo-text">
              SYSTEM<span className="nav-logo-text-alt">MANAGER</span>
            </span>
          </div>

          <div className="nav-actions">
            <div className="nav-tabs">

              {isAdmin && (
                <>
              <button
                onClick={() => navigate('/alerts')}
                className={`nav-tab ${location.pathname === '/alerts' ? 'active' : ''}`}
              >
                ALERTS
              </button>
                <button
                  onClick={() => navigate('/dashboard')}
                  className={`nav-tab ${location.pathname === '/dashboard' ? 'active' : ''}`}
                >
                  DASHBOARD
                </button>
              <button
                onClick={() => navigate('/rag-lab')}
                className={`nav-tab ${location.pathname === '/rag-lab' ? 'active' : ''}`}
              >
                RAG LAB
              </button>
            </>
              )}
            </div>

            <div className="user-badge">
              <span className="user-avatar">
                {user.username?.[0]?.toUpperCase()}
              </span>
              <span className="user-name">{user.username}</span>
              <span className="badge-divider">|</span>
              <span className="user-role">{user.roles?.[0] || 'User'}</span>
            </div>
            <button onClick={handleLogout} className="btn-logout">
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="app-main">{children}</main>

      <footer className="app-footer">
        © 2026 SYSTEM_MANAGER_CORP. ALL PRIVILEGES SECURED.
      </footer>
    </div>
  );
};

function App() {
  const [user, setUser] = useState(null);
  const [initialized, setInitialized] = useState(() => !localStorage.getItem('access_token'));

  useEffect(() => {
    const token = localStorage.getItem('access_token');

    if (!token) {
      return;
    }

    api.request('/auth/me')
      .then((u) => {
        if (u.username) setUser(u);
      })
      .finally(() => setInitialized(true));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  };

  if (!initialized) {
    return (
      <>
        <style>{`
          .init-root {
            min-height: 100vh;
            background:
              radial-gradient(circle at top, rgba(59, 130, 246, 0.14), transparent 34%),
              linear-gradient(180deg, #0b1220 0%, #111827 100%);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 16px;
            font-family: var(--mono);
            color: var(--text-primary);
            font-size: 12px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }

          .init-spinner {
            width: 26px;
            height: 26px;
            border: 2px solid rgba(255, 255, 255, 0.12);
            border-top-color: var(--primary);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
        <div className="init-root">
          <div className="init-spinner" />
          <span>BOOTING_SYSTEM_SHELL_V1.0.4...</span>
        </div>
      </>
    );
  }

  return (
    <BrowserRouter>
      <div className="app-root">
        <Routes>
          <Route
            path="/login"
            element={
              !user ? (
                <LoginPage onLoginSuccess={(u) => setUser(u)} />
              ) : (
                <Navigate to="/alerts" replace />
              )
            }
          />

          <Route
            path="/alerts"
            element={
              user ? (
                <MainLayout user={user} handleLogout={handleLogout}>
                  <AlertsPage />
                </MainLayout>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          <Route
            path="/dashboard"
            element={
              user && isAdminUser(user) ? (
                <MainLayout user={user} handleLogout={handleLogout}>
                  <AdminDashboard />
                </MainLayout>
              ) : user ? (
                <Navigate to="/alerts" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          <Route
            path="/rag-lab"
            element={
              user && isAdminUser(user) ? (
                <MainLayout user={user} handleLogout={handleLogout}>
                  <RagLab />
                </MainLayout>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          <Route path="/" element={<Navigate to={user ? '/alerts' : '/login'} replace />} />
          <Route path="*" element={<Navigate to={user ? '/alerts' : '/login'} replace />} />
        </Routes>

        <style>{`
          .app-root {
            min-height: 100vh;
            color: var(--text-primary);
            background:
              radial-gradient(circle at top, rgba(59, 130, 246, 0.12), transparent 34%),
              linear-gradient(180deg, #0b1220 0%, var(--surface) 100%);
          }

          .app-shell {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
          }

          .app-nav {
            position: sticky;
            top: 0;
            z-index: 100;
            background: rgba(17, 24, 39, 0.92);
            backdrop-filter: blur(14px);
            border-bottom: 1px solid var(--border);
          }

          .nav-container {
            max-width: 1280px;
            margin: 0 auto;
            padding: 16px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
          }

          .nav-logo-group {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .nav-logo-icon {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--primary);
            color: #fff;
            font-family: var(--mono);
            font-size: 14px;
            font-weight: 700;
            border-radius: 4px;
            box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
          }

          .nav-logo-text {
            font-family: var(--mono);
            font-size: 14px;
            font-weight: 700;
            color: var(--text-primary);
            letter-spacing: 0.08em;
          }

          .nav-logo-text-alt {
            color: var(--text-muted);
            margin-left: 4px;
          }

          .nav-actions {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .nav-tabs {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.02);
          }

          .nav-tab {
            border: 1px solid transparent;
            background: transparent;
            color: var(--text-muted);
            padding: 8px 12px;
            border-radius: 6px;
            font-family: var(--mono);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            cursor: pointer;
            transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
            white-space: nowrap;
          }

          .nav-tab:hover,
          .nav-tab.active {
            background: rgba(59, 130, 246, 0.08);
            border-color: rgba(59, 130, 246, 0.45);
            color: var(--text-primary);
          }

          .user-badge {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            background: var(--surface-2);
            border: 1px solid var(--border);
            border-radius: 6px;
          }

          .user-avatar {
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(59, 130, 246, 0.16);
            border: 1px solid rgba(59, 130, 246, 0.45);
            color: #fff;
            font-family: var(--mono);
            font-size: 11px;
            font-weight: 700;
            border-radius: 999px;
          }

          .user-name,
          .user-role,
          .badge-divider {
            font-family: var(--mono);
            text-transform: uppercase;
          }

          .user-name {
            font-size: 12px;
            color: var(--text-primary);
            font-weight: 600;
          }

          .badge-divider {
            color: var(--border);
            font-size: 11px;
          }

          .user-role {
            font-size: 10px;
            color: var(--text-muted);
            font-weight: 700;
          }

          .btn-logout {
            border: 1px solid var(--border);
            background: transparent;
            color: var(--text-primary);
            padding: 8px 14px;
            border-radius: 6px;
            font-family: var(--mono);
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            cursor: pointer;
            transition: background 0.15s ease, border-color 0.15s ease, filter 0.15s ease;
          }

          .btn-logout:hover {
            background: var(--surface-2);
            border-color: var(--primary);
            filter: brightness(1.1);
          }

          .app-main {
            flex-grow: 1;
            width: 100%;
          }

          .app-footer {
            margin-top: auto;
            background: rgba(17, 24, 39, 0.9);
            border-top: 1px solid var(--border);
            padding: 14px 24px;
            text-align: center;
            font-family: var(--mono);
            font-size: 10px;
            color: var(--text-muted);
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }

          @media (max-width: 820px) {
            .nav-container,
            .nav-actions {
              align-items: stretch;
              flex-direction: column;
            }

            .nav-tabs,
            .user-badge {
              width: 100%;
            }

            .nav-tab,
            .btn-logout {
              flex: 1;
            }
          }

        `}</style>
      </div>
    </BrowserRouter>
  );
}

export default App;
