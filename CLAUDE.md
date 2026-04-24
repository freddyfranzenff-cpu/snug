# Snug — Claude Code Context

## What is Snug
Snug is a private couples PWA — a shared intimate space for daily connection for both long-distance and cohabiting couples. Built originally for Freddy (Stuttgart) and Sarah (Dehradun/Taiwan), rolling out to ~10 test couples. Long-term: grow to 50k+ couples, position for acquisition by Match Group or similar in ~5 years. Core insight: Match profits when relationships fail; Snug profits when they succeed.

---

## Repo & Deployment
GitHub: `github.com/freddyfranzenff-cpu/snug`. `main` → Vercel prod (`snug-seven.vercel.app`). `staging` → Vercel preview URL. **Never commit directly to `main`** — all work goes through `staging` first.

---

## Tech Stack
Vanilla JS ES modules + Vite 5.4 · Firebase RTDB (`ldrcounter`, `europe-west1`) + Auth + Storage · hosted on Vercel with serverless `/api/weather.js` and `/api/notify.js` · PWA via `sw.js` + `manifest.json` · Leaflet.js from unpkg CDN for LDR distance map + Places map · Firebase SDK 10.12.0 loaded via ESM from gstatic CDN · ESLint 9 flat config.

---

## File Structure
```
snug/
  src/
    index.html              HTML shell; inline <head> IIFE sets --app-height
    styles/main.css
    js/
      main.js               thin entry — bootstraps R.tryInitFirebase()
      state.js              mutable `state` object (all former globals)
      registry.js           mutable `R` namespace for cross-module calls
      firebase-config.js    reads import.meta.env.VITE_*
      app-height.js, sw-register.js
      auth.js               auth router, signup/login/onboarding, _teardownSessionState
      couple.js             create/join/link/offboarding, applyMode, start*Listener
      ui.js                 startUI, showPage, switchHomeTab, updateMetricChips
      milestones.js, bucket.js, letters.js, memoryjar.js
      pulse.js, status.js, weather.js, presence.js, countdown.js
      settings.js, togethermode.js, places.js, avatar.js
      notifications.js      FCM tokens, notifyPartner, deep-link, prefs UI
      tonightsmood.js, tonightsdinner.js, ourlist.js   Together-mode features
      tooltips.js           info-icon system — shared sheet, 13 tooltips
      summary.js            Snugshot tab — insight + week/month stats
  firebase-messaging-sw.js  FCM background handler (symlinked into public/)
  public/                   icons/, manifest.json, sw.js symlinked to repo root
  api/
    weather.js              ES module default export — wttr.in proxy
    notify.js               FCM HTTP v1 sender, JWT + ID-token verified
  sw.js, manifest.json, database.rules.json, storage.rules   repo root
  firebase.json, .firebaserc, vite.config.js, vercel.json, eslint.config.js,
  package.json, .env.local (gitignored), CLAUDE.md
```

---

## Module Architecture
`state.js` exports a single mutable `state` object — sidesteps ES module `let`-binding reassignment limits. `registry.js` exports a mutable `R` namespace — modules attach functions at load, cross-module call sites use `R.X()` at call time to dodge circular-import evaluation-order problems. `window.*` handlers preserved in their original modules so inline `onclick=` attributes in `index.html` keep working.

---

