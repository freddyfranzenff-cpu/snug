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
    index.html              ← HTML shell; inline <head> IIFE kept for --app-height
    styles/
      main.css              ← All CSS
    js/
      main.js               ← Thin entry point — imports all modules, bootstraps R.tryInitFirebase()
      state.js              ← Single mutable `state` object holding all former top-level globals
      registry.js           ← Mutable `R` namespace — modules attach functions at load, call sites use R.X()
      firebase-config.js    ← Firebase init, reads from import.meta.env.VITE_*
      app-height.js         ← --app-height CSS var updater
      sw-register.js        ← Service worker registration
      auth.js               ← onAuthStateChanged, login, signup, onboarding
      couple.js             ← couple creation, joining, linking, offboarding
      ui.js                 ← applyMode, startUI, showPage, switchHomeTab, _pageSubContent
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
      tonightsmood.js       ← Tonight's Mood — pick/waiting/reveal states, bottom sheet, day rollover
      summary.js            ← Home → Summary tab: week/month stats (memory jar, pulses, milestones, streak, mood match)
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
- All R.* registrations verified present; all inline onclick handlers audited — all clean

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

  activeMystery    uid of current mystery planner (set when mystery created, cleared on reveal/cancel/done)

  datePlan/{dateKey}/
    mode             'open' | 'mystery'
    plannerId        uid of mystery date creator (write-once)
    where, what, who plan details (open dates, or after mystery reveal)
    revealed         boolean (mystery dates only) — false until planner reveals
    time             optional HH:MM string — if absent, letters unlock at 23:59
    hints/{pushId}/
      text, authorUid, createdAt, correct (boolean — planner marks guess correct)
      guess/
        text, authorUid, createdAt

  pulses/{pushId}/
    from (uid), to (uid), fromName, time (ms)

  tonightsMood/{dateKey ('YYYY-MM-DD')}/{uid}/
    mood        'cosy' | 'romantic' | 'adventurous' | 'netflix' | 'productive' | 'chaotic' | 'talky' | 'celebratory' | 'hungry'
    chosenAt    number (ms timestamp)

invites/{code}/
  coupleId, createdBy (uid), createdAt, expiresAt (48h), used (bool)
