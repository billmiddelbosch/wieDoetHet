import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

const ANON_STORAGE_KEY = 'wdh_anonymous'
const TOKEN_KEY = 'auth_token'

function generateSessionId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now()
}

function loadAnonymous() {
  try {
    const raw = localStorage.getItem(ANON_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(localStorage.getItem(TOKEN_KEY) ?? null)
  const anonymousUser = ref(loadAnonymous())

  const isAuthenticated = computed(() => !!token.value)
  const isInitiator = computed(() => !!user.value)

  function setUser(u) {
    user.value = u
  }

  function setToken(t) {
    token.value = t
    if (t) {
      localStorage.setItem(TOKEN_KEY, t)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  }

  function setAnonymousUser(name) {
    const sessionId = anonymousUser.value?.sessionId ?? generateSessionId()
    const anon = { name, sessionId }
    anonymousUser.value = anon
    localStorage.setItem(ANON_STORAGE_KEY, JSON.stringify(anon))
  }

  function clearAnonymousUser() {
    anonymousUser.value = null
    localStorage.removeItem(ANON_STORAGE_KEY)
  }

  function logout() {
    user.value = null
    setToken(null)
  }

  return {
    user,
    token,
    anonymousUser,
    isAuthenticated,
    isInitiator,
    setUser,
    setToken,
    setAnonymousUser,
    clearAnonymousUser,
    logout,
  }
})
