# Snug — Claude Code Context

## What is Snug
Snug is a private couples PWA. It gives couples — both long-distance and living together — a shared intimate space for daily connection. Built originally for Freddy (Stuttgart) and Sarah (Dehradun/Taiwan), now rolling out to ~10 test couples.

Long-term vision: grow to 50k+ active couples, position for acquisition by Match Group or similar in ~5 years. The core insight: Match Group profits when relationships fail. Snug profits when they succeed.

---

## Repo & Deployment
- **GitHub:** `github.com/freddyfranzenff-cpu/snug`
- **Production:** `main` branch → auto-deploys to Vercel (snug-seven.vercel.app, custom domain TBD)
- **Staging:** `staging` branch → auto-deploys to Vercel preview URL
- **Rule:** Never commit directly to `main`. All work goes to `staging` first, tested, then merged.

---

## Tech Stack
- **Frontend:** Vanilla JS (ES modules after Session 1 refactor), single `index.html` pre-refactor (~6800 lines)
- **Database:** Firebase Realtime Database (`ldrcounter` project, `europe-west1` region)
- **Auth:** Firebase Auth (email/password)
- **Storage:** Firebase Storage (avatars, milestone photos)
- **Hosting:** Vercel
- **Serverless:** Vercel API functions (`/api/` folder) — `weather.js` live (proxies open-meteo), FCM notify planned
- **PWA:** Service worker (`sw.js`), Web App Manifest (`manifest.json`)
- **Build:** Plain files pre-Session 1. Vite to be added in Session 1.
- **Maps:** Leaflet.js for the LDR distance map and Places map (loaded from unpkg CDN)
- **Firebase SDK version:** 10.12.0 (loaded via ESM from gstatic CDN)

---

## Firebase Data Structure
```
users/{uid}/
  name, email, city, avatarUrl, coupleId, role, inviteCode, fcmToken, createdAt

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
    where, what, who

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
**Tab bars (home + page sub-tabs):** White surface, `border-radius: 14px`, `1px solid var(--border)`, active tab gets `--kll` background
**Bottom sheets:** `border-radius: 24px 24px 0 0`, swipe-to-dismiss via handle drag

---

## App Structure (pre-refactor)
Everything lives in `index.html` (~6812 lines). Key sections:

- **Lines 1-33:** `<head>` — `--app-height` IIFE, PWA meta, font + Leaflet imports
- **Lines 34-700:** CSS — design system, layout chain, component styles
- **Lines 700-1100:** CSS continued — home page, cards, auth screens, sheets
- **Lines 1100-1310:** Auth screens HTML (login, signup, onboarding, linking, invite, forgot)
- **Lines 1310-1660:** Home page HTML (top strip, tabs, Now/Us/Story panels)
- **Lines 1660-2200:** Shell pages HTML (Memories, Together, Account + settings)
- **Lines 2200-2210:** JS — Firebase config (hardcoded, move to env vars in Session 1)
- **Lines 2210-2250:** Global state variable declarations
- **Lines 2250-2530:** Auth helpers, onboarding, couple creation/joining, watchForPartner
- **Lines 2530-2810:** tryInitFirebase, onAuthStateChanged, partner detection, _watchOther
- **Lines 2810-3000:** detectAndStart, weather, map, notes
- **Lines 3000-3500:** Milestones, meetup date, countdown, greeting, distance/sleep, bucket list
- **Lines 3500-3950:** Places, notes render, pulse system
- **Lines 3950-4300:** Letters system
- **Lines 4300-5100:** Memory jar system
- **Lines 5100-5700:** Status card, status sheet, today's plan sheet, date night sheet, MJ sheet
- **Lines 5700-5925:** Settings (name, email, password, avatar, mode, start date, invite)
- **Lines 5925-6070:** doLinkingDeleteAccount
- **Lines 6070-6200:** doDeleteAccount
- **Lines 6200-6600:** applyMode, startCoupleTypeListener, updateMetricChips, startUI
- **Lines 6600-6720:** App bootstrap, SW registration, --app-height listener, offline handler
- **Lines 6720-6812:** Bottom sheet HTML (DN, TP, MJ sheets)

---

## Service Worker
- File: `sw.js` in repo root
- **Bump `CACHE_VERSION` string on every production deploy** — forces mobile PWA clients to update
- Current pattern: `ylc-v{number}` (e.g. `ylc-v103`)
- `skipWaiting()` and `clients.claim()` present — SW activates immediately without tab reload
- Client-side `updatefound` listener sends `SKIP_WAITING` message to reinforce immediate activation

---

## Environment Variables
Currently hardcoded in `index.html` (to be moved to env vars in Session 1).

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
FCM_SERVER_KEY          <- server-side only, never expose to client
```

---

## Session Roadmap

