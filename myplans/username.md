# Username Integration Plan

## Context

Add a username field in app settings that flows through to Mem0's `user_id`. When user updates their username, reinitialize the Mem0 database.

---

## Implementation Complete ✅

| File | Change | Status |
|------|--------|--------|
| `electron/services/storage/mem0/mem0Service.ts` | Add logging, remove fallback, throw if empty | ✅ |
| `python-sidecar/mem0_server.py` | Make user_id required | ✅ |
| `electron/ipc/handlers.ts` | Add reinitialize on username change | ✅ |
| `src/components/settings/GeneralSettings.tsx` | Add validation + error message | ✅ |

---

## Changes Made

### 1. mem0Service.ts
- Added logging: `{ username }` logged when getting user_id
- Throws error if username is empty
- Tracks cached user for change detection

### 2. mem0_server.py
- `AddRequest.user_id` - required field
- `SearchRequest.user_id` - required field
- GET/DELETE `/memories` - `user_id` optional (None default)

### 3. handlers.ts
- Added reinitialize on username change:
  ```typescript
  if ('username' in partial && updated.username !== prev.username && prev.username !== '') {
    logger.info({ old, new }, '[Lore] Username changed, reinitializing Mem0')
    reinitializeMem0().catch(...)
  }
  ```

### 4. GeneralSettings.tsx
- Added validation: Shows error if username is empty on blur
- Error message: "Username required for Mem0 memory. Please enter your name."
- Visual feedback: Red border on error

---

## Test Cases

| # | Test | Expected Result | Status |
|---|------|---------------|--------|
| 1 | Fresh install, no username set | Error: "Username required for Mem0 memory" | ⏳ |
| 2 | Set username = "yash" | Saved, Mem0 reinit, log shows "[Lore] Username changed" | ⏳ |
| 3 | Send thought "I like coffee" | Memory stored under "yash" | ⏳ |
| 4 | Change username to "alex" | DB reinit with new namespace | ⏳ |
| 5 | Query memories | Empty (new user namespace) | ⏳ |
| 6 | Set empty username | Error shown, save blocked | ⏳ |

---

## Notes

- **Sidecar startup issue** (ECONNREFUSED) is separate - requires debugging why sidecar doesn't start at launch
- This plan assumes sidecar runs for Mem0 to function