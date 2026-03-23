# TODO - Code Quality Improvements

## Structural / High Impact

- [x] **1. Break up content-script.ts (god file)**
  Extracted `cache.ts` (99 lines), `person-weeks.ts` (162 lines), `badge-styles.ts` (136 lines).
  content-script.ts reduced from 1472 to 1288 lines. `fetchAccurateCount` + `api.ts` extraction
  is a future step (still in content-script.ts behind istanbul ignore).

- [x] **2. Remove istanbul ignore blankets over testable logic**
  `parseSprint`, `buildPwOverride`, `computePersonWeeks`, `effortToPersonWeeks`,
  `personEffortToPw` are now in `person-weeks.ts` — pure functions, fully testable.
  `fetchAccurateCount` still has istanbul ignore (api.ts extraction is future work).

- [x] **3. Deduplicate timeline bar lookup**
  Added `findTimelineBar(issueId)` in `dom-parser.ts`. Replaced all 6 duplicated
  lookups in `badge.ts` and the one in `content-script.ts`.

- [x] **4. Replace inline CSS with injected stylesheet**
  Created `badge-styles.ts` with `injectBadgeStyles()` and `STYLES` class constants.
  `badge.ts` now uses CSS classes with minimal inline overrides for dynamic values only.

- [x] **5. Fix/remove misleading `extractAssignees` in dom-parser.ts**
  Fixed to scope query to `[data-issue="${issueId}"][data-name^="cell-"]` instead of
  querying all cells on the page. Updated tests accordingly.

## Instance Compatibility

- [x] **6. Make avatar IDs configurable**
  Created `issue-types.ts` with `getIssueTypeAvatars()` — auto-detects epic/story avatar
  IDs via `/rest/api/2/issuetype` API per Jira hostname. Cached in `chrome.storage.local`
  with 7-day TTL per domain. Handles both Server/DC (`avatarId=` param) and Cloud
  (`/avatar/{id}` path) URL formats. Falls back to hardcoded defaults on error.
  `dom-parser.ts` updated with unified `isIssueTypeRow()` accepting configurable avatar IDs.
  `content-script.ts` populates `issueTypeAvatars` at init and passes to find functions.

- [x] **7. Make custom field IDs configurable**
  Created `custom-fields.ts` with `getCustomFieldIds()` — auto-detects Sprint and
  Story Points custom field IDs via `/rest/api/2/field` API per Jira hostname. Matches
  by schema type (e.g. `gh-sprint`) with name fallback for Story Points. Cached in
  `chrome.storage.local` with 7-day TTL per domain, same pattern as #6.
  `content-script.ts` now uses dynamic `fields[sprintFieldId]` / `fields[storyPointsFieldId]`
  instead of hardcoded `customfield_11002` / `customfield_10003`.
  Both #6 and #7 init in parallel via `Promise.all` and re-detect together.
  Instance Config UI panel added to popup showing all 4 detected values with Re-detect button.

## Resilience

- [x] **8. Differentiate error cache from real zero-count cache**
  Added `isError` flag to `CachedAssigneeData`. Error entries use 30s TTL
  (`ERROR_CACHE_TTL_MS`) instead of the normal 5-min TTL, so retries happen faster.

- [~] **9. Add API call concurrency limiting** *(deferred)*
  50 visible epics = 50 parallel fetches on first load. Considered concurrency pool
  (meh UX — staggered badge appearance) and batch queries (significant refactor).
  Not a problem in practice — no rate limit errors observed. Revisit if needed.

- [x] **10. Deduplicate PW badge text/tooltip construction**
  `updateTimelineBadgesWithSprints` now calls `buildPwOverride()` instead of
  manually reconstructing the same text/tooltip.

## Testing / Minor

- [x] **11. Replace module-level state with injectable dependencies**
  Created `CacheStore` class in `cache.ts` with `populate()`, `clear()`,
  `isExpired()`, `evictOldest()`. Exported `cache` singleton. Old Map exports
  kept as deprecated aliases. `__test_*` helpers delegate to `cache` methods.

- [x] **12. Minor cleanups**
  - `sync-versions.js` now updates popup.html version pill automatically
  - Added fragility comment to `._2v7GN` selector in dom-parser.ts
  - Added SPA navigation detector in `initialize()` — clears caches on URL change
