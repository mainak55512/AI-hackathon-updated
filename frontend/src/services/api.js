const API_BASE = "/api";
const REQUEST_TIMEOUT_MS = 120000;

async function apiCall(path, method, body) {
  const token = localStorage.getItem('access_token');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      signal: controller.signal,
      ...(body && { body: JSON.stringify(body) })
    });

    return response;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`Request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)} seconds`);
      timeoutError.name = 'AbortError';
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

const api = {

  async request(path, method = 'GET', body = null) {
    let response = await apiCall(path, method, body);

    if (response.status === 401) {
      const refresh_token = localStorage.getItem('refresh_token');

      if (!refresh_token) {
        window.location.href = '/login';
        return;
      }

      const refresh_headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${refresh_token}`
      };

      const refresh_response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: refresh_headers
      });

      if (refresh_response.ok) {
        const data = await refresh_response.json();

        localStorage.setItem('access_token', data.access_token);

        response = await apiCall(path, method, body);
      } else {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return;
      }

      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
    }

    if (!response.ok) {
      let errorData = null;
      const contentType = response.headers.get("content-type");

      if (contentType && contentType.includes("application/json")) {
        try {
          errorData = await response.json();
        } catch {
          errorData = null;
        }
      } else {
        try {
          const text = await response.text();
          errorData = text ? { error: text } : null;
        } catch {
          errorData = null;
        }
      }

      const message = errorData?.error || response.statusText || 'Request failed';
      const error = new Error(message);
      error.response = {
        status: response.status,
        data: errorData,
      };
      throw error;
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    }

    return response;
  },

  login: (username, password) => api.request('/auth/login', 'POST', { username, password }),
  getStats: () => api.request('/dashboard/stats'),
  getAlerts: () => api.request('/get-alerts'),
  getKPIs: () => api.request('/get-kpis'),
  getUsers: () => api.request('/users'),
  createUser: (data) => api.request('/users', 'POST', data),
  deleteUser: (id) => api.request('/users/' + id, 'DELETE'),
  updateUser: (id, data) => api.request(`/users/${id}`, 'PUT', data),
  getLogs: () => api.request('/all_logs'),
  getUsageSummary: () => api.request('/llm/usage'),
  getRagModels: () => api.request('/rag/models'),
  getRagStatus: () => api.request('/rag/status'),
  reindexRag: (force = false) => api.request('/rag/reindex', 'POST', { force }),
  askRag: (payload) => api.request('/rag/ask', 'POST', payload),
  getTopEndpoints: () => api.request('/endpoints'),
};

export default api;
