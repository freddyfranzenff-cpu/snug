# Snug — Claude Code Context

## What is Snug
Snug is a private couples PWA. It gives couples — both long-distance and living together — a shared intimate space for daily connection. Built originally for Freddy (Stuttgart) and Sarah (Dehradun/Taiwan), now rolling out to ~10 test couples.

Long-term vision: grow to 50k+ active couples, position for acquisition by Match Group or similar in ~5 years. The core insight: Match Group profits when relationships fail. Snug profits when they succeed.

---

## Repo & Deployment
- **GitHub:** `github.com/freddyfranzenff-cpu/snug`
- **Production:** `main` branch → auto-deploys to Vercel (`snug-seven.vercel.app`, custom domain TBD)
- **Staging:** `staging` branch → auto-deploys to Vercel preview URL
- **Rule:** Never commit directly to `main`. All work goes to `staging` first, tested, then merged.

---

## Tech Stack
- **Frontend:** Vanilla JS (ES modules), Vite 5.4 build pipeline
- **Database:** Firebase Realtime Database (`ldrcounter` project, `europe-west1` region)
- **Auth:** Firebase Auth (email/password)
- **Storage:** Firebase Storage (avatars, milestone photos)
- **Hosting:** Vercel
- **Serverless:** Vercel API functions (`/api/` folder) — `weather.js` (proxies wttr.in), `notify.js` (FCM push notifications)
- **PWA:** Service worker (`sw.js`), Web App Manifest (`manifest.json`)
- **Build:** Vite 5.4 (`vite.config.js` at repo root, `src/` as root, outputs to `dist/`)
- **Linting:** ESLint 9 flat config (`eslint.config.js`)
- **Maps:** Leaflet.js for the LDR distance map and Places map (loaded from unpkg CDN)
- **Firebase SDK version:** 10.12.0 (loaded via ESM from gstatic CDN)

---

## File Structure
```
snug/
  src/
    index.html              ← HTML shell; inline <head> IIFE kept for --app-height
    styles/main.css
    js/
      main.js               ← Thin entry — bootstraps R.tryInitFirebase()
      state.js              ← Mutable `state` object (all former globals)
      registry.js           ← Mutable `R` namespace for cross-module calls
      firebase-config.js    ← Reads import.meta.env.VITE_*
      app-height.js, sw-register.js
      auth.js               ← onAuthStateChanged, login, signup, onboarding
      couple.js             ← couple creation/joining/linking/offboarding, applyMode, startCoupleTypeListener, startMeetupDateListener, selectSettingsMode
      ui.js                 ← startUI, showPage, switchHomeTab, updateMetricChips
      milestones.js, bucket.js, letters.js, memoryjar.js
      pulse.js, status.js, weather.js, presence.js, countdown.js
      settings.js, togethermode.js, places.js, avatar.js
      notifications.js      ← FCM tokens, notifyPartner(), deep-link, prefs UI
      tonightsmood.js       ← Tonight's Mood — pick/waiting/reveal, bottom sheet
      tooltips.js           ← Info icon system — shared bottom sheet, 13 tooltip definitions
      summary.js            ← Snugshot tab: insight + week/month stats
  firebase-messaging-sw.js  ← FCM background handler (repo root, symlinked into public/)
  public/                   ← icons/, manifest.json, sw.js all symlinked to repo root
  api/
    weather.js              ← Vercel serverless — proxies wttr.in (ES module default export)
    notify.js               ← Vercel serverless — FCM HTTP v1 push sender, JWT service account auth
  sw.js, manifest.json      ← Repo root (service worker + PWA manifest)
  database.rules.json       ← RTDB security rules (deployed via firebase-tools)
  storage.rules             ← Storage security rules (deployed via firebase-tools)
  firebase.json             ← Firebase CLI config (points to rules files)
  .firebaserc               ← Firebase project alias (ldrcounter)
  vite.config.js            ← root=src, publicDir=public, outDir=dist
  vercel.json               ← framework=vite, outputDirectory=dist
  eslint.config.js, package.json
  .env.local                ← Firebase env vars (gitignored — never commit)
  CLAUDE.md                 ← This file
```

### Module architecture
- `state.js` exports a single mutable `state` object — sidesteps ES module `let`-binding reassignment limits.
- `registry.js` exports a mutable `R` namespace — modules attach functions at load, cross-module call sites use `R.X()` to avoid circular-import evaluation-order problems.
- `window.*` handlers preserved in their original modules — inline `onclick=` attributes in `index.html` keep working unchanged.