## Firebase Data Structure
```
users/{uid}/
  name, email, city, avatarUrl, coupleId, role, inviteCode, createdAt
  fcmTokens/{tokenHash}   token string (multi-device map)
  notificationPrefs/      per-trigger booleans (default ON if absent)

couples/{coupleId}/
  owner, coupleType ('ldr'|'together'), startDate ('YYYY-MM-DD')
  meetupDate      'YYYY-MM-DDTHH:MM:00' (time included for Together)
  inviteCode      mirrored on users/{uid}/inviteCode for cleanup
  createdAt
  activeMystery   uid of current mystery planner (cleared on reveal/cancel/done)

  members/{uid}/      name, city, role ('owner'|'joiner')
  presence/{uid}/     timezone, city, lat, lng, updatedAt (serverTimestamp)

  milestones/{pushId}/   title, date, endDate, note, tag, emoji, addedBy,
                         location, locationDisplay, lat, lng, photoURL,
                         photoPath (Storage path for deletion), photoPosition, createdAt
  bucket/{pushId}/       title, category, addedBy, done, completedAt, time
  letters/{pushId}/      unlockDate, createdAt, {uid}/{content,writtenAt,unlockDate,readAt}
  memoryJar/{YYYY-MM-DD}/{uid}/    text, createdAt
  pulses/{pushId}/       from, to, fromName, time (ms)

  datePlan/{dateKey}/
    mode          'open' | 'mystery'
    plannerId     uid (write-once)
    where, what, who   plan details (open dates, or after mystery reveal)
    revealed      bool (mystery only) — false until planner reveals
    time          optional HH:MM — absent = letters unlock at 00:00
    hints/{pushId}/  text, authorUid, createdAt, correct (planner sets)
      guess/    text, authorUid, createdAt

  statusHistory/{pushId}/    uid, activity, mood, savedAt (ms)
    Append-only log — never overwritten/deleted. Powers real status-update counts.

  dailyInsight/{dateKey}/{range('week'|'month')}/    text, rule, generatedAt
    One per local day per range; first partner to open Snugshot writes, second reads.

  tonightsMood/{dateKey}/{uid}/
    mood    one of: cosy, romantic, adventurous, netflix, productive,
            chaotic, talky, celebratory, hungry
    chosenAt   number (ms)

  ourList/{pushId}/            (Together)
    text (≤200), tag ('groceries'|'home'|'todo'), addedBy (uid), addedAt (ms)
    done (bool, default false), doneAt (ms), doneBy (uid)  — set when done flips true

  tonightsDinner/{dateKey}/    (one node per local day)
    proposal (≤200), proposedBy, proposedAt, firstProposedAt (for seconds_to_agree),
    previousProposal (kept when a counter replaces a proposal),
    status ('proposed'|'agreed'|'countered'), counteredBy, agreedAt

meta/userCount       integer — Phase 1 cap ≤30, incremented via transaction in doOnboarding
invites/{code}/      coupleId, createdBy, createdAt, expiresAt (48h), used

userNotifBatch/{recipientUid}/listItemAdded_{senderUid}/   (admin-only)
  lastPushAt, pendingItems[]
  Rules hard-block client access; service-account bypass in api/notify.js is the only
  writer. Powers Our-list 30s debounce.
```

---

## Navigation Structure

**Bottom nav (4 tabs):** Home · Memories (Milestones / Places / Memory Jar) · Ours (Bucket / Letters — page id `page-together`) · Account (Profile / Notifications).

**Home sub-tab contents:**
- **Now** — greeting+days strip · avatar row · Pulse · (LDR) Right Now card (clocks/weather/distance/sleep) · Status (LDR: full card; Together: compact one-liner opening the status sheet) · (Together) Our list · (Together) Tonight's dinner · (Together) Tonight's Mood · metric chips
- **Us** — Countdown · (Together, when `meetupDate` set) `#dn-planner-label` + `#dn-planner` planner card · current letter pair · Memory Jar preview · Bucket progress
- **Snugshot** — Insight card + week/month stats: memory jar, longest streak, pulses, status updates, (Together) Tonight's Mood match rate. Panel id stays `panel-summary`; `switchHomeTab('summary')` unchanged — display label only.

---

## Two Modes
Mode stored as `coupleType` on the couple node. `applyMode(type)` in `couple.js` switches UI; live-synced via `startCoupleTypeListener()`; flips also re-run `R.initNotificationPrefs()` for Together-only toggle hide/show. `selectSettingsMode(type)` writes `coupleType`. Display labels: "Long distance" / "Together"; data values stay `'ldr'` / `'together'`.

- **LDR** — shows `ldr-section-wrap` (clocks/distance/weather/sleep); hides Together cards; full Status card visible. Countdown "Next meetup"; chip icon `✈`; letters unlock at 00:00.
- **Together** — shows `dn-planner`, `tonights-mood-card`, `tonights-dinner-card`, `our-list-card`, `#status-card-compact`; hides `ldr-section-wrap` and the full Status card. Countdown "Next date night"; chip re-labels to "Date night" and swaps `✈` → inline calendar SVG (`#metric-meetup-icon`); letters unlock at `state._dnTimeVal` (default `19:00`); Snugshot adds Tonight's Mood match rate.

---

## Critical Layout Rules — DO NOT CHANGE
Hard-won fixes. Reverting any of them breaks scroll on Android/iOS.

