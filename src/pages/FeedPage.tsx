import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileUp,
  Heart,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { downloadFeedPostCard, downloadImageFile } from '../lib/download.ts';
import { User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';

interface FeedPageProps {
  user: User;
}

export const FeedPage: React.FC<FeedPageProps> = ({ user }) => {
  const canPost = user.role_slug === 'super_admin' || user.role_slug === 'teacher' || user.role_slug === 'committee_member';
  const canDelete = user.role_slug === 'super_admin' || user.role_slug === 'committee_member';

  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', content: '', images: [] as string[] });
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [viewPostId, setViewPostId] = useState<string | null>(null);
  const [viewImageIdx, setViewImageIdx] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const viewPost = posts.find((p) => p.id === viewPostId) || null;

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ posts: any[] }>('/api/feed');
      setPosts(res.posts || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const parseImages = (jsonStr: string): string[] => {
    try {
      const parsed = JSON.parse(jsonStr || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      if (editingId) {
        await apiRequest(`/api/feed/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await apiRequest('/api/feed', { method: 'POST', body: JSON.stringify(form) });
      }
      setFormOpen(false);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleLike = async (postId: string) => {
    setErr('');
    try {
      await apiRequest(`/api/feed/${postId}/like`, { method: 'POST' });
      load();
    } catch (e: any) {
      setErr(e.message || 'Failed to update like');
    }
  };

  const handleComment = async (e: React.FormEvent, postId: string) => {
    e.preventDefault();
    const comment = (commentInputs[postId] || '').trim();
    if (!comment) return;
    setErr('');
    try {
      await apiRequest(`/api/feed/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ comment }),
      });
      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
      load();
    } catch (e: any) {
      setErr(e.message || 'Failed to post comment');
    }
  };

  const handleDownloadImage = async (url: string, baseName: string, key: string) => {
    if (downloadingKey) return;
    setErr('');
    setDownloadingKey(key);
    try {
      await downloadImageFile(url, baseName);
    } catch (e: any) {
      setErr(e?.message || 'Failed to download image');
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleDownloadAllImages = async (urls: string[], baseName: string, key: string) => {
    if (downloadingKey) return;
    setErr('');
    setDownloadingKey(key);
    try {
      for (let i = 0; i < urls.length; i += 1) {
        await downloadImageFile(urls[i], `${baseName}-${i + 1}`);
      }
    } catch (e: any) {
      setErr(e?.message || 'Failed to download images');
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleDownloadFeed = async (post: any, images: string[], imgIdx: number, key: string) => {
    if (downloadingKey) return;
    setErr('');
    setDownloadingKey(key);
    try {
      await downloadFeedPostCard(
        {
          id: post.id,
          title: post.title,
          content: post.content,
          author_name: post.author_name,
          author_role: post.author_role,
          created_at: post.created_at,
          images,
        },
        imgIdx
      );
    } catch (e: any) {
      setErr(e?.message || 'Failed to download feed post');
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[#171717]">Madrasa Community Activity Feed</h2>
          <p className="text-xs text-[#737373]">Campus updates, Hifz milestones, and student achievements.</p>
        </div>
        {canPost && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm({ title: '', content: '', images: [] });
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> New Post
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-10 text-center text-xs text-[#737373] bg-white rounded-xl border border-neutral-200">Loading activity feed...</div>
      ) : posts.length === 0 ? (
        <div className="p-10 text-center text-xs text-[#737373] bg-white rounded-xl border border-neutral-200">No feed posts published yet.</div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => {
            const imgs = parseImages(post.images_json);
            const isAuthorOrAdmin = canPost && (post.author_id === user.id || user.role_slug === 'super_admin' || user.role_slug === 'committee_member');
            return (
              <article key={post.id} className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-red-50 text-[#DC1726] flex items-center justify-center text-xs font-bold shrink-0">
                      {String(post.author_name || 'A').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#171717]">{post.author_name}</div>
                      <div className="text-[11px] text-[#737373] font-mono-num">
                        {post.author_role} · {new Date(post.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setViewPostId(post.id);
                        setViewImageIdx(0);
                      }}
                      title="View Feed Post"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-neutral-200 bg-white text-[11px] font-semibold text-[#171717] hover:bg-neutral-50 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#0EA5E9]" />
                      <span>View</span>
                    </button>
                    {isAuthorOrAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(post.id);
                          setForm({ title: post.title || '', content: post.content || '', images: imgs });
                          setFormOpen(true);
                        }}
                        title="Edit Post"
                        className="p-1.5 rounded text-[#F59E0B] hover:bg-amber-50"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(post)}
                        title="Delete Post"
                        className="p-1.5 rounded text-[#DC1726] hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {post.title && (
                  <h3
                    onClick={() => {
                      setViewPostId(post.id);
                      setViewImageIdx(0);
                    }}
                    className="text-sm font-bold text-[#171717] cursor-pointer hover:text-[#DC1726] transition-colors"
                  >
                    {post.title}
                  </h3>
                )}
                <p className="text-xs text-[#171717] leading-relaxed whitespace-pre-line">{post.content}</p>

                {imgs.length > 0 && (
                  <div className={`grid gap-2 ${imgs.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {imgs.map((url, idx) => (
                      <div key={idx} className="relative group rounded-lg overflow-hidden border border-neutral-200">
                        <img
                          src={url}
                          alt={`Post media ${idx + 1}`}
                          onClick={() => {
                            setViewPostId(post.id);
                            setViewImageIdx(idx);
                          }}
                          className="w-full max-h-72 object-cover cursor-pointer hover:opacity-95 transition-opacity"
                        />
                        <button
                          type="button"
                          disabled={downloadingKey === `img-${post.id}-${idx}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadImage(
                              url,
                              `${post.title || 'madrasa-photo'}-${idx + 1}`,
                              `img-${post.id}-${idx}`
                            );
                          }}
                          title="Download Image"
                          className="absolute bottom-2 end-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-black/70 text-white text-[11px] font-semibold hover:bg-black/85 transition-colors cursor-pointer disabled:opacity-60"
                        >
                          <Download className="w-3 h-3" />
                          <span>{downloadingKey === `img-${post.id}-${idx}` ? 'Saving...' : 'Download'}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => handleLike(post.id)}
                      className={`inline-flex items-center gap-1.5 font-medium transition-colors ${
                        post.liked_by_me ? 'text-[#DC1726]' : 'text-[#737373] hover:text-[#171717]'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${post.liked_by_me ? 'fill-[#DC1726]' : ''}`} />
                      <span className="font-mono-num">{post.likes_count || 0}</span> Likes
                    </button>
                    <span className="inline-flex items-center gap-1.5 text-[#737373]">
                      <MessageSquare className="w-4 h-4" />
                      <span className="font-mono-num">{post.comments?.length || 0}</span> Comments
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={downloadingKey === `feed-${post.id}`}
                      onClick={() => handleDownloadFeed(post, imgs, 0, `feed-${post.id}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-neutral-200 bg-white text-[11px] font-semibold text-[#171717] hover:bg-neutral-50 cursor-pointer disabled:opacity-60"
                    >
                      <Download className="w-3.5 h-3.5 text-[#10B981]" />
                      <span>{downloadingKey === `feed-${post.id}` ? 'Saving...' : 'Download Feed'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setViewPostId(post.id);
                        setViewImageIdx(0);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#0EA5E9] hover:underline cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" /> View Details
                    </button>
                  </div>
                </div>

                {/* Comments */}
                <div className="space-y-2 pt-1">
                  {(post.comments || []).map((c: any) => (
                    <div key={c.id} className="bg-neutral-50 rounded-lg px-3 py-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#171717]">{c.author_name} <span className="font-normal text-[#737373]">({c.author_role})</span></span>
                        <span className="text-[10px] text-[#737373] font-mono-num">{new Date(c.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-[#171717] mt-0.5">{c.comment}</p>
                    </div>
                  ))}
                  <form onSubmit={(e) => handleComment(e, post.id)} className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Write a comment..."
                      value={commentInputs[post.id] || ''}
                      onChange={(e) => setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-neutral-200 text-xs focus:outline-none focus:border-[#DC1726]"
                    />
                    <button type="submit" className="p-2 rounded-lg bg-[#171717] text-white hover:bg-neutral-800" aria-label="Post comment">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
          <div className="mx-auto max-w-lg bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-base font-bold">{editingId ? 'Edit Feed Post' : 'Create Feed Post'}</h3>
              <button type="button" onClick={() => setFormOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block font-medium mb-1">Headline (Optional)</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
              </div>
              <div>
                <label className="block font-medium mb-1">Update Content *</label>
                <textarea rows={4} required value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
              </div>
              <div>
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 cursor-pointer">
                  <FileUp className="w-3.5 h-3.5" /> Attach Images ({form.images.length})
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length) return;
                      setErr('');
                      try {
                        const urls: string[] = [];
                        for (const f of files) {
                          const up = await uploadFile(f, 'feed-images');
                          urls.push(up.url);
                        }
                        setForm((prev) => ({ ...prev, images: [...prev.images, ...urls] }));
                      } catch (err: any) {
                        setErr(err.message || 'Failed to upload image');
                      } finally {
                        e.target.value = '';
                      }
                    }}
                    className="hidden"
                  />
                </label>
                {form.images.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {form.images.map((url, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-neutral-200">
                        <img src={url} alt={`Attachment ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }))}
                          className="absolute top-0.5 end-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center"
                          aria-label="Remove image"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold">Publish</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewPost && (() => {
        const viewImgs = parseImages(viewPost.images_json);
        const safeIdx = Math.min(viewImageIdx, Math.max(0, viewImgs.length - 1));
        return (
          <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto p-3 sm:p-6 flex items-start sm:items-center justify-center">
            <div className="mx-auto max-w-2xl w-full bg-white rounded-xl border border-neutral-200 shadow-2xl overflow-hidden my-4">
              <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 bg-neutral-50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-red-50 text-[#DC1726] flex items-center justify-center text-xs font-bold shrink-0">
                    {String(viewPost.author_name || 'A').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#171717]">{viewPost.author_name}</div>
                    <div className="text-[11px] text-[#737373] font-mono-num">
                      {viewPost.author_role} · {new Date(viewPost.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewPostId(null)}
                  className="p-1.5 rounded-lg text-[#737373] hover:text-[#171717] hover:bg-neutral-200"
                  aria-label="Close feed post view"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-4 text-xs">
                {viewPost.title && (
                  <h3 className="text-base sm:text-lg font-bold text-[#171717]">{viewPost.title}</h3>
                )}
                <p className="text-xs sm:text-sm text-[#171717] leading-relaxed whitespace-pre-line">
                  {viewPost.content}
                </p>

                {viewImgs.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="relative rounded-xl border border-neutral-200 bg-neutral-950/95 overflow-hidden flex items-center justify-center">
                      <img
                        src={viewImgs[safeIdx]}
                        alt={`Post media ${safeIdx + 1}`}
                        className="w-full max-h-[60vh] object-contain"
                      />
                      {viewImgs.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setViewImageIdx((prev) => (prev - 1 + viewImgs.length) % viewImgs.length)
                            }
                            className="absolute start-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
                            aria-label="Previous image"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewImageIdx((prev) => (prev + 1) % viewImgs.length)}
                            className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
                            aria-label="Next image"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <div className="absolute bottom-2 end-2 px-2 py-0.5 rounded bg-black/65 text-white text-[10px] font-mono-num">
                            {safeIdx + 1} / {viewImgs.length}
                          </div>
                        </>
                      )}
                    </div>
                    {viewImgs.length > 1 && (
                      <div className="flex flex-wrap gap-2">
                        {viewImgs.map((u, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setViewImageIdx(idx)}
                            className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                              idx === safeIdx ? 'border-[#DC1726]' : 'border-neutral-200 opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img src={u} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={downloadingKey === `modal-img-${viewPost.id}`}
                        onClick={() =>
                          handleDownloadImage(
                            viewImgs[safeIdx],
                            `${viewPost.title || 'madrasa-photo'}-${safeIdx + 1}`,
                            `modal-img-${viewPost.id}`
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0EA5E9] text-white text-xs font-semibold hover:bg-sky-600 transition-colors disabled:opacity-60"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>
                          {downloadingKey === `modal-img-${viewPost.id}`
                            ? 'Downloading Image...'
                            : viewImgs.length > 1
                              ? `Download Photo ${safeIdx + 1}`
                              : 'Download Image'}
                        </span>
                      </button>
                      {viewImgs.length > 1 && (
                        <button
                          type="button"
                          disabled={downloadingKey === `modal-all-${viewPost.id}`}
                          onClick={() =>
                            handleDownloadAllImages(
                              viewImgs,
                              viewPost.title || 'madrasa-photo',
                              `modal-all-${viewPost.id}`
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-[#171717] hover:bg-neutral-50 transition-colors disabled:opacity-60"
                        >
                          <Download className="w-3.5 h-3.5 text-[#0EA5E9]" />
                          <span>
                            {downloadingKey === `modal-all-${viewPost.id}`
                              ? 'Downloading All...'
                              : `Download All (${viewImgs.length})`}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-neutral-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => handleLike(viewPost.id)}
                      className={`inline-flex items-center gap-1.5 font-medium transition-colors ${
                        viewPost.liked_by_me ? 'text-[#DC1726]' : 'text-[#737373] hover:text-[#171717]'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${viewPost.liked_by_me ? 'fill-[#DC1726]' : ''}`} />
                      <span className="font-mono-num">{viewPost.likes_count || 0}</span> Likes
                    </button>
                    <span className="inline-flex items-center gap-1.5 text-[#737373]">
                      <MessageSquare className="w-4 h-4" />
                      <span className="font-mono-num">{viewPost.comments?.length || 0}</span> Comments
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={downloadingKey === `modal-feed-${viewPost.id}`}
                    onClick={() =>
                      handleDownloadFeed(viewPost, viewImgs, safeIdx, `modal-feed-${viewPost.id}`)
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#10B981] text-white text-xs font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-60"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {downloadingKey === `modal-feed-${viewPost.id}` ? 'Preparing Feed...' : 'Download Feed'}
                    </span>
                  </button>
                </div>

                <div className="space-y-2 pt-1 max-h-56 overflow-y-auto">
                  {(viewPost.comments || []).length === 0 ? (
                    <div className="text-[11px] text-[#737373]">No comments yet.</div>
                  ) : (
                    (viewPost.comments || []).map((c: any) => (
                      <div key={c.id} className="bg-neutral-50 rounded-lg px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#171717]">
                            {c.author_name} <span className="font-normal text-[#737373]">({c.author_role})</span>
                          </span>
                          <span className="text-[10px] text-[#737373] font-mono-num">
                            {new Date(c.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-[#171717] mt-0.5">{c.comment}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={(e) => handleComment(e, viewPost.id)} className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Write a comment..."
                    value={commentInputs[viewPost.id] || ''}
                    onChange={(e) =>
                      setCommentInputs((prev) => ({ ...prev, [viewPost.id]: e.target.value }))
                    }
                    className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 text-xs focus:outline-none focus:border-[#DC1726]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-lg bg-[#171717] text-white hover:bg-neutral-800 inline-flex items-center gap-1.5 text-xs font-medium"
                  >
                    <Send className="w-3.5 h-3.5" /> Comment
                  </button>
                </form>
              </div>
            </div>
          </div>
        );
      })()}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Post"
        message="Remove this post from the activity feed?"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteTarget) return;
          setErr('');
          try {
            await apiRequest(`/api/feed/${deleteTarget.id}`, { method: 'DELETE' });
            load();
          } catch (e: any) {
            setErr(e.message || 'Failed to delete post');
          } finally {
            setDeleteTarget(null);
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