---

## Firebase Data Structure
```
users/{uid}/
  name, email, city, avatarUrl, coupleId, role, inviteCode, createdAt
  fcmTokens/{tokenHash}   token string (map — supports multiple devices)
  notificationPrefs/      per-trigger booleans (default: all true if absent)

couples/{coupleId}/
  owner, coupleType ('ldr'|'together'), startDate ('YYYY-MM-DD')
  meetupDate       'YYYY-MM-DDTHH:MM:00' (time included for Together mode)
  inviteCode       stored here AND on users/{uid}/inviteCode for cleanup
  createdAt

  members/{uid}/      name, city, role ('owner'|'joiner')
  presence/{uid}/     timezone, city, lat, lng, updatedAt (serverTimestamp)

  milestones/{pushId}/
    title, date ('YYYY-MM-DD'), endDate, note, tag, emoji
    addedBy (display name), location, locationDisplay, lat, lng
    photoURL, photoPath (Storage path for deletion), photoPosition, createdAt

  bucket/{pushId}/
    title, category, addedBy, done, completedAt, time

  letters/{pushId}/
    unlockDate ('YYYY-MM-DDTHH:MM:00'), createdAt
    {uid}/    content, writtenAt, unlockDate, readAt

  memoryJar/{dateKey ('YYYY-MM-DD')}/{uid}/    text, createdAt

  activeMystery    uid of current mystery planner (cleared on reveal/cancel/done)

  datePlan/{dateKey}/
    mode             'open' | 'mystery'
    plannerId        uid of mystery date creator (write-once)
    where, what, who plan details (open dates, or after mystery reveal)
    revealed         boolean (mystery dates only) — false until planner reveals
    time             optional HH:MM — if absent, letters unlock at 00:00
    hints/{pushId}/
      text, authorUid, createdAt, correct (boolean — planner marks guess correct)
      guess/   text, authorUid, createdAt

  pulses/{pushId}/    from, to, fromName, time (ms)

  statusHistory/{pushId}/    uid, activity, mood, savedAt (ms)
    (append-only log — each status save pushes a new node; never overwritten
     or deleted. Powers real status-update counts on the Snugshot tab.)

  dailyInsight/{dateKey}/{range ('week'|'month')}/    text, rule, generatedAt
    (one entry per local calendar day PER range; first partner to open
     Snugshot generates+writes, second reads. Week and month cache independently.)

  tonightsMood/{dateKey}/{uid}/
    mood        'cosy' | 'romantic' | 'adventurous' | 'netflix' | 'productive' | 'chaotic' | 'talky' | 'celebratory' | 'hungry'
    chosenAt    number (ms)

meta/
  userCount         integer — Phase 1 rollout cap (max 30). Incremented via transaction in doOnboarding; rule enforces <= 30.

invites/{code}/    coupleId, createdBy, createdAt, expiresAt (48h), used
```

---

## Navigation Structure

### Bottom nav (4 tabs)
- **Home** — main daily view with Now / Us / Summary sub-tabs
- **Memories** — Milestones / Places / Memory Jar
- **Ours** — Bucket List / Letters (page ID: `page-together`, `showPage('together')` unchanged)
- **Account** — Profile / Notifications

### Home sub-tabs
- **Now** — Pulse, Right Now (LDR clocks/weather/distance), Status, metric chips
- **Us** — Countdown, Your letters (current upcoming letter pair only), Memory Jar preview, Bucket progress
- **Snugshot** — Insight card + grouped week/month stats: memory jar, longest streak, pulses, status updates, Tonight's Mood match rate (Together only). Panel ID stays `panel-summary`; `switchHomeTab('summary')` unchanged — display label only.

---

## Two Modes
Snug has two modes toggled per couple. `applyMode(type)` handles all UI switching. Mode is stored as `coupleType` on the couple node and live-synced via `startCoupleTypeListener()`.

**LDR mode** (`coupleType === 'ldr'`): shows `ldr-section-wrap` (clocks, distance, weather, sleep); hides `dn-planner`, `tonights-mood-card`. Countdown label "Next meetup". Letters unlock at midnight on meetup date.

