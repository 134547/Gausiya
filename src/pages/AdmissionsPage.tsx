import React, { useEffect, useState } from 'react';
import {
  CheckCircle,
  Eye,
  FileText,
  FileUp,
  Pencil,
  Plus,
  Power,
  Printer,
  ScrollText,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { apiRequest, uploadFile } from '../lib/api.ts';
import { MadrasaSettings, User } from '../types.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { PrintModal } from '../components/PrintModal.tsx';
import { IqrarNamaSheet } from '../components/IqrarNamaSheet.tsx';
import { AdmissionPaperSheet } from '../components/AdmissionPaperSheet.tsx';

interface AdmissionsPageProps {
  settings: MadrasaSettings | null;
  user?: User | null;
  onSettingsUpdated?: (s: MadrasaSettings) => void;
}

type PrintDocMode = 'combined' | 'admission' | 'iqrar';

const emptyForm = {
  admission_no: '',
  student_name: '',
  father_name: '',
  mother_name: '',
  dob: '',
  gender: 'Male',
  religion: 'Islam',
  address: '',
  village: '',
  district: 'Palamu',
  state: 'Jharkhand',
  pin_code: '',
  student_mobile: '',
  guardian_name: '',
  guardian_relationship: 'Father',
  guardian_mobile: '',
  previous_school: '',
  previous_class: '',
  admission_date: new Date().toISOString().slice(0, 10),
  admission_class_id: '',
  photo_url: '',
  documents: [] as { name: string; url: string }[],
  remarks: '',
};

export const AdmissionsPage: React.FC<AdmissionsPageProps> = ({ settings, user, onSettingsUpdated }) => {
  const [activeSection, setActiveSection] = useState<'applications' | 'iqrar'>('applications');
  const [admissions, setAdmissions] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [admissionsOpen, setAdmissionsOpen] = useState<boolean>(settings?.admissions_open !== false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [viewItem, setViewItem] = useState<any>(null);
  const [printItem, setPrintItem] = useState<any>(null);
  const [printMode, setPrintMode] = useState<PrintDocMode>('combined');
  const [selectedIqrarId, setSelectedIqrarId] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const canManageAdmissionToggle = !user || user.role_slug === 'super_admin';

  useEffect(() => {
    if (typeof settings?.admissions_open === 'boolean') {
      setAdmissionsOpen(settings.admissions_open);
    }
  }, [settings?.admissions_open]);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search) qs.set('search', search);
      if (filterClass) qs.set('classId', filterClass);
      if (filterStatus) qs.set('status', filterStatus);
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);

      const [admData, clsData, statusData] = await Promise.all([
        apiRequest<{ admissions: any[] }>(`/api/admissions?${qs.toString()}`),
        apiRequest<{ classes: any[] }>('/api/classes'),
        apiRequest<{ admissionsOpen: boolean }>('/api/admissions/status'),
      ]);
      setAdmissions(admData.admissions);
      setClasses(clsData.classes);
      if (admData.admissions.length > 0 && !selectedIqrarId) {
        setSelectedIqrarId(String(admData.admissions[0].id));
      }
      if (typeof statusData?.admissionsOpen === 'boolean') {
        setAdmissionsOpen(statusData.admissionsOpen);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filterClass, filterStatus, dateFrom, dateTo]);

  const handleToggleAdmissions = async (open: boolean) => {
    if (!canManageAdmissionToggle || togglingStatus || open === admissionsOpen) return;
    setTogglingStatus(true);
    setErr('');
    setMsg('');
    try {
      const res = await apiRequest<{ admissionsOpen: boolean }>('/api/admissions/status', {
        method: 'PUT',
        body: JSON.stringify({ open }),
      });
      setAdmissionsOpen(res.admissionsOpen);
      if (settings && onSettingsUpdated) {
        onSettingsUpdated({ ...settings, admissions_open: res.admissionsOpen });
      }
      setMsg(
        res.admissionsOpen
          ? 'Online Admission turned ON. Public admission form is now open.'
          : 'Online Admission turned OFF. Public admission form is now closed.'
      );
    } catch (e: any) {
      setErr(e.message || 'Failed to update online admission status');
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const openPrint = (item: any, mode: PrintDocMode = 'combined') => {
    setPrintMode(mode);
    setPrintItem(item);
  };

  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm, admission_date: new Date().toISOString().slice(0, 10) });
    setFormOpen(true);
  };

  const openEdit = (adm: any) => {
    let docs: { name: string; url: string }[] = [];
    try {
      docs = JSON.parse(adm.documents_json || '[]');
    } catch {
      docs = [];
    }
    setEditingId(adm.id);
    setForm({
      admission_no: adm.admission_no || '',
      student_name: adm.student_name || '',
      father_name: adm.father_name || '',
      mother_name: adm.mother_name || '',
      dob: adm.dob || '',
      gender: adm.gender || 'Male',
      religion: adm.religion || 'Islam',
      address: adm.address || '',
      village: adm.village || '',
      district: adm.district || 'Palamu',
      state: adm.state || 'Jharkhand',
      pin_code: adm.pin_code || '',
      student_mobile: adm.student_mobile || '',
      guardian_name: adm.guardian_name || '',
      guardian_relationship: adm.guardian_relationship || 'Father',
      guardian_mobile: adm.guardian_mobile || '',
      previous_school: adm.previous_school || '',
      previous_class: adm.previous_class || '',
      admission_date: adm.admission_date || '',
      admission_class_id: adm.admission_class_id ? String(adm.admission_class_id) : '',
      photo_url: adm.photo_url || '',
      documents: docs,
      remarks: adm.remarks || '',
    });
    setFormOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    try {
      const up = await uploadFile(file, 'student-photos');
      setForm((f) => ({ ...f, photo_url: up.url }));
    } catch (error: any) {
      setErr(error.message);
    } finally {
      e.target.value = '';
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    try {
      const up = await uploadFile(file, 'admission-documents');
      setForm((f) => ({ ...f, documents: [...f.documents, { name: up.name, url: up.url }] }));
    } catch (error: any) {
      setErr(error.message);
    } finally {
      e.target.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      if (editingId) {
        await apiRequest(`/api/admissions/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
        setMsg('Admission record updated.');
      } else {
        const res = await apiRequest<{ reference_no?: string; admission_no: string }>('/api/admissions', { method: 'POST', body: JSON.stringify(form) });
        setMsg(`Admission submitted with Reference No: ${res.reference_no || res.admission_no}. You can print the Admission Paper & Iqrar Nama from the actions menu.`);
      }
      setFormOpen(false);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleApprove = async (id: string) => {
    setErr('');
    try {
      const res = await apiRequest<{ admission_no?: string; reference_no?: string }>(`/api/admissions/${id}/approve`, { method: 'POST', body: JSON.stringify({}) });
      setMsg(
        res?.admission_no
          ? `Admission approved! Official Student Admission No assigned: ${res.admission_no}${res.reference_no ? ` (Ref: ${res.reference_no})` : ''}.`
          : 'Admission approved and student profile automatically activated.'
      );
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleReject = async (id: string) => {
    setErr('');
    try {
      await apiRequest(`/api/admissions/${id}/reject`, { method: 'POST', body: JSON.stringify({}) });
      setMsg('Admission application rejected.');
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setErr('');
    try {
      await apiRequest(`/api/admissions/${deleteTarget.id}`, { method: 'DELETE' });
      setMsg('Admission deleted.');
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setDeleteTarget(null);
    }
  };

  const selectedIqrarRecord =
    selectedIqrarId === 'blank'
      ? {}
      : admissions.find((a) => String(a.id) === String(selectedIqrarId)) || admissions[0] || {};

  return (
    <div className="space-y-5">
      {msg && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium">{msg}</div>}
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      {/* Online Admission ON / OFF Control */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              admissionsOpen ? 'bg-emerald-50 text-[#10B981]' : 'bg-red-50 text-[#DC1726]'
            }`}
          >
            <Power className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-[#171717]">
              Online Admission Portal:{' '}
              <span className={admissionsOpen ? 'text-[#10B981]' : 'text-[#DC1726]'}>
                {admissionsOpen ? 'ON (Open)' : 'OFF (Closed)'}
              </span>
            </div>
            <p className="text-xs text-[#737373] mt-0.5">
              {admissionsOpen
                ? 'Students and parents can submit new online admission forms from the public homepage.'
                : 'Public online admission applications are paused. Visitors see an Admissions Closed notice.'}
            </p>
          </div>
        </div>

        {canManageAdmissionToggle && (
          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg shrink-0 self-start sm:self-center">
            <button
              type="button"
              disabled={togglingStatus}
              aria-pressed={admissionsOpen}
              onClick={() => handleToggleAdmissions(true)}
              className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                admissionsOpen
                  ? 'bg-[#10B981] text-white shadow-xs'
                  : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              Admission ON
            </button>
            <button
              type="button"
              disabled={togglingStatus}
              aria-pressed={!admissionsOpen}
              onClick={() => handleToggleAdmissions(false)}
              className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                !admissionsOpen
                  ? 'bg-[#DC1726] text-white shadow-xs'
                  : 'text-[#737373] hover:text-[#171717]'
              }`}
            >
              Admission OFF
            </button>
          </div>
        )}
      </div>

      {/* Sub-Section Tabs under Admissions: Admission Applications | Iqrar Nama */}
      <div className="bg-white rounded-xl border border-neutral-200 p-2 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSection('applications')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              activeSection === 'applications'
                ? 'bg-[#DC1726] text-white shadow-xs'
                : 'text-[#525252] hover:bg-neutral-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Admission Forms &amp; Papers</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('iqrar')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              activeSection === 'iqrar'
                ? 'bg-[#141E30] text-white shadow-xs'
                : 'text-[#525252] hover:bg-neutral-100'
            }`}
          >
            <ScrollText className="w-4 h-4" />
            <span>Iqrar Nama Section (اقرار نامہ)</span>
          </button>
        </div>

        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" /> New Admission
        </button>
      </div>

      {activeSection === 'iqrar' ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-neutral-100 pb-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[#171717]">
                Iqrar Nama Section (اقرار نامہ سرپرست برائے داخلہ)
              </h3>
              <p className="text-xs text-[#737373]">
                Select any student admission to view or print their filled Iqrar Nama, Admission Paper, or print a Blank Iqrar Nama form.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedIqrarId}
                onChange={(e) => setSelectedIqrarId(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white min-w-[230px]"
              >
                <option value="blank">Blank Iqrar Nama Template</option>
                {admissions.map((adm) => (
                  <option key={adm.id} value={String(adm.id)}>
                    {adm.admission_no} — {adm.student_name} ({adm.father_name})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => openPrint(selectedIqrarRecord, 'iqrar')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#141E30] text-white text-xs font-semibold hover:bg-slate-800 whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" /> Print Iqrar Nama
              </button>

              {selectedIqrarId !== 'blank' && selectedIqrarRecord?.admission_no && (
                <>
                  <button
                    type="button"
                    onClick={() => openPrint(selectedIqrarRecord, 'admission')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800 whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print Admission Paper
                  </button>
                  <button
                    type="button"
                    onClick={() => openPrint(selectedIqrarRecord, 'combined')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700 whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print Both
                  </button>
                </>
              )}
            </div>
          </div>

          <IqrarNamaSheet settings={settings} data={selectedIqrarRecord} />
        </div>
      ) : (
        <>
          {/* Filter & Actions Bar */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-[#737373] absolute start-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search student, reference no, father, mobile..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full ps-9 pe-3 py-2 text-xs rounded-lg border border-neutral-200"
                />
              </div>
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white"
              >
                <option value="">All Classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-neutral-200 bg-white"
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-2.5 py-2 text-xs rounded-lg border border-neutral-200 font-mono-num" />
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-2.5 py-2 text-xs rounded-lg border border-neutral-200 font-mono-num" />
              <button type="submit" className="px-3 py-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-xs font-medium text-[#171717]">
                Filter
              </button>
            </form>
          </div>

          {/* Admissions Table */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373]">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">Reference No</th>
                    <th className="px-4 py-3 text-start font-semibold">Student Name</th>
                    <th className="px-4 py-3 text-start font-semibold">Father / Guardian</th>
                    <th className="px-4 py-3 text-start font-semibold">Class</th>
                    <th className="px-4 py-3 text-start font-semibold">Date</th>
                    <th className="px-4 py-3 text-start font-semibold">Status</th>
                    <th className="px-4 py-3 text-end font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {loading ? (
                    <tr><td colSpan={7} className="p-8 text-center text-[#737373]">Loading admissions...</td></tr>
                  ) : admissions.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-[#737373]">No admission applications found.</td></tr>
                  ) : (
                    admissions.map((adm) => (
                      <tr key={adm.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 font-mono-num font-semibold text-[#171717]">{adm.admission_no}</td>
                        <td className="px-4 py-3 font-medium text-[#171717]">{adm.student_name}</td>
                        <td className="px-4 py-3 text-[#737373]">
                          <div>{adm.father_name}</div>
                          <div className="font-mono-num text-[11px]">{adm.guardian_mobile}</div>
                        </td>
                        <td className="px-4 py-3 text-[#171717]">{adm.class_name}</td>
                        <td className="px-4 py-3 font-mono-num text-[#737373]">{adm.admission_date}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-semibold capitalize ${
                              adm.status === 'approved' ? 'text-[#10B981]' : adm.status === 'rejected' ? 'text-[#DC1726]' : 'text-[#F59E0B]'
                            }`}
                          >
                            {adm.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {adm.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApprove(adm.id)}
                                  title="Approve & Activate Student"
                                  className="p-1.5 rounded-md text-[#10B981] hover:bg-emerald-50"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReject(adm.id)}
                                  title="Reject"
                                  className="p-1.5 rounded-md text-[#DC1726] hover:bg-red-50"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button type="button" onClick={() => setViewItem(adm)} title="View Details" className="p-1.5 rounded-md text-[#0EA5E9] hover:bg-sky-50">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => openPrint(adm, 'combined')} title="Print Admission & Iqrar Nama" className="p-1.5 rounded-md text-[#171717] hover:bg-neutral-100">
                              <Printer className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => openPrint(adm, 'iqrar')} title="Print Iqrar Nama Only" className="p-1.5 rounded-md text-[#141E30] hover:bg-slate-100">
                              <ScrollText className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => openEdit(adm)} title="Edit" className="p-1.5 rounded-md text-[#F59E0B] hover:bg-amber-50">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => setDeleteTarget(adm)} title="Delete" className="p-1.5 rounded-md text-[#DC1726] hover:bg-red-50">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Add / Edit Admission Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
          <div className="mx-auto max-w-3xl bg-white rounded-xl border border-neutral-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50">
              <h3 className="text-base font-bold text-[#171717]">
                {editingId ? 'Edit Admission Record' : 'New Student Admission Form'}
              </h3>
              <button type="button" onClick={() => setFormOpen(false)} className="p-1.5 rounded-lg hover:bg-neutral-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium mb-1">Reference No (Auto if blank)</label>
                  <input type="text" value={form.admission_no} onChange={(e) => setForm({ ...form, admission_no: e.target.value })} placeholder="Auto-generated (REF-...)" className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" />
                </div>
                <div>
                  <label className="block font-medium mb-1">Admission Date *</label>
                  <input type="date" required value={form.admission_date} onChange={(e) => setForm({ ...form, admission_date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" />
                </div>
                <div>
                  <label className="block font-medium mb-1">Admission Class *</label>
                  <select required value={form.admission_class_id} onChange={(e) => setForm({ ...form, admission_class_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                    <option value="">Select Class</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium mb-1">Student Full Name *</label>
                  <input type="text" required value={form.student_name} onChange={(e) => setForm({ ...form, student_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
                </div>
                <div>
                  <label className="block font-medium mb-1">Father&apos;s Name *</label>
                  <input type="text" required value={form.father_name} onChange={(e) => setForm({ ...form, father_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
                </div>
                <div>
                  <label className="block font-medium mb-1">Mother&apos;s Name</label>
                  <input type="text" value={form.mother_name} onChange={(e) => setForm({ ...form, mother_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium mb-1">Date of Birth</label>
                  <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" />
                </div>
                <div>
                  <label className="block font-medium mb-1">Gender</label>
                  <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white">
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Religion</label>
                  <input type="text" value={form.religion} onChange={(e) => setForm({ ...form, religion: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
                </div>
                <div>
                  <label className="block font-medium mb-1">Student Mobile</label>
                  <input type="text" value={form.student_mobile} onChange={(e) => setForm({ ...form, student_mobile: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium mb-1">Guardian Name *</label>
                  <input type="text" required value={form.guardian_name} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
                </div>
                <div>
                  <label className="block font-medium mb-1">Relationship</label>
                  <input type="text" value={form.guardian_relationship} onChange={(e) => setForm({ ...form, guardian_relationship: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
                </div>
                <div>
                  <label className="block font-medium mb-1">Guardian Mobile *</label>
                  <input type="text" required value={form.guardian_mobile} onChange={(e) => setForm({ ...form, guardian_mobile: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium mb-1">Complete Address</label>
                  <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 sm:col-span-2 gap-3">
                  <div>
                    <label className="block font-medium mb-1">Village / Mohalla</label>
                    <input type="text" value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">District</label>
                    <input type="text" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">State</label>
                    <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">PIN Code</label>
                    <input type="text" value={form.pin_code} onChange={(e) => setForm({ ...form, pin_code: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200 font-mono-num" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Previous School / Madrasa</label>
                  <input type="text" value={form.previous_school} onChange={(e) => setForm({ ...form, previous_school: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
                </div>
                <div>
                  <label className="block font-medium mb-1">Previous Class</label>
                  <input type="text" value={form.previous_class} onChange={(e) => setForm({ ...form, previous_class: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
                  <label className="block font-medium mb-1.5">Student Photograph</label>
                  <div className="flex items-center gap-3">
                    {form.photo_url && (
                      <img src={form.photo_url} alt="Student" referrerPolicy="no-referrer" className="w-12 h-12 rounded-lg object-cover border border-neutral-200" />
                    )}
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-neutral-200 cursor-pointer hover:bg-neutral-100">
                      <FileUp className="w-3.5 h-3.5" /> Upload Photo
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
                  <label className="block font-medium mb-1.5">Required Documents</label>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-neutral-200 cursor-pointer hover:bg-neutral-100">
                    <FileUp className="w-3.5 h-3.5" /> Attach Document
                    <input type="file" onChange={handleDocUpload} className="hidden" />
                  </label>
                  <div className="mt-2 space-y-1">
                    {form.documents.map((d, i) => (
                      <div key={i} className="text-[11px] text-[#0EA5E9] truncate">{d.name}</div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Additional Remarks</label>
                <textarea rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-neutral-200" />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg bg-neutral-100 font-medium">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-[#DC1726] text-white font-semibold hover:bg-red-700">Save Admission</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewItem && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4 flex items-start sm:items-center justify-center">
          <div className="max-w-3xl w-full bg-white rounded-xl border border-neutral-200 shadow-xl p-6 space-y-4 text-xs my-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#171717]">{viewItem.student_name}</h3>
                <p className="text-[#737373] font-mono-num">{viewItem.admission_no} · {viewItem.class_name}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const item = viewItem;
                    setViewItem(null);
                    openPrint(item, 'admission');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#171717] text-white text-xs font-semibold hover:bg-neutral-800"
                >
                  <Printer className="w-3.5 h-3.5" /> Admission Paper
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const item = viewItem;
                    setViewItem(null);
                    openPrint(item, 'iqrar');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141E30] text-white text-xs font-semibold hover:bg-slate-800"
                >
                  <Printer className="w-3.5 h-3.5" /> Iqrar Nama
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const item = viewItem;
                    setViewItem(null);
                    openPrint(item, 'combined');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DC1726] text-white text-xs font-semibold hover:bg-red-700"
                >
                  <Printer className="w-3.5 h-3.5" /> Both
                </button>
                <button type="button" onClick={() => setViewItem(null)} className="p-1.5 rounded-lg hover:bg-neutral-100"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-[#737373]">Father:</span> <strong>{viewItem.father_name}</strong></div>
              <div><span className="text-[#737373]">Mother:</span> <strong>{viewItem.mother_name || '-'}</strong></div>
              <div><span className="text-[#737373]">DOB / Gender:</span> <strong>{viewItem.dob || '-'} / {viewItem.gender}</strong></div>
              <div><span className="text-[#737373]">Guardian:</span> <strong>{viewItem.guardian_name} ({viewItem.guardian_mobile})</strong></div>
              <div className="col-span-2"><span className="text-[#737373]">Address:</span> <strong>{viewItem.address}, {viewItem.village}, {viewItem.district}, {viewItem.state} - {viewItem.pin_code}</strong></div>
              <div><span className="text-[#737373]">Previous School:</span> <strong>{viewItem.previous_school || '-'}</strong></div>
              <div><span className="text-[#737373]">Remarks:</span> <strong>{viewItem.remarks || '-'}</strong></div>
            </div>
            <IqrarNamaSheet compact settings={settings} data={viewItem} />
          </div>
        </div>
      )}

      {/* Print Admission Paper & Iqrar Nama */}
      <PrintModal
        open={Boolean(printItem)}
        standalone
        title={
          printMode === 'admission'
            ? 'Official Admission Record Paper'
            : printMode === 'iqrar'
              ? 'Iqrar Nama (اقرار نامہ سرپرست برائے داخلہ)'
              : 'Official Admission Record & Iqrar Nama'
        }
        subtitle={printItem?.admission_no || 'Blank Template'}
        settings={settings}
        onClose={() => setPrintItem(null)}
        headerActions={
          <div className="flex items-center gap-1 p-1 bg-neutral-200/70 rounded-lg">
            {printItem?.admission_no && (
              <button
                type="button"
                onClick={() => setPrintMode('admission')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                  printMode === 'admission' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#525252]'
                }`}
              >
                Admission Paper
              </button>
            )}
            <button
              type="button"
              onClick={() => setPrintMode('iqrar')}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                printMode === 'iqrar' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#525252]'
              }`}
            >
              Iqrar Nama
            </button>
            {printItem?.admission_no && (
              <button
                type="button"
                onClick={() => setPrintMode('combined')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                  printMode === 'combined' ? 'bg-white text-[#171717] shadow-xs' : 'text-[#525252]'
                }`}
              >
                Both
              </button>
            )}
          </div>
        }
        extraPages={
          printItem && printMode === 'combined' ? (
            <IqrarNamaSheet settings={settings} data={printItem} />
          ) : undefined
        }
      >
        {printItem &&
          (printMode === 'iqrar' ? (
            <IqrarNamaSheet settings={settings} data={printItem} />
          ) : (
            <AdmissionPaperSheet settings={settings} data={printItem} />
          ))}
      </PrintModal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Admission Application"
        message={`Remove admission record ${deleteTarget?.admission_no} for ${deleteTarget?.student_name}?`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
