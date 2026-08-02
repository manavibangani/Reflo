export const API_BASE_URL = 'http://127.0.0.1:8000'
export const WS_BASE_URL = 'ws://127.0.0.1:8000'

export function authHeaders() {
  const token = sessionStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiFetch(path, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {}),
    },
  })
}

function decodeToken() {
  const token = sessionStorage.getItem('token')
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

export function getCurrentUserId() {
  return decodeToken()?.sub || null
}

export function getCurrentUserEmail() {
  return decodeToken()?.email || null
}