**Together mode** (`coupleType === 'together'`): shows `dn-planner`, `tonights-mood-card`; hides `ldr-section-wrap`. Countdown label "Next date night". Letters unlock at `_dnTimeVal` (default `19:00`). Metric chip "Date night". Summary tab shows Tonight's Mood match rate.

**Mode display labels:** "Long distance" and "Together" (display only — `coupleType` data values remain `'ldr'` and `'together'`)

---

## Critical Layout Rules — DO NOT CHANGE
These were hard-won fixes. Reverting any of them breaks scroll on Android/iOS.

```css
/* Every level must be bounded for overflow-y:auto to scroll correctly */
.main                { overflow: hidden; }   /* THE KEY FIX — without this panels grow unbounded */
.page.active         { overflow: hidden; }

/* Panels must be display:block — display:flex breaks Android Chrome scroll */
/* flex:1 1 0 makes it a bounded flex ITEM; display:block makes it scroll correctly internally */
.home-tab-panel.active  { display: block; flex: 1 1 0; min-height: 0; overflow-y: auto; }
.page-tab-panel.active  { display: block; flex: 1 1 0; min-height: 0; overflow-y: auto; }

/* Kill Android tap blue flash */
* { -webkit-tap-highlight-color: transparent; }

/* iOS viewport height fix — set via JS in <head> before CSS */
/* window.innerHeight -> --app-height CSS variable */
/* Never use 100vh directly — unreliable on iOS Safari */
```

The full scroll chain that works:
```
body (height: var(--app-height) px, overflow: hidden, flex col)
  .main (flex:1, min-height:0, overflow:hidden)
    .page.active (flex:1, min-height:0, overflow:hidden, flex col)
      home-top-strip / shell-page-header + page-tabs (flex-shrink:0)
      panel (display:block, flex:1 1 0, min-height:0, overflow-y:auto) <- scrolls here
```

The `--app-height` IIFE in `<head>` of `src/index.html` must stay inline — it runs synchronously before first CSS paint. Do not move it to a module.

**Known scroll root cause fixed — do not revert:** `.home-cd-card` had a stale `display:flex;flex-direction:column;justify-content:space-between` declaration causing layout unpredictability on narrow viewports. Removed — card now uses default block layout.

**Scrollbar placement rule:** The scrollbar for `overflow-y:auto` always renders at the right edge of the element that has `overflow-y` set. If horizontal padding lives on a PARENT of the scrolling panel, the panel is narrower than the viewport and the scrollbar appears inset from the screen edge, overlapping content. Always put horizontal padding directly on the scrolling panel itself, not on its parent.

---

## Design System
**Font:** Plus Jakarta Sans (Google Fonts). **Primary:** `--k: #c8553a` (coral), `--kl: #e07a5f`, `--kll: #fdf0ec`. **Pink:** `--pk: #d4607a`, `--pll: #fce8f0`. **Neutral:** `--bg: #faf6f2`, `--surface: #fff`, `--text: #1e120a`, `--muted: #9a6752`, `--border: rgba(200,85,58,0.11)`. See `src/styles/main.css` for full tokens, card radii, button styles, tab bars, bottom sheets, and metric chip details.

---

## Weather API
`api/weather.js` (ES module default export) proxies wttr.in. Localhost calls open-meteo directly; production uses `/api/weather?lat=&lng=`. **Do NOT revert to CommonJS** — Vercel requires ES module default export.

**Known issue:** `manifest.json` returns 401 from service worker fetch (symlink not followed by Vercel). Deferred — no functional impact.

---

## Environment Variables
All Firebase config reads from `import.meta.env.VITE_*` via `src/js/firebase-config.js`. Values in `.env.local` (gitignored) and Vercel dashboard.

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_VAPID_KEY       ← web push VAPID public key (client-safe)
FIREBASE_SERVICE_ACCOUNT      ← full service account JSON stringified (server only, never expose)
FIREBASE_DATABASE_URL         ← RTDB URL for server-side (api/notify.js reads this)
```

---

## Service Worker
- File: `sw.js` in repo root (symlinked into `public/` for Vite)
- **Bump `CACHE_VERSION` string on every production deploy** — forces mobile PWA clients to update
- Current pattern: `ylc-v{number}` (e.g. `ylc-v112`)
- Current version: `ylc-v131` (PR 6 — Harden api/notify.js with Firebase ID token verification)
- `skipWaiting()` and `clients.claim()` present — SW activates immediately without tab reload

---

## Global State Variables
All held in `state` from `src/js/state.js`. Reset to null/default on sign-out.

```js
// Identity
ME, OTHER, myUid, partnerUid, coupleId, myRole
coupleType                    // 'ldr' | 'together' — default 'ldr'

