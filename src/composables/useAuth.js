import { useAuthStore } from '@/stores/auth'
import apiClient from '@/lib/axios'

export function useAuth() {
  const authStore = useAuthStore()

  async function login(email, password) {
    const { data } = await apiClient.post('/auth/login', { email, password })
    authStore.setToken(data.token)
    authStore.setUser(data.user)
  }

  async function register(name, email, password) {
    const { data } = await apiClient.post('/auth/register', { name, email, password })
    authStore.setToken(data.token)
    authStore.setUser(data.user)
  }

  async function fetchMe() {
    const { data } = await apiClient.get('/auth/me')
    authStore.setUser(data)
  }

  function logout() {
    authStore.logout()
  }

  return { login, register, fetchMe, logout }
}
