import { useEffect, useState } from 'react';
import api from '../services/api';

const StatCard = ({ title, value, icon, tone }) => {
  const icons = {
    users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13.732 4c-.77.923-1.168 2.088-1.168 3.387 0 1.299.398 2.464 1.168 3.387M19.914 21a6.994 6.994 0 00-2.433-4.382m-.032 0h1.59',
    check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    log: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  };

  return (
    <div className="stat-card" data-tone={tone}>
      <div className="stat-card-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d={icons[icon]} />
        </svg>
      </div>
      <div className="stat-card-copy">
        <span className="stat-card-title">{title}</span>
        <span className="stat-card-value">{value}</span>
      </div>
    </div>
  );
};

const getMockLogs = () => [
  { id: 1, created_at: '2026-05-08 22:15:31', message: 'SYS_AUTH: Connection established', user: 'admin', log_level: 'Info' },
  { id: 2, created_at: '2026-05-08 21:04:12', message: 'SYS_DB: Hotfile core backup initiated', user: 'daemon_00', log_level: 'Info' },
  { id: 3, created_at: '2026-05-08 19:40:55', message: 'AUTH_FAIL: Invalid SSH identity payload', user: 'guest_99', log_level: 'Err' },
  { id: 4, created_at: '2026-05-08 18:12:00', message: 'SEC_AUDIT: Role modification attempted', user: 'j_doe', log_level: 'Warn' },
  { id: 5, created_at: '2026-05-08 15:30:22', message: 'SYS_CONF: Port 8080 redirected to 443', user: 'admin', log_level: 'Info' },
];