### Session 1 — Infrastructure (next)
Split `index.html` into Vite project. CSS into `src/styles/`. JS modules into `src/js/` by feature. Move Firebase config to env vars. Add ESLint.
> Prompt: "Read CLAUDE.md. Split index.html into a Vite project structure. CSS into src/styles/, JS modules into src/js/ organised by feature. Firebase config from environment variables. ESLint for vanilla JS. Pure refactor — zero functionality changes."

### Session 2 — Push Notifications
FCM via Vercel serverless (`api/notify.js`). Triggers: pulse sent, memory jar entry, status updated. Store FCM token at `users/{uid}/fcmToken`. Handle iOS 16.4+ PWA limitation.
> Prompt: "Read CLAUDE.md. Add FCM push notifications via Vercel serverless at api/notify.js. Client registers on login, stores FCM token at users/{uid}/fcmToken. Serverless reads partner token and sends via FCM HTTP v1 API."

### Session 3 — Domain + Branding
Register domain (snug.app / getsnug.app / joinsnug.com). Connect to Vercel. Update manifest.json, meta tags, invite link generation, Firebase authorised domains.

---

## Known Bugs Fixed — Do Not Revert
- **Android scroll:** `.main` must have `overflow:hidden` — without it `page-home` grows unbounded and panels never scroll
- **Android/iOS panel scroll:** panels must be `display:block` not `display:flex` — flex containers with `overflow-y:auto` don't scroll correctly on Android Chrome when they are also flex children
- **iOS viewport:** `--app-height` set from `window.innerHeight` in `<head>` IIFE before CSS paint. Also updated on `resize` and `orientationchange` (100ms delay for iOS layout settle)
- **Tap highlight:** `-webkit-tap-highlight-color:transparent` on `*` selector kills blue flash on Android
- **Africa bug:** GPS coords `[0,0]` were pushed to presence — fixed with `if(myCoords && window._pushPresence)` null check
- **iOS PWA login:** Must complete signup in Safari browser first. Home screen install creates isolated localStorage — invite code lost
- **Letter save guard:** Letters only saveable when a future `meetupDate` is set — enforced in `saveLetterContent()`
- **Meetup date guards:** Rejects past dates and dates more than 2 years in future

---

## Global State Variables
All declared at module scope. All reset to null/default on sign-out via `onAuthStateChanged`.

```js
// Identity
ME, OTHER                     // display names (strings)
myUid, partnerUid             // Firebase Auth UIDs
coupleId                      // RTDB couple key (pushId)
myRole                        // 'owner' | 'joiner' (from members record)
coupleType                    // 'ldr' | 'together' — default 'ldr'

// Dates
meetupDate                    // Date object | null
coupleStartDate               // 'YYYY-MM-DD' string
_dnTimeVal                    // '19:00' default — Together mode date night time

// Location
myTz, otherTz                 // IANA timezone strings | null
myCity, otherCity             // city strings (GPS-derived, not user input)
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

// Local caches (live-synced from Firebase listeners)
localNotes                    // array
localMilestones               // array
localBucket                   // array

// Intervals and listeners
clockInterval                 // 1s tick — LDR clocks
distanceInterval              // 60s tick — distance + sleep recalc
countdownInterval             // 1s tick — meetup countdown
pulseTimeInterval             // 60s tick — pulse "X ago" display
unsubNotes, unsubMilestones, unsubBucket, unsubPulse
_membersUnsub                 // watches couple members — detects partner deletion
_watchPartnerUnsub            // watches for joiner during onboarding invite screen
_coupleTypeUnsub              // live-syncs coupleType changes between partners
```

---

## Key JS Functions

