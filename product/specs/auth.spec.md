# Spec — Authentication

**Last Updated:** 2026-03-03

---

## Purpose
Handle both anonymous access (via share link) and registered user auth (email + password with JWT).

## Routes
- `/login` — Login form
- `/register` — Registration form
- Anonymous identity is captured inline on the task claim page — no dedicated route

## Composable: useAuth
```js
// src/composables/useAuth.js
{
  login(email, password): Promise<void>,
  register(name, email, password): Promise<void>,
  logout(): void,
  fetchMe(): Promise<void>,
}
```

## Store: useAuthStore
```js
// src/stores/auth.js
{
  // State
  user: User | null,
  token: string | null,
  isAuthenticated: boolean,  // computed: !!token
  isInitiator: boolean,      // computed: !!user (registered = can be initiator)

  // Anonymous
  anonymousUser: { name: string, sessionId: string } | null,

  // Actions
  setUser(user),
  setToken(token),
  setAnonymousUser(name),
  clearAnonymousUser(),
  logout(),
}
```

## Views
### LoginView
- Fields: email, password
- Submit calls `useAuth.login()`
- On success: redirect to `/dashboard`
- Links to `/register`
- i18n keys: `auth.login.*`

### RegisterView
- Fields: name, email, password, password confirmation
- Submit calls `useAuth.register()`
- On success: redirect to `/dashboard`
- Links to `/login`
- i18n keys: `auth.register.*`

## Anonymous Identity
- When an unauthenticated user tries to claim a task, they are prompted for their name
- Name is stored in `useAuthStore.anonymousUser` and persisted to localStorage as `wdh_anonymous`
- `sessionId` is a UUID generated once per device and also persisted

## Navigation Guards
- `/dashboard`, `/groups/new`, `/groups/:id/settings` require auth → redirect to `/login`
- `/login`, `/register` redirect to `/dashboard` if already authenticated

## Acceptance Criteria
- [ ] Login form validates email format and non-empty password
- [ ] Register form validates passwords match and name is non-empty
- [ ] JWT token stored in localStorage as `auth_token` (matches existing Axios interceptor)
- [ ] On 401 from Axios, token cleared and redirected to `/` (already in axios.js)
- [ ] Anonymous name prompt shown on task claim page when not authenticated
- [ ] Anonymous session persisted across page reloads