```css
.main                 { overflow: hidden; }   /* THE KEY FIX — panels grow unbounded without this */
.page.active          { overflow: hidden; }
/* Panels MUST be display:block — display:flex breaks Android Chrome scroll.
   flex:1 1 0 makes the panel a bounded flex ITEM; display:block makes it scroll internally. */
.home-tab-panel.active { display: block; flex: 1 1 0; min-height: 0; overflow-y: auto; }
.page-tab-panel.active { display: block; flex: 1 1 0; min-height: 0; overflow-y: auto; }
* { -webkit-tap-highlight-color: transparent; }  /* kill Android blue flash */
```

Scroll chain that works:
```
body (height: var(--app-height) px, overflow:hidden, flex col)
  .main (flex:1, min-height:0, overflow:hidden)
    .page.active (flex:1, min-height:0, overflow:hidden, flex col)
      shell header / home-top-strip + tabs (flex-shrink:0)
      panel (display:block, flex:1 1 0, min-height:0, overflow-y:auto) ← scrolls here
```

- The `--app-height` IIFE in `<head>` of `src/index.html` must stay inline — runs synchronously before first CSS paint. Never use `100vh` on iOS Safari.
- **Scrollbar placement rule:** horizontal padding must sit directly on the scrolling panel, not on a parent. Panel-level padding keeps the scrollbar at the true viewport edge; parent-level padding insets it and overlaps content.
- **Do not revert:** `.home-cd-card` must use default block layout — the old `display:flex;flex-direction:column;justify-content:space-between` caused countdown/next-card overlap on narrow viewports.

### Other fixed bugs — do not revert
- GPS `[0,0]` check (Africa bug) prevents bad presence push
- iOS PWA login: complete signup in Safari BEFORE installing to home screen — PWA install creates isolated localStorage, `pendingJoinCode` is lost otherwise
- iOS double notification: `api/notify.js` skips legacy `fcmToken` if already present in `fcmTokens` map
- iOS double notification (background): FCM payload is data-only — no top-level `notification` field — `onBackgroundMessage` controls display

---

## Design System
Font: Plus Jakarta Sans (Google Fonts). Primary `--k: #c8553a` (coral), `--kl: #e07a5f`, `--kll: #fdf0ec`. Pink `--pk: #d4607a`, `--pll: #fce8f0`. Neutral `--bg: #faf6f2`, `--surface: #fff`, `--text: #1e120a`, `--muted: #9a6752`, `--border: rgba(200,85,58,0.11)`. See `src/styles/main.css` for full tokens, card radii, buttons, tab bars, bottom sheets, metric chips.

---

## Weather API
`api/weather.js` is an ES module default export. Production: `/api/weather?lat=&lng=` proxies wttr.in. Localhost short-circuits to open-meteo. **Do NOT revert to CommonJS** — Vercel requires ES module default export.

---

## Environment Variables
Client (via `import.meta.env.VITE_*`):
```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_VAPID_KEY       web-push VAPID public key (client-safe)
```
Server only (never expose):
```
FIREBASE_SERVICE_ACCOUNT      full service-account JSON (stringified)
FIREBASE_DATABASE_URL         RTDB URL for api/notify.js
```

---

## Service Worker
- File: `sw.js` at repo root (symlinked into `public/`)
- **Bump `CACHE_VERSION` on every production deploy** — forces PWA clients to update
- Pattern: `ylc-v{n}`. Current: `ylc-v145`
- `skipWaiting()` + `clients.claim()` — activates immediately without tab reload
- Firebase / Storage / Auth / Vercel `/api/*` / weather APIs are never intercepted

---

## Global State
Source of truth: `src/js/state.js` — one mutable object exported as `state`. Module-level state outside `state` that must be reset on sign-out:
- `summary.js` — `_currentRange`, `_requestSeq` (reset via `R.resetSummary()`)
- `memoryjar.js` — `_mjExpandedMonths` Set (reset via `R._mjResetExpandedMonths()`)

Both are called from `_teardownSessionState()` in `auth.js`.

---

## Info Icon System
One CSS class `info-btn`, no modifiers. Size/colour controlled via ancestor selectors:
- **Base** (section headings, settings labels): 9×9 px, 6px font, 1px coral border.
- **`.shell-page-header-row .info-btn`** (Memories/Ours titles, 1.25rem bold): 13×13 px, 8px font, `margin-top:3px`.
- **`.snugshot-insight-card-header .info-btn`** (white-on-coral): 8×8 px, 5px font, semi-transparent white.

