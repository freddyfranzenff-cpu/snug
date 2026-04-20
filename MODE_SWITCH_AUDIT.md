# Mode Switch Static Debug Audit

**Date:** 2026-04-20
**Scope:** LDR <-> Together mode switching chain
**Files analysed:** couple.js, ui.js, tonightsmood.js, togethermode.js, countdown.js, auth.js, state.js, settings.js, letters.js

---

## 1. LISTENER LIFECYCLE

### `_coupleTypeUnsub` (state.js:101)
- **Created:** couple.js:86 (`startCoupleTypeListener`)
- **Torn down:** couple.js:84 (self-cleanup on re-call), auth.js:493 (sign-out), auth.js:573 (partner-deleted path 1), auth.js:644 (partner-deleted path 2 / permission-denied), settings.js:623 (doDeleteAccount)
- **Verdict:** All paths covered.

### `_meetupDateUnsub` (state.js:104)
- **Created:** couple.js:98 (`startMeetupDateListener`)
- **Torn down:** couple.js:96 (self-cleanup on re-call), settings.js:633 (doDeleteAccount)
- **NOT torn down:** auth.js sign-out (~489-535), auth.js partner-deleted path 1 (~569-597), auth.js partner-deleted path 2 (~643-660)

> **HIGH** · auth.js:489-535 · `_meetupDateUnsub` is never torn down on sign-out · The Firebase `onValue` listener on `couples/{coupleId}/meetupDate` survives sign-out, causing writes to `state.meetupDate` and UI calls (`startCountdown`, `_syncDnPickerBtn`, `renderUsLetterShortcut`) on a session that has been fully reset — potential crash on null refs or ghost UI updates on the login screen · Add `if(state._meetupDateUnsub){try{state._meetupDateUnsub();}catch(e){}state._meetupDateUnsub=null;}` to all three auth.js cleanup paths.

### `_dnUnsub` (state.js:94)
- **Created:** togethermode.js:167 (`loadDnPlanner`)
- **Torn down:** togethermode.js:156 (self-cleanup on re-call), couple.js:217 (selectSettingsMode Together->LDR on switching device only), auth.js:503 (sign-out), auth.js:574 (partner-deleted path 1), auth.js:645 (partner-deleted path 2), settings.js:632 (doDeleteAccount)

> **MEDIUM** · couple.js:62-69 (`applyMode`) · When partner's device receives LDR mode via `startCoupleTypeListener`, `applyMode` hides `dn-planner` but does NOT tear down `_dnUnsub` · The datePlan listener continues running invisibly on the non-switching partner's device, consuming bandwidth and writing to `state._dnCurrentPlan` for a mode that is no longer active · Add `if(!show && state._dnUnsub){try{state._dnUnsub();}catch(e){}state._dnUnsub=null;state._dnCurrentPlan=null;}` in the `!show` branch of applyMode.

### `_tmUnsub` / `_tmRollInterval` (tonightsmood.js:92-94, module-level)
- **Created:** tonightsmood.js:208 (`_subscribe`) / tonightsmood.js:218 (`_startDayRollWatcher`)
- **Torn down:** tonightsmood.js:234-237 (`teardownTonightsMood`), called from: couple.js:78 (applyMode LDR path), auth.js:504 (sign-out), auth.js:576 (partner-deleted path 1), auth.js:647 (partner-deleted path 2), settings.js:634 (implicit via teardownTonightsMood — not present, see below)
- **NOT torn down:** settings.js doDeleteAccount (~620-671) does NOT call `teardownTonightsMood`

> **MEDIUM** · settings.js:620-671 · `doDeleteAccount` does not call `R.teardownTonightsMood()` · The `_tmUnsub` Firebase listener and `_tmRollInterval` (60s setInterval) survive account deletion, running against a deleted couple node — harmless Firebase PERMISSION_DENIED errors in console, plus a leaked interval · Add `if(R.teardownTonightsMood){try{R.teardownTonightsMood();}catch(e){}}` to doDeleteAccount.

### `clockInterval` (state.js:65)
- **Created:** ui.js:223 (`startUI`)
- **Torn down:** auth.js:514 (sign-out), settings.js:648 (doDeleteAccount)
- **NOT torn down:** auth.js partner-deleted paths (~569-597, ~643-660)

