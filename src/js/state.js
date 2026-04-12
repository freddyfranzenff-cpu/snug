// Shared mutable state for the Snug app.
//
// All globals that were previously top-level `let`/`const` bindings in the old
// monolithic main.js now live as properties on this single exported object.
//
// Why an object and not individual exports? ES modules cannot reassign imported
// `let` bindings from outside their defining module. Wrapping everything in an
// object sidesteps that: feature modules import `{ state }` and freely read/write
// `state.myUid = ...`, `state.coupleType === 'ldr'`, etc.
//
// This is populated lazily — most fields start null and get filled in by
// tryInitFirebase / loadCoupleAndStart / onAuthStateChanged.

export const state = {
  // ── Firebase handles (set by tryInitFirebase) ──────────────
  db: null, dbRef: null, dbSet: null, dbPush: null, dbRemove: null,
  fbOnValue: null, dbUpdate: null, fbRunTransaction: null,
  storage: null, fbStorageRef: null, fbUploadBytes: null,
  fbGetDownloadURL: null, fbDeleteObject: null,
  fbAuth: null,

  // ── Identity ──────────────────────────────────────────────
  ME: null, OTHER: null,
  myUid: null, partnerUid: null, coupleId: null,
  myName: null, otherName: null, myRole: null,
  coupleType: 'ldr',

  // ── Location & presence ───────────────────────────────────
  myTz: null, otherTz: null,
  myCity: null, otherCity: null,
  myCoords: null, otherCoords: null,

  // ── Avatars ───────────────────────────────────────────────
  myAvatarUrl: null, otherAvatarUrl: null,
  _onboardAvatarBlob: null,
  _myAvatarUnsub: null, _otherAvatarUnsub: null,

  // ── Letter system ─────────────────────────────────────────
  _letterCountdownInterval: null,
  currentLetterRoundId: null,
  letterRounds: [],

  // ── Deletion flow ─────────────────────────────────────────
  _selfDeleting: false,

  // ── Status card ───────────────────────────────────────────
  myStatus: null, otherStatus: null,
  statusRefreshInterval: null,

  // ── Couple info ───────────────────────────────────────────
  coupleStartDate: null, coupleMeetupDate: null,

  // ── Partner & members listeners ───────────────────────────
  _watchPartnerUnsub: null, _membersUnsub: null,
  _unsubWatchOther: null,

  // ── Local caches ──────────────────────────────────────────
  localNotes: [], localMilestones: [], localBucket: [],
  unsubNotes: null, unsubMilestones: null,
  unsubBucket: null, unsubPulse: null,

  // ── Map + intervals ───────────────────────────────────────
  mapInstance: null, myMarker: null, otherMarker: null, connectLine: null,
  countdownInterval: null, distanceInterval: null,
  clockInterval: null, pulseTimeInterval: null,
  placesMapInstance: null, meetupDate: null,

  // ── Bucket list filter/edit ───────────────────────────────
  blFilter: 'all', blEditKey: null,

  // ── Milestone edit state ──────────────────────────────────
  editingKey: null, editingOriginalAuthor: null,

  // ── Photo upload + reposition ─────────────────────────────
  pendingPhotoFile: null, pendingPhotoForKey: null,
  pendingPhotoPosition: '50% 50%',
  repositionMode: 'new',
  repositionKey: null,
  repositionPos: { x: 50, y: 50 },
  repositionDragging: false,
  repositionStart: { x: 0, y: 0 },
  repositionStartPos: { x: 50, y: 50 },

  // ── Pulse ─────────────────────────────────────────────────
  _lastPulseSent: 0,

  // ── Memory jar ────────────────────────────────────────────
  _mjUnsub: null,
  _mjMyEntry: null, _mjOtherEntry: null,
  _mjStreakCount: 0,

  // ── Together-mode features ────────────────────────────────
  _dnTimeVal: '19:00',
  _dnUnsub: null, _dnCurrentPlan: {},
  _tpUnsub: null, _tpMyCurrentVal: '',

  // ── Status sheet selection ────────────────────────────────
  _selectedActivity: null, _selectedMood: null,

  // ── Couple type listener ──────────────────────────────────
  _coupleTypeUnsub: null,

  // ── Meetup date live listener ─────────────────────────────
  _meetupDateUnsub: null,

  // ── Invite link flag ──────────────────────────────────────
  _inviteInFlight: false,

  // ── Milestone photo registry (shared Map) ─────────────────
  _msRegistry: new Map(),
};
