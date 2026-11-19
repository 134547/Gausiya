// Astronomical Hanafi Fiqh Prayer Time Calculator
// Method: University of Islamic Sciences, Karachi (Fajr 18°, Isha 18°)
// Juristic Asr: Hanafi (Misl-e-Sani — shadow factor = 2)

export interface JamaatOffsets {
  fajr: number;
  zuhr: number;
  asr: number;
  maghrib: number;
  isha: number;
}

export interface PrayerRow {
  key: 'fajr' | 'zuhr' | 'asr' | 'maghrib' | 'isha';
  name: string;
  shortName: string;
  urdu: string;
  azanMinutes: number;
  namazMinutes: number;
  azanFormatted: string;
  namazFormatted: string;
}

export interface HanafiDaySchedule {
  dateKey: string;
  timeZone: string;
  isFriday: boolean;
  gregorianLabel: string;
  hijriLabel: string;
  prayers: PrayerRow[];
  sehriEndFormatted: string;
  sunriseFormatted: string;
  zawalFormatted: string;
  iftarFormatted: string;
  sunriseMinutes: number;
  zawalMinutes: number;
  currentPrayerKey: PrayerRow['key'] | null;
  activePrayer: {
    key: PrayerRow['key'];
    name: string;
    shortName: string;
    urdu: string;
    azanFormatted: string;
    namazFormatted: string;
    isCurrentWaqt: boolean;
  };
  nextPrayer: {
    key: PrayerRow['key'];
    name: string;
    shortName: string;
    urdu: string;
    azanFormatted: string;
    namazFormatted: string;
    minutesUntilAzan: number;
    countdownLabel: string;
  };
}

export interface PresetArea {
  name: string;
  latitude: number;
  longitude: number;
  timeZone: string;
}

export const PRESET_AREAS: PresetArea[] = [
  { name: 'Islamnagar, Ramgarh, Palamu, Jharkhand', latitude: 23.88, longitude: 84.08, timeZone: 'Asia/Kolkata' },
  { name: 'Hidaya Nagar, Chemmad, Tirurangadi PO, Kerala 676306', latitude: 11.0425, longitude: 75.9114, timeZone: 'Asia/Kolkata' },
  { name: 'Daltonganj (Medininagar), Palamu, Jharkhand', latitude: 24.0358, longitude: 84.0663, timeZone: 'Asia/Kolkata' },
  { name: 'Garhwa, Jharkhand', latitude: 24.1617, longitude: 83.8077, timeZone: 'Asia/Kolkata' },
  { name: 'Latehar, Jharkhand', latitude: 23.7441, longitude: 84.5023, timeZone: 'Asia/Kolkata' },
  { name: 'Ranchi, Jharkhand', latitude: 23.3441, longitude: 85.3096, timeZone: 'Asia/Kolkata' },
  { name: 'Hazaribagh, Jharkhand', latitude: 23.9925, longitude: 85.3637, timeZone: 'Asia/Kolkata' },
  { name: 'Dhanbad, Jharkhand', latitude: 23.7957, longitude: 86.4304, timeZone: 'Asia/Kolkata' },
  { name: 'Jamshedpur, Jharkhand', latitude: 22.8046, longitude: 86.2029, timeZone: 'Asia/Kolkata' },
  { name: 'Patna, Bihar', latitude: 25.5941, longitude: 85.1376, timeZone: 'Asia/Kolkata' },
  { name: 'Gaya, Bihar', latitude: 24.7914, longitude: 85.0002, timeZone: 'Asia/Kolkata' },
  { name: 'Varanasi, Uttar Pradesh', latitude: 25.3176, longitude: 82.9739, timeZone: 'Asia/Kolkata' },
  { name: 'Lucknow, Uttar Pradesh', latitude: 26.8467, longitude: 80.9462, timeZone: 'Asia/Kolkata' },
  { name: 'Bareilly, Uttar Pradesh', latitude: 28.367, longitude: 79.4304, timeZone: 'Asia/Kolkata' },
  { name: 'New Delhi, India', latitude: 28.6139, longitude: 77.209, timeZone: 'Asia/Kolkata' },
  { name: 'Kolkata, West Bengal', latitude: 22.5726, longitude: 88.3639, timeZone: 'Asia/Kolkata' },
  { name: 'Mumbai, Maharashtra', latitude: 19.076, longitude: 72.8777, timeZone: 'Asia/Kolkata' },
  { name: 'Hyderabad, Telangana', latitude: 17.385, longitude: 78.4867, timeZone: 'Asia/Kolkata' },
  { name: 'Makkah, Saudi Arabia', latitude: 21.4225, longitude: 39.8262, timeZone: 'Asia/Riyadh' },
  { name: 'Madinah, Saudi Arabia', latitude: 24.4672, longitude: 39.6111, timeZone: 'Asia/Riyadh' },
  { name: 'Dubai, UAE', latitude: 25.2048, longitude: 55.2708, timeZone: 'Asia/Dubai' },
];

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function dSin(deg: number): number {
  return Math.sin(deg * DEG2RAD);
}

