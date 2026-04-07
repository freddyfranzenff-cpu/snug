const https = require('https');
 
module.exports = function handler(req, res) {
  const { lat, lng } = req.query;
 
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600');
 
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng required' });
  }
 
  const path = `/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weathercode,windspeed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
 
  const options = {
    hostname: 'api.open-meteo.com',
    path: path,
    method: 'GET',
    timeout: 8000,
    headers: { 'User-Agent': 'Snug-App/1.0' }
  };
 
  const request = https.request(options, (r) => {
    let body = '';
    r.on('data', chunk => body += chunk);
    r.on('end', () => {
      try {
        const data = JSON.parse(body);
        res.status(200).json(data);
      } catch(e) {
        res.status(502).json({ error: 'Bad response from open-meteo', raw: body.substring(0, 100) });
      }
    });
  });
 
  request.on('timeout', () => {
    request.destroy();
    res.status(504).json({ error: 'open-meteo timed out' });
  });
 
  request.on('error', (e) => {
    res.status(500).json({ error: e.message, code: e.code });
  });
 
  request.end();
};
