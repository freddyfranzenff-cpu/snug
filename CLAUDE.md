# Snug — Claude Code Context

## What is Snug
Private couples PWA — a shared intimate space for daily connection for both long-distance and cohabiting couples. Built for Freddy (Stuttgart) and Sarah (Dehradun/Taiwan), rolling out to ~10 test couples. Long-term: grow to 50k+ couples, position for acquisition by Match Group in ~5 years. Core insight: Match profits when relationships fail; Snug profits when they succeed.

---

## Repo & Deployment
GitHub: `github.com/freddyfranzenff-cpu/snug`. `main` → Vercel prod (`snug-seven.vercel.app`). `staging` → Vercel preview. **Never commit directly to `main`** — all work via `staging` first.

---

## Tech Stack
Vanilla JS ES modules + Vite 5.4 · Firebase RTDB (`ldrcounter`, `europe-west1`) + Auth + Storage · hosted on Vercel with serverless `/api/weather.js` and `/api/notify.js` · PWA via `sw.js` + `manifest.json` · Leaflet.js from unpkg CDN (LDR distance map + Places) · Firebase SDK 10.12.0 via gstatic ESM · Plus Jakarta Sans + Cormorant Garamond via one Google Fonts `<link>` in `index.html` · ESLint 9 flat config.

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
      auth.js               auth router, signup/login/onboarding, _teardownSessionState
      couple.js             create/join/link/offboarding, applyMode, start*Listener
      ui.js                 startUI, showPage, switchHomeTab, updateMetricChips
      notifications.js      FCM tokens, notifyPartner, deep-link, prefs UI
      tooltips.js           info-icon system — shared sheet, 13 tooltips
      summary.js            Snugshot tab — insight + week/month stats
      tonightsmood.js, tonightsdinner.js, ourlist.js   Together-mode features
      milestones.js, bucket.js, letters.js, memoryjar.js, pulse.js, status.js,
      weather.js, presence.js, countdown.js, settings.js, togethermode.js,
      places.js, avatar.js, app-height.js, sw-register.js
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
`state.js` exports a single mutable `state` object — sidesteps ES `let`-binding reassignment limits. `registry.js` exports a mutable `R` namespace — modules attach functions at load, call sites use `R.X()` at call time to dodge circular-import evaluation order. `window.*` handlers preserved in their modules so inline `onclick=` attrs keep working.

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

  milestones/{pushId}/   title, date, endDate, note, tag, emoji, addedBy, location,
                         locationDisplay, lat, lng, photoURL, photoPath, photoPosition, createdAt
  bucket/{pushId}/       title, category, addedBy, done, completedAt, time
  letters/{pushId}/      unlockDate, createdAt, {uid}/{content,writtenAt,unlockDate,readAt}
  memoryJar/{YYYY-MM-DD}/{uid}/    text, createdAt
  pulses/{pushId}/       from, to, fromName, time (ms)

  datePlan/{dateKey}/
    mode ('open'|'mystery'), plannerId (write-once), where/what/who (plan details),
    revealed (bool, mystery only), time (optional HH:MM; absent = letters unlock 00:00)
    hints/{pushId}/  text, authorUid, createdAt, correct (planner sets)
      guess/         text, authorUid, createdAt

  statusHistory/{pushId}/    uid, activity, mood, savedAt (ms)
    Append-only log — never overwritten/deleted. Powers real status-update counts.

  dailyInsight/{dateKey}/{range('week'|'month')}/    text, rule, generatedAt
    One per local day per range; first partner to open Snugshot writes, second reads.

  tonightsMood/{dateKey}/{uid}/
    mood       one of 9: cosy, romantic, adventurous, netflix, productive, chaotic, talky, celebratory, hungry
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
  lastPushAt, pendingItems[] — powers Our-list 30s debounce.
  Rules hard-block client access; only api/notify.js writes (service-account).
