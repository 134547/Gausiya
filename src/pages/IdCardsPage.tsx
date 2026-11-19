import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  CreditCard,
  GraduationCap,
  Printer,
  RefreshCw,
  Search,
  Square,
  UserCheck,
  Users,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { MadrasaSettings } from '../types.ts';
import { IdCardPerson, OfficialIdCard } from '../components/OfficialIdCard.tsx';
import { PrintModal } from '../components/PrintModal.tsx';

interface IdCardsPageProps {
  settings: MadrasaSettings | null;
}

interface PrintableCardItem {
  key: string;
  type: 'student' | 'teacher';
  person: IdCardPerson;
}

export const IdCardsPage: React.FC<IdCardsPageProps> = ({ settings }) => {
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active');
  const [viewMode, setViewMode] = useState<'both' | 'students' | 'teachers'>('both');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const [printItems, setPrintItems] = useState<PrintableCardItem[] | null>(null);
  const [printTitle, setPrintTitle] = useState('Official ID Cards');
  const [printSubtitle, setPrintSubtitle] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setErr('');
    try {
      const [stRes, tRes, clsRes] = await Promise.all([
        apiRequest<{ students: any[] }>('/api/students'),
        apiRequest<{ teachers: any[] }>('/api/teachers'),
        apiRequest<{ classes: any[] }>('/api/classes'),
      ]);
      setStudents(stRes.students || []);
      setTeachers(tRes.teachers || []);
      setClasses(clsRes.classes || []);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load student and teacher ID records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredStudents = useMemo(() => {
    return students
      .filter((st) => {
        if (statusFilter === 'active' && st.status !== 'active') return false;
        if (filterClass && String(st.class_id || '') !== String(filterClass)) return false;
        if (!normalizedSearch) return true;
        const hay = [
          st.full_name,
          st.student_code,
          st.admission_no,
          st.father_name,
          st.mother_name,
          st.class_name,
          st.mobile,
          st.village,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(normalizedSearch);
      })
      .map(
        (st): PrintableCardItem => ({
          key: `student:${st.id}`,
          type: 'student',
          person: {
            id: st.id,
            code: st.student_code || '—',
            admission_no: st.admission_no || '',
            full_name: st.full_name || 'Student',
            father_name: st.father_name || '',
            mother_name: st.mother_name || '',
            dob: st.dob || '',
            mobile: st.mobile || '',
            address: st.address || '',
            village: st.village || '',
            district: st.district || 'Palamu',
            state: st.state || 'Jharkhand',
            pin_code: st.pin_code || '',
            class_name: st.class_name || 'Unassigned',
            photo_url: st.photo_url || '',
            status: st.status || 'active',
          },
        })
      );
  }, [students, statusFilter, filterClass, normalizedSearch]);

  const filteredTeachers = useMemo(() => {
    return teachers
      .filter((t) => {
        if (statusFilter === 'active' && t.employment_status !== 'active') return false;
        if (!normalizedSearch) return true;
        const hay = [
          t.full_name,
          t.teacher_code,
          t.father_name,
          t.qualification,
          t.mobile,
          t.email,
          t.address,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(normalizedSearch);
      })
      .map(
        (t): PrintableCardItem => ({
          key: `teacher:${t.id}`,
          type: 'teacher',
          person: {
            id: t.id,
            code: t.teacher_code || '—',
            full_name: t.full_name || 'Teacher',
            father_name: t.father_name || '',
            dob: t.dob || '',
            mobile: t.mobile || '',
            address: t.address || '',
            qualification: t.qualification || '',
            joining_date: t.joining_date || '',
            photo_url: t.photo_url || '',
            status: t.employment_status || 'active',
          },
        })
      );
  }, [teachers, statusFilter, normalizedSearch]);

  const allVisibleItems = useMemo(() => {
    if (viewMode === 'students') return filteredStudents;
    if (viewMode === 'teachers') return filteredTeachers;
    return [...filteredStudents, ...filteredTeachers];
  }, [viewMode, filteredStudents, filteredTeachers]);

  const selectedItems = useMemo(() => {
    const map = new Map<string, PrintableCardItem>();
    for (const item of [...filteredStudents, ...filteredTeachers]) {
      map.set(item.key, item);
    }
    return selectedKeys.map((k) => map.get(k)).filter(Boolean) as PrintableCardItem[];
  }, [selectedKeys, filteredStudents, filteredTeachers]);

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const openPrintSheet = (items: PrintableCardItem[], title: string, subtitle: string) => {
    if (!items.length) return;
    setPrintItems(items);
    setPrintTitle(title);
    setPrintSubtitle(subtitle);
  };

  const renderCardTile = (item: PrintableCardItem) => {
    const isSelected = selectedKeys.includes(item.key);
    return (
      <div
        key={item.key}
        className={`flex flex-col items-center p-3 rounded-2xl border transition-all bg-neutral-50/70 ${
          isSelected
            ? 'border-[#DC1726] ring-2 ring-[#DC1726]/15 bg-red-50/30'
            : 'border-neutral-200 hover:border-neutral-300'
        }`}
      >
        {/* Top Action Bar for Card */}
        <div className="w-full max-w-[292px] flex items-center justify-between gap-2 mb-2.5">
          <button
            type="button"
            onClick={() => toggleSelect(item.key)}
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-md transition-colors ${
              isSelected
                ? 'bg-[#DC1726] text-white'
                : 'bg-white border border-neutral-200 text-[#525252] hover:bg-neutral-100'
            }`}
          >
            {isSelected ? (
              <CheckSquare className="w-3.5 h-3.5" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            {isSelected ? 'Selected' : 'Select'}
          </button>

          <button
            type="button"
            onClick={() =>
              openPrintSheet(
                [item],
                `${item.type === 'student' ? 'Student' : 'Teacher'} ID Card`,
                `${item.person.full_name} (${item.person.code})`
              )
            }
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1D56B8] text-white text-[11px] font-semibold hover:bg-blue-700 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print / PDF
          </button>
        </div>

        {/* Official Vertical ID Card */}
        <OfficialIdCard type={item.type} person={item.person} settings={settings} />
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {err && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">
          {err}
        </div>
      )}

      {/* Header & Bulk Actions */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1D56B8]/10 text-[#1D56B8] flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#171717]">
                Official ID Cards Directory — Students &amp; Teachers
              </h2>
              <p className="text-xs text-[#737373] mt-0.5">
                Har student aur teacher ka official Madrasa ID card alag-alag columns me ready hai. Single ya bulk print / PDF download karein.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedItems.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    openPrintSheet(
                      selectedItems,
                      'Selected Official ID Cards',
                      `${selectedItems.length} Cards`
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Selected ({selectedItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKeys([])}
                  className="px-3 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-xs font-medium text-[#525252]"
                >
                  Clear
                </button>
              </>
            )}

            <button
              type="button"
              disabled={filteredStudents.length === 0}
              onClick={() =>
                openPrintSheet(
                  filteredStudents,
                  'All Students ID Cards',
                  `${filteredStudents.length} Students`
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1D56B8] text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" /> Print All Students ({filteredStudents.length})
            </button>

            <button
              type="button"
              disabled={filteredTeachers.length === 0}
              onClick={() =>
                openPrintSheet(
                  filteredTeachers,
                  'All Teachers ID Cards',
                  `${filteredTeachers.length} Teachers`
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" /> Print All Teachers ({filteredTeachers.length})
            </button>

            <button
              type="button"
              onClick={loadAll}
              disabled={loading}
              title="Refresh ID Cards"
              className="p-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-[#525252] disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search, Column View & Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-neutral-100">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-[#737373] absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Name, Student/Teacher ID, Admission No, Mobile..."
                className="w-full ps-9 pe-3 py-2 text-xs rounded-lg border border-neutral-200"
              />
            </div>

            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white"
            >
              <option value="">All Student Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'active' | 'all')}
              className="px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white"
            >
              <option value="active">Active Only</option>
              <option value="all">All Status</option>
            </select>
          </div>

          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg self-start md:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('both')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'both'
                  ? 'bg-white text-[#171717] shadow-xs'
                  : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> Both Columns
            </button>
            <button
              type="button"
              onClick={() => setViewMode('students')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'students'
                  ? 'bg-white text-[#1D56B8] shadow-xs'
                  : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" /> Students ({filteredStudents.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('teachers')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                viewMode === 'teachers'
                  ? 'bg-white text-[#DC1726] shadow-xs'
                  : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" /> Teachers ({filteredTeachers.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Separate Columns for Students & Teachers */}
      {loading ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center text-xs text-[#737373]">
          Loading Student &amp; Teacher ID cards...
        </div>
      ) : allVisibleItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center text-xs text-[#737373]">
          No student or teacher ID cards matched your filter.
        </div>
      ) : (
        <div
          className={`grid gap-6 items-start ${
            viewMode === 'both' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {/* COLUMN 1: STUDENTS ID CARDS */}
          {viewMode !== 'teachers' && (
            <section className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3.5 bg-[#1D56B8] text-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <GraduationCap className="w-5 h-5" />
                  <div>
                    <h3 className="text-sm font-bold">Students ID Cards</h3>
                    <p className="text-[11px] text-blue-100">
                      {filteredStudents.length} Student{filteredStudents.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                {filteredStudents.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      openPrintSheet(
                        filteredStudents,
                        'Students Official ID Cards',
                        `${filteredStudents.length} Cards`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold text-white"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print All
                  </button>
                )}
              </div>

              <div className="p-4">
                {filteredStudents.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[#737373]">
                    No student ID cards found for this filter.
                  </p>
                ) : (
                  <div
                    className={`grid gap-4 justify-items-center ${
                      viewMode === 'both'
                        ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2'
                        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
                    }`}
                  >
                    {filteredStudents.map(renderCardTile)}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* COLUMN 2: TEACHERS ID CARDS */}
          {viewMode !== 'students' && (
            <section className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
              <div className="px-4 py-3.5 bg-[#171717] text-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-5 h-5 text-[#DC1726]" />
                  <div>
                    <h3 className="text-sm font-bold">Teachers ID Cards</h3>
                    <p className="text-[11px] text-neutral-300">
                      {filteredTeachers.length} Teacher{filteredTeachers.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                {filteredTeachers.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      openPrintSheet(
                        filteredTeachers,
                        'Teachers Official ID Cards',
                        `${filteredTeachers.length} Cards`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DC1726] hover:bg-red-700 text-xs font-semibold text-white"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print All
                  </button>
                )}
              </div>

              <div className="p-4">
                {filteredTeachers.length === 0 ? (
                  <p className="py-8 text-center text-xs text-[#737373]">
                    No teacher ID cards found for this filter.
                  </p>
                ) : (
                  <div
                    className={`grid gap-4 justify-items-center ${
                      viewMode === 'both'
                        ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2'
                        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
                    }`}
                  >
                    {filteredTeachers.map(renderCardTile)}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Print / PDF Modal for Single or Bulk ID Cards */}
      <PrintModal
        open={Boolean(printItems && printItems.length > 0)}
        title={printTitle}
        subtitle={printSubtitle}
        settings={settings}
        standalone
        onClose={() => setPrintItems(null)}
      >
        {printItems && printItems.length === 1 ? (
          <div className="flex justify-center py-6">
            <OfficialIdCard
              type={printItems[0].type}
              person={printItems[0].person}
              settings={settings}
            />
          </div>
        ) : printItems && printItems.length > 1 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 justify-items-center py-2">
            {printItems.map((item) => (
              <OfficialIdCard
                key={item.key}
                type={item.type}
                person={item.person}
                settings={settings}
              />
            ))}
          </div>
        ) : null}
      </PrintModal>
    </div>
  );
};
