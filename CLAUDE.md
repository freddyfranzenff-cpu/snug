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

## File Structure (post Session 1b refactor)
```
snug/
  src/
    index.html              ← HTML shell (1175 lines); inline <head> IIFE kept for --app-height
    styles/
      main.css              ← All CSS (1077 lines)
    js/
      main.js               ← Thin entry point (51 lines) — imports all modules, bootstraps R.tryInitFirebase()
      state.js              ← Single mutable `state` object holding all former top-level globals
      registry.js           ← Mutable `R` namespace — modules attach functions at load, call sites use R.X()
      firebase-config.js    ← Firebase init, reads from import.meta.env.VITE_*
      app-height.js         ← --app-height CSS var updater
      sw-register.js        ← Service worker registration
      auth.js               ← onAuthStateChanged, login, signup, onboarding
      couple.js             ← couple creation, joining, linking, offboarding
      ui.js                 ← applyMode, startUI, showPage, switchHomeTab, _pageSubContent
      notes.js              ← submitNote, deleteNote, reactToNote, renderNotes
      milestones.js         ← milestone CRUD, places map, initMap, updateOtherMarker
      bucket.js             ← bucket list CRUD
      letters.js            ← letter system, unlock logic
      memoryjar.js          ← memory jar, streak calculation
      pulse.js              ← sendPulse, initPulse, updateReceivedBanner
      status.js             ← status card, status sheet (drag-to-dismiss via shared _initSheetSwipe)
      weather.js            ← fetchWeather, wIcon, wDesc
      presence.js           ← GPS, timezone, city detection, _pushPresence
      countdown.js          ← startCountdown, updateMetricChips
      settings.js           ← name, email, password, avatar, mode, start date
      togethermode.js       ← Together mode specific UI and sheets
      places.js             ← Places map page
      avatar.js             ← Avatar upload and display
      notifications.js      ← FCM token registration, notifyPartner(), deep-link routing, notification prefs UI
  firebase-messaging-sw.js  ← FCM background message handler (repo root, symlinked into public/)
  public/
    icons/                  ← Symlink → ../icons/
    manifest.json           ← Symlink → ../manifest.json (401 on Vercel — known issue, deferred)
    sw.js                   ← Symlink → ../sw.js
  api/
    weather.js              ← Vercel serverless — proxies wttr.in (ES module default export)
    notify.js               ← Vercel serverless — FCM HTTP v1 push sender, JWT service account auth
  sw.js                     ← Service worker (repo root)
  manifest.json             ← PWA manifest (repo root)
  vite.config.js            ← Vite config (root=src, publicDir=public, outDir=dist)
  vercel.json               ← framework=vite, outputDirectory=dist
  eslint.config.js          ← ESLint flat config for vanilla JS
  package.json              ← Vite + ESLint devDependencies
  .env.local                ← Firebase env vars (gitignored — never commit)
  CLAUDE.md                 ← This file
```

### Module architecture
- `state.js` exports a single mutable `state` object — sidesteps ES module `let`-binding reassignment limits
- `registry.js` exports a mutable `R` namespace — modules attach functions at load time, cross-module call sites use `R.X()` to avoid circular import evaluation-order problems
- `window.*` handlers preserved in their original modules — inline `onclick=` attributes in `index.html` keep working unchanged
- All 105 R.* registrations verified present; 68 inline onclick handlers audited — all clean

---

## Firebase Data Structure
```
users/{uid}/
  name, email, city, avatarUrl, coupleId, role, inviteCode, createdAt
  fcmTokens/{tokenHash}   token string (map — supports multiple devices)
  notificationPrefs/      per-trigger booleans (default: all true if absent)

couples/{coupleId}/
  owner            UID of creator
  coupleType       'ldr' | 'together'
  startDate        'YYYY-MM-DD'
  meetupDate       'YYYY-MM-DDTHH:MM:00' (time included for Together mode)
  inviteCode       stored here AND on users/{uid}/inviteCode for cleanup
  createdAt

  members/{uid}/
    name, city, role ('owner'|'joiner')

  presence/{uid}/
    timezone, city, lat, lng, updatedAt (serverTimestamp)

  notes/{pushId}/
    text, author (display name), time (ms), reactions/{uid}: true

  milestones/{pushId}/
    title, date ('YYYY-MM-DD'), endDate, note, tag, emoji
    addedBy (display name), location, locationDisplay, lat, lng
    photoURL, photoPath (Storage path for deletion), photoPosition
    createdAt

  bucket/{pushId}/
    title, category, addedBy (display name), done, completedAt, time

  letters/{pushId}/
    unlockDate ('YYYY-MM-DDTHH:MM:00'), createdAt
    {uid}/
      content, writtenAt, unlockDate, readAt

  memoryJar/{dateKey ('YYYY-MM-DD')}/{uid}/
    text, createdAt

  datePlan/{dateKey}/
    mode             'open' | 'mystery'
    plannerId        uid of mystery date creator
    where, what, who plan details (open dates, or after mystery reveal)
    revealed         boolean (mystery dates only) — false until planner reveals
    time             optional HH:MM string — if absent, letters unlock at 23:59
    hints/{pushId}/
      text, authorUid, createdAt
      guess/
        text, authorUid, createdAt

  todayPlan/{uid}/
    text, updatedAt

  pulses/{pushId}/
    from (uid), to (uid), fromName, time (ms)

invites/{code}/
  coupleId, createdBy (uid), createdAt, expiresAt (48h), used (bool)
```

