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
      couple.js             ← couple creation, joining, linking, offboarding
      ui.js                 ← applyMode, startUI, showPage, switchHomeTab
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
**Font:** Plus Jakarta Sans (Google Fonts)

**Colours:**
```
--k:       #c8553a   /* primary coral */
--kl:      #e07a5f   /* light coral */
--kll:     #fdf0ec   /* coral wash / active tab bg */
--pk:      #d4607a   /* pink accent */
--pll:     #fce8f0   /* pink wash */
--bg:      #faf6f2   /* warm cream background */
--surface: #ffffff
--text:    #1e120a
--muted:   #9a6752
--border:  rgba(200,85,58,0.11)
```

**Cards:** `border-radius: 12-16px`, `1px solid var(--border)`, no heavy box-shadows
**Auth cards:** `border-radius: 20px`, warm gradient top-line `::before` pseudo-element
**Buttons:** Primary = coral-to-pink gradient with subtle shadow. Secondary = white with warm border.
**Tab bars:** White surface, `border-radius: 14px`, `1px solid var(--border)`, active tab gets `--kll` background
**Bottom sheets:** `border-radius: 24px 24px 0 0`, swipe-to-dismiss via handle drag

**Metric chips:** three tiles at bottom of Now panel — ✈ Next Meetup · ✦ Milestones · 🔥 Streak. All use unicode glyphs with `font-size:.85rem; color:var(--k)`. Note: 🔥 is a color emoji and cannot honour `color:var(--k)` — it renders in system emoji colors. Accepted trade-off.

---

## Weather API
`api/weather.js` (ES module, default export — required by Vercel) proxies wttr.in `https://wttr.in/{lat},{lng}?format=j1` and returns normalised shape matching open-meteo so app code is unchanged. Localhost calls open-meteo directly (hostname check); production uses `/api/weather?lat=&lng=`. Native `fetch` + `AbortSignal.timeout(8000)`. **Do NOT revert to CommonJS** — Vercel requires ES module default export.

**Known issue:** `manifest.json` returns 401 from service worker fetch (symlink in `public/` not followed by Vercel). Deferred. No functional impact.

---

## Environment Variables
All Firebase config now reads from `import.meta.env.VITE_*` via `src/js/firebase-config.js`.
Values live in `.env.local` (gitignored) and in Vercel dashboard (Settings → Environment Variables).

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
- Current version: `ylc-v123` (Session 4 tooltips + empty state copy + polish pass)
- `skipWaiting()` and `clients.claim()` present — SW activates immediately without tab reload

---

## Global State Variables
All held in the `state` object exported from `src/js/state.js`. Access as `state.myUid`, `state.coupleId`, etc. All reset to null/default on sign-out via `onAuthStateChanged`.

```js
// Identity
ME, OTHER                     // display names (strings)
myUid, partnerUid             // Firebase Auth UIDs
coupleId                      // RTDB couple key (pushId)
myRole                        // 'owner' | 'joiner'
coupleType                    // 'ldr' | 'together' — default 'ldr'

// Dates
meetupDate                    // Date object | null
coupleStartDate               // 'YYYY-MM-DD' string
_dnTimeVal                    // '19:00' default — Together mode date night time

// Location
myTz, otherTz                 // IANA timezone strings | null
myCity, otherCity             // city strings (GPS-derived)
myCoords, otherCoords         // [lat, lng] arrays | null

// Avatars
myAvatarUrl, otherAvatarUrl   // Storage download URLs | null

// Status
myStatus, otherStatus         // status objects | null
statusRefreshInterval         // setInterval ID

// Memory jar
_mjMyEntry, _mjOtherEntry     // today's entry objects | null
_mjStreakCount                 // integer
_mjUnsub                      // Firebase unsub function

// Tonight's Mood
_tmInFlight                   // boolean — true while mood submission is in-flight

// Deletion guard
_selfDeleting                 // boolean — true while this user is deleting

// Local caches
localMilestones, localBucket  // arrays, live-synced from Firebase

// Intervals and listeners
clockInterval, distanceInterval, countdownInterval, pulseTimeInterval
unsubMilestones, unsubBucket, unsubPulse
_membersUnsub, _watchPartnerUnsub, _coupleTypeUnsub
```

