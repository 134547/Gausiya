import React, { useEffect, useState } from 'react';
import { ExternalLink, Megaphone, Pencil, Upload, Volume2, VolumeX, X } from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { safeReadJson } from '../lib/imageUpload.ts';
import { isSafeExternalUrl, isVideoUrl } from '../lib/media.ts';

export interface CornerAdData {
  enabled: boolean;
  show_on_portal: boolean;
  badge: string;
  title: string;
  description: string;
  media_url: string;
  media_type: 'none' | 'image' | 'video';
  cta_label: string;
  cta_url: string;
  updated_at: string;
}

interface CornerAdWidgetProps {
  context: 'public' | 'portal';
  canManage?: boolean;
}

const DISMISS_STORAGE_KEY = 'madrasa_corner_ad_dismissed_v1';

export const CornerAdWidget: React.FC<CornerAdWidgetProps> = ({ context, canManage = false }) => {
  const [ad, setAd] = useState<CornerAdData | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [muted, setMuted] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState<CornerAdData>({
    enabled: true,
    show_on_portal: true,
    badge: 'Sponsored · Notice',
    title: '',
    description: '',
    media_url: '',
    media_type: 'none',
    cta_label: '',
    cta_url: '',
    updated_at: '',
  });

  useEffect(() => {
    let active = true;
    const loadAd = async () => {
      try {
        const res = await fetch('/api/public/corner-ad', { headers: { Accept: 'application/json' } });
        if (!res.ok) return;
        const { data } = await safeReadJson<{ ad?: CornerAdData }>(res);
        if (!active || !data?.ad) return;
        setAd(data.ad);
        setForm(data.ad);
        try {
          const dismissedVer = sessionStorage.getItem(DISMISS_STORAGE_KEY);
          if (dismissedVer && dismissedVer === data.ad.updated_at) {
            setDismissed(true);
          } else {
            setDismissed(false);
          }
        } catch {
          // ignore storage errors
        }
      } catch {
        // non-blocking
      }
    };
    loadAd();
    return () => {
      active = false;
    };
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      if (ad?.updated_at) {
        sessionStorage.setItem(DISMISS_STORAGE_KEY, ad.updated_at);
      }
    } catch {
      // ignore
    }
  };

  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (form.cta_url.trim() && !isSafeExternalUrl(form.cta_url.trim())) {
      setErr('CTA Link must start with https://, http://, mailto:, tel:, or #');
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest<{ ad: CornerAdData }>('/api/corner-ad', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      if (res?.ad) {
        setAd(res.ad);
        setForm(res.ad);
        setDismissed(false);
        try {
          sessionStorage.removeItem(DISMISS_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
      setEditOpen(false);
    } catch (e: any) {
      setErr(e?.message || 'Failed to save advertisement');
    } finally {
      setSaving(false);
    }
  };

  if (!ad) return null;

  const shouldRenderCard =
    !dismissed &&
    ad.enabled &&
    (context === 'public' || ad.show_on_portal);

  const hasSafeCta = Boolean(ad.cta_label && ad.cta_url && isSafeExternalUrl(ad.cta_url));
  const isExternalCta = hasSafeCta && /^https?:\/\//i.test(ad.cta_url);
  const isVideo = Boolean(ad.media_url && (ad.media_type === 'video' || isVideoUrl(ad.media_url)));

  return (
    <>
      {shouldRenderCard && (
        <aside
          aria-label="Featured Announcement"
          className="no-print fixed z-40 bottom-[66px] end-3 md:bottom-4 md:end-4 w-[276px] sm:w-[308px] max-w-[calc(100vw-24px)] rounded-2xl bg-white border border-neutral-200/90 shadow-[0_14px_38px_-10px_rgba(17,24,39,0.28)] overflow-hidden transition-all"
        >
          {/* Top Accent Strip */}
          <div className="h-1 bg-gradient-to-r from-[#DC1726] via-amber-500 to-[#008069]" />

          {/* Header Badge + Dismiss / Admin Edit */}
          <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#DC1726] truncate">
              <Megaphone className="w-3 h-3 shrink-0" />
              <span className="truncate">{ad.badge || 'Advertisement'}</span>
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setForm(ad);
                    setErr('');
                    setEditOpen(true);
                  }}
                  title="Edit Corner Advertisement"
                  className="p-1 rounded-full text-[#737373] hover:text-[#171717] hover:bg-neutral-100 transition-colors cursor-pointer"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Close advertisement"
                title="Close"
                className="w-6 h-6 rounded-full bg-neutral-100 hover:bg-neutral-200 text-[#525252] hover:text-[#171717] flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Optional Image or Video Banner */}
          {ad.media_url && (
            <div className="px-3 pb-2">
              <div className="relative rounded-xl overflow-hidden bg-neutral-950 border border-neutral-200/80">
                {isVideo ? (
                  <>
                    <video
                      src={ad.media_url}
                      autoPlay
                      loop
                      muted={muted}
                      playsInline
                      className="w-full max-h-36 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setMuted((m) => !m)}
                      aria-label={muted ? 'Unmute video' : 'Mute video'}
                      className="absolute bottom-1.5 end-1.5 p-1 rounded-full bg-black/65 text-white hover:bg-black/85"
                    >
                      {muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                    </button>
                  </>
                ) : (
                  <img
                    src={ad.media_url}
                    alt={ad.title || 'Advertisement'}
                    className="w-full max-h-36 object-cover"
                  />
                )}
              </div>
            </div>
          )}

          {/* Content & CTA */}
          <div className="px-3 pb-3 space-y-1.5">
            {ad.title && (
              <h4 className="text-xs font-extrabold text-[#171717] leading-snug line-clamp-2">
                {ad.title}
              </h4>
            )}
            {ad.description && (
              <p className="text-[11px] text-[#525252] leading-relaxed line-clamp-3">
                {ad.description}
              </p>
            )}
            {hasSafeCta && (
              <div className="pt-1">
                <a
                  href={ad.cta_url}
                  target={isExternalCta ? '_blank' : undefined}
                  rel={isExternalCta ? 'noopener noreferrer' : undefined}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DC1726] hover:bg-red-700 text-white text-[11px] font-bold transition-colors"
                >
                  <span>{ad.cta_label}</span>
                  {isExternalCta && <ExternalLink className="w-3 h-3" />}
                </a>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Super Admin / Committee Quick Manage Pill when dismissed or turned off in Portal */}
      {!shouldRenderCard && canManage && context === 'portal' && (
        <button
          type="button"
          onClick={() => {
            setForm(ad);
            setErr('');
            setEditOpen(true);
          }}
          title="Manage Corner Advertisement"
          className="no-print hidden md:inline-flex fixed z-30 bottom-4 end-4 items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-neutral-200 shadow-sm text-[11px] font-semibold text-[#525252] hover:text-[#DC1726] hover:border-red-200 transition-colors cursor-pointer"
        >
          <Megaphone className="w-3.5 h-3.5 text-[#DC1726]" />
          <span>Corner Ad ({ad.enabled ? 'ON' : 'OFF'})</span>
        </button>
      )}

      {/* Corner Advertisement Editor Modal (Super Admin / Committee Only) */}
      {editOpen && canManage && (
        <div
          className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setEditOpen(false)}
        >
          <form
            onSubmit={handleSaveAd}
            onClick={(e) => e.stopPropagation()}
            className="max-w-md w-full bg-white rounded-2xl border border-neutral-200 shadow-2xl p-5 space-y-3.5 text-xs my-auto"
          >
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-[#DC1726]" />
                <h3 className="text-sm font-bold text-[#171717]">Corner Advertisement Settings</h3>
              </div>
              <button type="button" onClick={() => setEditOpen(false)} className="p-1 rounded hover:bg-neutral-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {err && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px] font-medium">
                {err}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                />
                <span>Show Corner Ad on Website</span>
              </label>
              <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_on_portal}
                  onChange={(e) => setForm({ ...form, show_on_portal: e.target.checked })}
                />
                <span>Also show inside Portal</span>
              </label>
            </div>

            <div>
              <label className="block font-semibold mb-1">Badge Label</label>
              <input
                type="text"
                value={form.badge}
                onChange={(e) => setForm({ ...form, badge: e.target.value })}
                placeholder="e.g. Sponsored · Admissions Open"
                className="w-full px-3 py-2 rounded-lg border border-neutral-200"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Title *</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Headline for your corner advertisement"
                className="w-full px-3 py-2 rounded-lg border border-neutral-200"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Short Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief details shown inside the corner card"
                className="w-full px-3 py-2 rounded-lg border border-neutral-200"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Ad Image or Video (Optional, max 10 MB)</label>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 cursor-pointer font-medium">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploading ? 'Uploading...' : 'Upload Image / Video'}</span>
                  <input
                    type="file"
                    accept="image/*,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v"
                    disabled={uploading}
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setErr('');
                      setUploading(true);
                      try {
                        const up = await uploadFile(f, 'madrasa-assets');
                        const vid = f.type.startsWith('video/') || isVideoUrl(up.url, up.name);
                        setForm((prev) => ({
                          ...prev,
                          media_url: up.url,
                          media_type: vid ? 'video' : 'image',
                        }));
                      } catch (uploadErr: any) {
                        setErr(uploadErr?.message || 'Upload failed');
                      } finally {
                        setUploading(false);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
                {form.media_url && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, media_url: '', media_type: 'none' })}
                    className="text-[#DC1726] font-semibold hover:underline"
                  >
                    Remove Media
                  </button>
                )}
              </div>
              {form.media_url && (
                <div className="mt-2 rounded-lg overflow-hidden border border-neutral-200 bg-black max-h-28 flex items-center justify-center">
                  {form.media_type === 'video' || isVideoUrl(form.media_url) ? (
                    <video src={form.media_url} controls muted playsInline className="max-h-28 w-full object-contain" />
                  ) : (
                    <img src={form.media_url} alt="Preview" className="max-h-28 w-full object-cover" />
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block font-semibold mb-1">Button Text (Optional)</label>
                <input
                  type="text"
                  value={form.cta_label}
                  onChange={(e) => setForm({ ...form, cta_label: e.target.value })}
                  placeholder="e.g. Learn More"
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Button Link (Optional)</label>
                <input
                  type="text"
                  value={form.cta_url}
                  onChange={(e) => setForm({ ...form, cta_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="px-4 py-2 rounded-lg bg-neutral-100 font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploading}
                className="px-4 py-2 rounded-lg bg-[#DC1726] text-white font-semibold hover:bg-red-700 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Corner Ad'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};
