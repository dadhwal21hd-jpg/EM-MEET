import axios from 'axios'

// Module-level token — set by AuthContext, read by the request interceptor.
// This avoids threading the token through every call site.
let authToken = null
let onUnauthorized = null

export const setAuthToken = (token) => { authToken = token }
export const setUnauthorizedHandler = (handler) => { onUnauthorized = handler }

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

// Attach token to every outgoing request
api.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`
  return config
})

// On 401, signal AuthContext to clear the session
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && onUnauthorized) onUnauthorized()
    return Promise.reject(err)
  }
)