**Note:** `summary.js` and `memoryjar.js` maintain additional module-level state not on `state`:
- `summary.js`: `_currentRange` (week/month), `_requestSeq` (race guard) — reset via `R.resetSummary()`
- `memoryjar.js`: `_mjExpandedMonths` Set (persists expanded state across tab visits) — reset via `R._mjResetExpandedMonths()`
- Both reset functions called on all three sign-out paths in `auth.js` (main sign-out, partner-deletion, permission-denied)

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
| `startCoupleTypeListener()` | Live `coupleType` listener → `applyMode()` |
| `applyMode(type)` | Switches LDR ↔ Together UI |
| `watchForPartner(...)` | Polls members, redirects when partner joins |
| `showPage(page)` | Standalone page navigation |
| `switchHomeTab(tab)` | Now/Us/Summary switch, resets scroll; unknowns fall back to `'now'` |
| `updateDistanceAndSleep()` | Haversine + tz-hour sleep status |
| `updateMetricChips()` | 3 chips at bottom of Now |
| `startCountdown()` | 1s interval for countdown + chip |
| `initPulse()` | Pulse listener + banner + history |
| `sendPulse()` | 60s-cooldown rate-limited push |
| `initTonightsMood()` | Mood listener, pick/waiting/reveal, sheet wiring |
| `teardownTonightsMood()` | Clears listener + day-roll + `_tmInFlight` |
| `renderSummary(range)` | One-shot Snugshot reads, race-guarded |
| `resetSummary()` | Resets `_currentRange`/`_requestSeq` on sign-out |
| `renderUsLetterShortcut()` | Renders current upcoming letter pair on Us tab |
| `resetUsLetterShortcut()` | Bumps seq, hides row, clears DOM on sign-out |
| `doDeleteAccount()` | Path 1 offboarding |
| `doLinkingDeleteAccount()` | Path 2 offboarding (from linking screen) |

---

## Onboarding Flow
**Owner:** login → signup → onboarding (name + avatar) → linking → create couple → invite screen → wait for partner

**Joiner:** receives `/?join=CODE` URL → signup → onboarding → linking (code pre-filled) → joins couple → app loads

**iOS PWA warning:** Must complete full signup in Safari browser BEFORE installing to home screen. Home screen install creates isolated localStorage — `pendingJoinCode` is lost.

---

## Offboarding Flow
Two paths — both run the same sequence. Validate input === `'DELETE'`, reauthenticate, set `_selfDeleting=true`. Read milestone photo paths + invite code, delete own avatar + all milestone photos (parallel), delete invite document. Wipe entire couple node (`couples/{coupleId}=null`), clear `coupleId`+`inviteCode` on own user record, delete own RTDB user record, delete Firebase Auth account. Remaining partner is notified via `_membersUnsub` listener (detects null members or permission denied).

---

## Known Bugs Fixed — Do Not Revert
- Android scroll: `.main` must have `overflow:hidden`
- Android/iOS panel scroll: panels must be `display:block` not `display:flex`
- iOS viewport: `--app-height` from `window.innerHeight` in `<head>` IIFE — never `100vh`
- Tap highlight: `-webkit-tap-highlight-color:transparent` on `*` kills Android blue flash
- Africa bug: GPS `[0,0]` check prevents bad presence push
- iOS PWA login: complete signup in browser before installing to home screen
- Stale hardcoded appId in index.html — env var version (`db66ccb1ddcc0278d9fb84`) is correct
- iOS double notification: `api/notify.js` skips legacy `fcmToken` string if already in `fcmTokens` map
- Countdown card overlap: removed stale flex from `.home-cd-card`; now default block layout
- Android/iOS scrollbar overlap: Home tab panels (Now/Us/Snugshot) had horizontal padding on `#page-home` instead of on the panels themselves. This caused panels to be 359.6px wide instead of 390px, placing the scrollbar 15.2px inside the screen edge and overlapping content. Fixed by removing padding from `#page-home` and adding `padding: .75rem .95rem calc(3.5rem + env(safe-area-inset-bottom, 0px))` directly to `.home-tab-panel.active` — matching the same pattern used by `.page-tab-panel.active`. Also added horizontal padding to `.home-top-strip` and `.home-tabs` directly.
- iOS double notification (background): FCM message payload contained both a top-level `notification` field and a `webpush.notification` field. On iOS PWAs, FCM auto-displayed the top-level notification AND `onBackgroundMessage` showed a second one. Tag-based collapsing is unreliable on older iOS WebKit versions so both appeared. Fixed by removing the top-level `notification` field from `buildMessage` in `api/notify.js` — making it a data-only message where only `onBackgroundMessage` controls display. Android was unaffected because it correctly collapses same-tag notifications.