---

## Two Modes
Snug has two modes toggled per couple. `applyMode(type)` handles all UI switching. Mode is stored as `coupleType` on the couple node and live-synced via `startCoupleTypeListener()`.

**LDR mode** (`coupleType === 'ldr'`):
- Shows: `ldr-section-wrap` (live clocks, distance km, weather, sleep indicators)
- Hides: `todays-plan`, `dn-planner` (Today's plan + Date night planner)
- Countdown label: "Next meetup"
- Letters unlock at midnight on meetup date

**Together mode** (`coupleType === 'together'`):
- Shows: `todays-plan`, `dn-planner`
- Hides: `ldr-section-wrap`
- Countdown label: "Next date night"
- Letters unlock at the date night time (`_dnTimeVal`, default `19:00`)
- Metric chip: "Date night" instead of "Next meetup"

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

---

## Weather API
- File: `api/weather.js` (ES module, default export — required by Vercel)
- Proxies wttr.in: `https://wttr.in/{lat},{lng}?format=j1`
- Returns normalised shape matching open-meteo so app code is unchanged
- Localhost: app calls open-meteo directly (detected via `location.hostname === 'localhost'`)
- Production: app calls `/api/weather?lat=&lng=` Vercel serverless proxy
- Uses native `fetch` + `AbortSignal.timeout(8000)` — no `require('https')`
- **Do NOT revert to CommonJS `require`/`module.exports`** — Vercel requires ES module default export

### Known issue
- `manifest.json` returns 401 from service worker fetch — caused by symlink in `public/` not being followed correctly by Vercel. Deferred to Session 1b. No functional impact on the app.

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
- Current pattern: `ylc-v{number}` (e.g. `ylc-v104`)
- Current version: `ylc-v104` (bumped in Session 2)
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

// Deletion guard
_selfDeleting                 // boolean — true while this user is deleting

// Local caches
localNotes, localMilestones, localBucket  // arrays, live-synced from Firebase

// Intervals and listeners
clockInterval, distanceInterval, countdownInterval, pulseTimeInterval
unsubNotes, unsubMilestones, unsubBucket, unsubPulse
_membersUnsub, _watchPartnerUnsub, _coupleTypeUnsub
```

---

## Key JS Functions

| Function | What it does |
|---|---|
| `tryInitFirebase()` | Dynamic ESM import of Firebase SDK 10.12.0, sets up `fbAuth` wrapper, starts `onAuthStateChanged` |
| `onAuthStateChanged` callback | Central auth router — shows login/onboarding/linking/app based on user + couple state |
| `loadCoupleAndStart(cId, myUid, partnerUid, members)` | Sets all global state from members snapshot, calls `detectAndStart()` |
| `detectAndStart()` | GPS → `tzFromCoords` + `cityFromCoords` → sets myTz/myCity/myCoords → `_pushPresence` → `startUI()` |
| `startUI()` | Shows main, populates all static UI, starts all real-time listeners and intervals |
| `startCoupleTypeListener()` | Real-time listener on `couples/{id}/coupleType` — calls `applyMode()` on change |
| `applyMode(type)` | Switches ALL UI between LDR and Together — visibility, labels, mode pill, settings toggle |
| `watchForPartner(cId, uid)` | Polls `couples/{id}/members` — redirects to app when partner joins |
| `showPage(page)` | Navigates to full standalone page (milestones, notes, bucket, places, letter) |
| `switchHomeTab(tab)` | Switches Now/Us/Story panels, resets scroll to top |
| `updateDistanceAndSleep()` | Haversine distance from coords + sleep status from timezone hour |
| `updateMetricChips()` | Updates 3 bottom chips: meetup countdown, milestone count, streak |
| `startCountdown()` | Starts 1s interval for countdown card + metric chip |
| `initPulse()` | Firebase listener on `pulses` node, renders received banner + history |
| `sendPulse()` | Rate-limited (60s cooldown) — pushes `{from, to, fromName, time}` to pulses |
| `doDeleteAccount()` | Path 1 deletion — reauthenticates, wipes couple node, deletes auth account |
| `doLinkingDeleteAccount()` | Path 2 deletion — same steps as Path 1, accessible from linking screen |

---

## Onboarding Flow
**Owner:** login → signup → onboarding (name + avatar) → linking → create couple → invite screen → wait for partner

**Joiner:** receives `/?join=CODE` URL → signup → onboarding → linking (code pre-filled) → joins couple → app loads

**iOS PWA warning:** Must complete full signup in Safari browser BEFORE installing to home screen. Home screen install creates isolated localStorage — `pendingJoinCode` is lost.

---

## Offboarding Flow
Two paths — both run identical 12-step deletion sequence:
1. Validate input === 'DELETE', reauthenticate
2. Set `_selfDeleting = true`
3. Read milestone photo paths + invite code
4. Delete own avatar from Storage
5. Delete all milestone photos (parallel)
6. Delete invite document
7. **Wipe entire couple node** (sets `couples/{coupleId}` to null)
8. Clear coupleId + inviteCode on own user record
9. Delete own RTDB user record
10. Delete Firebase Auth account

Remaining partner is notified via `_membersUnsub` listener which detects null members or permission denied.

---

## Known Bugs Fixed — Do Not Revert
- **Android scroll:** `.main` must have `overflow:hidden`
- **Android/iOS panel scroll:** panels must be `display:block` not `display:flex`
- **iOS viewport:** `--app-height` set from `window.innerHeight` in `<head>` IIFE — never use `100vh`
- **Tap highlight:** `-webkit-tap-highlight-color:transparent` on `*` kills blue flash on Android
- **Africa bug:** GPS coords `[0,0]` check prevents bad presence push
- **iOS PWA login:** Complete signup in browser before installing to home screen
- **AppId:** Old hardcoded appId in index.html was stale — env var version (`db66ccb1ddcc0278d9fb84`) is correct

---

## XSS Protection
- All user content rendered via `_esc(str)` — escapes `& < > " '`
- Partner letter content set via `el.textContent` (not innerHTML)
- Milestone photo URLs stored in `_msRegistry` Map keyed by Firebase pushId

---

## Firebase Security Rules Summary
- `users/$uid`: read/write own data only. `avatarUrl` any-auth readable (partner avatar display).
- `couples/$coupleId`: members-only read/write. Bootstrap escape: `!data.exists()` allows owner to create couple node.
- `invites/$code`: any-auth read. Write only by creator or couple member.
- Storage `avatars/{uid}.jpg`: any-auth read, own write/delete, max 2MB, image type only.
- Storage `milestones/`: any-auth read/write. **Known gap — TODO: scope to couple members.**

---

## Session Roadmap

### ✅ Session 1 — Infrastructure (complete)
Split `index.html` into Vite project structure. CSS → `src/styles/`. JS → `src/js/`. Firebase config → env vars. ESLint added. Deployed and verified on staging + main.

### ✅ Session 1b — JS Module Split (complete)
Split `src/js/main.js` (4522 lines, one big file) into feature modules. The globals (`myUid`, `coupleId`, `db`, etc.) need to be moved to a shared state module that other modules import from. Suggested structure:

```
src/js/
  main.js           ← entry point + bootstrap only
  state.js          ← all shared global variables (exported)
  auth.js           ← onAuthStateChanged, login, signup, onboarding
  couple.js         ← couple creation, joining, linking, offboarding
  ui.js             ← applyMode, startUI, showPage, switchHomeTab
  notes.js          ← submitNote, deleteNote, reactToNote, renderNotes
  milestones.js     ← milestone CRUD, places map
  bucket.js         ← bucket list CRUD
  letters.js        ← letter system, unlock logic
  memoryjar.js      ← memory jar, streak calculation
  pulse.js          ← sendPulse, initPulse, updateReceivedBanner
  status.js         ← status card, status sheet
  weather.js        ← fetchWeather, wIcon, wDesc
  presence.js       ← GPS, timezone, city detection, _pushPresence
  countdown.js      ← startCountdown, updateMetricChips
  settings.js       ← name, email, password, avatar, mode, start date
  firebase-config.js ← already exists
  app-height.js      ← already exists
  sw-register.js     ← already exists
```

> Prompt: "Read CLAUDE.md. Split src/js/main.js into feature modules as described in the Session 1b section. Create src/js/state.js to hold all shared globals as exported variables. Other modules import from state.js. Do not change any functionality — pure refactor only. Run vite build to confirm no errors before committing to staging."

### ✅ Session 2 — Push Notifications (complete)
FCM HTTP v1 via Vercel serverless (`api/notify.js`). JWT-signed service account auth. Tokens stored as map at `users/{uid}/fcmTokens/{tokenHash}` — supports multiple devices per user. Legacy single `fcmToken` string also read for backwards compatibility and cleared on next register.

**Triggers (all implemented):**
- Pulse sent
- Memory jar entry written
- Status updated (only fires if activity or mood actually changed)
- Note sent (awaits confirmed write before notifying)
- Milestone added
- Bucket list item added (awaits confirmed write before notifying)
- Meetup date set (LDR mode)
- Date night date set (Together mode)

**Notification content:** title uses partner's display name dynamically. Body text is trigger-specific.

**Deep linking:** tapping a notification opens the relevant section — pulse/status → Now tab, note → Notes, milestone → Milestones, bucket → Bucket list, memoryJar → Memory Jar, meetup/dateNight → Story tab. Works both live (postMessage) and cold-start (sessionStorage + URL params).

**Account page:** now has Profile and Notifications sub-tabs using existing page-tabs pattern. Notifications tab shows per-trigger on/off toggles stored at `users/{uid}/notificationPrefs/`. Toggles disabled until OS permission granted. Defaults: all triggers ON if notificationPrefs node absent.

**iOS:** Web Push only works on iOS 16.4+ with PWA installed to home screen. `pushSupported()` bails unless running in standalone mode.

**Known limitation:** notification icon shows as white square on Android status bar — needs proper monochrome icon asset (Session 3 / branding task). Chrome may flag staging URL as possible spam — resolves with custom domain.

### Phase 1 — Together Mode Polish (current)
Three features shipping before test rollout to 10 couples.

**1. Mystery Date Picker (Session 3a)**
Enhancement to date night planner. Planner chooses Open or Mystery mode when setting a date.
- Open date: both partners see full plan (where/what/who), both can edit — existing behaviour
- Mystery date: only planner sees full plan. Partner sees mystery card with date + time (if set).
- Hint system: max 3 hints, one active at a time, next hint only after partner guesses current one
- Hints and guesses: text only, immutable after submission, stored as Firebase push entries
- Reveal: planner taps Reveal → confirmation sheet → sets revealed:true → partner card updates
- Date Done: after reveal, button opens sheet to convert to milestone with hints/guesses as notes + photo
- Letter unlock rule: if time set → unlock at that time. If time not set → unlock at 23:59 (fallback)
- Picker redesign: modern bottom sheet (inspired by status update sheet) with Date, Time (optional), Mode fields
- Meetup date picker (LDR): Date only — do not change its logic

**2. Tonight's Mood (Session 3b)**
Daily Together mode ritual. Both partners independently pick a mood each evening.
Moods: playful, cosy, romantic, adventurous, just Netflix.
App only reveals what the other picked after both have chosen.
If match → celebration moment. If different → gentle compromise suggestion.
Stored at couples/{coupleId}/tonightsMood/{dateKey}/{uid}/: { mood, chosenAt }

**3. Contextual Tooltips + Empty State Copy (Session 3c)**
Small info icon on each feature — tapping shows 2-sentence explanation.
Empty state copy: meaningful placeholder text when sections have no content.
First-use walkthrough: one-time guided tour on first login.
Applies to both LDR and Together mode.

### Phase 2 — Test Rollout
Roll out to ~10 couples after Phase 1 is stable. Mix of LDR and Together couples.
Watch: 7-day retention, memory jar streak, notification open rate by trigger, Tonight's Mood completion, mystery date creation rate.

### Session 3 — Domain + Branding (after Phase 2)
Register domain (snug.app / getsnug.app / joinsnug.com). Connect to Vercel. Update manifest.json, meta tags, invite link generation, Firebase authorised domains.
