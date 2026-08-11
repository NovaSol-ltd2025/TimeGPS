// Bangkok has a fixed UTC+7 offset (no DST), so we can compute it directly
// without a timezone database library.

export function bangkokNowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return map; // { day, month, year, hour, minute, second }
}

export function formatBangkokDateTime(date = new Date()) {
  const p = bangkokNowParts(date);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

export function bangkokDateStr(date = new Date()) {
  const p = bangkokNowParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

// Returns [startOfDayUtcIso, endOfDayUtcIso] for "today" in Bangkok time.
export function bangkokTodayRangeUtc(date = new Date()) {
  const p = bangkokNowParts(date);
  const start = new Date(`${p.year}-${p.month}-${p.day}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return [start.toISOString(), end.toISOString()];
}

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