function dCos(deg: number): number {
  return Math.cos(deg * DEG2RAD);
}

function dTan(deg: number): number {
  return Math.tan(deg * DEG2RAD);
}

function dAsin(x: number): number {
  return Math.asin(Math.max(-1, Math.min(1, x))) * RAD2DEG;
}

function dAcos(x: number): number {
  return Math.acos(Math.max(-1, Math.min(1, x))) * RAD2DEG;
}

function dAtan2(y: number, x: number): number {
  return Math.atan2(y, x) * RAD2DEG;
}

function dArccot(x: number): number {
  return Math.atan(1 / x) * RAD2DEG;
}

function fixMod(a: number, b: number): number {
  const m = a - b * Math.floor(a / b);
  return m < 0 ? m + b : m;
}

function julianDate(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + B - 1524.5;
}

function sunPosition(jd: number): { declination: number; equationOfTime: number } {
  const D = jd - 2451545.0;
  const g = fixMod(357.529 + 0.98560028 * D, 360);
  const q = fixMod(280.459 + 0.98564736 * D, 360);
  const L = fixMod(q + 1.915 * dSin(g) + 0.02 * dSin(2 * g), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = dAtan2(dCos(e) * dSin(L), dCos(L)) / 15;
  const eqt = q / 15 - fixMod(RA, 24);
  const decl = dAsin(dSin(e) * dSin(L));
  return { declination: decl, equationOfTime: eqt };
}

function computeMidDay(jDate: number, tFraction: number): number {
  const { equationOfTime } = sunPosition(jDate + tFraction);
  return fixMod(12 - equationOfTime, 24);
}

function computeSunAngleTime(
  jDate: number,
  latitude: number,
  angle: number,
  tFraction: number,
  direction: 'ccw' | 'cw'
): number {
  const { declination } = sunPosition(jDate + tFraction);
  const noon = computeMidDay(jDate, tFraction);
  const numerator = -dSin(angle) - dSin(declination) * dSin(latitude);
  const denominator = dCos(declination) * dCos(latitude);
  const cosVal = denominator === 0 ? 0 : numerator / denominator;
  if (cosVal < -1 || cosVal > 1) {
    return direction === 'ccw' ? noon - 6 : noon + 6;
  }
  const t = dAcos(cosVal) / 15;
  return noon + (direction === 'ccw' ? -t : t);
}

function computeHanafiAsrTime(jDate: number, latitude: number, tFraction: number): number {
  // Hanafi Fiqh: Misl-e-Sani (shadow length = 2x object height + noon shadow)
  const { declination } = sunPosition(jDate + tFraction);
  const angle = -dArccot(2 + dTan(Math.abs(latitude - declination)));
  return computeSunAngleTime(jDate, latitude, angle, tFraction, 'cw');
}

export function formatMinutes12h(totalMinutes: number): string {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours24 = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${period}`;
}

export function formatCountdown(minutesLeft: number): string {
  const safe = Math.max(0, Math.round(minutesLeft));
  const hrs = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hrs === 0) return `in ${mins}m`;
  if (mins === 0) return `in ${hrs}h`;
  return `in ${hrs}h ${mins}m`;
}

export function resolveSafeTimeZone(timeZone?: string, latitude?: number, longitude?: number): string {
  const candidate = String(timeZone || '').trim();
  if (candidate) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
      return candidate;
    } catch {
      // fall through
    }
  }
  if (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    latitude >= 6 &&
    latitude <= 38 &&
    longitude >= 68 &&
    longitude <= 98
  ) {
    return 'Asia/Kolkata';
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

interface ZonedClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
  tzOffsetHours: number;
}

function getZonedClockParts(date: Date, timeZone: string): ZonedClockParts {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    const parts = dtf.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
    const year = Number(get('year')) || date.getFullYear();
    const month = Number(get('month')) || date.getMonth() + 1;
    const day = Number(get('day')) || date.getDate();
    const rawHour = Number(get('hour'));
    const hour = Number.isFinite(rawHour) ? rawHour % 24 : date.getHours();
    const minute = Number(get('minute')) || 0;
    const second = Number(get('second')) || 0;
    const weekday = get('weekday') || '';

    // Exact UTC offset in hours for this instant in this timeZone
    const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const roundedNowMs = Math.floor(date.getTime() / 1000) * 1000;
    const tzOffsetHours = Math.round(((asUtcMs - roundedNowMs) / 3600000) * 4) / 4;

    return { year, month, day, hour, minute, second, weekday, tzOffsetHours };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
      tzOffsetHours: -date.getTimezoneOffset() / 60,
    };
  }
}

export function formatLiveClockForZone(
  date: Date,
  timeZone?: string,
  includeSeconds = true
): string {
  const tz = resolveSafeTimeZone(timeZone);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
      hour12: true,
    }).format(date);
  } catch {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
      hour12: true,
    });
  }
}

function getHijriDateLabel(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      timeZone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    try {
      return new Intl.DateTimeFormat('en-u-ca-islamic', {
        timeZone,
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(date);
    } catch {
      return '';
    }
  }
}

export function calculateHanafiPrayerSchedule(
  latitude: number,
  longitude: number,
  now: Date = new Date(),
  offsets: JamaatOffsets = { fajr: 20, zuhr: 15, asr: 15, maghrib: 5, isha: 15 },
  timeZone?: string
): HanafiDaySchedule {
  const resolvedTz = resolveSafeTimeZone(timeZone, latitude, longitude);
  const zoned = getZonedClockParts(now, resolvedTz);
  const { year, month, day, tzOffsetHours: tzHours } = zoned;

  // Base Julian date shifted for longitude
  const jDate = julianDate(year, month, day) - longitude / (15 * 24);

  // Two-pass astronomical refinement for <30s accuracy
  let fajrH = 5 / 24;
  let sunriseH = 6 / 24;
  let dhuhrH = 12 / 24;
  let asrH = 15 / 24;
  let maghribH = 18 / 24;
  let ishaH = 19.5 / 24;

  for (let pass = 0; pass < 2; pass += 1) {
    fajrH = computeSunAngleTime(jDate, latitude, 18, fajrH, 'ccw') / 24;
    sunriseH = computeSunAngleTime(jDate, latitude, 0.833, sunriseH, 'ccw') / 24;
    dhuhrH = computeMidDay(jDate, dhuhrH) / 24;
    asrH = computeHanafiAsrTime(jDate, latitude, asrH) / 24;
    maghribH = computeSunAngleTime(jDate, latitude, 0.833, maghribH, 'cw') / 24;
    ishaH = computeSunAngleTime(jDate, latitude, 18, ishaH, 'cw') / 24;
  }

  const tzAdjustHours = tzHours - longitude / 15;
  const toMinutes = (dayFraction: number, extraMins = 0): number => {
    const hrs = fixMod(dayFraction * 24 + tzAdjustHours, 24);
    return Math.round(hrs * 60 + extraMins);
  };

  // Standard Hanafi ihtiyat (safety margins): +2m after solar noon for Zuhr, +2m after sunset for Maghrib
  const fajrAzan = toMinutes(fajrH, 0);
  const sunriseMins = toMinutes(sunriseH, 0);
  const zawalMins = toMinutes(dhuhrH, 0);
  const zuhrAzan = toMinutes(dhuhrH, 2);
  const asrAzan = toMinutes(asrH, 0);
  const maghribAzan = toMinutes(maghribH, 2);
  const ishaAzan = toMinutes(ishaH, 0);

  const safeOffset = (val: number, fallback: number) =>
    Number.isFinite(val) && val >= 0 && val <= 120 ? Math.round(val) : fallback;

  const prayers: PrayerRow[] = [
    {
      key: 'fajr',
      name: 'Fajr',
      shortName: 'Fajr',
      urdu: 'فجر',
      azanMinutes: fajrAzan,
      namazMinutes: fajrAzan + safeOffset(offsets.fajr, 20),
      azanFormatted: formatMinutes12h(fajrAzan),
      namazFormatted: formatMinutes12h(fajrAzan + safeOffset(offsets.fajr, 20)),
    },
    {
      key: 'zuhr',
      name: 'Zuhr',
      shortName: 'Zuhr',
      urdu: 'ظہر',
      azanMinutes: zuhrAzan,
      namazMinutes: zuhrAzan + safeOffset(offsets.zuhr, 15),
      azanFormatted: formatMinutes12h(zuhrAzan),
      namazFormatted: formatMinutes12h(zuhrAzan + safeOffset(offsets.zuhr, 15)),
    },
    {
      key: 'asr',
      name: 'Asr (Hanafi)',
      shortName: 'Asr',
      urdu: 'عصر (حنفی)',
      azanMinutes: asrAzan,
      namazMinutes: asrAzan + safeOffset(offsets.asr, 15),
      azanFormatted: formatMinutes12h(asrAzan),
      namazFormatted: formatMinutes12h(asrAzan + safeOffset(offsets.asr, 15)),
    },
    {
      key: 'maghrib',
      name: 'Maghrib',
      shortName: 'Maghrib',
      urdu: 'مغرب',
      azanMinutes: maghribAzan,
      namazMinutes: maghribAzan + safeOffset(offsets.maghrib, 5),
      azanFormatted: formatMinutes12h(maghribAzan),
      namazFormatted: formatMinutes12h(maghribAzan + safeOffset(offsets.maghrib, 5)),
    },
    {
      key: 'isha',
      name: 'Isha',
      shortName: 'Isha',
      urdu: 'عشاء',
      azanMinutes: ishaAzan,
      namazMinutes: ishaAzan + safeOffset(offsets.isha, 15),
      azanFormatted: formatMinutes12h(ishaAzan),
      namazFormatted: formatMinutes12h(ishaAzan + safeOffset(offsets.isha, 15)),
    },
  ];

  const nowMinutes = zoned.hour * 60 + zoned.minute;

  // Determine CURRENT (abhi wala) prayer waqt in this location's real time
  let currentPrayerKey: PrayerRow['key'] | null = null;
  if (nowMinutes >= fajrAzan && nowMinutes < sunriseMins) {
    currentPrayerKey = 'fajr';
  } else if (nowMinutes >= zuhrAzan && nowMinutes < asrAzan) {
    currentPrayerKey = 'zuhr';
  } else if (nowMinutes >= asrAzan && nowMinutes < maghribAzan) {
    currentPrayerKey = 'asr';
  } else if (nowMinutes >= maghribAzan && nowMinutes < ishaAzan) {
    currentPrayerKey = 'maghrib';
  } else if (nowMinutes >= ishaAzan || nowMinutes < fajrAzan) {
    currentPrayerKey = 'isha';
  }

  let nextRow = prayers.find((p) => p.azanMinutes > nowMinutes);
  let minutesUntilAzan = 0;
  if (nextRow) {
    minutesUntilAzan = nextRow.azanMinutes - nowMinutes;
  } else {
    nextRow = prayers[0]; // Tomorrow's Fajr
    minutesUntilAzan = 1440 - nowMinutes + nextRow.azanMinutes;
  }

  // Active prayer to display prominently:
  // If we are inside a prayer's waqt right now -> show THAT current prayer (NOT next!)
  // Only during the post-Sunrise / pre-Zuhr non-fard gap -> show Zuhr
  const activeRow =
    (currentPrayerKey ? prayers.find((p) => p.key === currentPrayerKey) : null) || prayers[1];

  const gregorianLabel = new Intl.DateTimeFormat('en-IN', {
    timeZone: resolvedTz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(now);

  return {
    dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    timeZone: resolvedTz,
    isFriday: zoned.weekday.toLowerCase().startsWith('fri'),
    gregorianLabel,
    hijriLabel: getHijriDateLabel(now, resolvedTz),
    prayers,
    sehriEndFormatted: formatMinutes12h(fajrAzan),
    sunriseFormatted: formatMinutes12h(sunriseMins),
    zawalFormatted: formatMinutes12h(zawalMins),
    iftarFormatted: formatMinutes12h(maghribAzan),
    sunriseMinutes: sunriseMins,
    zawalMinutes: zawalMins,
    currentPrayerKey,
    activePrayer: {
      key: activeRow.key,
      name: activeRow.name,
      shortName: activeRow.shortName,
      urdu: activeRow.urdu,
      azanFormatted: activeRow.azanFormatted,
      namazFormatted: activeRow.namazFormatted,
      isCurrentWaqt: currentPrayerKey !== null,
    },
    nextPrayer: {
      key: nextRow.key,
      name: nextRow.name,
      shortName: nextRow.shortName,
      urdu: nextRow.urdu,
      azanFormatted: nextRow.azanFormatted,
      namazFormatted: nextRow.namazFormatted,
      minutesUntilAzan,
      countdownLabel: formatCountdown(minutesUntilAzan),
    },
  };
}

export interface UpcomingNamazCountdown {
  key: PrayerRow['key'];
  name: string;
  namazFormatted: string;
  remainingSeconds: number;
  remainingLabel: string;
}

export function parseTimeStringToMinutes(raw?: string): number | null {
  const txt = String(raw || '').trim();
  const match = txt.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hrs = Number(match[1]);
  const mins = Number(match[2]);
  const period = (match[3] || '').toUpperCase();
  if (!Number.isFinite(hrs) || !Number.isFinite(mins) || mins < 0 || mins > 59) return null;
  if (period === 'PM' && hrs < 12) hrs += 12;
  if (period === 'AM' && hrs === 12) hrs = 0;
  if (hrs < 0 || hrs > 23) return null;
  return hrs * 60 + mins;
}

export function formatRemainingSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  }
  if (mins > 0) {
    return `${mins}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${secs}s`;
}

export function getUpcomingNamazCountdown(
  schedule: HanafiDaySchedule,
  now: Date,
  jumuahNamazTime?: string
): UpcomingNamazCountdown {
  const zoned = getZonedClockParts(now, schedule.timeZone);
  const nowSec = zoned.hour * 3600 + zoned.minute * 60 + zoned.second;

  const jumuahMins =
    schedule.isFriday && jumuahNamazTime ? parseTimeStringToMinutes(jumuahNamazTime) : null;

  const targets = schedule.prayers.map((p) => {
    if (p.key === 'zuhr' && jumuahMins !== null && jumuahNamazTime) {
      return {
        key: p.key,
        name: "Jumu'ah",
        namazFormatted: jumuahNamazTime.trim(),
        targetSeconds: jumuahMins * 60,
      };
    }
    return {
      key: p.key,
      name: p.shortName,
      namazFormatted: p.namazFormatted,
      targetSeconds: p.namazMinutes * 60,
    };
  });

  const upcoming = targets.find((t) => t.targetSeconds > nowSec);
  if (upcoming) {
    const remainingSeconds = upcoming.targetSeconds - nowSec;
    return {
      key: upcoming.key,
      name: upcoming.name,
      namazFormatted: upcoming.namazFormatted,
      remainingSeconds,
      remainingLabel: formatRemainingSeconds(remainingSeconds),
    };
  }

  // After today's Isha Namaz -> next upcoming is tomorrow's Fajr Namaz
  const fajr = targets[0];
  const remainingSeconds = 86400 - nowSec + fajr.targetSeconds;
  return {
    key: fajr.key,
    name: fajr.name,
    namazFormatted: fajr.namazFormatted,
    remainingSeconds,
    remainingLabel: formatRemainingSeconds(remainingSeconds),
  };
}

