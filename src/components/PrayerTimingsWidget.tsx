import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar,
  Clock,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  Loader2,
  LocateFixed,
  MapPin,
  Moon,
  Power,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import {
  PRESET_AREAS,
  calculateHanafiPrayerSchedule,
  formatLiveClockForZone,
  resolveSafeTimeZone,
} from '../lib/hanafiPrayerTimes.ts';
import { User } from '../types.ts';

interface PrayerTimingsWidgetProps {
  user: User;
}

interface PrayerSettingsData {
  jumuah_azan_time: string;
  jumuah_namaz_time: string;
  jumuah_note: string;
  eid_ul_fitr_time: string;
  eid_ul_fitr_note: string;
  eid_ul_adha_time: string;
  eid_ul_adha_note: string;
  fajr_jamaat_offset: number;
  zuhr_jamaat_offset: number;
  asr_jamaat_offset: number;
  maghrib_jamaat_offset: number;
  isha_jamaat_offset: number;
  ramzan_timetable_title: string;
  ramzan_timetable_url: string;
  ramzan_timetable_type: string;
  ramzan_timetable_name: string;
  ramzan_timetable_visible: boolean;
  default_location_name: string;
  default_latitude: number;
  default_longitude: number;
}

interface StoredLocationState {
  gpsEnabled: boolean;
  latitude: number;
  longitude: number;
  areaName: string;
  timeZone: string;
}

const DEFAULT_SETTINGS: PrayerSettingsData = {
  jumuah_azan_time: '12:45 PM',
  jumuah_namaz_time: '01:30 PM',
  jumuah_note: 'Khutbah starts 15 minutes before Jamaat',
  eid_ul_fitr_time: '07:30 AM',
  eid_ul_fitr_note: 'Madrasa Eidgah / Masjid',
  eid_ul_adha_time: '07:00 AM',
  eid_ul_adha_note: 'Madrasa Eidgah / Masjid',
  fajr_jamaat_offset: 20,
  zuhr_jamaat_offset: 15,
  asr_jamaat_offset: 15,
  maghrib_jamaat_offset: 5,
  isha_jamaat_offset: 15,
  ramzan_timetable_title: 'Ramzan Mubarak Timetable',
  ramzan_timetable_url: '',
  ramzan_timetable_type: '',
  ramzan_timetable_name: '',
  ramzan_timetable_visible: false,
  default_location_name: 'Islamnagar, Ramgarh, Palamu, Jharkhand',
  default_latitude: 23.88,
  default_longitude: 84.08,
};

const LOC_STORAGE_KEY = 'madrasa_hanafi_location_v1';

