import { useEffect, useState } from 'react';
import api from '../services/api';

const money = (value) => `$${Number(value || 0).toFixed(4)}`;
const tokens = (value) => Number(value || 0).toLocaleString();
const FALLBACK_MODELS = [
  { name: 'gpt-5.5', input_per_1m: 5.0, output_per_1m: 30.0, cached_input_per_1m: 0.0 },
  { name: 'gpt-5.4', input_per_1m: 2.5, output_per_1m: 15.0, cached_input_per_1m: 0.25 },
  { name: 'gpt-5.4-mini', input_per_1m: 0.75, output_per_1m: 4.5, cached_input_per_1m: 0.08 },
  { name: 'gpt-5.4-nano', input_per_1m: 0.2, output_per_1m: 1.25, cached_input_per_1m: 0.02 },
];

const RagLab = () => {
  const [models, setModels] = useState([]);
  const [defaultModel, setDefaultModel] = useState('');
  const [embeddingModel, setEmbeddingModel] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [question, setQuestion] = useState('');
  const [topK, setTopK] = useState(4);
  const [loadingModels, setLoadingModels] = useState(true);
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const loadModels = async () => {
      setLoadingModels(true);
      setError('');
      try {
        const data = await api.getRagModels();
        setModels((data.models && data.models.length > 0) ? data.models : FALLBACK_MODELS);
        setDefaultModel(data.default_model || '');
        setEmbeddingModel(data.embedding_model || '');
        setSelectedModel(data.default_model || data.models?.[0]?.name || FALLBACK_MODELS[0].name);
        api.getRagStatus()
          .then((statusData) => setStatus(statusData))
          .catch(() => setStatus(null));
      } catch (err) {
        setModels(FALLBACK_MODELS);
        setDefaultModel(FALLBACK_MODELS[0].name);
        setEmbeddingModel('text-embedding-3-small');
        setSelectedModel(FALLBACK_MODELS[0].name);
        setStatus(null);
        setError(err.response?.data?.error || 'Unable to load model catalog, using local fallback models');
      } finally {
        setLoadingModels(false);
      }
    };

    loadModels();
  }, []);

  const selectedRate = models.find((model) => model.name === selectedModel);
  const handleReindex = async () => {
    setError('');
    setReindexing(true);
    try {
      const data = await api.reindexRag(true);
      setStatus(data.index_status || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Reindex failed');
    } finally {
      setReindexing(false);
    }
  };

  const handleAsk = async (e) => {
    e.preventDefault();
    setError('');
    setLoadingAnswer(true);
    setResult(null);

    try {
      const data = await api.askRag({
        question,
        model: selectedModel || defaultModel,
        top_k: Number(topK) || 4,
      });
      setResult(data);
    } catch (err) {
      if (err?.name === 'AbortError') {
        setError('Question timed out. The first document answer can take a while on a cold backend. Retry once the index is warm.');
      } else {
        setError(err.response?.data?.error || err.message || 'Question failed');
      }
    } finally {
      setLoadingAnswer(false);
    }
  };

  
  if (loadingModels) {
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
          <span>LOADING RAG LAB...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rag-root">
      <style>{`
        .rag-root {
          min-height: 100%;
          padding: 32px 24px;
          color: var(--text-primary);
        }

        .rag-wrapper {
          max-width: 1280px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .rag-hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border);
        }

        .rag-title {
          margin: 0;
          font-family: var(--mono);
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .rag-subtitle {
          margin-top: 6px;
          color: var(--text-muted);
          font-size: 13px;
        }

        .rag-grid {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 16px;
        }

        .panel {
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: var(--shadow);
          overflow: hidden;
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

        .panel-body {
          padding: 20px;
        }

        .field-grid {
          display: grid;
          grid-template-columns: 1fr 120px;
          gap: 12px;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .label {
          color: var(--text-muted);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        .input,
        .select,
        .textarea {
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

        .textarea {
          min-height: 180px;
          resize: vertical;
          line-height: 1.6;
        }

        .input:focus,
        .select:focus,
        .textarea:focus {
          border-color: var(--primary);
        }

        .action-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 16px;
          flex-wrap: wrap;
        }

        .btn-primary {
          border: 1px solid transparent;
          border-radius: 6px;
          background: var(--primary);
          color: #fff;
          padding: 8px 16px;
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          cursor: pointer;
          transition: filter 0.15s ease;
        }

        .btn-primary:hover:not(:disabled) {
          filter: brightness(1.1);
        }

        .btn-primary:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .btn-secondary {
          border: 1px solid var(--border);
          border-radius: 6px;
          background: transparent;
          color: var(--text-primary);
          padding: 8px 16px;
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          cursor: pointer;
        }

        .error {
          padding: 12px 14px;
          border-radius: 6px;
          border: 1px solid rgba(248, 113, 113, 0.35);
          background: rgba(248, 113, 113, 0.12);
          color: var(--danger);
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .loading {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--text-muted);
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border-radius: 999px;
          border: 2px solid rgba(255, 255, 255, 0.12);
          border-top-color: var(--primary);
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .result-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }

        .metric {
          padding: 14px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.03);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .metric-label {
          color: var(--text-muted);
          font-family: var(--mono);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .metric-value {
          color: var(--text-primary);
          font-family: var(--mono);
          font-size: 1rem;
          font-weight: 700;
        }

        .answer-box {
          padding: 16px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.02);
          color: var(--text-primary);
          line-height: 1.7;
          white-space: pre-wrap;
        }

        .source-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .source-item {
          padding: 12px 14px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.02);
          color: var(--text-muted);
          font-family: var(--mono);
          font-size: 11px;
        }

        .source-item strong {
          color: var(--text-primary);
        }

        .rate-card {
          display: grid;
          gap: 12px;
        }

        .rate-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: rgba(255, 255, 255, 0.03);
          font-family: var(--mono);
          font-size: 12px;
        }

        .rate-row span:last-child {
          color: var(--text-primary);
          font-weight: 700;
        }

        .muted {
          color: var(--text-muted);
        }

        @media (max-width: 960px) {
          .rag-grid {
            grid-template-columns: 1fr;
          }

          .field-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="rag-wrapper">
        <div className="rag-hero">
          <div>
            <h1 className="rag-title">RAG Lab</h1>
            <p className="rag-subtitle">Choose an agent/model, ask a question, and review answer cost in real time.</p>
          </div>
        </div>

        {error && <div className="error">!! {error}</div>}

        {status && !status.ready && (
          <div className="error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <span>No indexed documents are ready yet. Add files to `llm/documents` and reindex.</span>
            <button className="btn-secondary" type="button" onClick={handleReindex} disabled={reindexing}>
              {reindexing ? 'Reindexing...' : 'Reindex'}
            </button>
          </div>
        )}

        <div className="rag-grid">
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Ask Question</h2>
              <p className="panel-subtitle">Select a model/agent and submit a retrieval grounded question.</p>
            </div>
            <div className="panel-body">
        {loadingModels && (
          <div className="loading" style={{ marginBottom: '12px' }}>
            <div className="spinner" />
            <span>Loading model catalog</span>
          </div>
        )}

              {!loadingModels && status && !status.ready && (
                <div className="loading" style={{ marginBottom: '12px' }}>
                  <div className="spinner" />
                  <span>Index warming up. The first answer can take longer than usual.</span>
                </div>
              )}

              <form onSubmit={handleAsk}>
                  <div className="field-grid">
                    <div className="field-group">
                      <label className="label">Agent / Model</label>
                      <select className="select" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                        {models.map((model) => (
                          <option key={model.name} value={model.name}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field-group">
                      <label className="label">Top K</label>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        max="12"
                        value={topK}
                        onChange={(e) => setTopK(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="field-group" style={{ marginTop: '12px' }}>
                    <label className="label">Question</label>
                    <textarea
                      className="textarea"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="Ask a question from the indexed knowledge base..."
                    />
                  </div>

                  <div className="action-row">
                    <button className="btn-primary" type="submit" disabled={loadingAnswer || !question.trim()}>
                      {loadingAnswer ? (
                        <>
                          <span className="spinner" />
                          <span>Loading</span>
                        </>
                      ) : (
                        <span>Ask Agent</span>
                      )}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setQuestion('')}>
                      Clear
                    </button>
                  </div>
                </form>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Model Rates</h2>
              <p className="panel-subtitle">Per-1M token pricing for the selected agent.</p>
            </div>
            <div className="panel-body">
              {selectedRate ? (
                <div className="rate-card">
                  <div className="rate-row"><span className="muted">Model</span><span>{selectedRate.name}</span></div>
                  <div className="rate-row"><span className="muted">Input / 1M</span><span>{money(selectedRate.input_per_1m)}</span></div>
                  <div className="rate-row"><span className="muted">Output / 1M</span><span>{money(selectedRate.output_per_1m)}</span></div>
                  <div className="rate-row"><span className="muted">Cached Input / 1M</span><span>{money(selectedRate.cached_input_per_1m)}</span></div>
                  <div className="rate-row"><span className="muted">Embedding Model</span><span>{embeddingModel}</span></div>
                </div>
              ) : (
                <div className="muted">No model selected.</div>
              )}
            </div>
          </div>
        </div>

        {result && (
          <div className="panel">
            <div className="panel-header">
              <h2 className="panel-title">Answer Results</h2>
              <p className="panel-subtitle">Token usage and cost are calculated for the selected model.</p>
            </div>
            <div className="panel-body">
              <div className="result-grid">
                <div className="metric">
                  <span className="metric-label">Model</span>
                  <span className="metric-value">{result.model}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Input Tokens</span>
                  <span className="metric-value">{tokens(result.usage?.input_tokens)}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Output Tokens</span>
                  <span className="metric-value">{tokens(result.usage?.output_tokens)}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Total Cost</span>
                  <span className="metric-value">{money(result.cost?.total_cost)}</span>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <div className="panel-title" style={{ marginBottom: '10px' }}>Answer</div>
                <div className="answer-box">{result.answer}</div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <div className="panel-title" style={{ marginBottom: '10px' }}>Cost Breakdown</div>
                <div className="result-grid">
                  <div className="metric">
                    <span className="metric-label">LLM Input</span>
                    <span className="metric-value">{money(result.cost?.llm_input_cost)}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">LLM Output</span>
                    <span className="metric-value">{money(result.cost?.llm_output_cost)}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Cached Input</span>
                    <span className="metric-value">{money(result.cost?.llm_cached_input_cost)}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Embedding</span>
                    <span className="metric-value">{money(result.cost?.embedding_cost)}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <div className="panel-title" style={{ marginBottom: '10px' }}>Sources</div>
                <div className="source-list">
                  {(result.sources || []).map((source) => (
                    <div className="source-item" key={`${source.source}-${source.rank}`}>
                      <strong>{source.source}</strong> | chunk {source.chunk_index} | similarity {Number(source.similarity || 0).toFixed(4)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RagLab;