### Placement contexts
- **Section headings (`.section-heading`)** — button is a direct flex child of the `<p>`; text wrapped in `<span>`. Heading needs inline `justify-content:flex-start` unless it has a trailing "See all" (default is `space-between`). Gap from `.section-heading { gap:5px }`.
- **Shell page titles** — button sibling of `<h2>` inside `.shell-page-header-row` (`flex / align:center / justify:flex-start / gap:8px`).
- **Snugshot insight card** — button sibling of `.snugshot-insight-label`. Label must be `inline-flex / align:center / line-height:1`, no `margin-bottom`.
- **Settings/onboarding labels** — button direct flex child; parent needs inline `flex / align:center / gap:5px`.

### Alignment lessons
- Never `vertical-align` or `position:relative/top` — use flex on parent.
- `margin-bottom` on a flex child creates an asymmetric margin box; `align-items:center` centres the whole box, pushing visible text off-centre. Remove it.
- `<p>` needs `line-height:1` to kill descender space that offsets icons.
- Raw text nodes don't participate in `gap` — wrap in `<span>`.
- `justify-content:space-between` pushes a lone second child right — override with `flex-start` when the heading is text + icon only.

`tooltips.js`: `TOOLTIPS` map `{ id: { title, text } }`. `showTooltip(id)` opens `#tooltip-overlay`; `closeTooltip()` closes. Countdown button injected at DOM ready picks tooltip id from `state.coupleType`. Swipe-to-dismiss via `R._initSheetSwipe`.

---

## Key JS Functions

| Function | What it does |
|---|---|
| `tryInitFirebase()` | ESM Firebase SDK import; wires `fbAuth`; starts auth listener |
| `onAuthStateChanged` cb | Central auth router — login / onboarding / linking / app |
| `loadCoupleAndStart` | Populates state from members, triggers `detectAndStart()` |
| `detectAndStart` | GPS → tz/city → `_pushPresence` → `startUI()` |
| `startUI` | Populates static UI, starts listeners + intervals |
| `applyMode(type)` | LDR ↔ Together UI switch (cards + chip icon + notif toggles) |
| `showPage(page)` / `switchHomeTab(tab)` | Bottom-nav / sub-tab switch; unknowns fall back to `'now'` |
| `sendPulse()` | 60s-cooldown rate-limited push |
| `initTonightsMood` / `initTonightsDinner` / `initOurList` | Together-mode feature wiring (listeners, rollover, sheets; Our-list runs 48h auto-trim on first snapshot) |
| `renderSummary(range)` | One-shot Snugshot reads, race-guarded via `_requestSeq` |
| `_teardownSessionState()` | Central teardown — listeners, intervals, module-level state. Called on sign-out AND partner-delete |
| `doDeleteAccount` / `doLinkingDeleteAccount` | Offboarding paths (Settings / linking screen) |
| `openDnDismissConfirm` / `confirmDnDismiss` | Planner-card dismiss — confirmation card; clears `datePlan/{dateKey}`, `meetupDate`, `activeMystery` |

---

## Onboarding Flow
- **Owner:** login → signup → verify email → onboarding (name + avatar) → linking → create couple → invite screen → wait for partner.
- **Joiner:** opens `/?join=CODE` → signup → verify email → onboarding → linking (code pre-filled) → joins couple → app loads.
- **iOS PWA gotcha:** complete signup in Safari BEFORE installing to home screen. Home-screen install creates isolated localStorage; `pendingJoinCode` is lost.

---

## Offboarding Flow
Two paths (Settings, or the linking screen). Both validate `'DELETE'`, reauthenticate, set `_selfDeleting=true`, delete avatar + milestone photos + invite doc, wipe couple node, clear own user record, delete Auth account. Partner is notified via `_membersUnsub`. Session-end cleanup is centralised in `_teardownSessionState()` — called from `onAuthStateChanged(null)` and partner-deleted paths.

---

## Firebase Security Rules
Full rules in `database.rules.json` and `storage.rules`. Key constraints:

