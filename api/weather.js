const https = require('https');

module.exports = function handler(req, res) {
  const { lat, lng } = req.query;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600');

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng required' });
  }

  // wttr.in: free, no auth, no CORS issues, no IP blocking
  const path = `/${lat},${lng}?format=j1`;

  const options = {
    hostname: 'wttr.in',
    path: path,
    method: 'GET',
    timeout: 8000,
    headers: { 'User-Agent': 'Snug-App/1.0', 'Accept': 'application/json' }
  };

  const request = https.request(options, (r) => {
    let body = '';
    r.on('data', chunk => body += chunk);
    r.on('end', () => {
      try {
        const d = JSON.parse(body);
        // Normalise to same shape as open-meteo so app code unchanged
        const cur = d.current_condition?.[0];
        const today = d.weather?.[0];
        res.status(200).json({
          current: {
            temperature_2m: parseFloat(cur?.temp_C),
            weathercode: parseInt(cur?.weatherCode),
            windspeed_10m: parseFloat(cur?.windspeedKmph)
          },
          daily: {
            temperature_2m_max: [parseFloat(today?.maxtempC)],
            temperature_2m_min: [parseFloat(today?.mintempC)]
          }
        });
      } catch(e) {
        res.status(502).json({ error: 'Bad response from wttr.in', raw: body.substring(0, 200) });
      }
    });
  });

  request.on('timeout', () => {
    request.destroy();
    res.status(504).json({ error: 'wttr.in timed out' });
  });

  request.on('error', (e) => {
    res.status(500).json({ error: e.message, code: e.code });
  });

  request.end();
};