```

---

## Two Modes
Snug has two modes toggled per couple. `applyMode(type)` handles all UI switching. Mode is stored as `coupleType` on the couple node and live-synced via `startCoupleTypeListener()`.

**LDR mode** (`coupleType === 'ldr'`):
- Shows: `ldr-section-wrap` (live clocks, distance km, weather, sleep indicators)
- Hides: `todays-plan`, `dn-planner`, `tonights-mood-card`
- Countdown label: "Next meetup"
- Letters unlock at midnight on meetup date

**Together mode** (`coupleType === 'together'`):
- Shows: `todays-plan`, `dn-planner`, `tonights-mood-card`
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
- `manifest.json` returns 401 from service worker fetch — caused by symlink in `public/` not being followed correctly by Vercel. Deferred. No functional impact on the app.

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
- Current pattern: `ylc-v{number}` (e.g. `ylc-v109`)
- Current version: `ylc-v109` (bumped in Session 3c)
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
| `initTonightsMood()` | Starts Firebase listener on `tonightsMood/{dateKey}`, manages pick/waiting/reveal states, wires bottom sheet |
| `teardownTonightsMood()` | Clears mood listener, day-roll interval, and `_tmInFlight` — called on sign-out and LDR mode switch |
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

## Firebase Security Rules

### RTDB Rules (current published version)
```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid",
        "avatarUrl": { ".read": "auth != null" }
      }
    },
    "invites": {
      "$code": {
        ".read": "auth != null",
        ".write": "auth != null && (!data.exists() || data.child('createdBy').val() === auth.uid || (!newData.exists() && data.child('coupleId').val() != null && root.child('couples').child(data.child('coupleId').val()).child('members').child(auth.uid).exists()))",
        "used": { ".write": "auth != null && newData.isBoolean() && newData.val() === true" }
      }
    },
    "couples": {
      "$coupleId": {
        ".read": "auth != null && root.child('couples').child($coupleId).child('members').child(auth.uid).exists()",
        ".write": "auth != null && (!data.exists() || root.child('couples').child($coupleId).child('members').child(auth.uid).exists())",
        "members": { "$memberUid": { ".write": "auth != null && auth.uid === $memberUid" } },
        "presence": { "$memberUid": { ".write": "auth != null && auth.uid === $memberUid" } },
        "activeMystery": {
          ".write": "auth != null && root.child('couples').child($coupleId).child('members').child(auth.uid).exists() && ((newData.exists() && newData.val() === auth.uid) || (!newData.exists() && (!data.exists() || data.val() === auth.uid)))",
          ".validate": "newData.isString() && root.child('couples').child($coupleId).child('members').child(newData.val()).exists()"
        },
        "meetupDate": {
          ".validate": "!root.child('couples').child($coupleId).child('activeMystery').exists() || root.child('couples').child($coupleId).child('activeMystery').val() === auth.uid"
        },
        "datePlan": {
          "$dateKey": {
            ".write": "auth != null && root.child('couples').child($coupleId).child('members').child(auth.uid).exists() && (!data.child('mode').exists() || data.child('mode').val() !== 'mystery' || data.child('revealed').val() === true || auth.uid === data.child('plannerId').val())",
            "plannerId": { ".validate": "!data.exists() || data.val() === newData.val()" },
            "hints": {
              ".validate": "newData.hasChildren() || !newData.exists()",
              "$pushId": {
                ".write": "auth != null && root.child('couples').child($coupleId).child('members').child(auth.uid).exists() && (!root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('mode').exists() || root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('mode').val() !== 'mystery' || root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('revealed').val() === true || auth.uid === root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('plannerId').val())",
                ".validate": "data.exists() || (newData.child('authorUid').val() === auth.uid && (auth.uid === root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('plannerId').val() || auth.uid === newData.parent().parent().child('plannerId').val()))",
                "text": { ".validate": "newData.isString() && newData.val().length < 500 && !data.exists()" },
                "guess": {
                  ".write": "auth != null && !data.exists() && root.child('couples').child($coupleId).child('members').child(auth.uid).exists() && auth.uid !== root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('plannerId').val()",
                  ".validate": "!data.exists() && newData.child('authorUid').val() === auth.uid && auth.uid !== root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('plannerId').val()",
                  "text": { ".validate": "newData.isString() && newData.val().length < 500 && !data.exists()" }
                },
                "correct": { ".write": "auth != null && auth.uid === root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('plannerId').val()" }
              }
            },
            "revealed": { ".validate": "newData.isBoolean() && (auth.uid === root.child('couples').child($coupleId).child('datePlan').child($dateKey).child('plannerId').val() || auth.uid === newData.parent().child('plannerId').val())" }
          }
        },
        "tonightsMood": {
          "$dateKey": {
            "$uid": {
              ".validate": "(auth.uid === $uid && newData.hasChildren(['mood','chosenAt'])) || (data.exists() && newData.child('mood').val() === data.child('mood').val() && newData.child('chosenAt').val() === data.child('chosenAt').val())",
              "mood": {
                ".validate": "newData.isString() && (newData.val() === 'cosy' || newData.val() === 'romantic' || newData.val() === 'adventurous' || newData.val() === 'netflix' || newData.val() === 'productive' || newData.val() === 'chaotic' || newData.val() === 'talky' || newData.val() === 'celebratory' || newData.val() === 'hungry')"
              },
              "chosenAt": { ".validate": "newData.isNumber()" },
              "$other": { ".validate": false }
            }
          }
        }
      }
    },
    "$other": { ".read": false, ".write": false }
  }
}
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
- `tonightsMood/$dateKey/$uid`: validated shape — `mood` must be one of the 9 valid mood keys, `chosenAt` must be a number, no extra children permitted. `.validate` enforces own-uid on creation/change; unchanged write-through of partner's existing entry is permitted so parent-node `runTransaction` (used for race-free pick) can rewrite the dateKey bucket without the partner's entry failing validation.
- `invites/$code`: any-auth read. Write only by creator or couple member.
- Storage `avatars/{uid}.jpg`: any-auth read, own write/delete, max 2MB, image type only.
- Storage `milestones/`: any-auth read/write. **Known gap — TODO: scope to couple members.**

---

## Session Roadmap

### ✅ Session 1 — Infrastructure (complete)
Split `index.html` into Vite project structure. CSS → `src/styles/`. JS → `src/js/`. Firebase config → env vars. ESLint added. Deployed and verified on staging + main.

### ✅ Session 1b — JS Module Split (complete)
Split `src/js/main.js` (4522 lines, one big file) into feature modules. Created `state.js` for shared globals and `registry.js` for the R namespace. All 105 R.* registrations verified present; 68 inline onclick handlers audited clean.

