// FCM HTTP v1 notifier — reads partner FCM token + notificationPrefs from
// Firebase RTDB using the service account, then sends a push.
//
// Env vars required:
//   FIREBASE_SERVICE_ACCOUNT  — full service account JSON (stringified)
//
// Request body: { coupleId, recipientUid, trigger, senderName }
//
// Triggers map to fixed title/body templates (see TRIGGERS below).

import crypto from 'node:crypto';

const TRIGGERS = {
  pulse:     { title: n => `${n} sent you a pulse`,         body: "They're thinking of you" },
  note:      { title: n => `${n} wrote a new note`,         body: "Tap to read it" },
  memoryJar: { title: n => `${n} wrote in the memory jar`,  body: "Tap to see today's entry" },
  milestone: { title: n => `${n} added a milestone`,        body: "A new memory together" },
  bucket:    { title: n => `${n} added to the bucket list`, body: "A new dream to share" },
  status:    { title: n => `${n} updated their status`,     body: "See what they're up to" },
  meetup:    { title: n => `${n} set your next meetup`,     body: "Tap to see the date" },
  dateNight: { title: n => `${n} set your next date night`, body: "Tap to see when" },
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
    const dbUrl = sa.databaseURL
      || process.env.FIREBASE_DATABASE_URL
      || `https://${sa.project_id}-default-rtdb.europe-west1.firebasedatabase.app`;

    const [fcmToken, prefs] = await Promise.all([
      rtdbGet(dbUrl, `users/${recipientUid}/fcmToken`, token),
      rtdbGet(dbUrl, `users/${recipientUid}/notificationPrefs`, token),
    ]);

    if(!fcmToken){
      return res.status(200).json({ skipped: 'no token' });
    }
    // Default: enabled unless explicitly false
    if(prefs && prefs[trigger] === false){
      return res.status(200).json({ skipped: 'pref disabled' });
    }

    const name = (senderName || 'Your partner').toString().slice(0, 40);
    const title = tpl.title(name);
    const bodyText = tpl.body;

    const message = {
      message: {
        token: fcmToken,
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
    };

    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      }
    );

    if(!fcmRes.ok){
      const errText = await fcmRes.text();
      // Stale token — clear it so the client can re-register
      if(fcmRes.status === 404 || fcmRes.status === 400){
        try{
          await fetch(`${dbUrl}/users/${recipientUid}/fcmToken.json?access_token=${token}`, {
            method: 'DELETE',
          });
        }catch(e){}
      }
      return res.status(502).json({ error: 'fcm send failed', detail: errText });
    }

    return res.status(200).json({ sent: true });
  }catch(e){
    console.error('notify failed:', e);
    return res.status(500).json({ error: e.message });
  }
}