- **All writes require `auth.token.email_verified === true`.**
- `users/$uid` — own data only; `avatarUrl` any-auth readable.
- `couples/$coupleId` — members-only; `!data.exists()` branch permits initial owner creation. `members/$memberUid` and `presence/$memberUid` each writable only by that uid.
- `meta/userCount` — must be previous+1 and ≤30.
- `activeMystery` — settable only to own uid; clearable only by current holder. `meetupDate` blocked for non-holders while lock is held.
- `datePlan/$dateKey` — non-planner blocked while mystery active + unrevealed. `plannerId` write-once. `hints`: planner-only creation. `guess`: non-planner only, immutable. `correct`: planner-only.
- `statusHistory/$pushId` — append-only; validates `{uid === auth.uid, activity, mood, savedAt:number}`.
- `tonightsMood/$dateKey/$uid` — validates one of 9 mood strings + numeric `chosenAt`; rejects extras.
- **Writer-claim fields** — `ourList.addedBy`, `tonightsDinner.proposedBy`/`counteredBy`: must equal `auth.uid` on create-or-change, OR be unchanged from prior value. `counteredBy` also requires the uid be a current couple member. Sibling updates (toggle `done`, flip `status` to `agreed`) still pass via the "unchanged" branch.
- `invites/$code` — any-auth read; write by creator or couple member.
- `userNotifBatch/*` — hard-denied to clients; admin-SDK only.
- Storage `avatars/{uid}.jpg` — own write/delete, ≤2MB, image/(jpeg|png|webp).
- Storage `milestones/{coupleId}/{milestoneKey}/{filename}` — ≤5MB, image MIME. RTDB `.validate` enforces `photoPath` begins with `milestones/{coupleId}/`. Legacy path `milestones/{milestoneKey}/{filename}` retained for existing photos.

Deploy: `npx firebase-tools deploy --only database,storage`. First run from a new machine: `npx firebase-tools login`. Console edits are overwritten on next deploy.

---

## Push Notifications

**Triggers:** `pulse`, `memoryJar`, `status` (only if changed), `milestone`, `bucket` (awaits confirmed write), `meetup` (LDR), `dateNight` (Together), `dnHint`, `dnGuess`, `dnReveal`, `dnCorrect`, `moodPick`, `moodMatch`, `moodReveal`, `listItemAdded`, `dinnerProposed`, `dinnerCountered`, `dinnerAgreed`. Title usually `{partnerName}` — exceptions: `moodMatch` ("It's a match! ✨"), `dinnerAgreed` ("Dinner agreed ✓"). `listItemAdded` + the three dinner triggers accept an `extra` string on `/api/notify` (≤200 chars) rendered into the body.

**Deep linking** (live via SW postMessage and cold-start via sessionStorage+URL params):
- Now: pulse, status, moodPick, moodMatch, moodReveal, listItemAdded, dinnerProposed/Countered/Agreed
- Us: meetup, dateNight, dnHint, dnGuess, dnCorrect, dnReveal
- Memories: milestone, memoryJar · Ours: bucket

**Tokens & prefs:** tokens at `users/{uid}/fcmTokens/{tokenHash}` (multi-device map). Legacy `fcmToken` string still read; skipped if already in map. Per-trigger toggles at `notificationPrefs/`, default ON. `PREF_ALIAS`: mood triggers share `tonightsMood`; dinner triggers share `tonightsDinner`; `listItemAdded` is its own key. In LDR, `initNotificationPrefs()` hides the Together-only `.settings-row-new`s (values preserved across flips).

**Debounce — listItemAdded:** server-side 30s sliding window per (sender→recipient). First item fires; subsequent within 30s accumulate into `userNotifBatch/.../pendingItems`. Next send after the window flushes into one combined body (1 → plain; 2 → "a and b"; 3–4 → "a, b, c"; 5+ → "a, b and N more").

**Server auth:** `api/notify.js` requires `Authorization: Bearer <Firebase ID token>`; verifies via firebase-admin; checks `email_verified`; validates couple membership. 401/403 on failure.

**iOS limits:** Web Push needs iOS 16.4+ installed PWA. `pushSupported()` bails unless `standalone`. Android monochrome icon deferred.

---

## XSS Protection
- All user content rendered via `R._esc(str)` — escapes `& < > " '`
- Partner letter content set via `el.textContent`, never `innerHTML`
- Milestone photo URLs held in a module-level `_msRegistry` Map keyed by Firebase pushId, not inlined into markup

---

## Features Shipped