function readStoredLocation(): StoredLocationState {
  try {
    const raw = localStorage.getItem(LOC_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        Number.isFinite(Number(parsed.latitude)) &&
        Number.isFinite(Number(parsed.longitude))
      ) {
        const lat = Number(parsed.latitude);
        const lng = Number(parsed.longitude);
        return {
          gpsEnabled: Boolean(parsed.gpsEnabled),
          latitude: lat,
          longitude: lng,
          areaName: String(parsed.areaName || DEFAULT_SETTINGS.default_location_name),
          timeZone: resolveSafeTimeZone(parsed.timeZone, lat, lng),
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return {
    gpsEnabled: false,
    latitude: DEFAULT_SETTINGS.default_latitude,
    longitude: DEFAULT_SETTINGS.default_longitude,
    areaName: DEFAULT_SETTINGS.default_location_name,
    timeZone: 'Asia/Kolkata',
  };
}

function saveStoredLocation(loc: StoredLocationState) {
  try {
    localStorage.setItem(LOC_STORAGE_KEY, JSON.stringify(loc));
  } catch {
    // ignore quota errors
  }
}

function isPdfAsset(url?: string, mime?: string, name?: string): boolean {
  const m = String(mime || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  const u = String(url || '').toLowerCase().split('?')[0];
  return m.includes('pdf') || n.endsWith('.pdf') || u.endsWith('.pdf');
}

export const PrayerTimingsWidget: React.FC<PrayerTimingsWidgetProps> = ({ user }) => {
  const isSuperAdmin = user.role_slug === 'super_admin';

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'timings' | 'ramzan' | 'manage'>('timings');
  const [prayerSettings, setPrayerSettings] = useState<PrayerSettingsData>(DEFAULT_SETTINGS);
  const [tableReady, setTableReady] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);

  const [location, setLocation] = useState<StoredLocationState>(() => readStoredLocation());
  const [locating, setLocating] = useState(false);
  const [locNotice, setLocNotice] = useState('');
  const [now, setNow] = useState<Date>(() => new Date());

  // Super Admin form state
  const [form, setForm] = useState<PrayerSettingsData>(DEFAULT_SETTINGS);
  const [ramzanStoredRef, setRamzanStoredRef] = useState<string | null>(null);
  const [uploadingRamzan, setUploadingRamzan] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingRamzan, setTogglingRamzan] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const watchIdRef = useRef<number | null>(null);
  const lastGeoCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const fetchPrayerSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const res = await apiRequest<{ settings: PrayerSettingsData; tableReady?: boolean }>(
        '/api/prayer-timings'
      );
      const merged = { ...DEFAULT_SETTINGS, ...(res.settings || {}) };
      setPrayerSettings(merged);
      setForm(merged);
      setRamzanStoredRef(null);
      setTableReady(res.tableReady !== false);

      // If user hasn't picked a custom/GPS location yet, use Madrasa's default coordinates
      try {
        if (!localStorage.getItem(LOC_STORAGE_KEY)) {
          const defLat = Number(merged.default_latitude) || DEFAULT_SETTINGS.default_latitude;
          const defLng = Number(merged.default_longitude) || DEFAULT_SETTINGS.default_longitude;
          setLocation({
            gpsEnabled: false,
            latitude: defLat,
            longitude: defLng,
            areaName: merged.default_location_name || DEFAULT_SETTINGS.default_location_name,
            timeZone: resolveSafeTimeZone('', defLat, defLng),
          });
        }
      } catch {
        // ignore
      }
    } catch {
      // keep defaults so Hanafi prayer times always render
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    fetchPrayerSettings();
  }, [fetchPrayerSettings]);

  // Real-time 1-second live clock (isolated inside widget, zero API polling)
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const resolveAreaNameAndApply = useCallback(
    async (lat: number, lng: number, gpsEnabled: boolean) => {
      const prevCoords = lastGeoCoordsRef.current;
      const movedEnough =
        !prevCoords ||
        Math.abs(prevCoords.lat - lat) > 0.015 ||
        Math.abs(prevCoords.lng - lng) > 0.015;

      const immediateTz = resolveSafeTimeZone('', lat, lng);

      // Immediately update coordinates so Hanafi times & real-time clock recalculate instantaneously
      setLocation((prev) => {
        const next: StoredLocationState = {
          gpsEnabled,
          latitude: lat,
          longitude: lng,
          areaName: movedEnough ? `Detecting area (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)...` : prev.areaName,
          timeZone: movedEnough ? immediateTz : prev.timeZone || immediateTz,
        };
        saveStoredLocation(next);
        return next;
      });

      if (!movedEnough) return;
      lastGeoCoordsRef.current = { lat, lng };

      try {
        const res = await apiRequest<{ areaName?: string; timeZone?: string }>(
          `/api/prayer-timings/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
        );
        const areaName = res.areaName || `Live GPS (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)`;
        const resolvedTz = resolveSafeTimeZone(res.timeZone, lat, lng);
        setLocation((prev) => {
          const next: StoredLocationState = {
            ...prev,
            gpsEnabled,
            latitude: lat,
            longitude: lng,
            areaName,
            timeZone: resolvedTz,
          };
          saveStoredLocation(next);
          return next;
        });
      } catch {
        const fallback = `Live GPS (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)`;
        setLocation((prev) => {
          const next: StoredLocationState = {
            ...prev,
            gpsEnabled,
            latitude: lat,
            longitude: lng,
            areaName: fallback,
            timeZone: immediateTz,
          };
          saveStoredLocation(next);
          return next;
        });
      }
    },
    []
  );

  const stopWatchingGps = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const detectLiveLocation = useCallback(
    (startWatch = true) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setLocNotice('Browser GPS is not available here. Please select your area from the dropdown.');
        return;
      }
      setLocating(true);
      setLocNotice('');

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocating(false);
          setLocNotice('');
          void resolveAreaNameAndApply(pos.coords.latitude, pos.coords.longitude, true);

          if (startWatch) {
            stopWatchingGps();
            watchIdRef.current = navigator.geolocation.watchPosition(
              (watchPos) => {
                void resolveAreaNameAndApply(
                  watchPos.coords.latitude,
                  watchPos.coords.longitude,
                  true
                );
              },
              () => {
                // ignore transient watch errors
              },
              { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 }
            );
          }
        },
        (geoErr) => {
          setLocating(false);
          const denied = geoErr.code === geoErr.PERMISSION_DENIED;
          setLocNotice(
            denied
              ? 'Location permission blocked in browser. Please allow location access or choose your area manually below.'
              : 'Could not detect GPS location right now. You can retry or select your area manually below.'
          );
          setLocation((prev) => {
            const next = { ...prev, gpsEnabled: false };
            saveStoredLocation(next);
            return next;
          });
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    },
    [resolveAreaNameAndApply, stopWatchingGps]
  );

  // If user previously turned GPS ON, refresh silently on mount and clean up watcher on unmount
  useEffect(() => {
    if (location.gpsEnabled) {
      detectLiveLocation(true);
    }
    return () => {
      stopWatchingGps();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on Escape when modal is open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Recompute astronomical schedule once per minute (while live clock updates every second)
  const minuteBucket = Math.floor(now.getTime() / 60000);

  const schedule = useMemo(
    () =>
      calculateHanafiPrayerSchedule(
        location.latitude,
        location.longitude,
        new Date(minuteBucket * 60000),
        {
          fajr: prayerSettings.fajr_jamaat_offset,
          zuhr: prayerSettings.zuhr_jamaat_offset,
          asr: prayerSettings.asr_jamaat_offset,
          maghrib: prayerSettings.maghrib_jamaat_offset,
          isha: prayerSettings.isha_jamaat_offset,
        },
        location.timeZone
      ),
    [
      location.latitude,
      location.longitude,
      location.timeZone,
      minuteBucket,
      prayerSettings.fajr_jamaat_offset,
      prayerSettings.zuhr_jamaat_offset,
      prayerSettings.asr_jamaat_offset,
      prayerSettings.maghrib_jamaat_offset,
      prayerSettings.isha_jamaat_offset,
    ]
  );

  // Real-time live clock for the active location's exact timezone
  const liveLocationTime = formatLiveClockForZone(now, schedule.timeZone, true);

  // Current (abhi wala) Namaz name & Namaz (Jamaat) time — NOT Azan, NOT Next
  const isJumuahNow =
    schedule.isFriday &&
    schedule.activePrayer.key === 'zuhr' &&
    Boolean(prayerSettings.jumuah_namaz_time);
  const currentNamazLabel = isJumuahNow ? "Jumu'ah" : schedule.activePrayer.shortName;
  const currentNamazTime = isJumuahNow
    ? prayerSettings.jumuah_namaz_time
    : schedule.activePrayer.namazFormatted;

  const showRamzanTab = isSuperAdmin || Boolean(prayerSettings.ramzan_timetable_visible);

  // If Ramzan tab becomes hidden for non-admin, switch back to timings
  useEffect(() => {
    if (activeTab === 'ramzan' && !showRamzanTab) {
      setActiveTab('timings');
    }
    if (activeTab === 'manage' && !isSuperAdmin) {
      setActiveTab('timings');
    }
  }, [activeTab, showRamzanTab, isSuperAdmin]);

  const handleToggleGps = () => {
    if (location.gpsEnabled) {
      stopWatchingGps();
      setLocNotice('');
      const defLat = Number(prayerSettings.default_latitude) || DEFAULT_SETTINGS.default_latitude;
      const defLng = Number(prayerSettings.default_longitude) || DEFAULT_SETTINGS.default_longitude;
      const fallback: StoredLocationState = {
        gpsEnabled: false,
        latitude: defLat,
        longitude: defLng,
        areaName: prayerSettings.default_location_name || DEFAULT_SETTINGS.default_location_name,
        timeZone: resolveSafeTimeZone('', defLat, defLng),
      };
      setLocation(fallback);
      saveStoredLocation(fallback);
    } else {
      detectLiveLocation(true);
    }
  };

  const handleSelectPresetArea = (areaName: string) => {
    const found = PRESET_AREAS.find((a) => a.name === areaName);
    if (!found) return;
    stopWatchingGps();
    setLocNotice('');
    lastGeoCoordsRef.current = { lat: found.latitude, lng: found.longitude };
    const next: StoredLocationState = {
      gpsEnabled: false,
      latitude: found.latitude,
      longitude: found.longitude,
      areaName: found.name,
      timeZone: found.timeZone || resolveSafeTimeZone('', found.latitude, found.longitude),
    };
    setLocation(next);
    saveStoredLocation(next);
  };

  const handleUploadRamzanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isSuperAdmin) return;
    setUploadingRamzan(true);
    setErr('');
    setMsg('');
    try {
      const up = await uploadFile(file, 'madrasa-assets');
      setForm((prev) => ({
        ...prev,
        ramzan_timetable_url: up.url,
        ramzan_timetable_type: up.mimetype || file.type || '',
        ramzan_timetable_name: up.name || file.name || 'Ramzan_Timetable',
      }));
      setRamzanStoredRef(up.storedRef || up.url);
      setMsg(`Uploaded "${up.name || file.name}". Click "Save Settings" to publish.`);
    } catch (uploadErr: any) {
      setErr(uploadErr?.message || 'Failed to upload Ramzan timetable file.');
    } finally {
      setUploadingRamzan(false);
      e.target.value = '';
    }
  };

  const handleQuickToggleRamzanVisibility = async (nextVisible: boolean) => {
    if (!isSuperAdmin || togglingRamzan) return;
    setTogglingRamzan(true);
    setErr('');
    setMsg('');
    try {
      const res = await apiRequest<{ settings: PrayerSettingsData; tableReady?: boolean }>(
        '/api/prayer-timings',
        {
          method: 'PUT',
          body: JSON.stringify({ ramzan_timetable_visible: nextVisible }),
        }
      );
      const updated = { ...DEFAULT_SETTINGS, ...(res.settings || {}) };
      setPrayerSettings(updated);
      setForm((prev) => ({ ...prev, ramzan_timetable_visible: updated.ramzan_timetable_visible }));
      setTableReady(res.tableReady !== false);
      setMsg(
        nextVisible
          ? 'Ramzan Timetable is now ON — visible to all students, teachers, parents, and users.'
          : 'Ramzan Timetable is now OFF — visible only to Super Admin.'
      );
    } catch (toggleErr: any) {
      setErr(toggleErr?.message || 'Failed to toggle Ramzan timetable visibility.');
    } finally {
      setTogglingRamzan(false);
    }
  };

  const handleSaveAdminSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || saving) return;
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const payload = {
        ...form,
        ramzan_timetable_url:
          ramzanStoredRef !== null ? ramzanStoredRef : form.ramzan_timetable_url,
      };
      const res = await apiRequest<{ settings: PrayerSettingsData; tableReady?: boolean }>(
        '/api/prayer-timings',
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        }
      );
      const updated = { ...DEFAULT_SETTINGS, ...(res.settings || {}) };
      setPrayerSettings(updated);
      setForm(updated);
      setRamzanStoredRef(null);
      setTableReady(res.tableReady !== false);
      setMsg('Jumu\'ah, Eid, Jamaat & Ramzan Timetable settings saved successfully.');
    } catch (saveErr: any) {
      setErr(saveErr?.message || 'Failed to save prayer settings.');
    } finally {
      setSaving(false);
    }
  };

  const ramzanIsPdf = isPdfAsset(
    prayerSettings.ramzan_timetable_url,
    prayerSettings.ramzan_timetable_type,
    prayerSettings.ramzan_timetable_name
  );

  const formRamzanIsPdf = isPdfAsset(
    form.ramzan_timetable_url,
    form.ramzan_timetable_type,
    form.ramzan_timetable_name
  );

  return (
    <>
      {/* TopBar "Namaz's Time" Widget right beside Notification Bell */}
      <div className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50/90 text-emerald-950 overflow-hidden shrink-0 shadow-[0_1px_2px_rgba(6,95,70,0.06)]">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setErr('');
            setMsg('');
            void fetchPrayerSettings();
          }}
          title={`Namaz's Time (${location.areaName}) — Current Namaz: ${currentNamazLabel} ${currentNamazTime} | Live Time: ${liveLocationTime}`}
          className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 hover:bg-emerald-100/80 transition-colors cursor-pointer"
        >
          <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-700 shrink-0" />
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs leading-none whitespace-nowrap">
            <span className="font-extrabold text-emerald-950 tracking-tight">
              Namaz&apos;s Time
            </span>
            <span className="text-emerald-300">|</span>
            <span className="font-bold text-emerald-900">{currentNamazLabel}</span>
            <span className="font-mono-num font-extrabold text-emerald-700">
              {currentNamazTime}
            </span>
            <span className="hidden md:inline text-emerald-300">•</span>
            <span
              className="hidden md:inline font-mono-num font-semibold text-emerald-800/90 text-[11px]"
              title={`Real-time clock (${location.areaName})`}
            >
              {liveLocationTime}
            </span>
          </div>
        </button>

        {/* Direct Location ON / OFF toggle right on TopBar */}
        <button
          type="button"
          onClick={handleToggleGps}
          disabled={locating}
          aria-pressed={location.gpsEnabled}
          title={
            location.gpsEnabled
              ? `Live Location ON (${location.areaName}) — Click to turn OFF`
              : 'Turn Location ON for automatic real-time area Namaz timings'
          }
          className={`inline-flex items-center gap-1 px-2 py-1.5 border-s border-emerald-200 text-[10px] sm:text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-60 ${
            location.gpsEnabled
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-white/80 text-neutral-600 hover:bg-emerald-100 hover:text-emerald-900'
          }`}
        >
          {locating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : (
            <LocateFixed className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="hidden sm:inline">
            {locating ? '...' : location.gpsEnabled ? 'ON' : 'OFF'}
          </span>
        </button>
      </div>

      {/* Modal Portal */}
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/55 overflow-y-auto p-3 sm:p-5 flex items-start justify-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div className="w-full max-w-3xl bg-white rounded-2xl border border-neutral-200 shadow-2xl overflow-hidden my-auto">
              {/* Emerald Islamic Header */}
              <div className="bg-gradient-to-r from-[#064E3B] via-[#065F46] to-[#047857] text-white px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/15 text-[10px] font-bold uppercase tracking-wider">
                        <Moon className="w-3 h-3" /> Hanafi Fiqh · Karachi
                      </span>
                      <span className="urdu-text text-sm font-bold text-emerald-100" dir="rtl">
                        اوقاتِ نماز (فقہ حنفی)
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                      Namaz&apos;s Time — Jumu&apos;ah, Eid &amp; Live Timetable
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-emerald-100">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> {schedule.gregorianLabel}
                      </span>
                      {schedule.hijriLabel && (
                        <>
                          <span className="opacity-50">•</span>
                          <span className="font-semibold text-white">{schedule.hijriLabel}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="hidden sm:flex flex-col items-end px-3 py-1.5 rounded-xl bg-black/25 border border-white/10">
                      <span className="text-[9px] uppercase tracking-wider text-emerald-200 font-semibold">
                        Live Local Time
                      </span>
                      <span className="font-mono-num text-sm font-extrabold text-white">
                        {liveLocationTime}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white shrink-0"
                      aria-label="Close Namaz's Time"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Current Namaz Live Banner + GPS Location Bar */}
                <div className="mt-3.5 pt-3 border-t border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="w-4 h-4 text-emerald-200 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">{location.areaName}</div>
                      <div className="text-[10px] text-emerald-200 font-mono-num">
                        {location.gpsEnabled ? 'Live GPS ON' : 'Manual Area'} · {liveLocationTime} ·{' '}
                        {location.latitude.toFixed(2)}°N, {location.longitude.toFixed(2)}°E
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleToggleGps}
                      disabled={locating}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                        location.gpsEnabled
                          ? 'bg-emerald-400 text-[#064E3B] hover:bg-emerald-300'
                          : 'bg-white/15 text-white hover:bg-white/25'
                      }`}
                    >
                      {locating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <LocateFixed className="w-3.5 h-3.5" />
                      )}
                      {locating
                        ? 'Detecting...'
                        : location.gpsEnabled
                          ? 'Location: ON'
                          : 'Location: OFF'}
                    </button>

                    {location.gpsEnabled && (
                      <button
                        type="button"
                        onClick={() => detectLiveLocation(true)}
                        disabled={locating}
                        title="Refresh Live GPS Area"
                        className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${locating ? 'animate-spin' : ''}`} />
                      </button>
                    )}

                    <div className="px-2.5 py-1.5 rounded-lg bg-black/25 text-[11px] font-semibold">
                      {schedule.activePrayer.isCurrentWaqt ? 'Current Namaz:' : 'Namaz:'}{' '}
                      <span className="text-emerald-200">{currentNamazLabel}</span>{' '}
                      <span className="font-mono-num font-bold text-white">{currentNamazTime}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Manual Area Selector & GPS Notice */}
              <div className="px-5 py-2.5 bg-neutral-50 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-[11px] font-semibold text-[#525252] whitespace-nowrap">
                    Change Area:
                  </span>
                  <select
                    value={
                      PRESET_AREAS.some((a) => a.name === location.areaName)
                        ? location.areaName
                        : ''
                    }
                    onChange={(e) => handleSelectPresetArea(e.target.value)}
                    className="flex-1 max-w-xs px-2.5 py-1 text-[11px] rounded-lg border border-neutral-200 bg-white text-[#171717]"
                  >
                    <option value="">
                      {location.gpsEnabled
                        ? 'Using Live GPS Area (or pick city)...'
                        : 'Select City / Area...'}
                    </option>
                    {PRESET_AREAS.map((area) => (
                      <option key={area.name} value={area.name}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Modal Tabs */}
                <div className="flex items-center gap-1 p-1 bg-neutral-200/70 rounded-lg self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setActiveTab('timings')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                      activeTab === 'timings'
                        ? 'bg-white text-[#065F46] shadow-xs'
                        : 'text-[#525252] hover:text-[#171717]'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" /> Namaz Timings
                  </button>

                  {showRamzanTab && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('ramzan')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        activeTab === 'ramzan'
                          ? 'bg-white text-[#065F46] shadow-xs'
                          : 'text-[#525252] hover:text-[#171717]'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Ramzan Timetable</span>
                      {isSuperAdmin && !prayerSettings.ramzan_timetable_visible && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                          OFF
                        </span>
                      )}
                    </button>
                  )}

                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('manage');
                        setErr('');
                        setMsg('');
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        activeTab === 'manage'
                          ? 'bg-white text-[#DC1726] shadow-xs'
                          : 'text-[#525252] hover:text-[#171717]'
                      }`}
                    >
                      <Settings className="w-3.5 h-3.5" /> Set Timings
                    </button>
                  )}
                </div>
              </div>

              {/* Body Content */}
              <div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto">
                {locNotice && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    {locNotice}
                  </div>
                )}
                {msg && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                    {msg}
                  </div>
                )}
                {err && (
                  <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
                    {err}
                  </div>
                )}

                {/* TAB 1: DAILY HANAFI NAMAZ + JUMU'AH + EID */}
                {activeTab === 'timings' && (
                  <div className="space-y-4">
                    {/* 5 Daily Hanafi Prayers Table */}
                    <div className="rounded-xl border border-neutral-200 overflow-hidden">
                      <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#171717]">
                          5 Waqt Daily Namaz — Hanafi Fiqh (Auto by Area)
                        </span>
                        {loadingSettings && (
                          <span className="text-[11px] text-[#737373]">Syncing...</span>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-white border-b border-neutral-100 text-[#737373]">
                            <tr>
                              <th className="px-4 py-2.5 text-start font-semibold">Namaz</th>
                              <th className="px-4 py-2.5 text-center font-semibold">Azan Time</th>
                              <th className="px-4 py-2.5 text-center font-semibold">Namaz / Jamaat</th>
                              <th className="px-4 py-2.5 text-end font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100">
                            {schedule.prayers.map((p) => {
                              const isCurrent = schedule.currentPrayerKey === p.key;
                              const isNext = schedule.nextPrayer.key === p.key;
                              return (
                                <tr
                                  key={p.key}
                                  className={
                                    isCurrent
                                      ? 'bg-emerald-50/70'
                                      : isNext
                                        ? 'bg-sky-50/40'
                                        : 'hover:bg-neutral-50'
                                  }
                                >
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-[#171717]">{p.name}</span>
                                      <span
                                        className="urdu-text text-sm text-[#525252]"
                                        dir="rtl"
                                      >
                                        {p.urdu}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center font-mono-num font-bold text-[#065F46]">
                                    {p.azanFormatted}
                                  </td>
                                  <td className="px-4 py-3 text-center font-mono-num font-bold text-[#171717]">
                                    {p.namazFormatted}
                                  </td>
                                  <td className="px-4 py-3 text-end">
                                    {isCurrent ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold">
                                        Current Waqt
                                      </span>
                                    ) : isNext ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 text-[10px] font-bold">
                                        Next ({schedule.nextPrayer.countdownLabel})
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-[#737373]">Hanafi</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Sun & Sehri/Iftar Quick Reference Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-3 text-center">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#737373]">
                          Sehri End
                        </div>
                        <div className="font-mono-num text-sm font-bold text-[#065F46] mt-0.5">
                          {schedule.sehriEndFormatted}
                        </div>
                      </div>
                      <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-3 text-center">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#737373] inline-flex items-center gap-1">
                          <Sun className="w-3 h-3 text-amber-500" /> Sunrise (Tulu)
                        </div>
                        <div className="font-mono-num text-sm font-bold text-[#171717] mt-0.5">
                          {schedule.sunriseFormatted}
                        </div>
                      </div>
                      <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-3 text-center">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#737373]">
                          Zawal (Midday)
                        </div>
                        <div className="font-mono-num text-sm font-bold text-[#171717] mt-0.5">
                          {schedule.zawalFormatted}
                        </div>
                      </div>
                      <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-3 text-center">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#737373]">
                          Iftar (Maghrib)
                        </div>
                        <div className="font-mono-num text-sm font-bold text-[#DC1726] mt-0.5">
                          {schedule.iftarFormatted}
                        </div>
                      </div>
                    </div>

                    {/* Jumu'ah & Eid Namaz Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {/* Jumu'ah Card */}
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-xs font-extrabold text-[#064E3B] uppercase tracking-wide">
                              Jumu&apos;ah Namaz (Friday)
                            </div>
                            <div className="urdu-text text-sm font-bold text-emerald-800" dir="rtl">
                              نمازِ جمعہ
                            </div>
                          </div>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => setActiveTab('manage')}
                              className="px-2.5 py-1 rounded-md bg-white border border-emerald-200 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                            >
                              Set Time
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2.5 text-xs">
                          <div className="bg-white rounded-lg border border-emerald-100 p-2.5">
                            <div className="text-[10px] text-[#737373] font-medium">Jumma Azan / Khutbah</div>
                            <div className="font-mono-num text-sm font-extrabold text-[#065F46] mt-0.5">
                              {prayerSettings.jumuah_azan_time || '—'}
                            </div>
                          </div>
                          <div className="bg-white rounded-lg border border-emerald-100 p-2.5">
                            <div className="text-[10px] text-[#737373] font-medium">Jumma Namaz / Jamaat</div>
                            <div className="font-mono-num text-sm font-extrabold text-[#171717] mt-0.5">
                              {prayerSettings.jumuah_namaz_time || '—'}
                            </div>
                          </div>
                        </div>
                        {prayerSettings.jumuah_note && (
                          <p className="text-[11px] text-emerald-900/80">{prayerSettings.jumuah_note}</p>
                        )}
                      </div>

                      {/* Eid Namaz Card */}
                      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-xs font-extrabold text-amber-950 uppercase tracking-wide">
                              Eid Namaz Timings
                            </div>
                            <div className="urdu-text text-sm font-bold text-amber-800" dir="rtl">
                              نمازِ عیدین (عید الفطر و عید الاضحیٰ)
                            </div>
                          </div>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => setActiveTab('manage')}
                              className="px-2.5 py-1 rounded-md bg-white border border-amber-200 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                            >
                              Set Time
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2.5 text-xs">
                          <div className="bg-white rounded-lg border border-amber-100 p-2.5">
                            <div className="text-[10px] text-[#737373] font-medium">Eid-ul-Fitr</div>
                            <div className="font-mono-num text-sm font-extrabold text-[#DC1726] mt-0.5">
                              {prayerSettings.eid_ul_fitr_time || '—'}
                            </div>
                            {prayerSettings.eid_ul_fitr_note && (
                              <div className="text-[10px] text-[#737373] mt-0.5 truncate">
                                {prayerSettings.eid_ul_fitr_note}
                              </div>
                            )}
                          </div>
                          <div className="bg-white rounded-lg border border-amber-100 p-2.5">
                            <div className="text-[10px] text-[#737373] font-medium">Eid-ul-Adha</div>
                            <div className="font-mono-num text-sm font-extrabold text-[#171717] mt-0.5">
                              {prayerSettings.eid_ul_adha_time || '—'}
                            </div>
                            {prayerSettings.eid_ul_adha_note && (
                              <div className="text-[10px] text-[#737373] mt-0.5 truncate">
                                {prayerSettings.eid_ul_adha_note}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: RAMZAN TIMETABLE VIEW (Visible to all when ON; Super Admin only when OFF) */}
                {activeTab === 'ramzan' && showRamzanTab && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                      <div>
                        <div className="text-sm font-bold text-[#171717]">
                          {prayerSettings.ramzan_timetable_title || 'Ramzan Mubarak Timetable'}
                        </div>
                        <div className="text-xs text-[#525252] mt-0.5">
                          Today ({location.areaName}): Sehri End{' '}
                          <strong className="font-mono-num text-[#065F46]">
                            {schedule.sehriEndFormatted}
                          </strong>{' '}
                          · Iftar{' '}
                          <strong className="font-mono-num text-[#DC1726]">
                            {schedule.iftarFormatted}
                          </strong>
                        </div>
                      </div>

                      {isSuperAdmin && (
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                              prayerSettings.ramzan_timetable_visible
                                ? 'bg-emerald-600 text-white'
                                : 'bg-amber-100 text-amber-900 border border-amber-200'
                            }`}
                          >
                            {prayerSettings.ramzan_timetable_visible ? (
                              <>
                                <Eye className="w-3.5 h-3.5" /> Visible to All (ON)
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3.5 h-3.5" /> Super Admin Only (OFF)
                              </>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => setActiveTab('manage')}
                            className="px-3 py-1 rounded-md bg-white border border-neutral-200 text-xs font-semibold text-[#171717] hover:bg-neutral-100"
                          >
                            Change / Upload
                          </button>
                        </div>
                      )}
                    </div>

                    {prayerSettings.ramzan_timetable_url ? (
                      <div className="rounded-xl border border-neutral-200 overflow-hidden bg-white">
                        <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-[#171717] inline-flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-[#DC1726]" />
                            {prayerSettings.ramzan_timetable_name || 'Ramzan Timetable'}
                          </span>
                          <div className="flex items-center gap-2">
                            <a
                              href={prayerSettings.ramzan_timetable_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-neutral-200 text-[11px] font-semibold text-[#171717] hover:bg-neutral-100"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Open Full
                            </a>
                            <a
                              href={prayerSettings.ramzan_timetable_url}
                              download={prayerSettings.ramzan_timetable_name || 'Ramzan_Timetable'}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#065F46] text-white text-[11px] font-semibold hover:bg-emerald-800"
                            >
                              <Download className="w-3.5 h-3.5" /> Download
                            </a>
                          </div>
                        </div>

                        {ramzanIsPdf ? (
                          <div className="bg-neutral-100">
                            <iframe
                              src={prayerSettings.ramzan_timetable_url}
                              title={prayerSettings.ramzan_timetable_title || 'Ramzan Timetable PDF'}
                              className="w-full h-[460px] border-0"
                            />
                          </div>
                        ) : (
                          <div className="p-3 bg-neutral-50 flex justify-center">
                            <img
                              src={prayerSettings.ramzan_timetable_url}
                              alt={prayerSettings.ramzan_timetable_title || 'Ramzan Timetable'}
                              referrerPolicy="no-referrer"
                              className="max-h-[520px] w-auto rounded-lg border border-neutral-200 shadow-xs object-contain"
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-xs text-[#737373] space-y-2">
                        <p className="font-semibold text-[#171717]">
                          No Ramzan Timetable image or PDF uploaded yet.
                        </p>
                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => setActiveTab('manage')}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
                          >
                            <FileUp className="w-3.5 h-3.5" /> Upload Ramzan Timetable
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: SUPER ADMIN MANAGEMENT ONLY */}
                {activeTab === 'manage' && isSuperAdmin && (
                  <form onSubmit={handleSaveAdminSettings} className="space-y-5 text-xs">
                    {!tableReady && (
                      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
                        <strong>Database Setup Needed:</strong> Please run the{' '}
                        <code className="font-mono-num">prayer_settings</code> SQL snippet in your
                        Supabase SQL Editor so your Jumu&apos;ah, Eid, and Ramzan Timetable changes
                        save permanently.
                      </div>
                    )}

                    {/* Ramzan Timetable Visibility ON/OFF + Upload */}
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                              form.ramzan_timetable_visible
                                ? 'bg-emerald-600 text-white'
                                : 'bg-neutral-200 text-neutral-600'
                            }`}
                          >
                            <Power className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-[#171717]">
                              Ramzan Timetable Visibility:{' '}
                              <span
                                className={
                                  form.ramzan_timetable_visible
                                    ? 'text-emerald-700'
                                    : 'text-[#DC1726]'
                                }
                              >
                                {form.ramzan_timetable_visible
                                  ? 'ON (Visible to All Users)'
                                  : 'OFF (Super Admin Only)'}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#737373] mt-0.5">
                              ON karne par sabhi dashboards me Ramzan Timetable dikhega. OFF rakhne
                              par sirf Super Admin ko dikhega.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 p-1 bg-white border border-neutral-200 rounded-lg self-start sm:self-center shrink-0">
                          <button
                            type="button"
                            disabled={togglingRamzan}
                            onClick={() => handleQuickToggleRamzanVisibility(true)}
                            className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors ${
                              form.ramzan_timetable_visible
                                ? 'bg-emerald-600 text-white'
                                : 'text-[#525252] hover:bg-neutral-100'
                            }`}
                          >
                            ON
                          </button>
                          <button
                            type="button"
                            disabled={togglingRamzan}
                            onClick={() => handleQuickToggleRamzanVisibility(false)}
                            className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors ${
                              !form.ramzan_timetable_visible
                                ? 'bg-[#DC1726] text-white'
                                : 'text-[#525252] hover:bg-neutral-100'
                            }`}
                          >
                            OFF
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block font-semibold mb-1 text-[#171717]">
                            Ramzan Timetable Title
                          </label>
                          <input
                            type="text"
                            value={form.ramzan_timetable_title}
                            onChange={(e) =>
                              setForm({ ...form, ramzan_timetable_title: e.target.value })
                            }
                            placeholder="e.g. Ramzan Mubarak Timetable 1447 AH"
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                          />
                        </div>

                        <div>
                          <label className="block font-semibold mb-1 text-[#171717]">
                            Upload Image or PDF (JPG, PNG, WebP, PDF)
                          </label>
                          <div className="flex items-center gap-2">
                            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#171717] text-white font-semibold cursor-pointer hover:bg-neutral-800">
                              {uploadingRamzan ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <FileUp className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {uploadingRamzan ? 'Uploading...' : 'Upload Image / PDF'}
                              </span>
                              <input
                                type="file"
                                accept="image/*,.pdf,application/pdf"
                                onChange={handleUploadRamzanFile}
                                className="hidden"
                              />
                            </label>

                            {form.ramzan_timetable_url && (
                              <button
                                type="button"
                                onClick={() => {
                                  setForm((prev) => ({
                                    ...prev,
                                    ramzan_timetable_url: '',
                                    ramzan_timetable_name: '',
                                    ramzan_timetable_type: '',
                                  }));
                                  setRamzanStoredRef('');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-red-200 bg-white text-[#DC1726] font-semibold hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {form.ramzan_timetable_url && (
                        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-white border border-neutral-200">
                          {formRamzanIsPdf ? (
                            <div className="w-12 h-12 rounded-lg bg-red-50 text-[#DC1726] flex items-center justify-center shrink-0">
                              <FileText className="w-6 h-6" />
                            </div>
                          ) : (
                            <img
                              src={form.ramzan_timetable_url}
                              alt="Ramzan preview"
                              referrerPolicy="no-referrer"
                              className="w-12 h-12 rounded-lg object-cover border border-neutral-200 shrink-0"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-[#171717] truncate">
                              {form.ramzan_timetable_name || 'Ramzan Timetable File'}
                            </div>
                            <div className="text-[11px] text-[#737373]">
                              {formRamzanIsPdf ? 'PDF Document' : 'Image File'} · Ready
                            </div>
                          </div>
                          <a
                            href={form.ramzan_timetable_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-semibold text-[#065F46] hover:underline shrink-0"
                          >
                            Preview
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Jumu'ah & Eid Namaz Settings */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-neutral-200 p-4 space-y-3">
                        <div className="font-bold text-[#171717]">Jumu&apos;ah (Friday) Timings</div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block font-medium mb-1">Jumma Azan Time</label>
                            <input
                              type="text"
                              value={form.jumuah_azan_time}
                              onChange={(e) =>
                                setForm({ ...form, jumuah_azan_time: e.target.value })
                              }
                              placeholder="12:45 PM"
                              className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                            />
                          </div>
                          <div>
                            <label className="block font-medium mb-1">Jumma Namaz Time</label>
                            <input
                              type="text"
                              value={form.jumuah_namaz_time}
                              onChange={(e) =>
                                setForm({ ...form, jumuah_namaz_time: e.target.value })
                              }
                              placeholder="01:30 PM"
                              className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block font-medium mb-1">Jumu&apos;ah Note / Bayan Info</label>
                          <input
                            type="text"
                            value={form.jumuah_note}
                            onChange={(e) => setForm({ ...form, jumuah_note: e.target.value })}
                            placeholder="e.g. Khutbah starts 15 minutes before Jamaat"
                            className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-neutral-200 p-4 space-y-3">
                        <div className="font-bold text-[#171717]">Eid Namaz Timings</div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block font-medium mb-1">Eid-ul-Fitr Time</label>
                            <input
                              type="text"
                              value={form.eid_ul_fitr_time}
                              onChange={(e) =>
                                setForm({ ...form, eid_ul_fitr_time: e.target.value })
                              }
                              placeholder="07:30 AM"
                              className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                            />
                          </div>
                          <div>
                            <label className="block font-medium mb-1">Eid-ul-Fitr Place / Note</label>
                            <input
                              type="text"
                              value={form.eid_ul_fitr_note}
                              onChange={(e) =>
                                setForm({ ...form, eid_ul_fitr_note: e.target.value })
                              }
                              placeholder="Madrasa Eidgah"
                              className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                            />
                          </div>
                          <div>
                            <label className="block font-medium mb-1">Eid-ul-Adha Time</label>
                            <input
                              type="text"
                              value={form.eid_ul_adha_time}
                              onChange={(e) =>
                                setForm({ ...form, eid_ul_adha_time: e.target.value })
                              }
                              placeholder="07:00 AM"
                              className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num"
                            />
                          </div>
                          <div>
                            <label className="block font-medium mb-1">Eid-ul-Adha Place / Note</label>
                            <input
                              type="text"
                              value={form.eid_ul_adha_note}
                              onChange={(e) =>
                                setForm({ ...form, eid_ul_adha_note: e.target.value })
                              }
                              placeholder="Madrasa Eidgah"
                              className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Jamaat Delay after Azan (Minutes) */}
                    <div className="rounded-xl border border-neutral-200 p-4 space-y-2.5">
                      <div>
                        <div className="font-bold text-[#171717]">
                          Jamaat Delay After Azan (Minutes)
                        </div>
                        <p className="text-[11px] text-[#737373]">
                          Azan time har area ke GPS location ke hisab se auto-update hota rahega;
                          Namaz / Jamaat time Azan ke kitne minute baad hoga yahan set karein.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        {(
                          [
                            ['fajr_jamaat_offset', 'Fajr (+min)'],
                            ['zuhr_jamaat_offset', 'Zuhr (+min)'],
                            ['asr_jamaat_offset', 'Asr (+min)'],
                            ['maghrib_jamaat_offset', 'Maghrib (+min)'],
                            ['isha_jamaat_offset', 'Isha (+min)'],
                          ] as const
                        ).map(([field, label]) => (
                          <div key={field}>
                            <label className="block font-medium mb-1 text-[11px]">{label}</label>
                            <input
                              type="number"
                              min={0}
                              max={120}
                              value={form[field]}
                              onChange={(e) =>
                                setForm({ ...form, [field]: Number(e.target.value) || 0 })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 font-mono-num"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                      <button
                        type="button"
                        onClick={() => setActiveTab('timings')}
                        className="px-4 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 font-medium text-[#171717]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving || uploadingRamzan}
                        className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold hover:bg-red-700 disabled:opacity-60"
                      >
                        {saving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        {saving ? 'Saving...' : 'Save Settings'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