const formatMoney = (value) => `$${Number(value || 0).toFixed(4)}`;
const formatTokens = (value) => Number(value || 0).toLocaleString();

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [topEndpoints, setTopEndpoints] = useState([]);
  const [usage, setUsage] = useState(null);
  const [activeTab, setActiveTab] = useState('stats');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'Viewer',
    is_active: true,
  });
  const [error, setError] = useState('');
  const [editingUserId, setEditingUserId] = useState(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setError('');
  };

  const resetForm = () => {
    setFormData({ username: '', email: '', password: '', role: 'Viewer', is_active: true });
    setEditingUserId(null);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    setError('');
  };

  const handleCreateUser = async () => {
    setError('');
    try {
      const response = await api.createUser(formData);
      const newUser = response.data || response;

      if (newUser?.id || newUser?.username) {
        setUsers((prevUsers) => [newUser, ...prevUsers]);

        if (stats) {
          setStats((prev) => ({
            ...prev,
            total_users: (Number(prev.total_users) || 0) + 1,
            active_users: (Number(prev.active_users) || 0) + 1,
            admin_count: formData.role === 'Admin'
              ? (Number(prev.admin_count) || 0) + 1
              : prev.admin_count,
          }));
        }

        closeModal();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Connection refused by backend');
    }
  };

  const initiateEdit = (user) => {
    setEditingUserId(user.id);
    setFormData({
      username: user.username,
      email: user.email,
      password: '',
      role: user.roles?.[0] || user.role || 'Viewer',
      is_active: user.is_active,
    });
    setIsModalOpen(true);
  };

  const handleUpdateUser = async (id, updatedData) => {
    setError('');

    try {
      const response = await api.updateUser(id, updatedData);
      const updatedUser = response.data || response;

      if (updatedUser) {
        setUsers((prevUsers) => prevUsers.map((u) => (u.id === id ? updatedUser : u)));
        const statsData = await api.getStats();
        setStats(statsData);
        closeModal();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Update protocol failed');
    }
  };

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const [statsData, usersData] = await Promise.all([api.getStats(), api.getUsers()]);
        setStats(statsData);
        setUsers(usersData);

        if (api.getLogs) {
          const logsData = await api.getLogs();
          setLogs(logsData);
        } else {
          setLogs(getMockLogs());
        }

        if (api.getTopEndpoints) {
          const endpoints = await api.getTopEndpoints()
          setTopEndpoints(endpoints)
        }

        if (api.getUsageSummary) {
          const usageData = await api.getUsageSummary();
          setUsage(usageData);
        }
      } catch (e) {
        console.error('Error loading dashboard', e);
        setLogs(getMockLogs());
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const handleDelete = async (id, username) => {
    if (!window.confirm(`Are you sure you want to delete '${username}'?`)) return;

    await api.deleteUser(id);
    setUsers((prev) => prev.filter((user) => user.id !== id));
    const statsData = await api.getStats();
    setStats(statsData);
  };

  const refreshStats = async () => {
        const [statsData, endpointData] = await Promise.all([api.getStats(), api.getTopEndpoints()]);
        setStats(statsData);
        setTopEndpoints(endpointData);
  }

  const activeHeaderDetails = {
    stats: {
      title: 'System Telemetry',
      subtitle: 'Realtime core system activity and node metrics',
    },
    users: {
      title: 'Identity Matrix',
      subtitle: 'User provisioning, privilege control, and access state',
    },
    logs: {
      title: 'Security Ledger',
      subtitle: 'Audit trail for system events and operator activity',
    },
    usage: {
      title: 'LLM Usage Ledger',
      subtitle: 'Daily, weekly, and monthly token usage with cost totals',
    },
  };

  if (loading) {
    return (
      <div className="loading-root">
        <style>{`
          .loading-root {
            min-height: calc(100vh - 64px);
            display: grid;
            place-items: center;
            background:
              radial-gradient(circle at top, rgba(59, 130, 246, 0.12), transparent 34%),
              linear-gradient(180deg, #0b1220 0%, #111827 100%);
          }
          .loading-panel {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            padding: 24px 28px;
            border: 1px solid var(--border);
            border-radius: 10px;
            background: rgba(31, 41, 55, 0.86);
            box-shadow: var(--shadow);
            color: var(--text-primary);
            font-family: var(--mono);
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.12em;
          }
          .loading-spinner {
            width: 28px;
            height: 28px;
            border-radius: 999px;
            border: 2px solid rgba(255, 255, 255, 0.12);
            border-top-color: var(--primary);
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
        <div className="loading-panel">
          <div className="loading-spinner" />
          <span>BOOTING DASHBOARD_V1.0.4...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-root">
      <style>{`
        .dash-root {
          min-height: 100vh;
          padding: 32px 24px;
          color: var(--text-primary);
        }

        .dash-wrapper {
          max-width: 1280px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .dash-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border);
        }

        .dash-title-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .dash-title {
          margin: 0;
          color: var(--text-primary);
          font-family: var(--mono);
          font-size: 1.1rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .dash-subtitle {
          color: var(--text-muted);
          font-size: 13px;
          font-weight: 500;
        }

        .btn-primary,
        .btn-secondary,
        .btn-action-edit,
        .btn-action-delete {
          border-radius: 6px;
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, filter 0.15s ease;
        }

        .btn-primary {
          background: var(--primary);
          color: #fff;
          border: 1px solid transparent;
          padding: 8px 16px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-primary:hover {
          filter: brightness(1.1);
        }

        .btn-secondary,
        .btn-action-edit {
          background: transparent;
          color: var(--text-primary);
          border: 1px solid var(--border);
          padding: 8px 16px;
        }

        .btn-secondary:hover,
        .btn-action-edit:hover {
          background: var(--border);
        }

        .btn-action-delete {
          background: transparent;
          color: var(--danger);
          border: 1px solid rgba(248, 113, 113, 0.35);
          padding: 4px 8px;
        }

        .btn-action-delete:hover {
          background: rgba(248, 113, 113, 0.12);
        }

        .dash-layout {
          display: flex;
          align-items: flex-start;
          gap: 24px;
        }

        .sidebar {
          width: 170px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex-shrink: 0;
        }

        .sidebar-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-left: 2px solid transparent;
          color: var(--text-muted);
          padding: 12px 14px;
          text-align: left;
          border-radius: 8px;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }

        .sidebar-item:hover {
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
        }

        .sidebar-item.active {
          background: rgba(59, 130, 246, 0.08);
          border-color: rgba(59, 130, 246, 0.5);
          border-left-color: var(--primary);
          color: var(--text-primary);
        }

        .sidebar-item svg,
        .btn-primary svg {
          width: 1.2em;
          height: 1.2em;
        }

        .dash-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .usage-stack {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }

        .stat-card {
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: var(--shadow);
        }

        .stat-card[data-tone='primary'] { border-left: 2px solid var(--primary); }
        .stat-card[data-tone='success'] { border-left: 2px solid var(--success); }
        .stat-card[data-tone='info'] { border-left: 2px solid var(--primary); }
        .stat-card[data-tone='neutral'] { border-left: 2px solid var(--text-muted); }

        .stat-card-icon {
          width: 44px;
          height: 44px;
          border-radius: 8px;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.03);
          color: var(--primary);
          border: 1px solid var(--border);
          flex-shrink: 0;
        }

        .stat-card-icon svg {
          width: 1.2em;
          height: 1.2em;
        }

        .stat-card-copy {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .stat-card-title {
          color: var(--text-muted);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .stat-card-value {
          color: var(--text-primary);
          font-family: var(--mono);
          font-size: 1.8rem;
          font-weight: 700;
        }

        .table-container {
          position: relative;
          overflow: hidden;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: var(--shadow);
        }

        .table-header {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 18px 20px;
          border-bottom: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.02);
        }

        .table-title {
          margin: 0;
          color: var(--text-primary);
          font-family: var(--mono);
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .table-subtitle {
          color: var(--text-muted);
          font-size: 13px;
        }

        .custom-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .custom-table thead th {
          position: sticky;
          top: 0;
          z-index: 1;
          background: #0f172a;
          color: var(--text-muted);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .custom-table th,
        .custom-table td {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
        }

        .custom-table tr:hover td {
          background: rgba(255, 255, 255, 0.02);
        }

        .username-cell {
          font-family: var(--mono);
          color: var(--text-primary);
          font-weight: 600;
        }

        .email-cell,
        .operator-cell,
        .ip-cell {
          color: var(--text-muted);
          font-family: var(--mono);
        }

        .role-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 4px 8px;
          border-radius: 999px;
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: 1px solid var(--border);
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.03);
        }

        .role-admin {
          border-color: rgba(59, 130, 246, 0.4);
          background: rgba(59, 130, 246, 0.08);
        }

        .status-indicator {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--text-primary);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          display: inline-block;
        }

        .status-active { color: var(--success); }
        .status-active .status-dot { background: var(--success); }
        .status-inactive { color: var(--text-muted); }
        .status-inactive .status-dot { background: var(--text-muted); }
        .status-failed { color: var(--danger); }
        .status-failed .status-dot { background: var(--danger); }
        .status-warning { color: #fbbf24; }
        .status-warning .status-dot { background: #fbbf24; }

        .timestamp-cell {
          font-family: var(--mono);
          color: var(--primary);
          font-size: 12px;
        }

        .event-cell {
          color: var(--text-primary);
        }

        .actions-cell {
          text-align: right;
          white-space: nowrap;
        }

        .corner-mark {
          position: absolute;
          right: -1px;
          bottom: -1px;
          width: 14px;
          height: 14px;
          border-top: 1px solid var(--border);
          border-left: 1px solid var(--border);
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
        }

        .modal-content {
          width: 100%;
          max-width: 500px;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: var(--shadow);
          padding: 24px;
          position: relative;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-label {
          display: block;
          margin-bottom: 4px;
          color: var(--text-muted);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .form-input {
          width: 100%;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--surface);
          color: var(--text-primary);
          padding: 12px 14px;
          font-family: var(--mono);
          font-size: 13px;
          outline: none;
        }

        .form-input:focus {
          border-color: var(--primary);
        }

        .error-msg {
          margin-bottom: 16px;
          color: var(--danger);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 20px;
        }

        @media (max-width: 900px) {
          .dash-root {
            padding: 24px 16px;
          }

          .dash-header,
          .dash-layout {
            flex-direction: column;
          }

          .sidebar {
            width: 100%;
            flex-direction: row;
            overflow-x: auto;
          }

          .sidebar-item {
            min-width: 140px;
          }
        }
      `}</style>

      <div className="dash-wrapper">
        <div className="dash-header">
          <div className="dash-title-group">
            <h1 className="dash-title">{activeHeaderDetails[activeTab].title}</h1>
            <p className="dash-subtitle">{activeHeaderDetails[activeTab].subtitle}</p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {activeTab === 'users' && (
              <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Add User
              </button>
            )}

            {activeTab === 'stats' && (
              <button
                className="btn-primary"
                onClick={refreshStats}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Refresh
              </button>
            )}

            {activeTab === 'logs' && (
              <button
                className="btn-primary"
                onClick={async () => {
                  const logsData = await api.getLogs();
                  setLogs(logsData);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Refresh
              </button>
            )}
          </div>
        </div>

        <div className="dash-layout">
          <aside className="sidebar">
            <button
              onClick={() => setActiveTab('stats')}
              className={`sidebar-item ${activeTab === 'stats' ? 'active' : ''}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
              </svg>
              Stats
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`sidebar-item ${activeTab === 'users' ? 'active' : ''}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13.732 4c-.77.923-1.168 2.088-1.168 3.387 0 1.299.398 2.464 1.168 3.387M19.914 21a6.994 6.994 0 00-2.433-4.382m-.032 0h1.59" />
              </svg>
              Users
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`sidebar-item ${activeTab === 'logs' ? 'active' : ''}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Logs
            </button>
            <button
              onClick={() => setActiveTab('usage')}
              className={`sidebar-item ${activeTab === 'usage' ? 'active' : ''}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 19V5m0 14h16M8 17v-6m4 6V7m4 10v-3" />
              </svg>
              Usage
            </button>
          </aside>

          <div className="dash-content">
            {activeTab === 'stats' && stats && (
              <>
                <div className="stats-grid">
                  <StatCard title="Total Users" value={stats.total_users} icon="users" tone="primary" />
                  <StatCard title="Active Accounts" value={stats.active_users} icon="check" tone="success" />
                  <StatCard title="Administrators" value={stats.admin_count} icon="shield" tone="info" />
                  <StatCard
                    title="System Status"
                    value={users.length > 0 ? 'ONLINE' : 'OFFLINE'}
                    icon="log"
                    tone="neutral"
                  />
                </div>

                <div className="table-container">
                  <div className="table-header">
                    <h2 className="table-title">TOP Active Endpoints</h2>
                    <p className="table-subtitle">Endpoint activity trace v1.2</p>
                  </div>

                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Endpoint</th>
                      <th>Method</th>
                      <th>Hits</th>
                      <th>Average Latency (ms)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topEndpoints.map((endpoint) => (
                      <tr key={endpoint.id}>
                        <td className="operator-cell">{endpoint.endpoint}</td>
                        <td className="operator-cell">{endpoint.method}</td>
                        <td className="operator-cell">{endpoint.hits}</td>
                        <td className="operator-cell">{endpoint.avg_latency_ms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="corner-mark" />
                </div>
              </>

            )}

            {activeTab === 'users' && (
              <div className="table-container">
                <div className="table-header">
                  <h2 className="table-title">User Management Database</h2>
                  <p className="table-subtitle">System privilege registry v1.0</p>
                </div>

                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Email Address</th>
                      <th>System Role</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td className="username-cell">{user?.username || 'N/A'}</td>
                        <td className="email-cell">{user.email}</td>
                        <td>
                          <span className={`role-badge ${user.roles?.includes('Admin') ? 'role-admin' : ''}`}>
                            {user.roles?.[0] || user.role || 'User'}
                          </span>
                        </td>
                        <td>
                          {user.is_active ? (
                            <span className="status-indicator status-active">
                              <span className="status-dot" />
                              Active
                            </span>
                          ) : (
                            <span className="status-indicator status-inactive">
                              <span className="status-dot" />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="actions-cell">
                          <button className="btn-action-edit" onClick={() => initiateEdit(user)}>
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(user.id, user.username)}
                            className="btn-action-delete"
                            style={{ marginLeft: '8px' }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="corner-mark" />
              </div>
            )}

            {activeTab === 'logs' && (
              <div className="table-container">
                <div className="table-header">
                  <h2 className="table-title">System Event Audit Log</h2>
                  <p className="table-subtitle">Cryptographic terminal activity trace v1.2</p>
                </div>

                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Activity</th>
                      <th>Operator</th>
                      <th>Log Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td className="timestamp-cell">{log.created_at}</td>
                        <td className="event-cell">{log.message}</td>
                        <td className="operator-cell">{log.user}</td>
                        <td>
                          {log.log_level === 'Info' && (
                            <span className="status-indicator status-active">
                              <span className="status-dot" />
                              Info
                            </span>
                          )}
                          {log.log_level === 'Err' && (
                            <span className="status-indicator status-failed">
                              <span className="status-dot" />
                              Error
                            </span>
                          )}
                          {log.log_level === 'Warn' && (
                            <span className="status-indicator status-warning">
                              <span className="status-dot" />
                              Warning
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="corner-mark" />
              </div>
            )}

            {activeTab === 'usage' && usage && (
              <div className="usage-stack">
                <div className="stats-grid">
                  <StatCard title="Daily Cost" value={formatMoney(usage.periods?.daily?.total_cost)} icon="log" tone="primary" />
                  <StatCard title="Weekly Cost" value={formatMoney(usage.periods?.weekly?.total_cost)} icon="check" tone="success" />
                  <StatCard title="Monthly Cost" value={formatMoney(usage.periods?.monthly?.total_cost)} icon="shield" tone="info" />
                  <StatCard title="Monthly Tokens" value={formatTokens(usage.periods?.monthly?.total_tokens)} icon="users" tone="neutral" />
                </div>

                <div className="table-container">
                  <div className="table-header">
                    <h2 className="table-title">Usage Period Summary</h2>
                    <p className="table-subtitle">Tokens and costs for the last 24 hours, 7 days, and 30 days</p>
                  </div>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Total Tokens</th>
                        <th>Input</th>
                        <th>Output</th>
                        <th>Embedding</th>
                        <th>Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {['daily', 'weekly', 'monthly'].map((period) => {
                        const row = usage.periods?.[period] || {};
                        return (
                          <tr key={period}>
                            <td className="username-cell">{period}</td>
                            <td>{formatTokens(row.total_tokens)}</td>
                            <td>{formatTokens(row.input_tokens)}</td>
                            <td>{formatTokens(row.output_tokens)}</td>
                            <td>{formatTokens(row.embedding_tokens)}</td>
                            <td>{formatMoney(row.total_cost)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="corner-mark" />
                </div>

                <div className="table-container">
                  <div className="table-header">
                    <h2 className="table-title">Current Rate Card</h2>
                    <p className="table-subtitle">Token rates are per 1M tokens for the configured models</p>
                  </div>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th>Input / 1M</th>
                        <th>Output / 1M</th>
                        <th>Cached / 1M</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(usage.rates?.models || {}).map(([model, rate]) => (
                        <tr key={model}>
                          <td className="username-cell">{model}</td>
                          <td>{formatMoney(rate.input_per_1m)}</td>
                          <td>{formatMoney(rate.output_per_1m)}</td>
                          <td>{formatMoney(rate.cached_input_per_1m)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="corner-mark" />
                </div>

                <div className="table-container">
                  <div className="table-header">
                    <h2 className="table-title">Embedding Rate</h2>
                    <p className="table-subtitle">Rate for the active embedding model used by RAG indexing and retrieval</p>
                  </div>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Embedding Model</th>
                        <th>Rate / 1M</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="username-cell">{usage.rates?.embedding_model}</td>
                        <td>{formatMoney(usage.rates?.embeddings?.[usage.rates?.embedding_model] || 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="corner-mark" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="table-title">
              {editingUserId ? `Edit User: ${formData.username}` : 'Provision New Identity'}
            </h2>

            {error && <div className="error-msg">!! {error}</div>}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingUserId) {
                  handleUpdateUser(editingUserId, formData);
                } else {
                  handleCreateUser();
                }
              }}
            >
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  className="form-input"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                  readOnly={Boolean(editingUserId)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  className="form-input"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Temporary Password</label>
                <input
                  className="form-input"
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required={!editingUserId}
                  placeholder={editingUserId ? 'Leave blank to keep current' : '••••••••'}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Access Level</label>
                <select className="form-input" name="role" value={formData.role} onChange={handleChange}>
                  <option value="Viewer">User</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

              {editingUserId && (
                <div className="form-group">
                  <label className="form-label">Account Status</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="is_active"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleChange}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                    />
                    <label
                      htmlFor="is_active"
                      style={{
                        color: formData.is_active ? 'var(--success)' : 'var(--danger)',
                        fontFamily: 'var(--mono)',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {formData.is_active ? 'Active' : 'Deactivated'}
                    </label>
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save
                </button>
              </div>
            </form>

            <div className="corner-mark" />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