> **LOW** · auth.js:569-597 · `clockInterval` not cleared on partner-deleted path · 1-second `setInterval` continues ticking and writing to DOM elements that may be hidden — no crash but wasted CPU · Clear in partner-deleted cleanup blocks.

### `distanceInterval` (state.js:65)
- **Created:** ui.js:192 (`startUI`)
- **Torn down:** auth.js:515 (sign-out), settings.js:647 (doDeleteAccount)
- **NOT torn down:** auth.js partner-deleted paths

> **LOW** · auth.js:569-597 · `distanceInterval` not cleared on partner-deleted path · Same class of issue as clockInterval — 60s interval continues running · Clear alongside clockInterval.

### `countdownInterval` (state.js:65)
- **Created:** countdown.js:39 (`startCountdown`)
- **Torn down:** countdown.js:12 (self-cleanup on re-call), auth.js:516 (sign-out), settings.js:646 (doDeleteAccount)
- **NOT torn down:** auth.js partner-deleted paths

> **LOW** · auth.js:569-597 · `countdownInterval` not cleared on partner-deleted path · 1-second interval continues ticking · Clear in partner-deleted cleanup blocks.

### `_metricInterval` (window._metricInterval — NOT on state)
- **Created:** countdown.js:42 (`startCountdown`)
- **Torn down:** countdown.js:41 (self-cleanup on re-call), auth.js:517 (sign-out), settings.js:666 (doDeleteAccount)
- **NOT torn down:** auth.js partner-deleted paths

> **LOW** · auth.js:569-597 · `window._metricInterval` not cleared on partner-deleted path · 5-second interval calling `updateMetricChips` on stale data · Clear in partner-deleted cleanup blocks.

### `unsubMilestones` / `unsubBucket` (state.js:59-60)
- **Created:** ui.js:205/214 (`startUI`)
- **Torn down:** ui.js:204/213 (self-cleanup on re-call), auth.js:519-520 (sign-out), auth.js:580-581 (partner-deleted path 1), auth.js:651-652 (partner-deleted path 2), settings.js:653-654 (doDeleteAccount)
- **Verdict:** All paths covered.

### `unsubPulse` (state.js:60)
- **Torn down:** auth.js:521 (sign-out), auth.js:582 (partner-deleted path 1), auth.js:653 (partner-deleted path 2), settings.js:655 (doDeleteAccount)
- **Verdict:** All paths covered.

### `statusRefreshInterval` (state.js:48)
- **Created:** status.js (via `startStatusRefresh`)
- **Torn down:** auth.js:491 (sign-out), settings.js:621 (doDeleteAccount)
- **NOT torn down:** auth.js partner-deleted paths

> **LOW** · auth.js:569-597 · `statusRefreshInterval` not cleared on partner-deleted path · Leaked interval continues refreshing status UI for a deleted couple · Clear in partner-deleted cleanup blocks.

### `pulseTimeInterval` (state.js:66)
- **Torn down:** auth.js:518 (sign-out), settings.js:649 (doDeleteAccount)
- **NOT torn down:** auth.js partner-deleted paths

> **LOW** · auth.js:569-597 · `pulseTimeInterval` not cleared on partner-deleted path · Leaked interval · Clear in partner-deleted cleanup blocks.

### Summary: partner-deleted paths are incomplete

> **MEDIUM** · auth.js:569-597, auth.js:643-660 · Both partner-deleted cleanup blocks tear down couple-specific Firebase listeners (`_coupleTypeUnsub`, `_dnUnsub`, `_mjUnsub`, milestones, bucket, pulse) but skip ALL intervals (`clockInterval`, `distanceInterval`, `countdownInterval`, `_metricInterval`, `pulseTimeInterval`, `statusRefreshInterval`) and skip `_meetupDateUnsub`, `_myAvatarUnsub`, `_otherAvatarUnsub`, `_unsubWatchOther` · These paths redirect to the linking screen where leaked intervals continue writing to hidden DOM and leaked listeners fire against deleted data · Consolidate teardown into a shared helper used by all three cleanup paths.

---

## 2. applyMode CORRECTNESS

### Elements touched by `applyMode` (couple.js:19-81):