### ✅ Session 2 — Push Notifications (complete)
FCM HTTP v1 via Vercel serverless (`api/notify.js`). JWT-signed service account auth. Tokens stored as map at `users/{uid}/fcmTokens/{tokenHash}` — supports multiple devices per user. Legacy single `fcmToken` string also read for backwards compatibility and cleared on next register.

**Triggers (all implemented):**
- Pulse sent
- Memory jar entry written
- Status updated (only fires if activity or mood actually changed)
- Milestone added
- Bucket list item added (awaits confirmed write before notifying)
- Meetup date set (LDR mode)
- Date night date set (Together mode)
- Mystery date hint dropped (dnHint)
- Mystery date guess submitted (dnGuess)
- Mystery date revealed (dnReveal)
- Mystery date guess marked correct (dnCorrect)
- Tonight's Mood — partner picked, your turn (moodPick)
- Tonight's Mood — both picked, see the reveal (moodMatch)

**Notification content:** title uses partner's display name dynamically. Body text is trigger-specific.

**Deep linking:** tapping a notification opens the relevant section — pulse/status → Now tab, milestone → Milestones, bucket → Bucket list, memoryJar → Memory Jar, meetup/dateNight → Summary tab, moodPick/moodMatch → Now tab. Works both live (postMessage) and cold-start (sessionStorage + URL params).

**Account page:** now has Profile and Notifications sub-tabs using existing page-tabs pattern. Notifications tab shows per-trigger on/off toggles stored at `users/{uid}/notificationPrefs/`. `moodPick` and `moodMatch` share a single `tonightsMood` toggle. Toggles disabled until OS permission granted. Defaults: all triggers ON if notificationPrefs node absent.

**iOS:** Web Push only works on iOS 16.4+ with PWA installed to home screen. `pushSupported()` bails unless running in standalone mode.

**Known limitation:** notification icon shows as white square on Android status bar — needs proper monochrome icon asset. Chrome may flag staging URL as possible spam — resolves with custom domain.

### Phase 1 — Together Mode Polish (current)

**✅ Session 3a — Mystery Date Picker (complete)**
Enhancement to date night planner. Planner chooses Open or Mystery mode when setting a date.
- Open date: both partners see full plan (where/what/who), both can edit
- Mystery date: only planner sees full plan. Partner sees mystery card with date + time (if set).
- Hint system: max 3 hints, one active at a time, next hint only after partner guesses current one
- Hints and guesses: text only, immutable after submission (enforced at rules layer)
- Planner can react to correct guess with "You got it!" — stored as hints/$pushId/correct: true
- Reveal: planner taps Reveal → confirmation sheet → sets revealed:true → partner card updates live
- Date Done: after reveal, button opens sheet to convert to milestone with formatted hints/guesses + photo
- Letter unlock rule: if time set → unlock at that time. If time not set → unlock at 23:59 (fallback)
- Picker redesign: modern bottom sheet with Date, Time (optional), Mode (Open/Mystery) fields
- LDR meetup picker also modernised — date only, same bottom sheet style
- activeMystery field on couple node locks meetupDate changes to planner only while mystery is active
- Non-planner cannot change date, switch modes, or see plan details while mystery is unrevealed
- Partner name always used instead of generic pronouns (they/their/them) — global rule
- Open date plan content migrates when date changes (where/what/who carried over)
- Notifications: dnHint, dnGuess, dnReveal, dnCorrect triggers added with partner name in title

**Additional UI fixes shipped with Session 3a:**
- Removed old native time input from Together mode date night section
- Reduced size of Together/days counter in home screen top right
- Global pronoun rule: always use partner display name, never they/their/them

**✅ Session 3b — Tonight's Mood (complete)**
Daily Together mode ritual. Both partners independently pick one of 9 moods each evening via a bottom sheet picker. Neither sees the other's pick until both have chosen. On reveal: match → mood-specific celebration message. Mismatch → hardcoded compromise suggestion from a 36-combo matrix.

**Moods:** cosy 🛋️ · romantic 🌹 · adventurous 🗺️ · just Netflix 📺 · productive ✅ · chaotic 🌀 · talky 💬 · celebratory 🥂 · hungry 🍕