---

## XSS Protection
- All user content rendered via `_esc(str)` — escapes `& < > " '`
- Partner letter content set via `el.textContent` (not innerHTML)
- Milestone photo URLs stored in `_msRegistry` Map keyed by Firebase pushId

---

## Firebase Security Rules

### RTDB Rules (current published version)
```json
{"rules":{"users":{"$uid":{".read":"auth != null && auth.uid === $uid",".write":"auth != null && auth.uid === $uid","avatarUrl":{".read":"auth != null"}}},"invites":{"$code":{".read":"auth != null",".write":"auth != null && (!data.exists() || data.child('createdBy').val() === auth.uid || (!newData.exists() && data.child('coupleId').val() != null && root.child('couples').child(data.child('coupleId').val()).child('members').child(auth.uid).exists()))","used":{".write":"auth != null && newData.isBoolean() && newData.val() === true"}}},"couples":{"$coupleId":{".read":"auth != null && root.child('couples').child($coupleId).child('members').child(auth.uid).exists()",".write":"auth != null && (!data.exists() || root.child('couples').child($coupleId).child('members').child(auth.uid).exists())","members":{"$memberUid":{".write":"auth != null && auth.uid === $memberUid"}},"presence":{"$memberUid":{".write":"auth != null && auth.uid === $memberUid"}},"activeMystery":{".write":"auth != null && root.child('couples').child($coupleId).child('members').child(auth.uid).exists() && ((newData.exists() && newData.val() === auth.uid) || (!newData.exists() && (!data.exists() || data.val() === auth.uid)))",".validate":"newData.isString() && root.child('couples').child($coupleId).child('members').child(newData.val()).exists()"},"meetupDate":{".validate":"!root.child('couples').child($coupleId).child('activeMystery').exists() || root.child('couples').child($coupleId).child('activeMystery').val() === auth.uid"},"datePlan":{"$dateKey":{".write":"auth != null && root.child('couples').child($coupleId).child('members').child(auth.uid).exists() && (!data.child('mode').exists() || data.child('mode').val() !== 'mystery' || data.child('revealed').val() === true || auth.uid === data.child('plannerId').val())","plannerId":{".validate":"!data.exists() || data.val() === newData.val()"},"hints":{".validate":"newData.hasChildren() || !newData.exists()","$pushId":{".write":"auth != null && root.child('couples').child($coupleId).child('members').child(auth.uid).exists() && (!root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('mode').exists() || root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('mode').val() !== 'mystery' || root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('revealed').val() === true || auth.uid === root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('plannerId').val())",".validate":"data.exists() || (newData.child('authorUid').val() === auth.uid && (auth.uid === root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('plannerId').val() || auth.uid === newData.parent().parent().child('plannerId').val()))","text":{".validate":"newData.isString() && newData.val().length < 500 && !data.exists()"},"guess":{".write":"auth != null && !data.exists() && root.child('couples').child($coupleId).child('members').child(auth.uid).exists() && auth.uid !== root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('plannerId').val()",".validate":"!data.exists() && newData.child('authorUid').val() === auth.uid && auth.uid !== root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('plannerId').val()","text":{".validate":"newData.isString() && newData.val().length < 500 && !data.exists()"}},"correct":{".write":"auth != null && auth.uid === root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('plannerId').val()"}}},"revealed":{".validate":"newData.isBoolean() && (auth.uid === root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('plannerId').val() || auth.uid === newData.parent().child('plannerId').val())"}}},"statusHistory":{"$pushId":{".write":"auth != null && root.child('couples').child($coupleId).child('members').child(auth.uid).exists() && (!data.exists() || data.child('uid').val() === auth.uid)",".validate":"newData.hasChildren(['uid','activity','mood','savedAt']) && newData.child('uid').val() === auth.uid && newData.child('savedAt').isNumber()"}},"dailyInsight":{"$dateKey":{".write":"auth != null && root.child('couples').child($coupleId).child('members').child(auth.uid).exists()"}},"tonightsMood":{"$dateKey":{"$uid":{".validate":"(auth.uid === $uid && newData.hasChildren(['mood','chosenAt'])) || (data.exists() && newData.child('mood').val() === data.child('mood').val() && newData.child('chosenAt').val() === data.child('chosenAt').val())","mood":{".validate":"newData.isString() && (newData.val() === 'cosy' || newData.val() === 'romantic' || newData.val() === 'adventurous' || newData.val() === 'netflix' || newData.val() === 'productive' || newData.val() === 'chaotic' || newData.val() === 'talky' || newData.val() === 'celebratory' || newData.val() === 'hungry')"},"chosenAt":{".validate":"newData.isNumber()"},"$other":{".validate":false}}}}}},"$other":{".read":false,".write":false}}}
```

