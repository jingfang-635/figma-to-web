import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { apiFetch, getToken, onAuthExpired, setToken } from '../api/client'

type AuthState = {
  token: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken())

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiFetch<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    setToken(data.token)
    setTokenState(data.token)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setTokenState(null)
  }, [])

  // When the API rejects the stored token, drop it so `RequireAuth` routes back
  // to the login screen rather than leaving an empty, silently-failed page.
  useEffect(() => onAuthExpired(() => setTokenState(null)), [])

  const value = useMemo(
    () => ({
      token,
      login,
      logout,
      isAuthenticated: Boolean(token),
    }),
    [token, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
