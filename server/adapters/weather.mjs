// Ambient weather for the backdrop animation — NOT a visible card.
// Open-Meteo current conditions (keyless) + one-time IP geolocation
// (ipapi.co, keyless) when lat/lon aren't set in config.
// Card config: { lat?, lon?, hidden: true }
const UA = 'Mozilla/5.0 (compatible; terminal-lite/0.1; local personal dashboard)';

let coords = null; // geolocate once per process

export async function fetchWeather(card) {
  if (card.lat != null && card.lon != null) {
    coords = { lat: card.lat, lon: card.lon };
  } else if (!coords) {
    coords = await geolocate();
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,cloud_cover,is_day`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`open-meteo: HTTP ${res.status}`);
  const cur = (await res.json())?.current;
  if (!cur) throw new Error('open-meteo: no current block');

  return [
    {
      id: 'ambient',
      condition: classify(cur),
      isDay: cur.is_day === 1,
      temp: cur.temperature_2m,
      wind: cur.wind_speed_10m,
      cloud: cur.cloud_cover,
    },
  ];
}

// WMO weather codes → one of: rain | snow | wind | cloudy | clear
function classify(cur) {
  const wc = cur.weather_code;
  if ((wc >= 51 && wc <= 67) || (wc >= 80 && wc <= 82) || wc >= 95) return 'rain';
  if ((wc >= 71 && wc <= 77) || wc === 85 || wc === 86) return 'snow';
  if (cur.wind_speed_10m >= 28) return 'wind';
  if (wc === 45 || wc === 48 || wc === 3 || cur.cloud_cover >= 70) return 'cloudy';
  return 'clear';
}

// keyless IP-geolocation chain — services differ in field names and uptime
const GEO_SERVICES = [
  { url: 'https://ipwho.is/', pick: (j) => ({ lat: j.latitude, lon: j.longitude }) },
  { url: 'https://ipapi.co/json/', pick: (j) => ({ lat: j.latitude, lon: j.longitude }) },
  { url: 'http://ip-api.com/json/', pick: (j) => ({ lat: j.lat, lon: j.lon }) },
];

async function geolocate() {
  let lastErr;
  for (const svc of GEO_SERVICES) {
    try {
      const res = await fetch(svc.url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`${svc.url}: HTTP ${res.status}`);
      const c = svc.pick(await res.json());
      if (c.lat == null || c.lon == null) throw new Error(`${svc.url}: no coordinates`);
      return c;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`geolocate: ${lastErr?.message ?? 'all services failed'}`);
}
