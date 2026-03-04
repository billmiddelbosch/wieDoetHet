# API Gateway Console Test Guide

Use these files to test endpoints via **API Gateway → Resources → select method → Test tab**.

## Testing Workflow

Run tests in this order — each step produces IDs/tokens needed by later steps:

1. **Register** → creates a user
2. **Login** → get `token`
3. **Create Group** → get `groupId`
4. **Create Task** → get `taskId`
5. **Claim / Unclaim Task**
6. **Fetch Claims (scorecard)**

## How to Fill the Test Tab

| Field | Where to find it |
|---|---|
| Path | Pre-filled from route, enter values for `{groupId}`, `{taskId}`, `{shareToken}` |
| Headers | Add `Authorization` header with value `Bearer <token>` (from login/register) |
| Request Body | Paste content from the `.json` files in this directory |

---

## Step 1 — Register

**Route:** `POST /auth/register`
**Headers:** *(none)*
**Body:** `register.json`

---

## Step 2 — Login

**Route:** `POST /auth/login`
**Headers:** *(none)*
**Body:** `login.json`

Copy the `token` from the response — you'll need it for all protected routes.

---

## Step 3 — Get Current User

**Route:** `GET /auth/me`
**Headers:** `Authorization: Bearer <token>`
**Body:** *(empty)*

---

## Step 4 — Create Group

**Route:** `POST /groups`
**Headers:** `Authorization: Bearer <token>`
**Body:** `create-group.json`

Copy the `id` from the response — this is your `groupId`.

---

## Step 5 — List Groups

**Route:** `GET /groups`
**Headers:** `Authorization: Bearer <token>`
**Body:** *(empty)*

---

## Step 6 — Get Group by ID

**Route:** `GET /groups/{groupId}`
**Path Parameters:** `groupId = <id from step 4>`
**Headers:** `Authorization: Bearer <token>`
**Body:** *(empty)*

---

## Step 7 — Update Group

**Route:** `PATCH /groups/{groupId}`
**Path Parameters:** `groupId = <id from step 4>`
**Headers:** `Authorization: Bearer <token>`
**Body:** `update-group.json`

---

## Step 8 — Get Group via Share Token

**Route:** `GET /groups/share/{shareToken}`
**Path Parameters:** `shareToken = <shareToken from the group response>`
**Headers:** *(none — public endpoint)*
**Body:** *(empty)*

---

## Step 9 — Create Task

**Route:** `POST /groups/{groupId}/tasks`
**Path Parameters:** `groupId = <id from step 4>`
**Headers:** `Authorization: Bearer <token>`
**Body:** `create-task.json`

Copy the `id` from the response — this is your `taskId`.

---

## Step 10 — List Tasks

**Route:** `GET /groups/{groupId}/tasks`
**Path Parameters:** `groupId = <id from step 4>`
**Headers:** `Authorization: Bearer <token>`
**Body:** *(empty)*

---

## Step 11 — Update Task

**Route:** `PATCH /groups/{groupId}/tasks/{taskId}`
**Path Parameters:** `groupId = <...>`, `taskId = <id from step 9>`
**Headers:** `Authorization: Bearer <token>`
**Body:** `update-task.json`

---

## Step 12 — Claim Task (authenticated)

**Route:** `POST /groups/{groupId}/tasks/{taskId}/claim`
**Path Parameters:** `groupId = <...>`, `taskId = <...>`
**Headers:** `Authorization: Bearer <token>`
**Body:** `claim-authenticated.json`

---

## Step 13 — Claim Task (anonymous)

**Route:** `POST /groups/{groupId}/tasks/{taskId}/claim`
**Path Parameters:** `groupId = <...>`, `taskId = <...>`
**Headers:** *(none)*
**Body:** `claim-anonymous.json`

---

## Step 14 — Unclaim Task (authenticated)

**Route:** `DELETE /groups/{groupId}/tasks/{taskId}/claim`
**Path Parameters:** `groupId = <...>`, `taskId = <...>`
**Headers:** `Authorization: Bearer <token>`
**Body:** `unclaim-authenticated.json`

---

## Step 15 — Unclaim Task (anonymous)

**Route:** `DELETE /groups/{groupId}/tasks/{taskId}/claim`
**Path Parameters:** `groupId = <...>`, `taskId = <...>`
**Headers:** *(none)*
**Body:** `unclaim-anonymous.json`

---

## Step 16 — Fetch Claims / Scorecard

**Route:** `GET /groups/{groupId}/claims`
**Path Parameters:** `groupId = <...>`
**Headers:** `Authorization: Bearer <token>`
**Body:** *(empty)*

---

## Step 17 — Delete Task

**Route:** `DELETE /groups/{groupId}/tasks/{taskId}`
**Path Parameters:** `groupId = <...>`, `taskId = <...>`
**Headers:** `Authorization: Bearer <token>`
**Body:** *(empty)*

---

## Step 18 — Delete Group

**Route:** `DELETE /groups/{groupId}`
**Path Parameters:** `groupId = <id from step 4>`
**Headers:** `Authorization: Bearer <token>`
**Body:** *(empty)*