| Element | LDR | Together | Bidirectional? |
|---|---|---|---|
| `#ldr-now-card` display | `''` (show) | `'none'` | Yes |
| `#ldr-section-wrap` display | `''` (show) | `'none'` | Yes |
| `#panel-us .card-label` innerHTML | "Next meetup" | "Next date night" | Yes |
| `#us-countdown-label` textContent | "Next meetup" | "Next date night" | Yes |
| `R.updateMetricChips()` | Called | Called | Yes |
| `#settings-mode-ldr` .active | true | false | Yes |
| `#settings-mode-together` .active | false | true | Yes |
| `#letter-page-eyebrow` | "For the day we meet" | "For our date night" | Yes |
| `R._syncDnPickerBtn()` | Called | Called | Yes |
| `#dn-planner` .visible | false (isLDR) | conditional on meetupDate | Yes |
| `R.loadDnPlanner()` | Not called | Called if visible | Yes |
| `#tonights-mood-card` display | `'none'` | `''` (show) | Yes |
| `R.initTonightsMood()` | Not called | Called | — |
| `R.teardownTonightsMood()` | Called | Not called | — |

> **No finding.** All DOM toggles are symmetric. Every element set on one direction is correctly set on the reverse. The `_syncDnPickerBtn` call handles LDR vs Together button text internally. `initTonightsMood` / `teardownTonightsMood` are correctly gated by direction.

---

## 3. PARTNER SYNC

**Scenario:** Partner A calls `selectSettingsMode('ldr')` while both devices are in Together mode.

### On Partner A's device (the switcher):
1. `selectSettingsMode` clears `meetupDate` in RTDB (line 191), clears `activeMystery` (line 210), tears down `_dnUnsub` and nulls `_dnCurrentPlan` (line 216-218), writes `coupleType='ldr'` (line 221).
2. `startCoupleTypeListener` fires → `applyMode('ldr')` runs.
3. `startMeetupDateListener` fires (meetupDate cleared) → refreshes countdown, picker btn.

### On Partner B's device (non-switcher):
1. `startCoupleTypeListener` fires → `applyMode('ldr')` runs.
   - Hides `ldr-now-card`? No — SHOWS it (LDR mode shows LDR card). Correct.
   - Hides `dn-planner`, hides `tonights-mood-card`.
   - Calls `teardownTonightsMood()` — correctly stops `_tmUnsub` and `_tmRollInterval`.
   - Updates countdown label, metric chip, letter eyebrow, settings toggles.
2. `startMeetupDateListener` fires → clears `state.meetupDate`, refreshes countdown.

> **MEDIUM** · couple.js:62-69 · On Partner B's device, `applyMode('ldr')` hides `dn-planner` but does NOT tear down `_dnUnsub` (the datePlan listener) · Partner B's `loadDnPlanner` listener continues running on the old datePlan node, writing to `state._dnCurrentPlan` even though the couple is now in LDR mode · This is the same finding as Section 1's `_dnUnsub` note — `applyMode` should tear down `_dnUnsub` when hiding `dn-planner`.

> **No other finding** for Tonight's Mood or countdown on the partner device — both are correctly handled via `teardownTonightsMood()` in `applyMode` and `startMeetupDateListener` respectively.

---

## 4. MEETUP DATE INTERACTION

### When `selectSettingsMode` clears meetupDate (couple.js:191):

1. RTDB write: `meetupDate` set to `''` (empty string, not null).
2. Local state: `state.meetupDate = null` (line 192) — set IMMEDIATELY on the switching device.
3. Partner device: `startMeetupDateListener` fires asynchronously. Between the RTDB write and the listener callback on the partner device, `state.meetupDate` on the partner device retains the OLD value.

> **LOW** · couple.js:191 + couple.js:98-131 · Brief race window where partner's `state.meetupDate` is stale after meetupDate is cleared in RTDB · In practice this window is sub-second on active connections, and no user-facing action depends on instant cross-device consistency of this field · No fix needed, but worth documenting.

### What happens to downstream state when meetupDate is cleared:

- **Countdown display:** `startMeetupDateListener` (couple.js:119) calls `R.startCountdown()` which reads `state.meetupDate` (now null) and shows "Set your next date night/meetup" placeholder. Correct.
- **`state._dnCurrentPlan`:** Not explicitly cleared by `selectSettingsMode` on the partner device. `loadDnPlanner` is not re-called since `dn-planner` is hidden, so `_dnCurrentPlan` retains stale data from the old dateKey. See Section 1/3 finding about `_dnUnsub`.
- **`_dnUnsub`:** On the switching device, torn down at line 217. On the partner device, NOT torn down (see Section 3).
- **dn-planner visibility:** `startMeetupDateListener` (couple.js:123-127) toggles visibility. Since `state.coupleType` is now `'ldr'`, the `show` condition is false. Correct.
- **Letter unlock dates:** Not affected by mode switch meetupDate clearing — `_updateUnreadLetterUnlockDates` is only called from `saveDnPickerSheet`, not from `selectSettingsMode`.