**Key implementation details:**
- New module: `src/js/tonightsmood.js` — registered as `R.initTonightsMood` and `R.teardownTonightsMood`
- Bottom sheet picker reuses `_initSheetSwipe` pattern from `status.js`
- Single tap commits, no confirm button, sheet closes immediately
- Partner mood never rendered until own mood is present — enforced in `_renderFromSnap`, not just DOM
- `runTransaction` used for race-free simultaneous pick — preserves partner's entry, determines correct notification trigger atomically
- Day rollover via 60s interval watching for dateKey change (robust to DST) — replaces recursive midnight timer
- `teardownTonightsMood()` called on sign-out (all 3 paths in auth.js) and on Together → LDR mode switch
- `state._tmInFlight` guard prevents double-tap double-submission
- Reveal state is final — no mood change after both have picked (intentional)
- Notifications: `moodPick` fires when partner hasn't picked yet; `moodMatch` fires when partner already picked. Both gated by single `tonightsMood` pref toggle via `PREF_ALIAS` map in `api/notify.js`
- Firebase rules: `.validate` (not `.write`) enforces own-uid scoping; write-through of unchanged partner entry permitted for transaction pattern
- dateKey uses device local time — Together mode assumes same-city couple; timezone edge case for LDR couples exploring Together mode is accepted

**✅ Session 3c — Cleanup + Summary tab (complete)**
Feature removals, rename pass, UI polish, and a brand-new Summary tab on Home.

**Removed:**
- **Notes feature** deleted entirely — `src/js/notes.js`, HTML (page, preview, sub-tab), CSS, Firebase listener, `localNotes`/`unsubNotes` state, the `note` notification trigger, the deep-link route, and the notification pref toggle.
- **Today's Plan** (`todayPlan` node) removed from Together mode — HTML, bottom sheet, CSS, `loadTodaysPlan`, `_tpUnsub`/`_tpMyCurrentVal` state.

**Renamed:**
- Home → "Story" sub-tab replaced with "**Summary**". Old panel-moments (link shortcuts to milestones/letters/places/bucket) deleted.
- Bottom nav "Together" → "**Ours**" (label only — page ID stays `page-together` so existing `showPage('together')` calls still work).
- "Living together" → "**Together**" in both linking screen and settings (display label only; `coupleType === 'together'` data value unchanged).

**New Summary tab (`src/js/summary.js`):**
- Week/Month toggle (defaults to week). All reads are one-shot snapshots (`{onlyOnce:true}`) — no persistent listeners.
- Stat cards: memory jar entries per user, current streak, pulses sent per user, milestones added in range, and (Together mode only) Tonight's Mood match rate.
- Empty state: "Nothing here yet — your story is just getting started."
- Grid of `.summary-card` tiles using existing design tokens.

**Other polish:**
- Tonight's Mood — activity list extended with Gym / Driving / Socialising; mood pills gained calm / lonely / loved / anxious.
- Status sheet iOS duplicate notification fix — `onMessage` handler no longer creates a secondary system `Notification`; the SW's push is the sole surface.
- Memory Jar "Earlier" months now collapsed by default — only expand on tap.
- Home → Us tab: bumped scroll bottom padding to `5rem + safe-area` so the last card clears the fixed bottom-nav.
- Pulse card: tightened internal layout + min-width:0 on flex children to stop the "last sent" chip clipping.
- Countdown card: wrapped cd-row + datetime-row in `.cd-align-row` for baseline alignment between timer numbers and the Set date button.
- Metric chip streak: flame emoji replaced with stroked SVG to match Next Meetup / Milestones icons.
- Partner-name footer added to Milestones, Places, and Bucket list pages.
- Account → Profile: name is now a dedicated row with explicit Save button (`saveNameFromInput`) rather than onblur auto-save.
- Account spacing tightened between section headings (Profile / Security / Your Snug).
- Expand buttons in Change password / Change email now render full-width.
- Memories bottom-nav icon swapped to a journal/notebook mark that reads better at 20px.

**Session 4 — Contextual Tooltips + Empty State Copy (next)**
Small info icon on each feature — tapping shows 2-sentence explanation.
Empty state copy: meaningful placeholder text when sections have no content.
First-use walkthrough: one-time guided tour on first login.
Applies to both LDR and Together mode.

### Phase 2 — Test Rollout
Roll out to ~10 couples after Phase 1 is stable. Mix of LDR and Together couples.
Watch: 7-day retention, memory jar streak, notification open rate by trigger, Tonight's Mood completion rate, mystery date creation rate.

### Session 4 — Domain + Branding (after Phase 2)
Register domain (snug.app / getsnug.app / joinsnug.com). Connect to Vercel. Update manifest.json, meta tags, invite link generation, Firebase authorised domains. Fix notification icon white square on Android (monochrome asset needed).