### Storage Rules (current published version)
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /avatars/{filename} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && filename == request.auth.uid + '.jpg' && request.resource.size < 2 * 1024 * 1024 && request.resource.contentType.matches('image/.*');
      allow delete: if request.auth != null && filename == request.auth.uid + '.jpg';
    }
    match /milestones/{milestoneKey}/{filename} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.resource.size < 10 * 1024 * 1024 && request.resource.contentType.matches('image/.*');
      allow delete: if request.auth != null;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### Rules summary
- `users/$uid`: read/write own data only. `avatarUrl` any-auth readable (partner avatar display).
- `couples/$coupleId`: members-only read/write. Bootstrap escape: `!data.exists()` allows owner to create couple node.
- `activeMystery`: only settable to own uid, only clearable by current lock holder. Blocks non-planner meetupDate changes.
- `datePlan/$dateKey`: non-planner blocked from writing when mystery is active and unrevealed.
- `hints/$pushId`: planner-only write on creation. Guess: non-planner only, immutable. Correct: planner only.
- `statusHistory/$pushId`: append-only log. Any couple member can write a new entry; existing entries are immutable. Validate enforces shape + own-uid + numeric `savedAt`.
- `dailyInsight/$dateKey`: any couple member can write today's insight. Rules cascade to `week`/`month` sub-range buckets. No field validation — first writer per range wins by convention.
- `tonightsMood/$dateKey/$uid`: validated shape — `mood` must be one of the 9 valid keys, `chosenAt` numeric, no extras. Unchanged write-through of partner's existing entry permitted so `runTransaction` works.
- `invites/$code`: any-auth read. Write only by creator or couple member.
- Storage `avatars/{uid}.jpg`: any-auth read, own write/delete, max 2MB, image type only.
- Storage `milestones/`: any-auth read/write. **Known gap — TODO: scope to couple members.**

---

## Deploying Firebase Rules

Rules are version-controlled in the repo:
- **RTDB rules:** `database.rules.json`
- **Storage rules:** `storage.rules`
- **Firebase config:** `firebase.json` + `.firebaserc`

Deploy both:
```
npx firebase-tools deploy --only database,storage
```

Deploy one at a time:
```
npx firebase-tools deploy --only database
npx firebase-tools deploy --only storage
```

**Warning:** Before first deploy from a new machine, run `npx firebase-tools login`.

**Important:** Rules now live in the repo and must be deployed via CLI after any change. Console edits will be overwritten on next deploy.

---

## Push Notifications

### Triggers (all implemented)
Pulse sent · memory jar entry · status updated (only if changed) · milestone added · bucket item added (awaits confirmed write) · meetup date set (LDR) · date night set (Together) · dnHint · dnGuess · dnReveal · dnCorrect · moodPick · moodMatch.

Title = partner's display name. Body is trigger-specific.

### Deep linking
- pulse/status → Now tab
- milestone → Milestones page
- bucket → Bucket list page
- memoryJar → Memory Jar page
- meetup/dateNight → Us tab
- moodPick/moodMatch → Now tab

Works live (postMessage) and cold-start (sessionStorage + URL params). Unknown `?tab=` falls back to `'now'`.

### Token management
Map at `users/{uid}/fcmTokens/{tokenHash}` — multiple devices. Legacy single `fcmToken` string still read for back-compat. `api/notify.js` skips the legacy token if its value already exists in the map (iOS double-notification fix).

### Notification preferences
Per-trigger toggles at `users/{uid}/notificationPrefs/`. `moodPick` and `moodMatch` share one `tonightsMood` toggle via `PREF_ALIAS`. Defaults: all ON if node absent.

### iOS / Known limits
- Web Push iOS 16.4+, PWA installed only. `pushSupported()` bails unless standalone mode.
- Android status-bar notification icon renders as white square — needs monochrome asset. Deferred.