// Dates
meetupDate, coupleStartDate, _dnTimeVal  // Date|null, 'YYYY-MM-DD', '19:00' default

// Location
myTz, otherTz, myCity, otherCity, myCoords, otherCoords

// Avatars, Status
myAvatarUrl, otherAvatarUrl, myStatus, otherStatus, statusRefreshInterval

// Memory jar
_mjMyEntry, _mjOtherEntry, _mjStreakCount, _mjUnsub

// Guards
_tmInFlight, _selfDeleting

// Caches
localMilestones, localBucket

// Intervals and listeners
clockInterval, distanceInterval, countdownInterval, pulseTimeInterval
unsubMilestones, unsubBucket, unsubPulse
_membersUnsub, _watchPartnerUnsub, _coupleTypeUnsub
```

**Module-level state outside `state`:** `summary.js` has `_currentRange`, `_requestSeq` (reset via `R.resetSummary()`). `memoryjar.js` has `_mjExpandedMonths` Set (reset via `R._mjResetExpandedMonths()`). Both reset on all three sign-out paths in `auth.js`.

---

## Info Icon System

All info icons use a single CSS class `info-btn` with no modifiers. Size and colour are controlled via targeted ancestor selectors only.

### CSS rules (src/styles/main.css)
```css
/* Base — next to small uppercase section headings (0.5rem) and settings labels */
.info-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 9px; height: 9px; border-radius: 50%;
  border: 1px solid var(--k); color: var(--k);
  font-size: 6px; font-weight: 700; font-style: normal;
  font-family: inherit; line-height: 1;
  background: none; padding: 0; cursor: pointer; flex-shrink: 0;
}

/* Next to 1.25rem bold shell page titles (Memories, Ours) */
.shell-page-header-row .info-btn {
  width: 13px; height: 13px; font-size: 8px; border-width: 1.2px; margin-top: 3px;
}

/* Snugshot insight card — white on coral background */
.snugshot-insight-card-header .info-btn {
  width: 8px; height: 8px; font-size: 5px; border-width: 1px;
  border-color: rgba(255,255,255,0.6); color: rgba(255,255,255,0.9);
}
```

### Placement rules
- **Context A — Section headings** (`.section-heading`): button is a direct flex child of the `<p>`. Text wrapped in `<span>`. The heading must have `style="justify-content:flex-start"` inline to prevent the icon being pushed right by the default `space-between`. Gap comes from the `gap:5px` already on `.section-heading`.
- **Context B — Shell page titles** (`.shell-page-title`): button is a sibling of the `<h2>` inside `.shell-page-header-row`, which is `display:flex; align-items:center; justify-content:flex-start; gap:8px`.
- **Context C — Snugshot insight card**: button is a sibling of `.snugshot-insight-label` inside `.snugshot-insight-card-header`, which is `display:flex; align-items:center; justify-content:flex-start; gap:6px`. The label must have `display:inline-flex; align-items:center; line-height:1` and no `margin-bottom` to avoid asymmetric box alignment.
- **Context D — Settings/onboarding labels**: button is a direct flex child of the label element. Parent must have `display:flex; align-items:center; gap:5px` as an inline style.

### Key alignment lessons
- Never use `vertical-align` or `position:relative/top` to align icons — use flex on the parent.
- `margin-bottom` on a flex child creates an asymmetric margin box — `align-items:center` centres the full box including the invisible margin, pushing visible text off-centre. Always remove `margin-bottom` from flex children that need optical centering.
- `<p>` elements need `line-height:1` to eliminate descender space that offsets icon alignment.
- Raw text nodes inside flex containers do not participate in `gap` — always wrap text in `<span>` so both text and icon are proper flex children.
- `justify-content:space-between` on a flex parent pushes a lone second child to the far right — override with `flex-start` on any heading that has only text + icon (no "See all" button).

### Tooltip JS (src/js/tooltips.js)
- `TOOLTIPS` map: `{ id: { title, text } }` — no icons in the sheet
- `showTooltip(id)`: sets `#tooltip-sheet .tt-title` and `#tooltip-body`, opens `#tooltip-overlay`
- `closeTooltip()`: removes open class
- Countdown button injected at DOM ready: reads `state.coupleType`, sets correct tooltip ID, also sets `label.style.justifyContent = 'flex-start'` and `label.style.alignItems = 'center'`
- Swipe-to-dismiss via `R._initSheetSwipe`