> **No additional finding** beyond those already noted in Sections 1 and 3.

---

## 5. MYSTERY LOCK BEHAVIOUR

### Race safety of `state._dnCurrentPlan` check (couple.js:154):

```js
const plan = state._dnCurrentPlan || {};
const mysteryActive = state.coupleType === 'together'
  && plan.mode === 'mystery'
  && !plan.revealed
  && plan.plannerId
  && plan.plannerId !== state.myUid;
```

`_dnCurrentPlan` is populated by `loadDnPlanner`'s Firebase `onValue` listener (togethermode.js:167-211), which subscribes to `datePlan/{dateKey}` where `dateKey` is derived from `state.meetupDate`.

> **MEDIUM** · couple.js:154 · `_dnCurrentPlan` can be stale if the dateKey has rolled past midnight but `loadDnPlanner` hasn't re-subscribed · `loadDnPlanner` only re-subscribes when `startMeetupDateListener` detects a dateKey change (couple.js:128-130), but if the meetupDate itself didn't change (just the calendar day rolled over), no re-subscription occurs · A mystery planner could set up a mystery on date X, midnight passes, the partner opens settings — `_dnCurrentPlan` still holds the old dateKey's data, but the dateKey is now different, so the plan object would still show `mode:'mystery'` from the old date · In practice the `plannerId !== state.myUid` check prevents the planner from being blocked, and the non-planner would be incorrectly blocked by a stale plan from a PAST date · Suggested fix: read `activeMystery` from RTDB (a single `onValue` with `onlyOnce:true`) instead of relying on client-side `_dnCurrentPlan`.

### What happens if planner switches mode while partner is mid-guess:

1. Planner calls `selectSettingsMode('ldr')`.
2. `activeMystery` is cleared (couple.js:210).
3. `meetupDate` is cleared (couple.js:191).
4. `coupleType` is set to `'ldr'` (couple.js:221).
5. Partner's `startCoupleTypeListener` fires → `applyMode('ldr')` → hides `dn-planner` and `tonights-mood-card`.
6. If the partner had the guess sheet open, the sheet overlay remains visible (it's absolutely positioned, not inside `dn-planner`).

> **LOW** · togethermode.js:686-733 · If the partner has the guess sheet (`dn-guess-sheet-overlay`) open when the planner switches mode, the overlay stays open over the now-LDR UI · Submitting the guess would attempt to write to a datePlan node for a date that was just cleared — the write would likely succeed (rules allow) but the data is orphaned · Suggested fix: close all Together-mode sheets in `applyMode` when switching to LDR.

---

## 6. FIRST-LOAD ORDER

### Trace of `state.coupleType` population on cold start:

1. `loadCoupleAndStart` (auth.js:389-404): one-time read of `couples/{coupleId}`, sets `state.coupleType = d?.coupleType||'ldr'` at line 403.
2. `detectAndStart()` is awaited (auth.js:410).
3. `startUI()` runs (called from `detectAndStart`).
4. `startUI` line 201: `R.applyMode(state.coupleType)` — at this point `state.coupleType` is the correct value from the one-time read.
5. `startCoupleTypeListener()` starts AFTER `startUI` returns (auth.js:411) — the listener fires with the current RTDB value, calling `applyMode` again (redundant but idempotent).

> **No finding.** `state.coupleType` is correctly populated from the one-time read BEFORE `applyMode` runs on cold start. There is no window where `applyMode` runs with the default `'ldr'` against a Together-mode couple.

### applyMode vs Milestones/Bucket listener order:

In `startUI` (ui.js:196-221):
- Line 201: `R.applyMode(state.coupleType)` — runs first
- Lines 204-211: milestones listener attached
- Lines 213-220: bucket listener attached

`applyMode` does not depend on milestones or bucket data. The only data-dependent part is `state.meetupDate` (for dn-planner visibility), which is already populated from the one-time read at auth.js:394-401.

> **No finding.** Order is correct.

---

## 7. SIGN-OUT COMPLETENESS

### Three sign-out paths identified:

1. **Full sign-out** (auth.js:476-535): `onAuthStateChanged` fires with `!user`
2. **Partner-deleted-me** (auth.js:568-598): `_membersUnsub` callback, `members` is null and `_coupleInitFired` is true
3. **Self-delete** (settings.js:590-671): `doDeleteAccount` function
4. **Partner-deleted path 2 / permission-denied** (auth.js:632-661): `_membersUnsub` error callback

(Path 4 is essentially identical to path 2 for teardown purposes.)

### Teardown comparison matrix:

| Resource | Path 1 (sign-out) | Path 2 (partner-deleted) | Path 3 (self-delete) | Path 4 (perm-denied) |
|---|---|---|---|---|
| `_coupleTypeUnsub` | 493 Yes | 573 Yes | 623 Yes | 644 Yes |
| `_meetupDateUnsub` | **NO** | **NO** | 633 Yes | **NO** |
| `_dnUnsub` | 503 Yes | 574 Yes | 632 Yes | 645 Yes |
| `_mjUnsub` | 492 Yes | 575 Yes | 622 Yes | 646 Yes |
| `_tmUnsub`/`_tmRollInterval` (via teardown) | 504 Yes | 576 Yes | **NO** | 647 Yes |
| `statusRefreshInterval` | 491 Yes | **NO** | 621 Yes | **NO** |
| `clockInterval` | 514 Yes | **NO** | 648 Yes | **NO** |
| `distanceInterval` | 515 Yes | **NO** | 647 Yes | **NO** |
| `countdownInterval` | 516 Yes | **NO** | 646 Yes | **NO** |
| `_metricInterval` | 517 Yes | **NO** | 666 Yes | **NO** |
| `pulseTimeInterval` | 518 Yes | **NO** | 649 Yes | **NO** |
| `unsubMilestones` | 519 Yes | 580 Yes | 653 Yes | 651 Yes |
| `unsubBucket` | 520 Yes | 581 Yes | 654 Yes | 652 Yes |
| `unsubPulse` | 521 Yes | 582 Yes | 655 Yes | 653 Yes |
| `_watchPartnerUnsub` | 522 Yes | **NO** | 656 Yes | **NO** |
| `_membersUnsub` | 523 Yes | N/A (self) | N/A | N/A |
| `_unsubWatchOther` | 524 Yes | **NO** | 657 Yes | **NO** |
| `_myAvatarUnsub` | 494 Yes | **NO** | 625 Yes | **NO** |
| `_otherAvatarUnsub` | 495 Yes | **NO** | 626 Yes | **NO** |
| `_letterCountdownInterval` (via `_stopLetterCountdown`) | 512 Yes | **NO** | 640 Yes | **NO** |
| `resetSummary` | 505 Yes | 577 Yes | 634 Yes | 648 Yes |
| `_mjResetExpandedMonths` | 507 Yes | 579 Yes | 635 Yes | 650 Yes |

### Findings:

> **HIGH** · auth.js:489-535 · `_meetupDateUnsub` is not torn down on any auth.js sign-out path (full sign-out, partner-deleted, permission-denied) · This listener writes to `state.meetupDate` and triggers UI refreshes on a reset session · Already noted in Section 1 — must be added to all three auth.js paths.

> **MEDIUM** · settings.js:620-671 · `doDeleteAccount` does not call `teardownTonightsMood()` · `_tmUnsub` and `_tmRollInterval` leak · Already noted in Section 1.

> **MEDIUM** · auth.js:569-598, 643-661 · Partner-deleted paths skip 10+ intervals and listeners: `statusRefreshInterval`, `clockInterval`, `distanceInterval`, `countdownInterval`, `_metricInterval`, `pulseTimeInterval`, `_watchPartnerUnsub`, `_unsubWatchOther`, `_myAvatarUnsub`, `_otherAvatarUnsub`, `_letterCountdownInterval` · These leak and continue running against stale/deleted data while the linking screen is shown · Extract a shared `_teardownAll()` helper and call it from all paths.

### State fields expected to be null/default on sign-out:

All fields in state.js are reset by Path 1 (full sign-out) and Path 3 (self-delete). Paths 2 and 4 reset couple-specific listener references but leave identity fields (`ME`, `OTHER`, `myUid`, `partnerUid`), location fields, avatar URLs, and caches (`localMilestones`, `localBucket`) in their pre-deletion state.

> **LOW** · auth.js:569-598 · Partner-deleted paths do not reset `state.ME`, `state.OTHER`, `state.myUid`, `state.partnerUid`, `state.coupleType`, `state.myCity`, etc · These stale values persist until the user logs out or reloads — if they create/join a new couple in the same session, `loadCoupleAndStart` will overwrite them, so this is cosmetic rather than functional · Resetting to defaults in the partner-deleted paths would be cleaner but is not strictly required.

---

## 8. iOS PWA SPECIFIC

### `visibilitychange` / `pageshow` / `resume` listeners:

Grep confirms: **zero** listeners for `visibilitychange`, `pageshow`, or any resume event exist anywhere in the codebase.

### Impact analysis:

- **`setInterval`-based timers** (`clockInterval`, `distanceInterval`, `countdownInterval`, `_metricInterval`, `_tmRollInterval`, `statusRefreshInterval`, `pulseTimeInterval`): On iOS Safari PWA, `setInterval` callbacks are suspended when the app is backgrounded and resume automatically when foregrounded. The timers continue from where they left off — they do NOT need re-binding. However, they will show stale values until the next tick after resume.

- **Firebase `onValue` listeners** (`_coupleTypeUnsub`, `_meetupDateUnsub`, `_dnUnsub`, `_tmUnsub`, `unsubMilestones`, etc.): Firebase RTDB's WebSocket reconnects automatically after backgrounding. Pending events are delivered on reconnection. No explicit rebinding needed.

- **Geolocation / presence:** The initial `detectAndStart()` runs `_pushPresence` once. After backgrounding for extended periods (hours), the user's presence data (`timezone`, `city`, `lat`, `lng`) becomes stale. There is no periodic GPS refresh or visibility-based re-push.

> **MEDIUM** · No file (gap) · No `visibilitychange` handler exists to refresh stale presence data after iOS PWA resume · If a user travels to a different timezone while the app is backgrounded, their partner's clock/city/distance display will show the old location until the user fully restarts the app · Suggested fix: add a `visibilitychange` listener that re-runs `detectAndStart()` (or at minimum `_pushPresence`) when the document becomes visible.

> **LOW** · countdown.js:13-39 · After iOS PWA resume, the countdown display shows stale values until the next 1-second tick · This is a sub-second visual glitch — the next `setInterval` tick corrects it · No fix needed.

> **LOW** · ui.js:222-223 · Clock display (`my-time`, `other-time`) shows time from before backgrounding until the next 1-second tick · Same class of issue as countdown — self-corrects within 1 second · No fix needed.

---

## Finding Summary

| # | Severity | Location | Description |
|---|---|---|---|
| 1 | HIGH | auth.js:489-535 | `_meetupDateUnsub` not torn down on sign-out — ghost listener survives |
| 2 | HIGH | auth.js:569-598, 643-661 | `_meetupDateUnsub` not torn down on partner-deleted paths |
| 3 | MEDIUM | couple.js:62-69 | `applyMode` hides dn-planner but doesn't tear down `_dnUnsub` on partner's device |
| 4 | MEDIUM | settings.js:620-671 | `doDeleteAccount` doesn't call `teardownTonightsMood()` |
| 5 | MEDIUM | auth.js:569-598, 643-661 | Partner-deleted paths skip 10+ interval/listener teardowns |
| 6 | MEDIUM | couple.js:154 | Mystery lock check uses potentially stale `_dnCurrentPlan` after dateKey rollover |
| 7 | MEDIUM | No file (gap) | No `visibilitychange` handler to refresh presence after iOS PWA resume |
| 8 | LOW | couple.js:191 | Brief race window for partner's `state.meetupDate` after RTDB clear |
| 9 | LOW | auth.js:569-598 | Partner-deleted paths don't reset identity/location state fields |
| 10 | LOW | togethermode.js:686-733 | Together-mode sheets stay open if mode switches while sheet is visible |
| 11 | LOW | auth.js:569-598 | `clockInterval`, `distanceInterval` etc. leak on partner-deleted path |
| 12 | LOW | countdown.js, ui.js | Sub-second stale display after iOS PWA resume (self-corrects) |