---

## Session Roadmap

### ✅ Session 1 — Infrastructure
Split `index.html` into Vite project. CSS → `src/styles/`, JS → `src/js/`. Firebase config → env vars. ESLint added. Deployed on staging + main.

### ✅ Session 1b — JS Module Split
Split `main.js` (4522 lines) into feature modules. Created `state.js` (shared globals) and `registry.js` (R namespace). All R.* and inline onclick handlers audited clean.

### ✅ Session 2 — Push Notifications
FCM HTTP v1 via Vercel serverless (`api/notify.js`), JWT service account auth. Full trigger set, deep linking, per-trigger prefs UI.

### ✅ Session 3a — Mystery Date Picker
Enhancement to date night planner: Open vs Mystery mode, hint system (max 3, one active), reveal flow, Date Done → milestone conversion, `activeMystery` lock. LDR meetup picker modernised. Global pronoun rule: always partner name, never they/their/them.

### ✅ Session 3b — Tonight's Mood
Daily Together ritual. 9 moods, bottom sheet, pick/waiting/reveal states. Match messages + 36-combo mismatch matrix. `runTransaction` for race-free picks. Day rollover via 60s interval. Full teardown on sign-out and mode switch. `.validate` rules enforce shape and own-uid scoping.

### ✅ Session 3c — Cleanup, Polish + Summary Tab
Removed Notes and Today's Plan. Renamed Story→Summary, "Together" nav→"Ours", "Living together"→"Together" (labels only). New `summary.js` with week/month toggle, one-shot reads, race guard via `_requestSeq`. Fixes: iOS double notification, countdown overlap, MJ collapse w/ persisted state, pulse clipping, greeting rebuild, status sheet additions, partner name footers.

### ✅ Session 3d — Snugshot redesign + Us-tab letter shortcut
Renamed Summary→Snugshot (display only). Coral-gradient insight card + grouped sections (Memory jar, Streak full-width 🔥, Pulses, Status updates, Tonight's mood Together-only). Milestones card removed. `renderUsLetterShortcut` shows one letter pair for current upcoming meetup under countdown (Written/Not written + Unlocked/Unlocks in Xd). Status sheet: Music→TV/Netflix, Sports→Sleeping, Resting→Chilling, calm→relaxed (legacy keys kept in `ACTIVITY_EMOJI`). Account polish: `settings-name-pill`, `settings-btn-subtle`. Memories nav icon → polaroid.

### ✅ Session 3e — Review fixes + real status counts + daily insight cache
`saveStatus` fires parallel `dbPush` to `statusHistory/{pushId}`, append-only, rules enforce same-uid + immutability. `_countStatusUpdates` reads `statusHistory` one-shot for real counts. Insight ladder uses dynamic `rangeLabel`; grammar guard `_subjectVerb` avoids "You has been". New rules 5a (status imbalance) and 5b (both active). Daily insight cache at `dailyInsight/{dateKey}/{week|month}` — first partner generates + writes, second reads. Letter shortcut hardened via `_letterShortcutSeq` and `R.resetUsLetterShortcut` called on all sign-out paths. Countdown uses `Math.floor`. Streak card shows `0d` not `—`.

### Phase 2 — Test Rollout (next)
Roll out to ~10 couples after pre-rollout audit and Session 4 (Contextual Tooltips). Mix of LDR and Together. Watch: 7-day retention, MJ streak, notification open rate by trigger, Tonight's Mood completion, mystery date creation.

### ✅ Session 4 — Contextual Tooltips + Empty State Copy
New `src/js/tooltips.js` module. Single shared bottom sheet (`#tooltip-overlay` / `#tooltip-sheet`). 13 `ⓘ` info icons across all features. `window.showTooltip(id)` / `window.closeTooltip()` globals. Countdown icon injected dynamically by `tooltips.js` reading `state.coupleType`. Improved empty state copy on 5 screens (milestones, bucket, memory jar, letters, places). Polish pass: pulse history inner box layout, Us tab letter shortcut labels and routing, Snugshot status card row layout, Memory jar icon removed from Us tab.

### Session 5 — Domain + Branding
Register domain (snug.app / getsnug.app / joinsnug.com), connect to Vercel, update `manifest.json`, meta tags, invite link generation, Firebase authorised domains. Fix Android monochrome notification icon.