```

---

## Navigation Structure

**Bottom nav (4 tabs):** Home · Memories (Milestones / Places / Memory Jar) · Ours (Bucket / Letters — page id `page-together`) · Account (Profile / Notifications).

**Home sub-tab contents:**
- **Now** — greeting+days strip · avatar row · Pulse · (LDR) Right Now card · Status (LDR: full; Together: compact one-liner) · (Together) Our list / Tonight's dinner / Tonight's Mood · metric chips
- **Us** — Countdown · (Together) `#dn-planner-label` + `#dn-planner` planner card · current letter pair · Memory Jar preview · Bucket progress
- **Snugshot** — Insight card + week/month stats: memory jar, longest streak, pulses, status updates, (Together) mood match rate. Panel id stays `panel-summary`.

---

## Two Modes
Mode stored as `coupleType` on the couple node. `applyMode(type)` in `couple.js` switches UI; live-synced via `startCoupleTypeListener()`; flips re-run `R.initNotificationPrefs()` for Together-only toggle hide/show. `selectSettingsMode(type)` writes `coupleType`. Display labels: "Long distance" / "Together"; data values stay `'ldr'` / `'together'`.

- **LDR** — shows `ldr-section-wrap` (clocks/distance/weather/sleep); hides Together cards; full Status card visible. Countdown "Next meetup"; chip `✈`; letters unlock 00:00.
- **Together** — shows `dn-planner`, `tonights-mood-card`, `tonights-dinner-card`, `our-list-card`, `#status-card-compact`; hides `ldr-section-wrap` + full Status card. Countdown "Next date night"; chip "Date night" with calendar SVG; letters unlock at `state._dnTimeVal` (default `19:00`); Snugshot adds mood match rate.

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
- GPS `[0,0]` check (Africa bug) prevents bad presence push.
- iOS PWA login: complete signup in Safari BEFORE installing to home screen — PWA install creates isolated localStorage, `pendingJoinCode` is lost otherwise.
- iOS double notification (foreground): `api/notify.js` skips legacy `fcmToken` if already in `fcmTokens` map. (Background): FCM payload is data-only — no top-level `notification` field — `onBackgroundMessage` controls display.

---

## Design System (visual-warmth-v2)
Warm peach palette + cream cards, proper elevation, avatar rim glow, card form light. Responds to feedback that 3C-iii read cold and flat. Coral brand + partner pink preserved; teal accent for moments. Fonts: `--font-sans` Plus Jakarta Sans, `--font-serif` Cormorant Garamond. See full `:root` in `src/styles/main.css`.

