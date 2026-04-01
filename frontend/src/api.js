const API_BASE_URL = import.meta.env.VITE_API_URL || ''

let API_ENDPOINTS = {}
try {
  API_ENDPOINTS = JSON.parse(import.meta.env.VITE_API_ENDPOINTS || '{}')
} catch (e) {
  console.warn('Invalid VITE_API_ENDPOINTS JSON:', e)
  API_ENDPOINTS = {}
}

function cleanUrl(url) {
  return url.replace(/\/$/, '')
}

function resolveEndpoint(name) {
  if (API_BASE_URL && API_BASE_URL.trim() !== '') {
    return `${cleanUrl(API_BASE_URL)}/api/${name}`
  }
  if (API_ENDPOINTS[name]) return API_ENDPOINTS[name]
  if (API_ENDPOINTS[name.replace(/s$/, '')]) return API_ENDPOINTS[name.replace(/s$/, '')]
  throw new Error(`API endpoint not found for ${name}`)
}

function getToken() {
  try {
    const stored = localStorage.getItem('auth')
    if (!stored) {
      console.warn('[API] No auth data in localStorage')
      return null
    }
    const parsed = JSON.parse(stored)
    if (!parsed.token) {
      console.warn('[API] Auth data exists but no token:', parsed)
      return null
    }
    return parsed.token
  } catch (e) {
    console.warn('[API] Error reading token from localStorage:', e)
    return null
  }
}

function authHeaders() {
  const token = getToken()
  if (token) {
    console.log('[API] Sending Authorization header with token')
  } else {
    console.warn('[API] No token available for Authorization header')
  }
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function doFetch(url, init = {}) {
  console.log('[doFetch]', init.method || 'GET', url)
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init.headers || {}),
    },
  })

  console.log('[doFetch] Response status:', response.status, 'for', url)

  if (response.status === 401) {
    console.warn('[API] Got 401 Unauthorized, logging out user')
    localStorage.removeItem('auth')
    window.location.href = '/login'
    return
  }

  if (!response.ok) {
    const payload = await response.text().catch(() => '')
    // Try to parse the error message from JSON
    try {
      const parsed = JSON.parse(payload)
      console.error('[doFetch] Error response:', parsed)
      throw new Error(parsed.error || `${response.status} ${response.statusText}`)
    } catch (e) {
      if (e.message.startsWith('{') || payload) {
        throw new Error(payload || `${response.status} ${response.statusText}`)
      }
      throw e
    }
  }

  return response.json()
}

export function fetchApi(name, init = {}) {
  return doFetch(resolveEndpoint(name), init)
}

export function fetchApiById(name, id, init = {}) {
  return doFetch(`${cleanUrl(resolveEndpoint(name))}/${encodeURIComponent(id)}`, init)
}

export function fetchApiSubPath(name, subPath, init = {}) {
  return doFetch(`${cleanUrl(resolveEndpoint(name))}/${subPath}`, init)
}

export const api = {
  // ── Auth ────────────────────────────────────────────────────────────────────
  login:    (email, password) =>
    fetchApiSubPath('individuals', 'auth/login',    { method: 'POST', body: JSON.stringify({ Email: email, Password: password }) }),
  register: (data) =>
    fetchApiSubPath('individuals', 'auth/register', { method: 'POST', body: JSON.stringify(data) }),

  // ── Reads ────────────────────────────────────────────────────────────────────
  getMetadata:     () => fetchApi('metadata'),
  getAchievements: () => fetchApi('achievements'),
  getIndividuals:  () => fetchApi('individuals'),
  getTeams:        () => fetchApi('teams'),
  getTeamRequests: () => fetchApiSubPath('teams', 'requests'),

  // ── Individuals CRUD ─────────────────────────────────────────────────────────
  createIndividual: (data) => fetchApi('individuals', { method: 'POST', body: JSON.stringify(data) }),
  updateIndividual: (id, data) => fetchApiById('individuals', id, { method: 'PUT',  body: JSON.stringify(data) }),
  deleteIndividual: (id)       => fetchApiById('individuals', id, { method: 'DELETE' }),

  // ── Teams CRUD ───────────────────────────────────────────────────────────────
  createTeam: (data) => fetchApi('teams', { method: 'POST', body: JSON.stringify(data) }),
  updateTeam: (id, data) => fetchApiById('teams', id, { method: 'PUT',  body: JSON.stringify(data) }),
  deleteTeam: (id)       => fetchApiById('teams', id, { method: 'DELETE' }),

  // ── Achievements CRUD ────────────────────────────────────────────────────────
  createAchievement: (data) => fetchApi('achievements', { method: 'POST', body: JSON.stringify(data) }),
  updateAchievement: (id, data) => fetchApiById('achievements', id, { method: 'PUT',  body: JSON.stringify(data) }),
  deleteAchievement: (id)       => fetchApiById('achievements', id, { method: 'DELETE' }),

  // ── Team Join Requests ───────────────────────────────────────────────────────
  createTeamRequest: (data) =>
    fetchApiSubPath('teams', 'requests', { method: 'POST', body: JSON.stringify(data) }),
  updateTeamRequest: (id, data) =>
    fetchApiSubPath('teams', `requests/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTeamRequest: (id) =>
    fetchApiSubPath('teams', `requests/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