| Function | What it does |
|---|---|
| `tryInitFirebase()` | Dynamic ESM import of Firebase SDK 10.12.0, sets up `fbAuth` wrapper, starts `onAuthStateChanged` |
| `onAuthStateChanged` callback | Central auth router — shows login/onboarding/linking/app based on user + couple state |
| `loadCoupleAndStart(cId, myUid, partnerUid, members)` | Sets all global state from members snapshot, calls `detectAndStart()` |
| `detectAndStart()` | GPS -> `tzFromCoords` + `cityFromCoords` -> sets myTz/myCity/myCoords -> `_pushPresence` -> `startUI()` |
| `startUI()` | Shows main, populates all static UI, starts all real-time listeners and intervals |
| `startCoupleTypeListener()` | Real-time listener on `couples/{id}/coupleType` — calls `applyMode()` on change |
| `applyMode(type)` | Switches ALL UI between LDR and Together — visibility, labels, mode pill, settings toggle |
| `watchForPartner(cId, uid)` | Polls `couples/{id}/members` — redirects to app when partner joins |
| `showPage(page)` | Navigates to full standalone page (milestones, notes, bucket, places, letter) |
| `switchHomeTab(tab)` | Switches Now/Us/Story panels, resets scroll to top |
| `switchPageTab(page, tab)` | Switches sub-tabs on Memories/Together shell pages |
| `updateDistanceAndSleep()` | Haversine distance from coords + sleep status from timezone hour |
| `updateMetricChips()` | Updates 3 bottom chips: meetup countdown (days), milestone count, streak |
| `startCountdown()` | Starts 1s interval for countdown card + metric chip |
| `initPulse()` | Firebase listener on `pulses` node, renders received banner + history |
| `sendPulse()` | Rate-limited (60s cooldown) — pushes `{from, to, fromName, time}` to pulses |
| `openStatusSheet()` | Hides nav, pre-selects current activity/mood, shows sheet |
| `openDnSheet()` | Hides nav, pre-fills current date night plan, shows sheet |
| `saveDnSheet()` | Saves where/what/who to `datePlan/{dateKey}` |
| `openTpSheet()` | Hides nav, pre-fills today's plan, shows sheet |
| `saveTpSheet()` | Saves text to `todayPlan/{myUid}` |
| `openMjSheet()` | Hides nav, guards double-write (`_mjMyEntry?.text`), shows memory jar sheet |
| `saveMjSheet()` | Saves text to `memoryJar/{dateKey}/{myUid}` |
| `_mjLoadAndRender()` | Real-time listener on today's memoryJar + one-time streak calculation (365 day lookback) |
| `renderMemoryJarPage()` | Renders full memory jar tab — today card + disables input row if already written |
| `renderMemoryJarPreview()` | Renders memory jar preview card on Us tab |
| `renderStatusCard()` | Renders status card — checks STATUS_EXPIRY_MS, called on load and every 60s |
| `initLetterPage()` | Loads letters from Firebase, calls renderLetterTimeline + renderCurrentRound |
| `saveLetterContent()` | Guards future date, creates round if new, saves `{content, writtenAt, unlockDate}` |
| `openLetterRead(roundKey)` | Reads partner letter (only if unlocked), marks `readAt`, shows read view |
| `submitNote()` | Pushes `{text, author: ME, time}` to notes |
| `deleteNote(key)` | Removes note — only shown for notes where `author === ME` |
| `reactToNote(key)` | Toggles `reactions/{myUid}: true` on note |
| `renderNotes(notes)` | Renders notes wall using `_esc()` for XSS safety |
| `autoSaveName(val)` | Saves name to `users/{uid}/name` AND `couples/{id}/members/{uid}` |
| `autoSaveStartDate(val)` | Saves start date to `couples/{id}/startDate`, rejects future dates |
| `doSignOut()` | Calls `fbAuth.signOut()` — `onAuthStateChanged` handles full state reset |
| `doDeleteAccount()` | Path 1 deletion — see Offboarding section |
| `doLinkingDeleteAccount()` | Path 2 deletion — see Offboarding section |

---

## Onboarding Flow (owner)
1. `screen-login` — sign in with existing account
2. `screen-signup` — create account (email + password + confirm password)
3. `screen-onboarding` — display name + optional avatar (cropped to square JPEG, uploaded to `avatars/{uid}.jpg`)
4. `screen-linking` — two options:
   - **Join:** enter partner's 6-char invite code -> `doJoinCouple()` -> app loads
   - **Create:** set start date + relationship type -> `doCreateCouple()` -> generates collision-checked code -> `screen-invite`
5. `screen-invite` — share URL (`origin/?join=CODE`), animated waiting dots, `watchForPartner()` polls until partner joins

## Onboarding Flow (joiner)
1. Partner shares `snug-seven.vercel.app/?join=CODE`
2. URL param parsed on load -> stored in `sessionStorage` + `localStorage` as `pendingJoinCode`, param stripped from URL
3. Joiner signs up -> onboarding -> linking screen
4. `onInviteCodeInput()` reads stored code, pre-fills input, hides "Create" section
5. `doJoinCouple()` validates code (checks expiry, `used` flag), joins couple, app loads

**iOS PWA warning:** Must complete full signup in Safari browser BEFORE installing to home screen. Home screen install creates isolated localStorage — `pendingJoinCode` is lost.

---

## Offboarding Flow — Handle With Care

### Path 1: Delete from Account Settings (`doDeleteAccount`)
Triggered from Account -> Settings -> "Delete account". Element IDs: `settings-delete-input`, `settings-delete-pw`, `settings-delete-error`, `btn-delete-account`.