---

## Key JS Functions

| Function | What it does |
|---|---|
| `tryInitFirebase()` | Dynamic ESM Firebase SDK import, wires `fbAuth`, starts auth listener |
| `onAuthStateChanged` cb | Central auth router — login/onboarding/linking/app |
| `loadCoupleAndStart(...)` | Populates state from members, triggers `detectAndStart()` |
| `detectAndStart()` | GPS → tz/city → `_pushPresence` → `startUI()` |
| `startUI()` | Populates static UI, starts listeners + intervals |
| `applyMode(type)` | Switches LDR ↔ Together UI |
| `showPage(page)` | Standalone page navigation |
| `switchHomeTab(tab)` | Now/Us/Summary switch, resets scroll; unknowns fall back to `'now'` |
| `sendPulse()` | 60s-cooldown rate-limited push |
| `initTonightsMood()` | Mood listener, pick/waiting/reveal, sheet wiring |
| `renderSummary(range)` | One-shot Snugshot reads, race-guarded |
| `_teardownSessionState()` | Centralised teardown — listeners, intervals, state reset. Called on auth logout and partner-delete |
| `doDeleteAccount()` | Path 1 offboarding |
| `doLinkingDeleteAccount()` | Path 2 offboarding (from linking screen) |

---

## Onboarding Flow
**Owner:** login → signup → verify email → onboarding (name + avatar) → linking → create couple → invite screen → wait for partner

**Joiner:** receives `/?join=CODE` URL → signup → verify email → onboarding → linking (code pre-filled) → joins couple → app loads

**iOS PWA warning:** Must complete full signup in Safari browser BEFORE installing to home screen. Home screen install creates isolated localStorage — `pendingJoinCode` is lost.

---

## Offboarding Flow
Two paths — both: validate `'DELETE'`, reauthenticate, `_selfDeleting=true`, delete avatar + milestone photos + invite doc, wipe couple node, clear own user record, delete Auth account. Partner notified via `_membersUnsub` listener. Session-end cleanup is centralised in `_teardownSessionState()` in `auth.js`, called from `onAuthStateChanged(null)` for sign-out and from partner-deleted paths directly.

---

## Known Bugs Fixed — Do Not Revert
- **Android scroll:** `.main` must have `overflow:hidden`
- **Panel scroll:** panels must be `display:block` not `display:flex`
- **iOS viewport:** `--app-height` from `window.innerHeight` in `<head>` IIFE — never `100vh`
- **Tap highlight:** `-webkit-tap-highlight-color:transparent` on `*`
- **Africa bug:** GPS `[0,0]` check prevents bad presence push
- **iOS PWA login:** complete signup in browser before installing to home screen
- **Stale appId:** env var version (`db66ccb1ddcc0278d9fb84`) is correct
- **iOS double notification:** `api/notify.js` skips legacy `fcmToken` if already in `fcmTokens` map
- **Countdown card overlap:** removed stale flex from `.home-cd-card`
- **Scrollbar overlap:** horizontal padding moved from `#page-home` to `.home-tab-panel.active` directly — matches `.page-tab-panel.active` pattern. Also added to `.home-top-strip` and `.home-tabs`.
- **iOS double notification (background):** removed top-level `notification` field from FCM payload — data-only message, `onBackgroundMessage` controls display

---

## XSS Protection
- All user content rendered via `_esc(str)` — escapes `& < > " '`
- Partner letter content set via `el.textContent` (not innerHTML)
- Milestone photo URLs stored in `_msRegistry` Map keyed by Firebase pushId

---

## Firebase Security Rules

Full rules live in `database.rules.json` and `storage.rules`. Deploy via `npx firebase-tools deploy --only database,storage`.

