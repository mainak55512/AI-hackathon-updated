import { useMemo, useEffect, useState } from "react";
import api from "../services/api";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

const getTone = (severity) => {
  if (severity >= 90) return "critical";
  if (severity >= 75) return "high";
  if (severity >= 55) return "medium";
  return "low";
};

const AlertsPage = () => {
  const [alerts, setAlerts] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [sortMode, setSortMode] = useState("severity");
  const [selectedId, setSelectedId] = useState("");
  const [feedback, setFeedback] = useState({});
  const [fileType, setFileType] = useState("json");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [modalAlert, setModalAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [kpiData, setKpiData] = useState([]);

  useEffect(() => {
    const loadAlerts = async () => {
      setLoading(true);
      console.log("Effect triggered: Fetching data...");
      try {
        const data = await api.getAlerts();
        setAlerts(data);
        if (data && data.length > 0) {
          setSelectedId(data[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch alerts:", err);
      } finally{
        setLoading(false);
      }
    };
    const loadKPIs = async () => {
      setLoading(true);
      console.log("Effect triggered: Fetching data...");
      try {
        const data = await api.getKPIs();
        setKpiData(data);
        // if (data && data.length > 0) {
        //   setSelectedId(data[0].id);
        // }
      } catch (err) {
        console.error("Failed to fetch alerts:", err);
      } finally{
        setLoading(false);
      }
    };

    loadAlerts();
    loadKPIs()
  }, []);

  const filteredAlerts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return alerts
      .filter((alert) => filter === "All" || alert.status === filter)
      .filter((alert) => {
        if (!normalizedQuery) return true;

        return [
          alert.id,
          alert.customer,
          alert.account,
          alert.type,
          alert.channel,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((first, second) => {
        if (sortMode === "newest") {
          return new Date(second.timestamp) - new Date(first.timestamp);
        }

        if (sortMode === "amount") {
          return second.amount - first.amount;
        }

        return second.severity - first.severity;
      });
  }, [alerts, filter, query, sortMode]);

  const selectedAlert =
    filteredAlerts.find((alert) => alert.id === selectedId) ||
    filteredAlerts[0] ||
    alerts[0] ||
    null;
  const severityCounts = useMemo(() => {
    return alerts.reduce(
      (counts, alert) => ({
        ...counts,
        [alert.status]: (counts[alert.status] || 0) + 1,
      }),
      { Critical: 0, High: 0, Medium: 0, Low: 0 },
    );
  }, [alerts]);
  const totalAlerts = alerts.length || 1;
  const criticalAngle = (severityCounts.Critical / totalAlerts) * 360;
  const highAngle = criticalAngle + (severityCounts.High / totalAlerts) * 360;
  const mediumAngle = highAngle + (severityCounts.Medium / totalAlerts) * 360;
  const chartStyle = {
    background: `conic-gradient(var(--danger) 0deg ${criticalAngle}deg, #fbbf24 ${criticalAngle}deg ${highAngle}deg, var(--primary) ${highAngle}deg ${mediumAngle}deg, var(--text-muted) ${mediumAngle}deg 360deg)`,
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    setUploadError("");
    setUploadResult(null);

    if (!selectedFile) {
      setUploadError("Select an alert input file before upload.");
      return;
    }

    setUploading(true);
    try {
      const result = await api.uploadAlerts(selectedFile, fileType);
      setUploadResult(result);
    } catch (err) {
      setUploadError(
        err.response?.data?.error || err.message || "Alert upload failed.",
      );
    } finally {
      setUploading(false);
    }
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
          <span>LOADING ALERTS...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="alerts-root">
      <style>{`
        .alerts-root {
          min-height: 100%;
          padding: 32px 24px;
          color: var(--text-primary);
        }

        .alerts-wrapper {
          max-width: 1280px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .alerts-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border);
        }

        .alerts-title {
          margin: 0;
          font-family: var(--mono);
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .alerts-subtitle {
          margin-top: 6px;
          color: var(--text-muted);
          font-size: 13px;
        }

        .live-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border: 1px solid rgba(74, 222, 128, 0.35);
          border-radius: 999px;
          background: rgba(74, 222, 128, 0.08);
          color: var(--success);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .live-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--success);
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }

        .insight-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 340px;
          gap: 16px;
        }

        .kpi-card,
        .chart-panel,
        .alert-panel,
        .detail-panel {
          position: relative;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: var(--shadow);
          overflow: hidden;
        }

        .kpi-card {
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .kpi-card[data-tone='primary'] { border-left: 2px solid var(--primary); }
        .kpi-card[data-tone='success'] { border-left: 2px solid var(--success); }
        .kpi-card[data-tone='danger'] { border-left: 2px solid var(--danger); }
        .kpi-card[data-tone='neutral'] { border-left: 2px solid var(--text-muted); }

        .kpi-icon {
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

        .kpi-icon svg {
          width: 20px;
          height: 20px;
        }

        .kpi-label,
        .field-label,
        .alert-meta,
        .badge,
        .feedback-label {
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .kpi-label {
          color: var(--text-muted);
        }

        .kpi-value {
          display: block;
          margin-top: 2px;
          color: var(--text-primary);
          font-family: var(--mono);
          font-size: 1.8rem;
          font-weight: 700;
        }

        .chart-panel {
          padding: 18px 20px;
          display: grid;
          grid-template-columns: 132px minmax(0, 1fr);
          gap: 18px;
          align-items: center;
        }

        .pie-chart {
          width: 132px;
          height: 132px;
          border-radius: 999px;
          border: 1px solid var(--border);
          display: grid;
          place-items: center;
          box-shadow: inset 0 0 0 14px rgba(17, 24, 39, 0.88);
        }

        .pie-center {
          width: 72px;
          height: 72px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: var(--surface-2);
          border: 1px solid var(--border);
          color: var(--text-primary);
          font-family: var(--mono);
          font-size: 1.4rem;
          font-weight: 700;
        }

        .legend-list {
          display: grid;
          gap: 10px;
        }

        .legend-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          color: var(--text-muted);
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .legend-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          display: inline-block;
        }

        .legend-dot.critical { background: var(--danger); }
        .legend-dot.high { background: #fbbf24; }
        .legend-dot.medium { background: var(--primary); }
        .legend-dot.low { background: var(--text-muted); }

        .controls {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) 170px 170px;
          gap: 12px;
        }

        .upload-panel {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 16px;
          align-items: end;
          padding: 18px 20px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface-2);
          box-shadow: var(--shadow);
          overflow: hidden;
        }

        .upload-fields {
          display: grid;
          grid-template-columns: 160px minmax(220px, 1fr);
          gap: 12px;
          align-items: end;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field-label {
          color: var(--text-muted);
        }

        .input,
        .select,
        .file-input {
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

        .input:focus,
        .select:focus,
        .file-input:focus {
          border-color: var(--primary);
        }

        .upload-message {
          margin-top: 10px;
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .upload-message.success {
          color: var(--success);
        }

        .upload-message.error {
          color: var(--danger);
        }

        .alerts-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);
          gap: 16px;
          align-items: start;
        }

        .panel-header {
          padding: 18px 20px;
          border-bottom: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.02);
        }

        .panel-title {
          margin: 0;
          font-family: var(--mono);
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .panel-subtitle {
          margin-top: 4px;
          color: var(--text-muted);
          font-size: 13px;
        }

        .alert-list {
          display: flex;
          flex-direction: column;
        }

        .alert-row {
          width: 100%;
          border: 0;
          border-bottom: 1px solid var(--border);
          background: transparent;
          color: var(--text-primary);
          padding: 16px 20px;
          display: grid;
          grid-template-columns: 76px minmax(0, 1fr) auto;
          gap: 14px;
          text-align: left;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .alert-row:hover,
        .alert-row.active {
          background: rgba(59, 130, 246, 0.08);
        }

        .alert-row.active {
          box-shadow: inset 2px 0 0 var(--primary);
        }

        .severity-ring {
          width: 58px;
          height: 58px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.03);
          font-family: var(--mono);
          font-size: 1rem;
          font-weight: 700;
        }

        .severity-ring[data-tone='critical'] { color: var(--danger); border-color: rgba(248, 113, 113, 0.45); }
        .severity-ring[data-tone='high'] { color: #fbbf24; border-color: rgba(251, 191, 36, 0.45); }
        .severity-ring[data-tone='medium'] { color: var(--primary); border-color: rgba(59, 130, 246, 0.45); }

        .alert-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .alert-title {
          margin: 0;
          font-family: var(--mono);
          font-size: 0.9rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .alert-summary {
          color: var(--text-muted);
          font-size: 13px;
          line-height: 1.55;
        }

        .alert-meta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .alert-meta {
          color: var(--text-muted);
        }

        .alert-amount {
          align-self: start;
          color: var(--text-primary);
          font-family: var(--mono);
          font-size: 0.9rem;
          font-weight: 700;
          white-space: nowrap;
        }

        .detail-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .badge-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .badge {
          padding: 6px 9px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
        }

        .detail-block {
          padding: 14px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.02);
        }

        .detail-block h3 {
          margin: 0 0 8px;
          color: var(--text-muted);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .detail-block p {
          color: var(--text-primary);
          font-size: 13px;
          line-height: 1.6;
        }

        .original-log {
          color: var(--primary);
          font-family: var(--mono);
          font-size: 11px;
          line-height: 1.7;
        }

        .action-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .btn-primary,
        .btn-secondary {
          border-radius: 6px;
          padding: 9px 14px;
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          transition: filter 0.15s ease, background 0.15s ease, border-color 0.15s ease;
        }

        .btn-primary:disabled {
          cursor: not-allowed;
          opacity: 0.72;
        }

        .btn-primary {
          border: 1px solid transparent;
          background: var(--primary);
          color: #fff;
        }

        .btn-primary:hover {
          filter: brightness(1.1);
        }

        .btn-secondary {
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text-primary);
        }

        .btn-secondary:hover,
        .btn-secondary.active {
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--primary);
        }

        .feedback-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 14px;
          border-radius: 8px;
          border: 1px solid rgba(59, 130, 246, 0.35);
          background: rgba(59, 130, 246, 0.08);
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(0, 0, 0, 0.72);
          backdrop-filter: blur(5px);
        }

        .modal-panel {
          width: min(760px, 100%);
          max-height: calc(100vh - 48px);
          overflow: auto;
          position: relative;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: var(--shadow);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          padding: 18px 20px;
          border-bottom: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.02);
        }

        .modal-body {
          padding: 20px;
          display: grid;
          gap: 14px;
        }

        .property-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .property-item {
          padding: 12px 14px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.02);
          min-width: 0;
        }

        .property-label {
          display: block;
          color: var(--text-muted);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .property-value {
          display: block;
          margin-top: 5px;
          color: var(--text-primary);
          font-family: var(--mono);
          font-size: 12px;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .btn-icon {
          width: 34px;
          height: 34px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text-primary);
          cursor: pointer;
          font-family: var(--mono);
          font-size: 16px;
          line-height: 1;
          transition: background 0.15s ease, border-color 0.15s ease;
        }

        .btn-icon:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: var(--primary);
        }

        .feedback-label {
          color: var(--text-muted);
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

        @media (max-width: 960px) {
          .alerts-root {
            padding: 24px 16px;
          }

          .alerts-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .controls,
          .upload-panel,
          .upload-fields,
          .insight-grid,
          .chart-panel,
          .alerts-layout {
            grid-template-columns: 1fr;
          }

          .property-grid {
            grid-template-columns: 1fr;
          }

          .alert-row {
            grid-template-columns: 64px minmax(0, 1fr);
          }

          .alert-amount {
            grid-column: 2;
          }
        }
      `}</style>

      <div className="alerts-wrapper">
        <div className="alerts-header">
          <div>
            <h1 className="alerts-title">Fraud Alert Prioritization</h1>
            <p className="alerts-subtitle">
              AI-generated alert summaries, risk indicators, severity ranking,
              and analyst feedback.
            </p>
          </div>
          <div className="live-badge">
            <span className="live-dot" />
            Real-Time Ingestion Active
          </div>
        </div>

        <div className="insight-grid">
          <div className="kpi-grid">
            {/* <div className="kpi-container"> */}
            {kpiData.map((kpi, index) => (
              <div key={index} className="kpi-card" data-tone={kpi.tone}>
                <div className="kpi-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                      d={kpi.iconPath}
                    />
                  </svg>
                </div>
                <div>
                  <span className="kpi-label">{kpi.label}</span>
                  <span className="kpi-value">{kpi.value}</span>
                </div>
              </div>
            ))}
            {/* </div> */}
          </div>
          <div className="chart-panel">
            <div className="pie-chart" style={chartStyle}>
              <div className="pie-center">{totalAlerts}</div>
            </div>
            <div>
              <h2 className="panel-title">Severity Mix</h2>
              <p className="panel-subtitle">
                Current queue distribution by alert label.
              </p>
              <div className="legend-list" style={{ marginTop: "14px" }}>
                <div className="legend-row">
                  <span className="legend-label">
                    <span className="legend-dot critical" />
                    Critical
                  </span>
                  <span>{severityCounts.Critical}</span>
                </div>
                <div className="legend-row">
                  <span className="legend-label">
                    <span className="legend-dot high" />
                    High
                  </span>
                  <span>{severityCounts.High}</span>
                </div>
                <div className="legend-row">
                  <span className="legend-label">
                    <span className="legend-dot medium" />
                    Medium
                  </span>
                  <span>{severityCounts.Medium}</span>
                </div>
                <div className="legend-row">
                  <span className="legend-label">
                    <span className="legend-dot low" />
                    Low
                  </span>
                  <span>{severityCounts.Low}</span>
                </div>
              </div>
            </div>
            <div className="corner-mark" />
          </div>
        </div>

        <form className="upload-panel" onSubmit={handleUpload}>
          <div>
            <div className="panel-title">Upload Alert Dataset</div>
            <p className="panel-subtitle">
              Submit generated fraud alert input data to backend processing.
            </p>
            <div className="upload-fields" style={{ marginTop: "14px" }}>
              <div className="field">
                <label className="field-label">File Type</label>
                <select
                  className="select"
                  value={fileType}
                  onChange={(event) => setFileType(event.target.value)}
                >
                  <option value="json">JSON</option>
                  <option value="xml">XML</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">Input File</label>
                <input
                  className="file-input"
                  type="file"
                  accept={
                    fileType === "json"
                      ? ".json,application/json"
                      : ".xml,text/xml,application/xml"
                  }
                  onChange={(event) => {
                    setSelectedFile(event.target.files?.[0] || null);
                    setUploadError("");
                    setUploadResult(null);
                  }}
                />
              </div>
            </div>
            {uploadError && (
              <div className="upload-message error">!! {uploadError}</div>
            )}
            {uploadResult && (
              <div className="upload-message success">
                {uploadResult.message}: {uploadResult.record_count} records
                queued from {uploadResult.file_name}
              </div>
            )}
          </div>
          <button className="btn-primary" type="submit" disabled={uploading}>
            {uploading ? "Uploading" : "Upload Dataset"}
          </button>
          <div className="corner-mark" />
        </form>

        <div className="controls">
          <div className="field">
            <label className="field-label">Search Alerts</label>
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Alert ID, customer, account, type"
            />
          </div>
          <div className="field">
            <label className="field-label">Severity Filter</label>
            <select
              className="select"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option>All</option>
              <option>Critical</option>
              <option>High</option>
              <option>Medium</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Sort By</label>
            <select
              className="select"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value)}
            >
              <option value="severity">Severity Score</option>
              <option value="newest">Newest Alert</option>
              <option value="amount">Exposure Amount</option>
            </select>
          </div>
        </div>

        <div className="alerts-layout">
          <div className="alert-panel">
            <div className="panel-header">
              <h2 className="panel-title">Ranked Alert Queue</h2>
              <p className="panel-subtitle">
                Sorted worklist for rapid analyst triage.
              </p>
            </div>
            <div className="alert-list">
              {filteredAlerts.map((alert) => (
                <button
                  key={alert.id}
                  className={`alert-row ${selectedAlert.id === alert.id ? "active" : ""}`}
                  type="button"
                  onClick={() => {
                    setSelectedId(alert.id);
                    setModalAlert(alert);
                  }}
                >
                  <div
                    className="severity-ring"
                    data-tone={getTone(alert.severity)}
                  >
                    {alert.severity}
                  </div>
                  <div className="alert-main">
                    <h3 className="alert-title">
                      {alert.id} / {alert.type}
                    </h3>
                    <p className="alert-summary">{alert.summary}</p>
                    <div className="alert-meta-row">
                      <span className="alert-meta">{alert.customer}</span>
                      <span className="alert-meta">{alert.account}</span>
                      <span className="alert-meta">{alert.channel}</span>
                      <span className="alert-meta">{alert.timestamp}</span>
                    </div>
                  </div>
                  <div className="alert-amount">
                    {formatCurrency(alert.amount)}
                  </div>
                </button>
              ))}
            </div>
            <div className="corner-mark" />
          </div>

          <div className="detail-panel">
            <div className="panel-header">
              <h2 className="panel-title">Alert Drill-Down</h2>
              <p className="panel-subtitle">
                {selectedAlert
                  ? `${selectedAlert.id} case intelligence and original alert trace.`
                  : "Select an Alert"}
              </p>
            </div>

            {selectedAlert ? (
              <div className="detail-body">
                <div className="badge-row">
                  <span className="badge">
                    Severity {selectedAlert.severity}
                  </span>
                  <span className="badge">{selectedAlert.status}</span>
                  <span className="badge">
                    {formatCurrency(selectedAlert.amount)}
                  </span>
                </div>

                <div className="detail-block">
                  <h3>AI Summary</h3>
                  <p>{selectedAlert.summary}</p>
                </div>

                <div className="detail-block">
                  <h3>Key Risk Indicators</h3>
                  <div className="badge-row">
                    {selectedAlert.indicators.map((indicator) => (
                      <span className="badge" key={indicator}>
                        {indicator}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="detail-block">
                  <h3>Original Alert Log</h3>
                  <div className="original-log">{selectedAlert.original}</div>
                </div>

                <div className="detail-block">
                  <h3>Recommended Action</h3>
                  <p>{selectedAlert.recommendation}</p>
                </div>

                <div className="action-row">
                  <a className="btn-primary" href={selectedAlert.caseUrl}>
                    Open Case Tool
                  </a>
                  <button className="btn-secondary" type="button">
                    Escalate
                  </button>
                  <button className="btn-secondary" type="button">
                    Mark Reviewed
                  </button>
                </div>

                <div className="feedback-box">
                  <span className="feedback-label">Summary Feedback</span>
                  <div className="action-row">
                    <button
                      className={`btn-secondary ${feedback[selectedAlert.id] === "useful" ? "active" : ""}`}
                      type="button"
                      onClick={() =>
                        setFeedback((prev) => ({
                          ...prev,
                          [selectedAlert.id]: "useful",
                        }))
                      }
                    >
                      Useful
                    </button>
                    <button
                      className={`btn-secondary ${feedback[selectedAlert.id] === "needs_review" ? "active" : ""}`}
                      type="button"
                      onClick={() =>
                        setFeedback((prev) => ({
                          ...prev,
                          [selectedAlert.id]: "needs_review",
                        }))
                      }
                    >
                      Needs Review
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="detail-body">
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  Loading alerts...
                </p>
              </div>
            )}
            <div className="corner-mark" />
          </div>
        </div>

        {modalAlert && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="alert-modal-title"
          >
            <div className="modal-panel">
              <div className="modal-header">
                <div>
                  <h2 className="panel-title" id="alert-modal-title">
                    {modalAlert.id} Alert Properties
                  </h2>
                  <p className="panel-subtitle">
                    Complete alert context and model-generated triage details.
                  </p>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  aria-label="Close alert details"
                  onClick={() => setModalAlert(null)}
                >
                  x
                </button>
              </div>

              <div className="modal-body">
                <div className="property-grid">
                  <div className="property-item">
                    <span className="property-label">Alert ID</span>
                    <span className="property-value">{modalAlert.id}</span>
                  </div>
                  <div className="property-item">
                    <span className="property-label">Timestamp</span>
                    <span className="property-value">
                      {modalAlert.timestamp}
                    </span>
                  </div>
                  <div className="property-item">
                    <span className="property-label">Account ID</span>
                    <span className="property-value">{modalAlert.account}</span>
                  </div>
                  <div className="property-item">
                    <span className="property-label">Customer</span>
                    <span className="property-value">
                      {modalAlert.customer}
                    </span>
                  </div>
                  <div className="property-item">
                    <span className="property-label">Transaction Amount</span>
                    <span className="property-value">
                      {formatCurrency(modalAlert.amount)}
                    </span>
                  </div>
                  <div className="property-item">
                    <span className="property-label">Transaction Type</span>
                    <span className="property-value">{modalAlert.type}</span>
                  </div>
                  <div className="property-item">
                    <span className="property-label">Location / Channel</span>
                    <span className="property-value">{modalAlert.channel}</span>
                  </div>
                  <div className="property-item">
                    <span className="property-label">Device Info</span>
                    <span className="property-value">
                      {modalAlert.original.split(";")[0]}
                    </span>
                  </div>
                  <div className="property-item">
                    <span className="property-label">Severity Score</span>
                    <span className="property-value">
                      {modalAlert.severity}
                    </span>
                  </div>
                  <div className="property-item">
                    <span className="property-label">Severity Label</span>
                    <span className="property-value">{modalAlert.status}</span>
                  </div>
                </div>

                <div className="detail-block">
                  <h3>Alert Description</h3>
                  <p>{modalAlert.summary}</p>
                </div>

                <div className="detail-block">
                  <h3>Risk Indicators</h3>
                  <div className="badge-row">
                    {modalAlert.indicators.map((indicator) => (
                      <span className="badge" key={indicator}>
                        {indicator}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="detail-block">
                  <h3>Original Alert Log</h3>
                  <div className="original-log">{modalAlert.original}</div>
                </div>

                <div className="detail-block">
                  <h3>Investigation Outcome</h3>
                  <p>
                    {modalAlert.status === "Critical"
                      ? "Pending urgent review"
                      : "Pending analyst validation"}
                  </p>
                </div>
              </div>

              <div className="corner-mark" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlertsPage;