Exact verified steps:
1. Validates input === 'DELETE'
2. Reauthenticates via `reauthenticateWithCredential` — returns error if wrong password, stops here
3. Sets `_selfDeleting = true`
4. Reads all milestone `photoPath` values (one-time Firebase read)
5. Reads invite code from `couples/{id}/inviteCode`, fallback `users/{uid}/inviteCode`
6. Deletes own avatar from Storage: `avatars/{myUid}.jpg`
7. Deletes all milestone photos from Storage (parallel Promise.all)
8. Deletes invite document: `invites/{code}`
9. **Wipes entire couple node:** multi-path update sets `couples/{coupleId}` to null — deletes ALL shared data for both partners
10. Clears `coupleId` and `inviteCode` on own user record
11. Deletes own user RTDB record: `users/{myUid}`
12. Deletes Firebase Auth account
13. On error in steps 4-11: still attempts Auth deletion as fallback

**No role distinction** — both owner and joiner run identical steps. Whoever runs this first wipes everything.

### Path 2: Delete from Linking Screen (`doLinkingDeleteAccount`)
Triggered from `screen-linking` -> "Want to delete your account instead?". Element IDs: `linking-delete-input`, `linking-delete-pw`, `linking-delete-error`, `linking-delete-btn`.

Runs the **exact same 12 steps** as Path 1. It is NOT a simplified path. Only differences are the HTML element IDs and that it's accessible without being in the main app (no coupleId required, but will still delete couple data if coupleId exists).

### How the remaining partner finds out
The `_membersUnsub` listener on `couples/{coupleId}/members` handles three scenarios:

1. **Live in app:** `_coupleInitFired` is true, members fires null -> tears down all listeners -> clears stale coupleId -> clears pendingJoinCode from storage -> shows `screen-linking` with `linking-deleted-msg` banner
2. **Firebase permission denied:** Couple node deleted, read fails with permission error -> same cleanup and redirect. Covers both live and login-time.
3. **Was offline, logs back in:** `_coupleInitFired` is false, members is null on first read -> clears stale coupleId -> shows `screen-linking` with banner

`_selfDeleting = true` prevents this flow from triggering on the deleting user's own device.

### Critical rules
- Never mix `linking-delete-*` and `settings-delete-*` element IDs
- Reauthentication is mandatory — Firebase requires fresh credentials to delete an Auth account
- `_selfDeleting` must be set before any async deletion begins
- The "Your Snug has ended" banner is shown by `_membersUnsub`, not by the deletion functions themselves

---

## Feature Details

### Weather
- Localhost: calls open-meteo directly (`api.open-meteo.com`) — avoids CORS issues in dev
- Production: calls Vercel proxy `/api/weather?lat=&lng=` — hides origin, avoids CORS
- Detected in `fetchWeather()` by `location.hostname === 'localhost'`
- Updates when `myCoords`/`otherCoords` change via presence listener
- WMO weather codes + wttr.in codes both handled in `wIcon()` and `wDesc()`

### XSS Protection
- All user content rendered via `_esc(str)` — escapes `& < > " '`
- Partner letter content set via `el.textContent` (not innerHTML) — fully safe
- Milestone photo URLs stored in `_msRegistry` Map keyed by Firebase pushId — never embedded in onclick attributes

### Memory Jar
- `_mjTodayKey()` uses local device date (not UTC): `YYYY-MM-DD`
- Streak: iterates 365 days back; today skipped if only one person wrote (lenient — incomplete today doesn't break streak)
- Both `mj-preview-input-row` (Us tab) and `mj-today-input-row` (Memory jar tab) call same `openMjSheet()` / `saveMjSheet()`
- After saving: `_mjSetInputDisabled(true, context)` replaces button row with green "You've written today" confirmation

### Letters
- Each round tied to a meetup/date-night date as `unlockDate`
- `saveLetterContent()` blocks save if no future meetupDate
- Together mode: unlock at `_dnTimeVal` time (e.g. `19:00`). LDR mode: unlock at `00:00`
- Partner's letter only readable if `isUnlocked(otherLetter.unlockDate)` — client-side check
- Reading sets `readAt` timestamp on partner's letter node

### Pulse
- 60s cooldown via `_lastPulseSent` timestamp (client-side only)
- Stored as `{from: uid, to: uid, fromName, time: ms}`
- History shows last 6 pulses only
- `updateReceivedBanner()` finds latest pulse where `p.from === partnerUid || p.from === OTHER`

### Places
- Milestones with `lat` + `lng` appear on Places map
- Grouped by ~2km proximity into location pins
- Leaflet.js with custom SVG heart markers
- `_placesGroups` on `window` for popup click handlers

---

## Firebase Security Rules Summary
Do not change without understanding implications.

- `users/$uid`: read/write own data only. `avatarUrl` any-auth readable (needed for partner avatar display).
- `couples/$coupleId`: members-only read/write. **Bootstrap escape:** `!data.exists()` allows owner to create couple node before being listed as member.
- `invites/$code`: any-auth read (needed for joining). Write only by creator or couple member.
- Storage `avatars/{uid}.jpg`: any-auth read, own write/delete only, max 2MB, image type only.
- Storage `milestones/`: any-auth read/write. **Known gap — TODO: scope to couple members.**