### Rules summary
- **All write rules require `auth.token.email_verified === true`.**
- `users/$uid`: read/write own data only. `avatarUrl` any-auth readable.
- `couples/$coupleId`: members-only read/write. `!data.exists()` allows owner to create.
- `activeMystery`: only settable to own uid, only clearable by lock holder. Blocks non-planner meetupDate changes.
- `datePlan/$dateKey`: non-planner blocked when mystery active and unrevealed.
- `hints/$pushId`: planner-only on creation. Guess: non-planner only, immutable. Correct: planner only.
- `statusHistory/$pushId`: append-only, immutable. Validates shape + own-uid + numeric `savedAt`.
- `dailyInsight/$dateKey`: any member writes; first writer per range wins.
- `tonightsMood/$dateKey/$uid`: validated shape — 9 mood keys, numeric `chosenAt`, no extras.
- `invites/$code`: any-auth read. Write by creator or couple member.
- Storage `avatars/{uid}.jpg`: own write/delete, max 2MB, image type.
- Storage `milestones/{coupleId}/{milestoneKey}/{filename}`: 5MB cap, image/(jpeg|png|webp). Legacy path `milestones/{milestoneKey}/{filename}` kept for existing photos. RTDB `.validate` enforces coupleId prefix on new writes.

---

## Deploying Firebase Rules

Rules version-controlled: `database.rules.json`, `storage.rules`, `firebase.json` + `.firebaserc`.

```
npx firebase-tools deploy --only database,storage    # both
npx firebase-tools deploy --only database            # RTDB only
npx firebase-tools deploy --only storage             # Storage only
```

First deploy from new machine: `npx firebase-tools login`. Console edits overwritten on next deploy.

---

## Push Notifications

**Triggers:** pulse · memoryJar · status (only if changed) · milestone · bucket (awaits confirmed write) · meetup (LDR) · dateNight (Together) · dnHint · dnGuess · dnReveal · dnCorrect · moodPick · moodMatch. Title = partner name, body trigger-specific.

**Deep linking:** pulse/status → Now, milestone → Milestones, bucket → Bucket, memoryJar → Memory Jar, meetup/dateNight → Us, moodPick/moodMatch → Now. Works live (postMessage) and cold-start (sessionStorage + URL params).

**Tokens:** map at `users/{uid}/fcmTokens/{tokenHash}` (multi-device). Legacy `fcmToken` string still read; skipped if already in map.

**Prefs:** per-trigger toggles at `notificationPrefs/`. `moodPick`/`moodMatch` share `tonightsMood` toggle via `PREF_ALIAS`. Defaults: all ON.

**Server auth:** `api/notify.js` requires `Authorization: Bearer <ID token>`, verifies via firebase-admin, checks `email_verified`, validates couple membership. 401/403 on failure.

**iOS limits:** Web Push iOS 16.4+ PWA only. `pushSupported()` bails unless standalone. Android monochrome icon deferred.

---

## Features Shipped

### Core (Sessions 1-4)
- Vite project structure, ES module split, `state.js` + `registry.js` architecture
- FCM push notifications (HTTP v1, JWT auth, full trigger set, deep linking, per-trigger prefs)
- Mystery date picker (open/mystery modes, hint system, `activeMystery` lock, reveal flow)
- Tonight's Mood (9 moods, `runTransaction`, match/mismatch matrix, day rollover, teardown)
- Snugshot tab (insight card, week/month stats, race-guarded `renderSummary`, daily insight cache)
- Us-tab letter shortcut (current letter pair, Written/Unlocked states)
- Real status counts via append-only `statusHistory` log
- Contextual tooltips (13 info icons, shared bottom sheet, `tooltips.js`)
- Empty state copy improvements (milestones, bucket, memory jar, letters, places)
- Global pronoun rule: always partner name, never they/their/them

### Phase 1 Security (Apr 2026): PRs 1-4, 6
- 30-user hard cap (`meta/userCount`, waitlist screen)
- Email verification (rules-enforced, verify screen, resend with rate-limit handling)
- Password policy (min 8 + uppercase + numeric)
- Storage rules tightened (MIME, size caps, coupleId-prefixed milestone paths)
- `api/notify.js` hardened with Firebase ID token verification + couple membership check

### Phase 2 — Test Rollout (next)
Roll out to ~10 couples. Watch: 7-day retention, MJ streak, notification open rate, Tonight's Mood completion, mystery date creation.

### Session 5 — Domain + Branding (upcoming)
Register domain, connect to Vercel, update manifest/meta/invite links, Firebase authorised domains. Fix Android monochrome notification icon.
