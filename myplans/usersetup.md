# User Identity Integration Plan

## Context

`lore-user` is hardcoded in 6 places in `python-sidecar/mem0_server.py`. This means all users of Lore share the same memory namespace in Mem0. The fix: add a `username` field to `AppSettings`, expose it in the General Settings UI, and flow it through the sidecar API so Mem0 namespaces memories per user.

LanceDB has no user concept today — memories are in a flat local table. That is tracked as a future phase.

---

## Architecture After Change

```
GeneralSettings UI
  └─ username input → updateSettings({ username })
                             │
                    AppSettings.username
                             │
               ┌─────────────┴─────────────┐
               ▼                           ▼
    mem0Service.ts                  (future: lanceService.ts)
    reads getSettings().username    
    passes user_id in every fetch
               │
               ▼
    python-sidecar/mem0_server.py
    uses req.user_id instead of 'lore-user'
               │
               ▼
    Mem0 / Chroma — memories namespaced per user
```

---

## Phase 1 — Data Layer

### `shared/types.ts`
Add `username` to `AppSettings`:
```typescript
export interface AppSettings {
  username: string          // ← add this
  shortcut: string
  // ... rest unchanged
}
```

### `electron/services/settingsService.ts`
Add default in `DEFAULTS`:
```typescript
const DEFAULTS: AppSettings = {
  username: 'lore-user',   // ← add this (safe fallback)
  shortcut: 'CommandOrControl+Shift+Space',
  // ... rest unchanged
}
```

**Files:** `shared/types.ts`, `electron/services/settingsService.ts`

---

## Phase 2 — Settings UI

### `src/components/settings/GeneralSettings.tsx`
Add a username text input as the **first field** in the General tab, above the keyboard shortcut.

UI spec:
- Label: `Your Name`
- Sublabel: `Used to identify your memories`
- Input: text, placeholder `e.g. Alex`, max 32 chars
- Save on blur or Enter (same pattern as existing host URL inputs)
- Reads initial value from `settings.username` via `window.loreAPI.getSettings()`
- Saves via `window.loreAPI.updateSettings({ username: value.trim() || 'lore-user' })`
- Empty input falls back to `'lore-user'` so memories are never broken

Check how existing text inputs (e.g. AI Engine Host in `ModelSettings.tsx`) are implemented and match that pattern exactly.

**File:** `src/components/settings/GeneralSettings.tsx`

---

## Phase 3 — Sidecar API

### `python-sidecar/mem0_server.py`
Update all request models and endpoints to accept `user_id` instead of hardcoding it.

**Request model changes:**
```python
class AddRequest(BaseModel):
    messages: list[Message]
    user_id: str = 'lore-user'          # ← add
    metadata: Optional[dict[str, Any]] = None

class SearchRequest(BaseModel):
    query: str
    user_id: str = 'lore-user'          # ← add
    limit: int = 20
```

For GET `/memories` and DELETE `/memories` (no request body), use a Query parameter:
```python
from fastapi import Query

@app.get('/memories')
async def get_all_memories(user_id: str = Query(default='lore-user')):

@app.delete('/memories')
async def delete_all_memories(user_id: str = Query(default='lore-user')):
```

For DELETE `/memories/{memory_id}` — memory IDs are globally unique in Chroma, so `user_id` is not needed for targeted deletes. Leave as-is.

**Endpoint changes — replace all `user_id='lore-user'` with the request param:**

| Endpoint | Change |
|----------|--------|
| `POST /add` | `user_id=req.user_id` |
| `POST /search` | `user_id=req.user_id` |
| `GET /memories` | `user_id=user_id` (query param) |
| `DELETE /memories` | `user_id=user_id` (query param) |

The fallback default value `'lore-user'` on all params ensures the sidecar works standalone (e.g. curl tests) without breaking.

**File:** `python-sidecar/mem0_server.py`

---

## Phase 4 — mem0Service.ts

### `electron/services/storage/mem0/mem0Service.ts`
Read `getSettings().username` and pass it as `user_id` in every fetch call.

```typescript
import { getSettings } from '../../settingsService'

// Helper to get current user_id
function getUserId(): string {
  return getSettings().username || 'lore-user'
}
```

**Per function:**

`addToMem0()`:
```typescript
body: JSON.stringify({ messages, user_id: getUserId(), metadata }),
```

`searchMem0()`:
```typescript
body: JSON.stringify({ query, user_id: getUserId(), limit }),
```

`getAllMem0Memories()`:
```typescript
const res = await fetch(`${MEM0_SIDECAR_URL}/memories?user_id=${encodeURIComponent(getUserId())}`)
```

`deleteAllMem0Memories()`:
```typescript
const res = await fetch(`${MEM0_SIDECAR_URL}/memories?user_id=${encodeURIComponent(getUserId())}`, {
  method: 'DELETE',
})
```

`deleteMem0Memory()` — no change needed (deletes by ID, user-agnostic).

**File:** `electron/services/storage/mem0/mem0Service.ts`

---

## Phase 5 — Test

1. Start the app: `npm run dev`
2. Open **Settings → General** — confirm "Your Name" field appears
3. Enter a name, e.g. `"yash"`, save
4. Open **Settings → Memory → Provider → Mem0**
5. Send a thought: `"I prefer coffee over tea"`
6. Confirm `[Agent] Classified` log shows `intent: thought`
7. In Python sidecar terminal, confirm the `/add` request body contains `"user_id": "yash"`
8. Change username to `"test"` in settings, then query: `"What do I prefer to drink?"`
   - Expected: no results (different user namespace — memories under `yash` not visible to `test`)
9. Switch back to `"yash"` and query again — expected: answer mentions coffee

---

## Critical Files

| File | Change |
|------|--------|
| `shared/types.ts` | Add `username: string` to `AppSettings` |
| `electron/services/settingsService.ts` | Add `username: 'lore-user'` to DEFAULTS |
| `src/components/settings/GeneralSettings.tsx` | Add username text input (first field) |
| `python-sidecar/mem0_server.py` | Accept `user_id` in request models + Query params |
| `electron/services/storage/mem0/mem0Service.ts` | Pass `getUserId()` in all fetch calls |

---

## Future — LanceDB User Namespacing

LanceDB currently stores all documents in a flat table with no `userId` field. To support per-user LanceDB isolation:

1. Add `userId: string` to `LoreDocument` in `shared/types.ts`
2. Add `userId` column to the LanceDB schema in `lanceService.ts`
3. Filter all queries by `userId = getSettings().username`
4. Migration: existing documents get `userId = 'lore-user'`

This is intentionally deferred — it requires a schema migration and is low priority while Mem0 is the focus.
