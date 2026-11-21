import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw, Search } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';

const MODULES = ['auth', 'super_admin', 'login_details', 'admissions', 'students', 'teachers', 'parents', 'classes', 'subjects', 'attendance', 'examinations', 'results', 'committee', 'notices', 'programs', 'feed', 'homework', 'online_classes'];

export const ActivityLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const qs = new URLSearchParams();
      if (search) qs.set('search', search);
      if (moduleFilter) qs.set('module', moduleFilter);
      const res = await apiRequest<{ logs: any[] }>(`/api/activity-logs?${qs.toString()}`);
      setLogs(res.logs || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [moduleFilter]);

  return (
    <div className="space-y-5">
      {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#DC1726] font-medium">{err}</div>}

      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="flex flex-wrap items-center gap-2.5 flex-1"
        >
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-[#737373] absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search user, action, record ID, details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full ps-9 pe-3 py-2 rounded-lg border border-neutral-200 text-xs focus:outline-none focus:border-[#DC1726]"
            />
          </div>
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-neutral-200 text-xs bg-white capitalize"
          >
            <option value="">All Modules</option>
            {MODULES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
          <button type="submit" className="px-3.5 py-2 rounded-lg bg-[#171717] text-white text-xs font-medium">Search</button>
        </form>

        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-200 bg-white text-xs font-medium hover:bg-neutral-50 whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Logs
        </button>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        {/* Phone App Audit Cards (< md) */}
        <div className="md:hidden divide-y divide-neutral-100">
          {loading ? (
            <div className="p-8 text-center text-xs text-[#737373]">Loading audit logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#737373]">No audit log entries match your filter.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-3.5 space-y-1.5 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono-num font-bold text-xs text-[#DC1726]">{log.action}</span>
                    <span className="text-[11px] text-neutral-500 capitalize"> · {String(log.module || '').replace('_', ' ')}</span>
                  </div>
                  <span className="text-[10px] font-mono-num text-[#737373] shrink-0">
                    {new Date(log.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-start gap-1.5 text-xs text-[#171717]">
                  <Activity className="w-3.5 h-3.5 text-[#14B8A6] shrink-0 mt-0.5" />
                  <span className="break-words">{log.details}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#737373] pt-1 border-t border-neutral-100">
                  <span className="font-semibold text-[#171717]">{log.username} <span className="font-normal text-[#737373]">({log.role_name})</span></span>
                  <span className="font-mono-num">{new Date(log.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Tablet & Desktop Audit Table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-[#737373] uppercase text-[11px]">
              <tr>
                <th className="px-4 py-3 text-start">Timestamp</th>
                <th className="px-4 py-3 text-start">User</th>
                <th className="px-4 py-3 text-start">Action</th>
                <th className="px-4 py-3 text-start">Module</th>
                <th className="px-4 py-3 text-start">Record ID</th>
                <th className="px-4 py-3 text-start">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-[#737373]">Loading audit logs...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-[#737373]">No audit log entries match your filter.</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-neutral-50/70">
                    <td className="px-4 py-2.5 text-[#737373] font-mono-num whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="font-semibold text-[#171717]">{log.username}</div>
                      <div className="text-[11px] text-[#737373]">{log.role_name}</div>
                    </td>
                    <td className="px-4 py-2.5 font-mono-num font-semibold text-[#DC1726] whitespace-nowrap">{log.action}</td>
                    <td className="px-4 py-2.5 capitalize text-[#171717] whitespace-nowrap">{String(log.module || '').replace('_', ' ')}</td>
                    <td className="px-4 py-2.5 font-mono-num text-[#737373]">{log.record_id || '—'}</td>
                    <td className="px-4 py-2.5 text-[#171717]">
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-[#14B8A6] shrink-0" />
                        <span>{log.details}</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
