// FCM HTTP v1 notifier — reads partner FCM token + notificationPrefs from
// Firebase RTDB using the service account, then sends a push.
//
// Env vars required in Vercel:
//   FIREBASE_SERVICE_ACCOUNT  — full service account JSON (stringified)
//   FIREBASE_DATABASE_URL     — RTDB URL, e.g.
//                               https://ldrcounter-default-rtdb.europe-west1.firebasedatabase.app
//                               (Service account JSONs from Firebase Console do NOT
//                                include databaseURL, so this MUST be set explicitly.
//                                The project_id-based fallback below is a best guess
//                                for new europe-west1 projects only.)
//
// Request body: { coupleId, recipientUid, trigger, senderName }
//
// Triggers map to fixed title/body templates (see TRIGGERS below).

import crypto from 'node:crypto';

const TRIGGERS = {
  pulse:     { title: n => `${n} sent you a pulse`,         body: n => `${n} is thinking of you` },
  memoryJar: { title: n => `${n} wrote in the memory jar`,  body: n => `Tap to see today's entry from ${n}` },
  milestone: { title: n => `${n} added a milestone`,        body: () => 'A new memory together' },
  bucket:    { title: n => `${n} added to the bucket list`, body: () => 'A new dream to share' },
  status:    { title: n => `${n} updated ${n}'s status`,    body: n => `See what ${n} is up to` },
  meetup:    { title: n => `${n} set your next meetup`,     body: () => 'Tap to see the date' },
  dateNight: { title: n => `${n} set your next date night`, body: () => 'Tap to see when' },
  dnHint:    { title: n => `${n} dropped a hint ✨`,         body: () => 'A clue about your mystery date' },
  dnGuess:   { title: n => `${n} took a guess`,             body: n => `See what ${n} thinks you're planning` },
  dnCorrect: { title: n => `${n} reacted to your guess`,    body: () => 'You got it right!' },
  dnReveal:  { title: n => `${n} revealed the mystery 🎉`,  body: () => 'Tap to see the full plan' },
  moodPick:  { title: n => `${n} has picked their mood`,    body: n => `${n} has picked their mood — what's yours tonight?` },
  moodMatch: { title: n => `${n} picked their mood`,        body: () => 'See if you match!' },
};

// Some triggers share a single user-facing pref toggle.
// e.g. both mood variants are gated by notificationPrefs.tonightsMood.
const PREF_ALIAS = {
  moodPick:  'tonightsMood',
  moodMatch: 'tonightsMood',
};

let _cachedToken = null;
let _cachedTokenExp = 0;

function base64url(buf){
  return Buffer.from(buf).toString('base64')
    .replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}

