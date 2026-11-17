import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { downloadImageFile, sanitizeFileName } from '../lib/download.ts';
import { User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';

export interface SyllabusItem {
  id: string;
  item_type?: 'book' | 'syllabus_pdf';
  class_id: string;
  class_name: string;
  class_code: string;
  class_teacher_name: string;
  subject_id: string;
  subject_name: string;
  book_name: string;
  syllabus_title?: string;
  syllabus_type?: string;
  author_name: string;
  academic_year: string;
  cover_page_url: string;
  book_pdf_url: string;
  book_pdf_name: string;
  syllabus_pdf_url: string;
  syllabus_pdf_name: string;
  weekly_plan: string;
  created_at: string;
}

interface SyllabusPageProps {
  user: User;
  embedded?: boolean;
}

const DEFAULT_SUBJECT_PRESETS = [
  'All Subjects',
  'English',
  'Urdu',
  'Arabic',
  'Hindi',
  'Mathematics',
  'Deeniyat',
  'Quran & Tajweed',
  'Hadith',
  'Fiqh',
  'Science',
  'Social Studies',
];

const SYLLABUS_TYPES = [
  'Annual Syllabus',
  'Half-Yearly / Term',
  'Monthly Syllabus',
  'Weekly Plan',
  'Chapter-wise',
  'Exam Syllabus',
];

async function downloadFileFromUrl(url: string, preferredName: string) {
  const cleanName = sanitizeFileName(preferredName.replace(/\.pdf$/i, ''), 'madrasa-document');
  const fileName = `${cleanName}.pdf`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Direct fetch failed');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  } catch {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const SyllabusPage: React.FC<SyllabusPageProps> = ({ user, embedded = false }) => {
  const isAdmin = user.role_slug === 'super_admin';

  const [items, setItems] = useState<SyllabusItem[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [dbSubjects, setDbSubjects] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeSection, setActiveSection] = useState<'all' | 'syllabus_pdfs' | 'books'>('all');
  const [classFilter, setClassFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Book Modal State
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingBookPdf, setUploadingBookPdf] = useState(false);
  const [uploadingSyllabusPdf, setUploadingSyllabusPdf] = useState(false);

  const [form, setForm] = useState({
    class_id: '',
    subject_id: '',
    subject_name: 'English',
    book_name: '',
    author_name: '',
    academic_year: '',
    cover_page_url: '',
    book_pdf_url: '',
    book_pdf_name: '',
    syllabus_pdf_url: '',
    syllabus_pdf_name: '',
    weekly_plan: '',
  });

  // Separate Syllabus PDF Modal State
  const [syllabusModalOpen, setSyllabusModalOpen] = useState(false);
  const [editingSyllabusId, setEditingSyllabusId] = useState<string | null>(null);
  const [savingSyllabus, setSavingSyllabus] = useState(false);
  const [uploadingStandalonePdf, setUploadingStandalonePdf] = useState(false);
  const [syllabusForm, setSyllabusForm] = useState({
    class_id: '',
    subject_name: 'All Subjects',
    syllabus_title: '',
    syllabus_type: 'Annual Syllabus',
    academic_year: '',
    syllabus_pdf_url: '',
    syllabus_pdf_name: '',
    weekly_plan: '',
  });

  const [viewItem, setViewItem] = useState<SyllabusItem | null>(null);
  const [previewPdf, setPreviewPdf] = useState<{ title: string; url: string; fileName: string } | null>(null);
  const [previewCover, setPreviewCover] = useState<{ title: string; url: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SyllabusItem | null>(null);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [sylRes, clsRes, subRes, setRes] = await Promise.all([
        apiRequest<{ items: SyllabusItem[] }>('/api/syllabus'),
        apiRequest<{ classes: any[] }>('/api/classes').catch(() => ({ classes: [] })),
        apiRequest<{ subjects: any[] }>('/api/subjects').catch(() => ({ subjects: [] })),
        apiRequest<{ sessions: any[] }>('/api/settings').catch(() => ({ sessions: [] })),
      ]);
      setItems(sylRes.items || []);
      setClasses(clsRes.classes || []);
      setDbSubjects(subRes.subjects || []);
      setSessions(setRes.sessions || []);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load syllabus & books.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const subjectChips = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      const s = item.subject_name.trim();
      if (s && !seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s);
    }
    return Array.from(seen.values());
  }, [items]);

  const formSubjectSuggestions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of DEFAULT_SUBJECT_PRESETS) map.set(p.toLowerCase(), p);
    for (const s of dbSubjects) {
      if (s?.name) map.set(String(s.name).trim().toLowerCase(), String(s.name).trim());
    }
    return Array.from(map.values());
  }, [dbSubjects]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (classFilter && item.class_id !== classFilter) return false;
      if (subjectFilter !== 'all' && item.subject_name.toLowerCase() !== subjectFilter.toLowerCase()) return false;
      if (!q) return true;
      return (
        item.book_name.toLowerCase().includes(q) ||
        String(item.syllabus_title || '').toLowerCase().includes(q) ||
        String(item.syllabus_type || '').toLowerCase().includes(q) ||
        item.subject_name.toLowerCase().includes(q) ||
        item.class_name.toLowerCase().includes(q) ||
        item.class_teacher_name.toLowerCase().includes(q) ||
        item.author_name.toLowerCase().includes(q) ||
        item.weekly_plan.toLowerCase().includes(q)
      );
    });
  }, [items, classFilter, subjectFilter, search]);

  // Separate Section 1: Syllabus PDFs (standalone Syllabus PDFs + any book items that have a Syllabus PDF attached)
  const syllabusPdfItems = useMemo(
    () =>
      filteredItems.filter(
        (item) => item.item_type === 'syllabus_pdf' || Boolean(item.syllabus_pdf_url)
      ),
    [filteredItems]
  );

  // Separate Section 2: Books & Kitabs (excludes standalone syllabus_pdf entries)
  const bookItems = useMemo(
    () => filteredItems.filter((item) => item.item_type !== 'syllabus_pdf'),
    [filteredItems]
  );

  const openAddBookForm = () => {
    const activeSession = sessions.find((s) => s.is_active) || sessions[0];
    setEditingId(null);
    setErr('');
    setForm({
      class_id: classFilter || (classes[0]?.id ? String(classes[0].id) : ''),
      subject_id: '',
      subject_name: 'English',
      book_name: '',
      author_name: '',
      academic_year: activeSession?.name || '',
      cover_page_url: '',
      book_pdf_url: '',
      book_pdf_name: '',
      syllabus_pdf_url: '',
      syllabus_pdf_name: '',
      weekly_plan: '',
    });
    setFormOpen(true);
  };

  const openEditBookForm = (item: SyllabusItem) => {
    setEditingId(item.id);
    setErr('');
    setForm({
      class_id: item.class_id || '',
      subject_id: item.subject_id || '',
      subject_name: item.subject_name || '',
      book_name: item.book_name || '',
      author_name: item.author_name || '',
      academic_year: item.academic_year || '',
      cover_page_url: item.cover_page_url || '',
      book_pdf_url: item.book_pdf_url || '',
      book_pdf_name: item.book_pdf_name || '',
      syllabus_pdf_url: item.syllabus_pdf_url || '',
      syllabus_pdf_name: item.syllabus_pdf_name || '',
      weekly_plan: item.weekly_plan || '',
    });
    setFormOpen(true);
  };

  const openAddSyllabusPdfModal = () => {
    const activeSession = sessions.find((s) => s.is_active) || sessions[0];
    setEditingSyllabusId(null);
    setErr('');
    setSyllabusForm({
      class_id: classFilter || '',
      subject_name: 'All Subjects',
      syllabus_title: '',
      syllabus_type: 'Annual Syllabus',
      academic_year: activeSession?.name || '',
      syllabus_pdf_url: '',
      syllabus_pdf_name: '',
      weekly_plan: '',
    });
    setSyllabusModalOpen(true);
  };

  const openEditSyllabusPdfModal = (item: SyllabusItem) => {
    setEditingSyllabusId(item.id);
    setErr('');
    setSyllabusForm({
      class_id: item.class_id || '',
      subject_name: item.subject_name || 'All Subjects',
      syllabus_title: item.syllabus_title || item.book_name || '',
      syllabus_type: item.syllabus_type || 'Annual Syllabus',
      academic_year: item.academic_year || '',
      syllabus_pdf_url: item.syllabus_pdf_url || '',
      syllabus_pdf_name: item.syllabus_pdf_name || '',
      weekly_plan: item.weekly_plan || '',
    });
    setSyllabusModalOpen(true);
  };

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    setUploadingCover(true);
    try {
      const up = await uploadFile(file, 'madrasa-assets');
      setForm((prev) => ({ ...prev, cover_page_url: up.url }));
    } catch (ex: any) {
      setErr(ex?.message || 'Failed to upload book cover image.');
    } finally {
      setUploadingCover(false);
      e.target.value = '';
    }
  };

  const handleUploadPdf = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'book' | 'syllabus' | 'standalone_syllabus'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    if (file.size > 3.8 * 1024 * 1024) {
      setErr('PDF file must be 3.8 MB or smaller. Please compress the PDF and try again.');
      e.target.value = '';
      return;
    }
    if (kind === 'book') setUploadingBookPdf(true);
    else if (kind === 'syllabus') setUploadingSyllabusPdf(true);
    else setUploadingStandalonePdf(true);

    try {
      const up = await uploadFile(file, 'notices');
      if (kind === 'book') {
        setForm((prev) => ({ ...prev, book_pdf_url: up.url, book_pdf_name: file.name }));
      } else if (kind === 'syllabus') {
        setForm((prev) => ({ ...prev, syllabus_pdf_url: up.url, syllabus_pdf_name: file.name }));
      } else {
        setSyllabusForm((prev) => ({
          ...prev,
          syllabus_pdf_url: up.url,
          syllabus_pdf_name: file.name,
          syllabus_title: prev.syllabus_title || file.name.replace(/\.pdf$/i, ''),
        }));
      }
    } catch (ex: any) {
      setErr(ex?.message || 'Failed to upload PDF file.');
    } finally {
      if (kind === 'book') setUploadingBookPdf(false);
      else if (kind === 'syllabus') setUploadingSyllabusPdf(false);
      else setUploadingStandalonePdf(false);
      e.target.value = '';
    }
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setErr('');
    setMsg('');
    if (!form.subject_name.trim() || !form.book_name.trim()) {
      setErr('Please enter both Subject / Language (e.g. English, Urdu) and Book Name.');
      return;
    }

    setSaving(true);
    try {
      const selectedCls = classes.find((c) => String(c.id) === String(form.class_id));
      const matchedSub = dbSubjects.find(
        (s) => String(s.name || '').trim().toLowerCase() === form.subject_name.trim().toLowerCase()
      );
      const payload = {
        ...form,
        item_type: 'book',
        class_name: selectedCls?.name || 'All Classes',
        subject_id: form.subject_id || (matchedSub?.id ? String(matchedSub.id) : ''),
      };

      if (editingId) {
        await apiRequest(`/api/syllabus/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setMsg('Book updated successfully.');
      } else {
        await apiRequest('/api/syllabus', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMsg('Book added successfully.');
      }
      setFormOpen(false);
      await loadAll();
    } catch (ex: any) {
      setErr(ex?.message || 'Failed to save book.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSyllabusPdf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setErr('');
    setMsg('');
    if (!syllabusForm.syllabus_title.trim()) {
      setErr('Please enter a Syllabus Title (e.g. Class 5 Annual Syllabus).');
      return;
    }
    if (!syllabusForm.syllabus_pdf_url) {
      setErr('Please upload the Syllabus PDF file.');
      return;
    }

    setSavingSyllabus(true);
    try {
      const selectedCls = classes.find((c) => String(c.id) === String(syllabusForm.class_id));
      const matchedSub = dbSubjects.find(
        (s) => String(s.name || '').trim().toLowerCase() === syllabusForm.subject_name.trim().toLowerCase()
      );
      const payload = {
        item_type: 'syllabus_pdf',
        class_id: syllabusForm.class_id,
        class_name: selectedCls?.name || 'All Classes',
        subject_id: matchedSub?.id ? String(matchedSub.id) : '',
        subject_name: syllabusForm.subject_name.trim() || 'All Subjects',
        book_name: syllabusForm.syllabus_title.trim(),
        syllabus_title: syllabusForm.syllabus_title.trim(),
        syllabus_type: syllabusForm.syllabus_type || 'Syllabus PDF',
        academic_year: syllabusForm.academic_year,
        syllabus_pdf_url: syllabusForm.syllabus_pdf_url,
        syllabus_pdf_name: syllabusForm.syllabus_pdf_name,
        weekly_plan: syllabusForm.weekly_plan,
      };

      if (editingSyllabusId) {
        await apiRequest(`/api/syllabus/${editingSyllabusId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setMsg('Syllabus PDF updated successfully.');
      } else {
        await apiRequest('/api/syllabus', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMsg('Syllabus PDF uploaded successfully.');
      }
      setSyllabusModalOpen(false);
      await loadAll();
    } catch (ex: any) {
      setErr(ex?.message || 'Failed to save Syllabus PDF.');
    } finally {
      setSavingSyllabus(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !isAdmin) return;
    setErr('');
    try {
      await apiRequest(`/api/syllabus/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      setMsg(deleteTarget.item_type === 'syllabus_pdf' ? 'Syllabus PDF deleted.' : 'Book deleted.');
      await loadAll();
    } catch (ex: any) {
      setDeleteTarget(null);
      setErr(ex?.message || 'Failed to delete item.');
    }
  };

  const selectedClassInfo = useMemo(
    () => (classFilter ? classes.find((c) => String(c.id) === String(classFilter)) : null),
    [classes, classFilter]
  );

  const showSyllabusSection = activeSection === 'all' || activeSection === 'syllabus_pdfs';
  const showBooksSection = activeSection === 'all' || activeSection === 'books';

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#171717]">
              Syllabus PDFs &amp; Books Section
            </h2>
            <p className="text-xs text-[#737373] mt-0.5">
              {isAdmin
                ? 'Upload Syllabus PDFs in their dedicated section, and manage subject Books (cover pages & book PDFs) separately.'
                : 'Browse class Syllabus PDFs in a dedicated section alongside subject books and cover pages.'}
            </p>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={openAddSyllabusPdfModal}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#059669] text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Upload Syllabus PDF</span>
              </button>
              <button
                type="button"
                onClick={openAddBookForm}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Book</span>
              </button>
            </div>
          )}
        </div>

        {/* Section Switcher Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setActiveSection('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              activeSection === 'all'
                ? 'bg-[#171717] text-white border-[#171717]'
                : 'bg-neutral-50 text-[#525252] border-neutral-200 hover:bg-neutral-100'
            }`}
          >
            All ({syllabusPdfItems.length + bookItems.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('syllabus_pdfs')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              activeSection === 'syllabus_pdfs'
                ? 'bg-[#059669] text-white border-[#059669]'
                : 'bg-emerald-50 text-[#059669] border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Syllabus PDFs ({syllabusPdfItems.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('books')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              activeSection === 'books'
                ? 'bg-[#DC1726] text-white border-[#DC1726]'
                : 'bg-red-50 text-[#DC1726] border-red-200 hover:bg-red-100'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Books &amp; Kitabs ({bookItems.length})</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-[#525252] mb-1">Filter by Class</label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white"
            >
              <option value="">All Classes ({items.length})</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code}) {c.class_teacher_name && c.class_teacher_name !== 'Unassigned' ? `· Teacher: ${c.class_teacher_name}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#525252] mb-1">Subject / Language</label>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white"
            >
              <option value="all">All Subjects</option>
              {subjectChips.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#525252] mb-1">Search Syllabus PDF or Book</label>
            <div className="relative">
              <Search className="w-4 h-4 text-[#737373] absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Syllabus title, book name, English, Urdu..."
                className="w-full ps-9 pe-3 py-2 text-xs rounded-lg border border-neutral-200"
              />
            </div>
          </div>
        </div>

        {selectedClassInfo && (
          <div className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-200 text-xs">
            <span className="font-bold text-[#171717]">
              {selectedClassInfo.name} ({selectedClassInfo.code})
            </span>
            <span className="inline-flex items-center gap-1 text-[#525252]">
              <UserCheck className="w-3.5 h-3.5 text-[#10B981]" />
              Class Teacher: <strong className="text-[#171717]">{selectedClassInfo.class_teacher_name || 'Unassigned'}</strong>
            </span>
          </div>
        )}

        {subjectChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSubjectFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                subjectFilter === 'all'
                  ? 'bg-[#171717] text-white border-[#171717]'
                  : 'bg-neutral-50 text-[#525252] border-neutral-200 hover:bg-neutral-100'
              }`}
            >
              All ({items.length})
            </button>
            {subjectChips.map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => setSubjectFilter(sub)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  subjectFilter.toLowerCase() === sub.toLowerCase()
                    ? 'bg-[#DC1726] text-white border-[#DC1726]'
                    : 'bg-neutral-50 text-[#525252] border-neutral-200 hover:bg-neutral-100'
                }`}
              >
                {sub}
              </button>
            ))}
          </div>
        )}
      </div>

      {msg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">
          {msg}
        </div>
      )}
      {err && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
          {err}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-10 text-center text-xs text-[#737373] flex flex-col items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-[#DC1726]" />
          <span>Loading syllabus PDFs &amp; books...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* SECTION 1: DEDICATED SYLLABUS PDFs SECTION */}
          {showSyllabusSection && (
            <section className="bg-white rounded-xl border border-emerald-200/80 shadow-xs overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 bg-emerald-50/70 border-b border-emerald-200/70 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#059669] text-white flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#171717] flex items-center gap-2">
                      <span>Syllabus PDFs Section</span>
                      <span className="px-2 py-0.5 rounded-full bg-white border border-emerald-200 text-[#059669] text-[11px] font-bold font-mono-num">
                        {syllabusPdfItems.length}
                      </span>
                    </h3>
                    <p className="text-[11px] text-[#525252]">
                      Class-wise, annual, monthly, weekly &amp; exam syllabus PDFs in one dedicated section.
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={openAddSyllabusPdfModal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#059669] text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Upload Syllabus PDF</span>
                  </button>
                )}
              </div>

              {syllabusPdfItems.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <FileText className="w-8 h-8 text-emerald-300 mx-auto" />
                  <div className="text-xs font-semibold text-[#171717]">No Syllabus PDFs uploaded yet</div>
                  <p className="text-[11px] text-[#737373]">
                    {isAdmin
                      ? 'Click "Upload Syllabus PDF" to add class-wise annual, monthly, or weekly syllabus PDFs.'
                      : 'No Syllabus PDFs match your selected filters right now.'}
                  </p>
                </div>
              ) : (
                <div className={`p-4 grid grid-cols-1 ${embedded ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'} gap-3.5`}>
                  {syllabusPdfItems.map((item) => {
                    const isStandalone = item.item_type === 'syllabus_pdf';
                    const titleText = item.syllabus_title || item.book_name || item.syllabus_pdf_name || 'Syllabus PDF';
                    return (
                      <div
                        key={`syl-${item.id}`}
                        className="rounded-xl border border-emerald-200/80 bg-emerald-50/20 p-4 flex flex-col justify-between gap-3"
                      >
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-[#059669] text-[10px] font-bold">
                              {item.syllabus_type || (isStandalone ? 'Syllabus PDF' : 'Book Syllabus PDF')}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-white border border-neutral-200 text-[#171717] text-[10px] font-semibold">
                              {item.class_name}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-red-50 text-[#DC1726] text-[10px] font-semibold">
                              {item.subject_name}
                            </span>
                          </div>

                          <h4 className="text-sm font-bold text-[#171717] leading-snug line-clamp-2">
                            {titleText}
                          </h4>

                          {item.syllabus_pdf_name && (
                            <div className="text-[11px] text-[#525252] truncate flex items-center gap-1">
                              <FileText className="w-3 h-3 text-[#059669] shrink-0" />
                              <span className="truncate">{item.syllabus_pdf_name}</span>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#737373]">
                            {item.academic_year && (
                              <span className="inline-flex items-center gap-1">
                                <CalendarDays className="w-3 h-3" /> {item.academic_year}
                              </span>
                            )}
                            {item.class_teacher_name && item.class_teacher_name !== 'Unassigned' && (
                              <span className="inline-flex items-center gap-1">
                                <UserCheck className="w-3 h-3 text-[#10B981]" /> {item.class_teacher_name}
                              </span>
                            )}
                          </div>

                          {item.weekly_plan && (
                            <p className="text-[11px] text-[#525252] bg-white rounded-lg border border-emerald-100 p-2 whitespace-pre-line line-clamp-3">
                              {item.weekly_plan}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2 pt-2 border-t border-emerald-100">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewPdf({
                                  title: `Syllabus PDF — ${titleText}`,
                                  url: item.syllabus_pdf_url,
                                  fileName: item.syllabus_pdf_name || `${titleText}-syllabus.pdf`,
                                })
                              }
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#059669] hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Syllabus PDF</span>
                            </button>
                            <button
                              type="button"
                              disabled={downloadingKey === `syl_sec_${item.id}`}
                              onClick={async () => {
                                setDownloadingKey(`syl_sec_${item.id}`);
                                await downloadFileFromUrl(
                                  item.syllabus_pdf_url,
                                  item.syllabus_pdf_name || `${titleText}-syllabus`
                                );
                                setDownloadingKey(null);
                              }}
                              title="Download Syllabus PDF"
                              className="p-2 rounded-lg bg-white border border-emerald-200 hover:bg-emerald-50 text-[#059669] cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>

                          {isAdmin && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  isStandalone ? openEditSyllabusPdfModal(item) : openEditBookForm(item)
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-[#D97706] hover:bg-amber-50 cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-[#DC1726] hover:bg-red-50 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* SECTION 2: BOOKS & KITABS SECTION */}
          {showBooksSection && (
            <section className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 bg-neutral-50 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#DC1726] text-white flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#171717] flex items-center gap-2">
                      <span>Books &amp; Kitabs Section</span>
                      <span className="px-2 py-0.5 rounded-full bg-white border border-neutral-200 text-[#171717] text-[11px] font-bold font-mono-num">
                        {bookItems.length}
                      </span>
                    </h3>
                    <p className="text-[11px] text-[#737373]">
                      Subject books, cover pages, authors, and downloadable book PDFs.
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={openAddBookForm}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Book</span>
                  </button>
                )}
              </div>

              {bookItems.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <BookOpen className="w-8 h-8 text-neutral-300 mx-auto" />
                  <div className="text-xs font-semibold text-[#171717]">No books added yet</div>
                  <p className="text-[11px] text-[#737373]">
                    {isAdmin
                      ? 'Click "Add Book" to upload subject books, cover pages, and book PDFs.'
                      : 'No books match your selected filters right now.'}
                  </p>
                </div>
              ) : (
                <div className={`p-4 grid grid-cols-1 ${embedded ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'} gap-4`}>
                  {bookItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden flex flex-col justify-between"
                    >
                      <div>
                        <div className="p-4 flex gap-3.5 items-start border-b border-neutral-100">
                          {/* Cover Page Thumbnail */}
                          <button
                            type="button"
                            onClick={() =>
                              item.cover_page_url &&
                              setPreviewCover({ title: `${item.book_name} (${item.subject_name})`, url: item.cover_page_url })
                            }
                            className={`w-20 h-28 rounded-lg border border-neutral-200 bg-neutral-50 shrink-0 overflow-hidden flex items-center justify-center ${
                              item.cover_page_url ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
                            }`}
                            title={item.cover_page_url ? 'Click to view Cover Page' : 'No cover page uploaded'}
                          >
                            {item.cover_page_url ? (
                              <img
                                src={item.cover_page_url}
                                alt={item.book_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="text-center px-1 text-[10px] text-[#737373]">
                                <BookOpen className="w-5 h-5 mx-auto mb-1 text-neutral-400" />
                                No Cover
                              </div>
                            )}
                          </button>

                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded bg-red-50 text-[#DC1726] border border-red-200 text-[11px] font-bold">
                                {item.subject_name}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-neutral-100 text-[#171717] text-[11px] font-semibold">
                                {item.class_name}
                              </span>
                            </div>

                            <h3 className="text-sm font-bold text-[#171717] leading-snug line-clamp-2">
                              {item.book_name}
                            </h3>

                            {item.author_name && (
                              <div className="text-[11px] text-[#737373] truncate">
                                Author / Publisher: <span className="text-[#404040] font-medium">{item.author_name}</span>
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#737373]">
                              {item.academic_year && (
                                <span className="inline-flex items-center gap-1">
                                  <CalendarDays className="w-3 h-3" /> {item.academic_year}
                                </span>
                              )}
                              {item.class_teacher_name && item.class_teacher_name !== 'Unassigned' && (
                                <span className="inline-flex items-center gap-1">
                                  <UserCheck className="w-3 h-3 text-[#10B981]" /> {item.class_teacher_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {item.weekly_plan && (
                          <div className="px-4 py-2.5 bg-neutral-50/70 border-b border-neutral-100 text-xs text-[#525252] whitespace-pre-line line-clamp-3">
                            {item.weekly_plan}
                          </div>
                        )}
                      </div>

                      {/* Book Action Buttons */}
                      <div className="p-3.5 space-y-2.5 bg-white">
                        {item.book_pdf_url ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewPdf({
                                  title: `Book PDF — ${item.book_name}`,
                                  url: item.book_pdf_url,
                                  fileName: item.book_pdf_name || `${item.book_name}-book.pdf`,
                                })
                              }
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-sky-50 hover:bg-sky-100 text-[#0284C7] border border-sky-200 text-xs font-semibold cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Book PDF</span>
                            </button>
                            <button
                              type="button"
                              disabled={downloadingKey === `book_${item.id}`}
                              onClick={async () => {
                                setDownloadingKey(`book_${item.id}`);
                                await downloadFileFromUrl(
                                  item.book_pdf_url,
                                  item.book_pdf_name || `${item.subject_name}-${item.book_name}-book`
                                );
                                setDownloadingKey(null);
                              }}
                              title="Download Book PDF"
                              className="p-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-[#171717] cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="px-2.5 py-2 rounded-lg bg-neutral-50 border border-neutral-200 text-[11px] text-[#737373] text-center">
                            No Book PDF uploaded
                          </div>
                        )}

                        <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setViewItem(item)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#171717] hover:text-[#DC1726] cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Full Details</span>
                          </button>

                          {isAdmin && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditBookForm(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-[#D97706] hover:bg-amber-50 cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-[#DC1726] hover:bg-red-50 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Super Admin Dedicated Upload / Edit Syllabus PDF Modal */}
      {syllabusModalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/55 overflow-y-auto p-4 flex items-center justify-center">
          <div className="max-w-lg w-full bg-white rounded-2xl border border-neutral-200 shadow-xl p-5 sm:p-6 space-y-4 text-xs my-6">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#171717] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#059669]" />
                  <span>{editingSyllabusId ? 'Edit Syllabus PDF' : 'Upload Syllabus PDF'}</span>
                </h3>
                <p className="text-[11px] text-[#737373]">
                  Add a standalone Class / Subject Syllabus PDF to the Syllabus PDFs section.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSyllabusModalOpen(false)}
                className="p-1.5 rounded-lg text-[#737373] hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {err && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-[#DC1726] font-medium">
                {err}
              </div>
            )}

            <form onSubmit={handleSaveSyllabusPdf} className="space-y-3.5">
              <div>
                <label className="block font-semibold mb-1">Syllabus Title *</label>
                <input
                  type="text"
                  required
                  value={syllabusForm.syllabus_title}
                  onChange={(e) => setSyllabusForm({ ...syllabusForm, syllabus_title: e.target.value })}
                  placeholder="e.g. Class 5 Annual Syllabus 2026 / Week 1-4 Urdu Plan"
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Syllabus Type</label>
                  <select
                    value={syllabusForm.syllabus_type}
                    onChange={(e) => setSyllabusForm({ ...syllabusForm, syllabus_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                  >
                    {SYLLABUS_TYPES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Class</label>
                  <select
                    value={syllabusForm.class_id}
                    onChange={(e) => setSyllabusForm({ ...syllabusForm, class_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                  >
                    <option value="">All Classes</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Subject / Category</label>
                  <input
                    type="text"
                    value={syllabusForm.subject_name}
                    onChange={(e) => setSyllabusForm({ ...syllabusForm, subject_name: e.target.value })}
                    placeholder="All Subjects, English, Urdu..."
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Academic Year</label>
                  <select
                    value={syllabusForm.academic_year}
                    onChange={(e) => setSyllabusForm({ ...syllabusForm, academic_year: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                  >
                    <option value="">Select Session</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-2">
                <div className="font-semibold text-[#171717] flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#059669]" />
                  <span>Syllabus PDF File * (Max 3.8 MB)</span>
                </div>
                {syllabusForm.syllabus_pdf_url && (
                  <div className="p-2 rounded-lg bg-white border border-emerald-200 text-[11px] text-[#059669] flex items-center justify-between gap-2">
                    <span className="truncate font-medium">
                      {syllabusForm.syllabus_pdf_name || 'Syllabus.pdf'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSyllabusForm({ ...syllabusForm, syllabus_pdf_url: '', syllabus_pdf_name: '' })
                      }
                      className="text-red-600 shrink-0"
                      title="Remove Syllabus PDF"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <label className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-dashed border-emerald-400 bg-white hover:bg-emerald-50 cursor-pointer font-semibold text-[#059669]">
                  {uploadingStandalonePdf ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>
                    {uploadingStandalonePdf
                      ? 'Uploading PDF...'
                      : syllabusForm.syllabus_pdf_url
                        ? 'Replace Syllabus PDF'
                        : 'Select Syllabus PDF File'}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => handleUploadPdf(e, 'standalone_syllabus')}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label className="block font-semibold mb-1">Notes / Chapters Overview (Optional)</label>
                <textarea
                  rows={2}
                  value={syllabusForm.weekly_plan}
                  onChange={(e) => setSyllabusForm({ ...syllabusForm, weekly_plan: e.target.value })}
                  placeholder="Optional details about chapters, weeks, or exam portions..."
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setSyllabusModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-100 font-semibold text-[#525252]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSyllabus || uploadingStandalonePdf}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#059669] text-white font-semibold hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                >
                  {savingSyllabus && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>
                    {savingSyllabus
                      ? 'Saving...'
                      : editingSyllabusId
                        ? 'Update Syllabus PDF'
                        : 'Save Syllabus PDF'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Super Admin Add / Edit Book Modal */}
      {formOpen && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/55 overflow-y-auto p-4 flex items-center justify-center">
          <div className="max-w-2xl w-full bg-white rounded-2xl border border-neutral-200 shadow-xl p-5 sm:p-6 space-y-4 text-xs my-6">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#171717]">
                  {editingId ? 'Edit Book & Syllabus' : 'Add Subject Book'}
                </h3>
                <p className="text-[11px] text-[#737373]">
                  Upload Book Cover Page image, Book PDF, and optional attached Weekly/Chapter Syllabus PDF.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-1.5 rounded-lg text-[#737373] hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {err && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-[#DC1726] font-medium">
                {err}
              </div>
            )}

            <form onSubmit={handleSaveBook} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Class *</label>
                  <select
                    value={form.class_id}
                    onChange={(e) => setForm({ ...form, class_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                  >
                    <option value="">All Classes</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Academic Year</label>
                  <select
                    value={form.academic_year}
                    onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white"
                  >
                    <option value="">Select Session</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  Subject / Language * (e.g. English, Urdu, Arabic, Deeniyat)
                </label>
                <input
                  type="text"
                  required
                  value={form.subject_name}
                  onChange={(e) => setForm({ ...form, subject_name: e.target.value })}
                  placeholder="English, Urdu, Arabic, Mathematics..."
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {formSubjectSuggestions
                    .filter((sub) => sub !== 'All Subjects')
                    .map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setForm({ ...form, subject_name: sub })}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                          form.subject_name.trim().toLowerCase() === sub.toLowerCase()
                            ? 'bg-[#DC1726] text-white border-[#DC1726]'
                            : 'bg-neutral-50 text-[#525252] border-neutral-200 hover:bg-neutral-100'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Book Name (Kitab Ka Naam) *</label>
                  <input
                    type="text"
                    required
                    value={form.book_name}
                    onChange={(e) => setForm({ ...form, book_name: e.target.value })}
                    placeholder="e.g. Noorani Qaida / Marigold English Book 1"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Author / Publisher (Optional)</label>
                  <input
                    type="text"
                    value={form.author_name}
                    onChange={(e) => setForm({ ...form, author_name: e.target.value })}
                    placeholder="Publisher or Author name"
                    className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                  />
                </div>
              </div>

              {/* Cover Page + PDF Uploads */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Cover Page Image */}
                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 space-y-2">
                  <div className="font-semibold text-[#171717] flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-[#DC1726]" />
                    <span>Book Cover Page</span>
                  </div>
                  {form.cover_page_url && (
                    <div className="relative w-full h-24 rounded-lg overflow-hidden border border-neutral-200 bg-white">
                      <img
                        src={form.cover_page_url}
                        alt="Book cover preview"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, cover_page_url: '' })}
                        className="absolute top-1 end-1 p-1 rounded-full bg-black/60 text-white"
                        title="Remove Cover Page"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <label className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-neutral-300 bg-white hover:bg-neutral-100 cursor-pointer font-semibold text-[#171717]">
                    {uploadingCover ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <span>{uploadingCover ? 'Uploading...' : form.cover_page_url ? 'Change Cover' : 'Upload Cover Image'}</span>
                    <input type="file" accept="image/*" onChange={handleUploadCover} className="hidden" />
                  </label>
                </div>

                {/* 2. Book PDF */}
                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 space-y-2">
                  <div className="font-semibold text-[#171717] flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-[#0284C7]" />
                    <span>Book PDF (Kitab PDF)</span>
                  </div>
                  {form.book_pdf_url ? (
                    <div className="p-2 rounded-lg bg-sky-50 border border-sky-200 text-[11px] text-[#0284C7] flex items-center justify-between gap-1">
                      <span className="truncate font-medium">{form.book_pdf_name || 'Book.pdf'}</span>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, book_pdf_url: '', book_pdf_name: '' })}
                        className="text-red-600 shrink-0"
                        title="Remove Book PDF"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#737373]">Max 3.8 MB PDF file</div>
                  )}
                  <label className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-sky-300 bg-white hover:bg-sky-50 cursor-pointer font-semibold text-[#0284C7]">
                    {uploadingBookPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <span>{uploadingBookPdf ? 'Uploading...' : form.book_pdf_url ? 'Replace Book PDF' : 'Upload Book PDF'}</span>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) => handleUploadPdf(e, 'book')}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* 3. Optional Linked Syllabus PDF */}
                <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 space-y-2">
                  <div className="font-semibold text-[#171717] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#059669]" />
                    <span>Book Syllabus PDF (Opt.)</span>
                  </div>
                  {form.syllabus_pdf_url ? (
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-[#059669] flex items-center justify-between gap-1">
                      <span className="truncate font-medium">{form.syllabus_pdf_name || 'Syllabus.pdf'}</span>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, syllabus_pdf_url: '', syllabus_pdf_name: '' })}
                        className="text-red-600 shrink-0"
                        title="Remove Syllabus PDF"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#737373]">Optional chapter plan PDF</div>
                  )}
                  <label className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-emerald-300 bg-white hover:bg-emerald-50 cursor-pointer font-semibold text-[#059669]">
                    {uploadingSyllabusPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <span>
                      {uploadingSyllabusPdf ? 'Uploading...' : form.syllabus_pdf_url ? 'Replace PDF' : 'Upload Syllabus PDF'}
                    </span>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) => handleUploadPdf(e, 'syllabus')}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">
                  Weekly &amp; Chapter Notes (Optional Summary)
                </label>
                <textarea
                  rows={3}
                  value={form.weekly_plan}
                  onChange={(e) => setForm({ ...form, weekly_plan: e.target.value })}
                  placeholder="Optional: Week 1: Chapter 1-2, Week 2: Chapter 3-4..."
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-100 font-semibold text-[#525252]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingCover || uploadingBookPdf || uploadingSyllabusPdf}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold hover:bg-red-700 disabled:opacity-60 cursor-pointer"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{saving ? 'Saving...' : editingId ? 'Update Book' : 'Save Book'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Details Modal */}
      {viewItem && (
        <div className="fixed inset-0 z-50 bg-black/55 overflow-y-auto p-4 flex items-center justify-center">
          <div className="max-w-xl w-full bg-white rounded-2xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs">
            <div className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-3">
              <div>
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className="px-2 py-0.5 rounded bg-red-50 text-[#DC1726] font-bold">{viewItem.subject_name}</span>
                  <span className="px-2 py-0.5 rounded bg-neutral-100 text-[#171717] font-semibold">{viewItem.class_name}</span>
                </div>
                <h3 className="text-base font-bold text-[#171717]">{viewItem.book_name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setViewItem(null)}
                className="p-1.5 rounded-lg text-[#737373] hover:bg-neutral-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              {viewItem.cover_page_url && (
                <div className="w-32 h-44 rounded-xl border border-neutral-200 overflow-hidden bg-neutral-50 shrink-0 mx-auto sm:mx-0">
                  <img
                    src={viewItem.cover_page_url}
                    alt={viewItem.book_name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1 space-y-2">
                {viewItem.author_name && (
                  <div>
                    <span className="text-[#737373]">Author / Publisher:</span>{' '}
                    <strong className="text-[#171717]">{viewItem.author_name}</strong>
                  </div>
                )}
                {viewItem.academic_year && (
                  <div>
                    <span className="text-[#737373]">Academic Year:</span>{' '}
                    <strong className="text-[#171717]">{viewItem.academic_year}</strong>
                  </div>
                )}
                {viewItem.class_teacher_name && viewItem.class_teacher_name !== 'Unassigned' && (
                  <div>
                    <span className="text-[#737373]">Class Teacher:</span>{' '}
                    <strong className="text-[#171717]">{viewItem.class_teacher_name}</strong>
                  </div>
                )}
                {viewItem.weekly_plan && (
                  <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 whitespace-pre-line text-[#404040] leading-relaxed">
                    {viewItem.weekly_plan}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-3 border-t border-neutral-100">
              {viewItem.cover_page_url && (
                <button
                  type="button"
                  onClick={() =>
                    downloadImageFile(viewItem.cover_page_url, `${viewItem.subject_name}-${viewItem.book_name}-cover`)
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 font-semibold text-[#171717]"
                >
                  <Download className="w-3.5 h-3.5" /> Download Cover Page
                </button>
              )}
              {viewItem.book_pdf_url && (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewPdf({
                      title: `Book PDF — ${viewItem.book_name}`,
                      url: viewItem.book_pdf_url,
                      fileName: viewItem.book_pdf_name || `${viewItem.book_name}-book.pdf`,
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0284C7] hover:bg-sky-700 font-semibold text-white"
                >
                  <Eye className="w-3.5 h-3.5" /> Open Book PDF
                </button>
              )}
              {viewItem.syllabus_pdf_url && (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewPdf({
                      title: `Syllabus PDF — ${viewItem.syllabus_title || viewItem.subject_name}`,
                      url: viewItem.syllabus_pdf_url,
                      fileName: viewItem.syllabus_pdf_name || `${viewItem.subject_name}-syllabus.pdf`,
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#059669] hover:bg-emerald-700 font-semibold text-white"
                >
                  <FileText className="w-3.5 h-3.5" /> Open Syllabus PDF
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cover Image Lightbox */}
      {previewCover && (
        <div className="fixed inset-0 z-50 bg-black/75 p-4 flex items-center justify-center">
          <div className="max-w-lg w-full bg-white rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
              <div className="text-sm font-bold text-[#171717] truncate">{previewCover.title}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadImageFile(previewCover.url, previewCover.title)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewCover(null)}
                  className="p-1.5 rounded-lg text-[#737373] hover:bg-neutral-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-neutral-100 flex items-center justify-center">
              <img src={previewCover.url} alt={previewCover.title} className="max-h-[75vh] object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}

      {/* In-App PDF Viewer Modal */}
      {previewPdf && (
        <div className="fixed inset-0 z-50 bg-black/70 p-3 sm:p-6 flex items-center justify-center">
          <div className="max-w-4xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-neutral-200">
              <div className="text-sm font-bold text-[#171717] truncate">{previewPdf.title}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadFileFromUrl(previewPdf.url, previewPdf.fileName)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Download PDF
                </button>
                <a
                  href={previewPdf.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-[#171717]"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open in Tab
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewPdf(null)}
                  className="p-1.5 rounded-lg text-[#737373] hover:bg-neutral-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-3 bg-neutral-100">
              <iframe
                src={previewPdf.url}
                title={previewPdf.title}
                className="w-full h-[72vh] rounded-lg border border-neutral-200 bg-white"
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.item_type === 'syllabus_pdf' ? 'Delete Syllabus PDF?' : 'Delete Book?'}
        message={`Are you sure you want to delete "${deleteTarget?.syllabus_title || deleteTarget?.book_name}" (${deleteTarget?.subject_name})?`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