### Core
- Pulse (60s cooldown) · Status (append-only `statusHistory`) · Memory Jar (daily shared + streak) · Bucket list · Letters (paired, scheduled, midnight/19:00 unlock, Us-tab shortcut) · Milestones (photo + position + coupleId-prefixed Storage paths) · Places (Leaflet)
- Snugshot (daily insight cache + week/month stats, race-guarded)
- Contextual tooltips (13 icons, shared bottom sheet)
- Global pronoun rule: always partner name, never they/their/them
- FCM push (HTTP v1, JWT, deep linking, per-trigger prefs)

### LDR-specific
- Right Now card: clocks, distance, weather, sleep indicator
- Meetup countdown + map line between coords

### Together-specific
- **Date-night planner** at `#dn-planner` on Home/Us. Open mode (where/what/who) or Mystery mode (planner locks `activeMystery`, drops hints, partner guesses, planner reveals). SVG field icons inside `.dn-field-icon`. `×` top-right dismiss opens an in-flow confirmation card — only on planner-facing cards (never `_renderMysteryPartnerCard`).
- **Mystery hint history** — guesser card renders the full hint chain mirroring planner's view (numbered hints, prior guesses labelled "Your guess", correct badge, "You got it!" line). "Guess this hint" attaches only to the latest unguessed hint.
- **Tonight's Mood** — 9 moods, `runTransaction`, match/mismatch matrix, day rollover.
- **Our list** — `ourList/{pushId}`, tag filter (All/Groceries/Home/To-do). Home/Now shows top 3 not-done; "See all →" opens full sheet. Checked items stay visible until end of local day. Client-side 48h auto-trim on first RTDB snapshot (done items only, `doneAt > 48h`) via one multi-location `dbUpdate`; guarded by `_cleanupRan` flag reset in `teardownOurList`.
- **Tonight's Dinner** — `tonightsDinner/{dateKey}`. State machine: propose → waiting/incoming → counter → agreed. "+ Ingredients to list" pushes comma-separated items as `groceries`-tagged rows via `R.addOurListMany` (single summary notification). Same local-day rollover as Tonight's Mood.
- **Status demotion** — `#status-card-compact` one-liner replaces the full card; `#status-compact-eyebrow` shows "STATUS" above it. `applyMode()` keeps exactly one heading visible at a time.
- **"Status" rename** — heading + sheet title read "Status" / "Update your status". Tooltip body still uses "what you're up to" descriptively — intentional.
- **Date night chip icon** — Together swaps `✈` for an inline calendar SVG and re-labels "Next meetup" → "Date night" via `updateMetricChips()`.

### Security (Phase 1)
- 30-user hard cap (`meta/userCount`, waitlist screen)
- Email verification enforced at rules layer; verify screen + resend with rate-limit handling
- Password policy (min 8, uppercase, numeric)
- Storage rules: MIME, size caps, coupleId-prefixed milestone paths
- `api/notify.js`: Firebase ID-token verification + couple-membership check
- Writer-claim fields (`ourList.addedBy`, `tonightsDinner.proposedBy`/`counteredBy`) enforced at rules layer

### Mixpanel event spec (Phase 3 — NOT yet wired)
Documented at call sites in `ourlist.js` / `tonightsdinner.js`: `list_item_added` (`tag`, `added_by_role`) · `list_item_checked` (`tag`, `checked_by_role`, `seconds_since_added`) · `list_opened` (once/session) · `list_see_all_tapped` (once/session) · `dinner_proposed` / `dinner_countered` (`role`) · `dinner_agreed` (`seconds_to_agree`, `had_counter`) · `dinner_ingredients_added` (`item_count`).

---

## Roadmap Context
Phase 1 (security) and Together-mode v2 shipped. **Phase 3 — Mixpanel analytics** is next; event specs already documented inline at call sites. **Phase 4 — test rollout** to ~10 couples follows; watch 7-day retention, MJ streak, notification open rate, Tonight's Mood completion, mystery-date creation, Our-list add rate, Tonight's Dinner agreement rate. Full plan in `Snug_Roadmap_2026.pdf`.

---

## Open Technical Debt
- Mystery-hint history is full-chain — if chains grow long, may need collapse-older UX (revisit after Phase 4 feedback).
- Mystery auto-reveal is client-side cosmetic; proper server enforcement needs a Cloud Function.
- App Check deferred to ~1000-user milestone. Android monochrome notif icon deferred. `manifest.json` 401 from SW fetch (symlink on Vercel) deferred — no functional impact.