async function getAccessToken(sa){
  const now = Math.floor(Date.now()/1000);
  if(_cachedToken && _cachedTokenExp - 60 > now) return _cachedToken;

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: [
      'https://www.googleapis.com/auth/firebase.messaging',
      'https://www.googleapis.com/auth/firebase.database',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = base64url(signer.sign(sa.private_key));
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if(!res.ok){
    const t = await res.text();
    throw new Error(`token exchange failed: ${res.status} ${t}`);
  }
  const j = await res.json();
  _cachedToken = j.access_token;
  _cachedTokenExp = now + (j.expires_in || 3600);
  return _cachedToken;
}

async function rtdbGet(dbUrl, path, token){
  const res = await fetch(`${dbUrl}/${path}.json?access_token=${token}`);
  if(!res.ok) return null;
  return res.json();
}

export default async function handler(req, res){
  if(req.method !== 'POST'){
    return res.status(405).json({ error: 'POST only' });
  }

  let sa;
  try{
    sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }catch(e){
    return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT not configured' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { coupleId, recipientUid, trigger, senderName } = body;
  if(!coupleId || !recipientUid || !trigger){
    return res.status(400).json({ error: 'coupleId, recipientUid, trigger required' });
  }
  const tpl = TRIGGERS[trigger];
  if(!tpl) return res.status(400).json({ error: `unknown trigger: ${trigger}` });

  try{
    const token = await getAccessToken(sa);
    const dbUrl = process.env.FIREBASE_DATABASE_URL
      || sa.databaseURL
      || `https://${sa.project_id}-default-rtdb.europe-west1.firebasedatabase.app`;

    // fcmTokens is a map of tokenHash -> token string (multi-device).
    // Legacy single-string at fcmToken is read as a fallback for users who
    // registered before the map migration — treat it as one unnamed entry.
    const [tokensMap, legacyToken, prefs] = await Promise.all([
      rtdbGet(dbUrl, `users/${recipientUid}/fcmTokens`, token),
      rtdbGet(dbUrl, `users/${recipientUid}/fcmToken`,  token),
      rtdbGet(dbUrl, `users/${recipientUid}/notificationPrefs`, token),
    ]);

    // Build [ { hash, token, legacy }, … ].
    // De-dupe: if the legacy single-string fcmToken matches any value already
    // in the fcmTokens map, skip it. Migrated users commonly have the same
    // device token at BOTH paths until they next re-register, and sending to
    // both produced a duplicate push on that device (notably on iOS).
    const entries = [];
    const seenTokens = new Set();
    if(tokensMap && typeof tokensMap === 'object'){
      for(const [h, t] of Object.entries(tokensMap)){
        if(typeof t === 'string' && t){
          entries.push({ hash: h, token: t, legacy: false });
          seenTokens.add(t);
        }
      }
    }
    if(typeof legacyToken === 'string' && legacyToken && !seenTokens.has(legacyToken)){
      entries.push({ hash: null, token: legacyToken, legacy: true });
    }

    if(!entries.length){
      return res.status(200).json({ skipped: 'no token' });
    }
    // Default: enabled unless explicitly false.
    // Some triggers share a single pref toggle via PREF_ALIAS.
    const prefKey = PREF_ALIAS[trigger] || trigger;
    if(prefs && prefs[prefKey] === false){
      return res.status(200).json({ skipped: 'pref disabled' });
    }

    const name = (senderName || 'Your partner').toString().slice(0, 40);
    const title = tpl.title(name);
    const bodyText = typeof tpl.body === 'function' ? tpl.body(name) : tpl.body;

    const buildMessage = (tokenStr) => ({
      message: {
        token: tokenStr,
        notification: { title, body: bodyText },
        data: { trigger, coupleId: String(coupleId) },
        webpush: {
          notification: {
            title,
            body: bodyText,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: `snug-${trigger}`,
          },
          fcm_options: { link: '/' },
        },
      },
    });

    const sendEndpoint =
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    // Fan out to every device. A stale token on one device must not stop
    // delivery to other devices — collect per-entry results.
    const results = await Promise.all(entries.map(async (e) => {
      try{
        const fcmRes = await fetch(sendEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildMessage(e.token)),
        });
        if(fcmRes.ok) return { entry: e, ok: true };
        const errText = await fcmRes.text();
        let parsed = null;
        try{ parsed = JSON.parse(errText); }catch(_){}
        const errStatus = parsed?.error?.status;
        const errCode = parsed?.error?.details?.find(d => d.errorCode)?.errorCode;
        const stale = (errStatus === 'NOT_FOUND' || errCode === 'UNREGISTERED');
        return { entry: e, ok: false, stale, errText };
      }catch(err){
        return { entry: e, ok: false, stale: false, errText: err.message };
      }
    }));

    // Only delete the specific leaf(s) that FCM reported as invalid.
    // Never wipe the whole map.
    await Promise.all(results
      .filter(r => r.stale)
      .map(async (r) => {
        try{
          if(r.entry.legacy){
            await fetch(
              `${dbUrl}/users/${recipientUid}/fcmToken.json?access_token=${token}`,
              { method: 'DELETE' }
            );
          } else {
            await fetch(
              `${dbUrl}/users/${recipientUid}/fcmTokens/${r.entry.hash}.json?access_token=${token}`,
              { method: 'DELETE' }
            );
          }
        }catch(_){}
      })
    );

    const sent   = results.filter(r => r.ok).length;
    const failed = results.length - sent;
    if(sent === 0){
      return res.status(502).json({
        error: 'fcm send failed',
        detail: results.map(r => r.errText).filter(Boolean),
      });
    }
    return res.status(200).json({ sent, failed });
  }catch(e){
    console.error('notify failed:', e);
    return res.status(500).json({ error: e.message });
  }
}