Core tokens:
- Brand coral `--k: #c8553a`, `--kl: #d66a4f`, `--kll: #fce8df` (warm coral tint)
- Partner pink `--pk: #c67b92`, `--pll: #f5dce4`
- Page `--bg: #f5d8c4` (warm peach) · `--bg-deep: #e8b8a0` · card `--surface: #fffaf3` (cream, dominant) · `--surface-2: #fff5ea` (hero cards)
- Text `--text: #3a1a10` (espresso), `--text2: #6b3a24` (warm brown), `--muted: #a06850`, `--border: rgba(107,58,36,0.12)`
- Semantic `--green: #2a9d5c`, `--teal: #3d6468` (Tonight's Mood match)
- Legacy aliases (`--cream`, `--warm`, `--accent`, `--accent2`, `--gold`, `--sidebar-bg`) remain for back-compat — use canonical tokens in new code.

### Elevation system
Shadow base is `rgba(74,40,24,...)` — darker than the warm-brown border token so shadows read against the peach backdrop (softer brown washes out). Hero shadows use `rgba(200,85,58,...)` (coral) to harmonise with the coral border. `--shadow-sm` (2 layers) for chips/pills/buttons; `--shadow-md` (1+4+12px, 3 layers) is default for `.card`; `--shadow-lg` (2+8+24px, 3 layers) for login card + overlays; `--shadow-hero` (3 layers, coral) for hero cards. Three-layer stacks buy depth single-layer can't fake — contact grounds, diffuse adds form, ambient anchors.

### Background + cards
- Body mesh: peach gradient (`170deg,#fae0cc 0%,#f5d8c4 45%,#ecc4ac 100%`) + four radial highlights in `body::before`.
- **Form light** — status, summary, stat-card-small, home-bl-progress, home-metric-chip, sealed letter tiles use `linear-gradient(180deg,#fffdf8 0%,var(--surface) 60%)` plus `inset 0 1px 0 rgba(255,255,255,0.7)` — lighter top fading into fill, 1px white highlight on the top edge. Reads as a surface under top-down light. The `.card` base rule keeps solid `--surface`; form-light selectors layer on top.
- **Hero cards** — `.card-accent`, `.home-cd-card`, `.td-card:has(.td-dish-pill-agreed)` share one rule: warmer gradient (`#fffaf2 → --surface-2`), coral 2px border, `inset 0 1px 0 rgba(255,255,255,0.8)`, `--shadow-hero`. `.mood-reveal-match` uses the same shape with teal border + teal-tinted shadow.
- Borderless page header.

### Avatars (rim glow)
`.home-avatar-me`, `.home-avatar-other`, `.settings-avatar-wrap` use a triple-shadow rim glow: cream halo (`0 0 0 4px rgba(255,250,243,0.95)`) separates from peach backdrop · coloured feather (`0 0 16px 4px rgba(<brand>,0.25)` — coral on me, pink on other) bleeds brand outward · downward drop (`0 6px 18px rgba(<brand>,0.20)`) grounds the element.

### Typography
`--font-sans` for UI chrome, buttons, inputs, labels, body copy. `--font-serif` for emotional moments — home greeting, days counter, hero numbers (`.cd-num`, `.stat-value`), letter previews, memory jar text, card headlines, agreed-dinner pill. `.section-heading` is serif 500, sentence case, emotional word in `<em>` for coral italic ("Our *list*", "Dinner *tonight*", "Tonight's *mood*", "Next *meetup*", "Memory *jar*"). Same `<em>` convention extended to hero screen titles (`.login-title em`, `.auth-title em`, `.locating-title em`).

---

## Weather API
`api/weather.js` is an ES module default export. Prod: `/api/weather?lat=&lng=` proxies wttr.in. Localhost short-circuits to open-meteo. **Do NOT revert to CommonJS** — Vercel requires ES module default export.

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
- File: `sw.js` at repo root (symlinked into `public/`).
- **Bump `CACHE_VERSION` on every prod deploy** — forces PWA clients to update.
- Pattern: `ylc-v{n}`. Current: `ylc-v147`.
- `skipWaiting()` + `clients.claim()` — activates without tab reload.
- Firebase / Storage / Auth / Vercel `/api/*` / weather APIs never intercepted.

---

## Global State
Source of truth: `src/js/state.js` — one mutable object exported as `state`. Module-level state outside `state` reset on sign-out via `_teardownSessionState()` in `auth.js`:
- `summary.js` — `_currentRange`, `_requestSeq` (via `R.resetSummary()`).
- `memoryjar.js` — `_mjExpandedMonths` Set (via `R._mjResetExpandedMonths()`).

---

## Info Icon System
One CSS class `info-btn`, no modifiers. Size/colour via ancestor selectors:
- **Base** (section headings, settings labels): 9×9px, 6px font, 1px coral border.
- **`.shell-page-header-row .info-btn`** (Memories/Ours titles): 13×13px, 8px font.
- **`.snugshot-insight-card-header .info-btn`** (white-on-coral): 8×8px, 5px font, semi-transparent white.

Placement: button is always a flex child (section heading `<p>`, shell header, settings label, Snugshot label). Section heading text wrapped in `<span>` so `gap` applies. Flex-only alignment — never `vertical-align`/`position:relative`. `<p>` needs `line-height:1`. `.section-heading` needs `justify-content:flex-start` unless trailing "See all".

`tooltips.js`: `TOOLTIPS` map `{ id: { title, text } }`. `showTooltip(id)` opens `#tooltip-overlay`. Countdown button picks tooltip id from `state.coupleType`. Swipe-to-dismiss via `R._initSheetSwipe`.

---

## Key JS Functions

| Function | What it does |
|---|---|
| `tryInitFirebase()` | ESM Firebase SDK import; wires `fbAuth`; starts auth listener |
| `onAuthStateChanged` cb | Central auth router — login / onboarding / linking / app |
| `loadCoupleAndStart` → `detectAndStart` → `startUI` | Members → state → GPS/tz/city → `_pushPresence` → listeners + intervals |
| `applyMode(type)` | LDR ↔ Together UI switch (cards + chip icon + notif toggles) |
| `showPage` / `switchHomeTab` | Bottom-nav / sub-tab switch; unknowns fall back to `'now'` |
| `sendPulse()` | 60s-cooldown rate-limited push |
| `initTonightsMood` / `initTonightsDinner` / `initOurList` | Together-mode wiring (listeners, rollover, sheets; Our-list 48h auto-trim on first snapshot) |
| `renderSummary(range)` | One-shot Snugshot reads, race-guarded via `_requestSeq` |
| `_teardownSessionState()` | Central teardown — listeners, intervals, module-level state. Called on sign-out AND partner-delete |
| `doDeleteAccount` / `doLinkingDeleteAccount` | Offboarding paths (Settings / linking screen) |
| `openDnDismissConfirm` / `confirmDnDismiss` | Planner-card dismiss — clears `datePlan/{dateKey}`, `meetupDate`, `activeMystery` |

---

## Onboarding Flow
- **Owner:** login → signup → verify email → onboarding (name + avatar) → linking → create couple → invite screen → wait for partner.
- **Joiner:** opens `/?join=CODE` → signup → verify email → onboarding → linking (code pre-filled) → joins couple → app loads.

---

## Offboarding Flow
Two paths (Settings or linking screen). Both validate `'DELETE'`, reauthenticate, set `_selfDeleting=true`, delete avatar + milestone photos + invite doc, wipe couple node, clear user record, delete Auth account. Partner notified via `_membersUnsub`. Session-end cleanup in `_teardownSessionState()` — called from `onAuthStateChanged(null)` and partner-deleted paths.

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
- Storage `milestones/{coupleId}/{milestoneKey}/{filename}` — ≤5MB, image MIME. RTDB `.validate` enforces `photoPath` begins with `milestones/{coupleId}/`. Legacy path retained for existing photos.

Deploy: `npx firebase-tools deploy --only database,storage`. First run from a new machine: `npx firebase-tools login`. Console edits overwritten on next deploy.

---

## Push Notifications

**Triggers:** `pulse`, `memoryJar`, `status` (changed only), `milestone`, `bucket` (awaits confirmed write), `meetup`/`dateNight`, `dn{Hint,Guess,Reveal,Correct}`, `mood{Pick,Match,Reveal}`, `listItemAdded`, `dinner{Proposed,Countered,Agreed}`. Title is `{partnerName}` except `moodMatch` ("It's a match! ✨") and `dinnerAgreed` ("Dinner agreed ✓"). `listItemAdded` + dinner triggers accept an `extra` string on `/api/notify` (≤200 chars) rendered into the body.

**Deep linking** (live via SW postMessage, cold-start via sessionStorage+URL params): Now ← pulse/status/mood*/listItemAdded/dinner* · Us ← meetup/dateNight/dn* · Memories ← milestone/memoryJar · Ours ← bucket.

**Tokens & prefs:** tokens at `users/{uid}/fcmTokens/{tokenHash}` (multi-device map; legacy `fcmToken` string still read, skipped if already in map). Per-trigger toggles at `notificationPrefs/`, default ON. `PREF_ALIAS`: mood triggers share `tonightsMood`, dinner triggers share `tonightsDinner`, `listItemAdded` own key. In LDR, `initNotificationPrefs()` hides Together-only toggles (values preserved across flips).

**Debounce — listItemAdded:** server-side 30s sliding window per (sender→recipient). First item fires; subsequent within 30s accumulate into `userNotifBatch/.../pendingItems`. Next send flushes into one combined body (1 plain · 2 "a and b" · 3–4 "a, b, c" · 5+ "a, b and N more").

**Server auth:** `api/notify.js` requires `Authorization: Bearer <Firebase ID token>`, verifies via firebase-admin, checks `email_verified`, validates couple membership. 401/403 on failure.

**iOS limits:** Web Push needs iOS 16.4+ installed PWA. `pushSupported()` bails unless `standalone`.

---

## XSS Protection
- User content rendered via `R._esc(str)` — escapes `& < > " '`.
- Partner letter content set via `el.textContent`, never `innerHTML`.
- Milestone photo URLs held in a module-level `_msRegistry` Map keyed by Firebase pushId, not inlined into markup.

---

## Features Shipped

### Core
- Pulse (60s cooldown) · Status (append-only `statusHistory`) · Memory Jar (daily shared + streak) · Bucket list · Letters (paired, scheduled, midnight/19:00 unlock) · Milestones (photo + position + coupleId-prefixed paths) · Places (Leaflet) · Snugshot (daily insight + week/month stats, race-guarded) · Contextual tooltips (13 icons) · FCM push (HTTP v1, deep linking, per-trigger prefs)
- Global pronoun rule: always partner name, never they/their/them
- Visual overhaul v2 (visual-warmth-v2): warmer peach palette, proper elevation system with three-layer shadows, avatar rim glow, card form light. Responds to user feedback that 3C-iii felt cold and flat.

### LDR-specific
- Right Now card: clocks, distance, weather, sleep indicator
- Meetup countdown + map line between coords

### Together-specific
- **Date-night planner** at `#dn-planner` on Home/Us. Open mode (where/what/who) or Mystery mode (planner locks `activeMystery`, drops hints, partner guesses, planner reveals). `×` top-right dismiss opens an in-flow confirmation card — planner-facing only (never `_renderMysteryPartnerCard`).
- **Mystery hint history** — guesser card renders the full hint chain (numbered hints, prior guesses labelled "Your guess", correct badge). "Guess this hint" attaches only to the latest unguessed hint.
- **Tonight's Mood** — 9 moods, `runTransaction`, match/mismatch matrix, day rollover.
- **Our list** — `ourList/{pushId}`, tag filter (All/Groceries/Home/To-do). Home/Now shows top 3 not-done; "See all →" opens full sheet. Checked items stay visible until end of local day. Client-side 48h auto-trim on first RTDB snapshot (done only) via one multi-location `dbUpdate`; `_cleanupRan` flag reset in `teardownOurList`.
- **Tonight's Dinner** — `tonightsDinner/{dateKey}`. State machine: propose → waiting/incoming → counter → agreed. "+ Ingredients to list" pushes comma-separated items as `groceries` rows via `R.addOurListMany` (one summary notif). Same local-day rollover as Tonight's Mood.
- **Status demotion** — `#status-card-compact` one-liner replaces the full card; `applyMode()` keeps exactly one heading visible. Heading "Status" / sheet title "Update your status".

### Security (Phase 1)
- 30-user hard cap (`meta/userCount`, waitlist screen) · email verification enforced at rules layer + verify/resend UI with rate-limit handling · password policy (min 8, uppercase, numeric)
- Storage rules: MIME, size caps, coupleId-prefixed milestone paths
- `api/notify.js`: Firebase ID-token verification + couple-membership check
- Writer-claim fields (`ourList.addedBy`, `tonightsDinner.proposedBy`/`counteredBy`) enforced at rules layer

### Mixpanel event spec (Phase 3 — NOT yet wired)
Event names + props documented at call sites in `ourlist.js` / `tonightsdinner.js` as inline comments.

---

## Roadmap Context
Phase 1 (security) + Together-mode v2 shipped. **Phase 3 — Mixpanel** next. **Phase 4 — ~10-couple rollout** follows; watch 7-day retention, MJ streak, notif open rate, mood completion, mystery-date creation, list add rate, dinner agreement rate. Full plan in `Snug_Roadmap_2026.pdf`.

---

## Open Technical Debt
- Mystery-hint history is full-chain — may need collapse-older UX if chains grow long (revisit post Phase 4).
- Mystery auto-reveal is client-side cosmetic; server enforcement needs a Cloud Function.
- App Check deferred to ~1000-user milestone. Android monochrome notif icon deferred. `manifest.json` 401 from SW fetch deferred — no functional impact.
