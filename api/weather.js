export default async function handler(req, res) {
  const { lat, lng } = req.query;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600');

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng required' });
  }

  try {
    const response = await fetch(`https://wttr.in/${lat},${lng}?format=j1`, {
      headers: { 'User-Agent': 'Snug-App/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    const d = await response.json();
    const cur = d.current_condition?.[0];
    const today = d.weather?.[0];
    return res.status(200).json({
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
    return res.status(502).json({ error: e.message });
  }
}

