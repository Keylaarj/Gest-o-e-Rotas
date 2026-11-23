const TOKEN_KEY = 'gestao-rotas-token';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let token =
  typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null;

function clearToken() {
  token = null;
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor.', 0);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    if (response.status === 401 && auth) {
      clearToken();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('gestao-rotas:unauthorized'));
      }
    }
    throw new ApiError(
      data.error || 'Não foi possível concluir a operação.',
      response.status
    );
  }

  return data;
}

export const api = {
  hasToken: () => Boolean(token),
  setToken(value) {
    token = value || null;
    if (typeof window !== 'undefined') {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
    }
  },
  clearToken,
  loginClient: (em, pw) =>
    request('/auth/login/client', { method: 'POST', body: { em, pw }, auth: false }),
  loginCompany: (cnpj, pw) =>
    request('/auth/login/company', { method: 'POST', body: { cnpj, pw }, auth: false }),
  loginDriver: (em, pw) =>
    request('/auth/login/driver', { method: 'POST', body: { em, pw }, auth: false }),
  registerCompany: (data) =>
    request('/auth/register/company', { method: 'POST', body: data, auth: false }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getSession: () => request('/session'),
  getData: () => request('/data'),
  createClient: (data) => request('/clients', { method: 'POST', body: data }),
  createDriver: (data) => request('/drivers', { method: 'POST', body: data }),
  updateOrderStatus: (id, st) =>
    request(`/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { st } }),
  updateStock: (id, data) =>
    request(`/stock/${id}`, { method: 'PATCH', body: data }),
  restockStock: (id) => request(`/stock/${id}/restock`, { method: 'POST' }),
  deleteStock: (id) => request(`/stock/${id}`, { method: 'DELETE' }),
  sendMessage: (store, key, text) =>
    request('/chats/messages', { method: 'POST', body: { store, key, text } }),
  updateAlerts: (alerts) =>
    request('/profile/alerts', { method: 'PATCH', body: { alerts } })
};
