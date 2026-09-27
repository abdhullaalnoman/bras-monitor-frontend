import React, { useState, useEffect } from "react";
import { api } from "../utils/api";
import { formatSeconds, formatTimeOnlyBD, formatDateShortBD } from "../utils/formatters";
import DeviceDashboardPage from "../pages/DeviceDashboardPage";
import { RawHistoryModal } from "./RawHistoryModal";

// ── Status badge (handles "DOWN"/"UP" in any case) ──────────────────────────
export function SaStatusBadge({ status }) {
  const isUp = String(status || "").toLowerCase() === "up";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
        isUp
          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
          : "bg-red-500/15 text-red-400 border border-red-500/25"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isUp ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`}
      />
      {status}
    </span>
  );
}

// ── Ask for sa_code (used by the top "History" button) ──────────────────────
export function SaCodePromptModal({ onSubmit, onClose }) {
  const [code, setCode] = useState("");

  function submit() {
    const c = code.trim();
    if (c) onSubmit(c);
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-white font-bold text-lg">SA History</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">
          <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            SA Code
          </label>
          <input
            autoFocus
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="e.g. bras1"
            className="w-full bg-slate-800/60 border border-slate-700/50 text-white rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 placeholder-slate-500 transition-all"
          />
          <button
            onClick={submit}
            disabled={!code.trim()}
            className="w-full mt-4 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-xl px-4 py-2.5 text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Show History
          </button>
        </div>
      </div>
    </div>
  );
}

// ── shared helpers ────────────────────────────────────────────────────────
// Duration: "9:00 AM - 6:00 PM"  (start_time - end_time)
function fmtDuration(start, end) {
  const s = start ? formatTimeOnlyBD(start) : "—";
  const e = end ? formatTimeOnlyBD(end) : "—";
  return `${s} - ${e}`;
}

// Date: "23/9/26 - 24/9/26"  (start_time date - end_time date)
function fmtDateRange(start, end) {
  const s = start ? formatDateShortBD(start) : "—";
  const e = end ? formatDateShortBD(end) : "—";
  return `${s} - ${e}`;
}

// Dashboard icon button — opens the device dashboard page for a sa_code
// (same page/component the BRAS table's HistoryModal uses for bts_code).
function DashboardButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-xl px-4 py-2 text-xs font-bold transition-all"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-3a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z"
        />
      </svg>
      Dashboard
    </button>
  );
}

// "More History" button — opens the raw sensor-reading history (row per
// reading), used by both the PDB and UPS events modals.
function MoreHistoryButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-xl px-4 py-2 text-xs font-bold transition-all"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
      More History
    </button>
  );
}

// ── System power events modal (/api/devices/:sa_code/system-power-events) ───
export function SystemPowerEventsModal({ saCode, onClose }) {
  const [events, setEvents] = useState([]);
  const [saName, setSaName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const limit = 300;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await api.getSystemPowerEvents(saCode, page, limit);
        if (cancelled) return;
        const records = data.events || data.data || (Array.isArray(data) ? data : []);
        setEvents(records);
        setSaName(data.sa_name || records[0]?.sa_name || "");
        setMeta({
          total: data.total ?? records.length,
          pages: data.pages || 1,
          current: data.page || page,
        });
      } catch (e) {
        if (!cancelled) setError("Failed to load events: " + e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [saCode, page]);

  // Show device dashboard full page on top (same page as BRAS table, keyed by sa_code)
  if (showDashboard) {
    return (
      <DeviceDashboardPage
        router={{ bts_code: saCode, bts_name: saName }}
        onClose={() => setShowDashboard(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-white font-bold text-lg">{saName || saCode}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-slate-400 text-sm font-mono">{saCode}</span>
              {meta && (
                <span className="text-xs text-slate-500">
                  {meta.total?.toLocaleString()} total events
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DashboardButton onClick={() => setShowDashboard(true)} />

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mode label */}
        <div className="px-6 pt-4 flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
            ⚡ System Power Events
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 flex flex-col min-h-0 px-6 pb-0">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <svg className="w-8 h-8 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : error ? (
            <div className="text-center text-red-400 py-8">{error}</div>
          ) : events.length === 0 ? (
            <div className="text-center text-slate-500 py-8">No records found</div>
          ) : (
            <div className="overflow-auto flex-1 mt-4" style={{ maxHeight: "calc(90vh - 280px)" }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                    <th className="text-left pb-3 font-semibold pr-4">#</th>
                    <th className="text-left pb-3 font-semibold pr-4">Status</th>
                    <th className="text-left pb-3 font-semibold pr-4">Up Time</th>
                    <th className="text-left pb-3 font-semibold pr-4">Down Time</th>
                    <th className="text-left pb-3 font-semibold pr-4">Duration</th>
                    <th className="text-left pb-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {events.map((h, i) => (
                    <tr key={h.id || i} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 text-slate-500 font-mono text-xs pr-4">
                        {(page - 1) * limit + i + 1}
                      </td>
                      <td className="py-3 pr-4">
                        <SaStatusBadge status={h.status} />
                      </td>
                      <td className="py-3 text-emerald-400/80 font-mono text-xs pr-4">
                        {formatSeconds(h.up_time)}
                      </td>
                      <td className="py-3 text-red-400/80 font-mono text-xs pr-4">
                        {formatSeconds(h.down_time)}
                      </td>
                      <td className="py-3 text-slate-300 font-mono text-xs pr-4">
                        {fmtDuration(h.start_time, h.end_time)}
                      </td>
                      <td className="py-3 text-slate-400 font-mono text-xs">
                        {fmtDateRange(h.start_time, h.end_time)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {meta && meta.pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
            <span className="text-slate-400 text-sm">
              Page {meta.current} of {meta.pages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
                disabled={page >= meta.pages}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PDB events modal (/api/devices/:sa_code/pdb-events) ─────────────────────
export function PdbEventsModal({ saCode, onClose }) {
  const [events, setEvents] = useState([]);
  const [saName, setSaName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showRawHistory, setShowRawHistory] = useState(false);
  const limit = 300;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await api.getPdbEvents(saCode, page, limit);
        if (cancelled) return;
        const records = data.events || data.data || (Array.isArray(data) ? data : []);
        setEvents(records);
        setSaName(data.sa_name || records[0]?.sa_name || "");
        setMeta({
          total: data.total ?? records.length,
          pages: data.pages || 1,
          current: data.page || page,
        });
      } catch (e) {
        if (!cancelled) setError("Failed to load PDB events: " + e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [saCode, page]);

  // Show device dashboard full page on top (same page as BRAS table, keyed by sa_code)
  if (showDashboard) {
    return (
      <DeviceDashboardPage
        router={{ bts_code: saCode, bts_name: saName }}
        onClose={() => setShowDashboard(false)}
      />
    );
  }

  // Show raw sensor-reading history (row per reading) full page on top
  if (showRawHistory) {
    return (
      <RawHistoryModal
        saCode={saCode}
        saName={saName}
        onClose={() => setShowRawHistory(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-white font-bold text-lg">{saName || saCode}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-slate-400 text-sm font-mono">{saCode}</span>
              {meta && (
                <span className="text-xs text-slate-500">
                  {meta.total?.toLocaleString()} total events
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DashboardButton onClick={() => setShowDashboard(true)} />
            <MoreHistoryButton onClick={() => setShowRawHistory(true)} />

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mode label */}
        <div className="px-6 pt-4 flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            🔋 PDB Events
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 flex flex-col min-h-0 px-6 pb-0">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <svg className="w-8 h-8 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : error ? (
            <div className="text-center text-red-400 py-8">{error}</div>
          ) : events.length === 0 ? (
            <div className="text-center text-slate-500 py-8">No records found</div>
          ) : (
            <div className="overflow-auto flex-1 mt-4" style={{ maxHeight: "calc(90vh - 280px)" }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                    <th className="text-left pb-3 font-semibold pr-4">#</th>
                    <th className="text-left pb-3 font-semibold pr-4">Status</th>
                    <th className="text-left pb-3 font-semibold pr-4">Up Time</th>
                    <th className="text-left pb-3 font-semibold pr-4">Down Time</th>
                    <th className="text-left pb-3 font-semibold pr-4">Duration</th>
                    <th className="text-left pb-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {events.map((h, i) => (
                    <tr key={h.id || i} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 text-slate-500 font-mono text-xs pr-4">
                        {(page - 1) * limit + i + 1}
                      </td>
                      <td className="py-3 pr-4">
                        <SaStatusBadge status={h.status} />
                      </td>
                      <td className="py-3 text-emerald-400/80 font-mono text-xs pr-4">
                        {formatSeconds(h.up_time)}
                      </td>
                      <td className="py-3 text-red-400/80 font-mono text-xs pr-4">
                        {formatSeconds(h.down_time)}
                      </td>
                      <td className="py-3 text-slate-300 font-mono text-xs pr-4">
                        {fmtDuration(h.start_time, h.end_time)}
                      </td>
                      <td className="py-3 text-slate-400 font-mono text-xs">
                        {fmtDateRange(h.start_time, h.end_time)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {meta && meta.pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
            <span className="text-slate-400 text-sm">
              Page {meta.current} of {meta.pages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
                disabled={page >= meta.pages}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function UpsEventsModal({ saCode, onClose }) {
  const [events, setEvents] = useState([]);
  const [saName, setSaName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showRawHistory, setShowRawHistory] = useState(false);
  const limit = 300;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await api.getUpsEvents(saCode, page, limit);
        if (cancelled) return;
        const records = data.events || data.data || (Array.isArray(data) ? data : []);
        setEvents(records);
        setSaName(data.sa_name || records[0]?.sa_name || "");
        setMeta({
          total: data.total ?? records.length,
          pages: data.pages || 1,
          current: data.page || page,
        });
      } catch (e) {
        if (!cancelled) setError("Failed to load UPS events: " + e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [saCode, page]);

  // Show device dashboard full page on top (same page as BRAS table, keyed by sa_code)
  if (showDashboard) {
    return (
      <DeviceDashboardPage
        router={{ bts_code: saCode, bts_name: saName }}
        onClose={() => setShowDashboard(false)}
      />
    );
  }

  // Show raw sensor-reading history (row per reading) full page on top
  if (showRawHistory) {
    return (
      <RawHistoryModal
        saCode={saCode}
        saName={saName}
        onClose={() => setShowRawHistory(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-white font-bold text-lg">{saName || saCode}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-slate-400 text-sm font-mono">{saCode}</span>
              {meta && (
                <span className="text-xs text-slate-500">
                  {meta.total?.toLocaleString()} total events
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DashboardButton onClick={() => setShowDashboard(true)} />
            <MoreHistoryButton onClick={() => setShowRawHistory(true)} />

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mode label */}
        <div className="px-6 pt-4 flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            🔌 UPS Events
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 flex flex-col min-h-0 px-6 pb-0">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <svg className="w-8 h-8 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : error ? (
            <div className="text-center text-red-400 py-8">{error}</div>
          ) : events.length === 0 ? (
            <div className="text-center text-slate-500 py-8">No records found</div>
          ) : (
            <div className="overflow-auto flex-1 mt-4" style={{ maxHeight: "calc(90vh - 280px)" }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                    <th className="text-left pb-3 font-semibold pr-4">#</th>
                    <th className="text-left pb-3 font-semibold pr-4">Status</th>
                    <th className="text-left pb-3 font-semibold pr-4">Up Time</th>
                    <th className="text-left pb-3 font-semibold pr-4">Down Time</th>
                    <th className="text-left pb-3 font-semibold pr-4">Duration</th>
                    <th className="text-left pb-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {events.map((h, i) => (
                    <tr key={h.id || i} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 text-slate-500 font-mono text-xs pr-4">
                        {(page - 1) * limit + i + 1}
                      </td>
                      <td className="py-3 pr-4">
                        <SaStatusBadge status={h.status} />
                      </td>
                      <td className="py-3 text-emerald-400/80 font-mono text-xs pr-4">
                        {formatSeconds(h.up_time)}
                      </td>
                      <td className="py-3 text-red-400/80 font-mono text-xs pr-4">
                        {formatSeconds(h.down_time)}
                      </td>
                      <td className="py-3 text-slate-300 font-mono text-xs pr-4">
                        {fmtDuration(h.start_time, h.end_time)}
                      </td>
                      <td className="py-3 text-slate-400 font-mono text-xs">
                        {fmtDateRange(h.start_time, h.end_time)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {meta && meta.pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
            <span className="text-slate-400 text-sm">
              Page {meta.current} of {meta.pages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
                disabled={page >= meta.pages}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SaStatusEventsModal({ saCode, onClose }) {
  const [events, setEvents] = useState([]);
  const [saName, setSaName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const limit = 300;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await api.getSaStatusEvents(saCode, page, limit);
        if (cancelled) return;
        const records = data.events || data.data || (Array.isArray(data) ? data : []);
        setEvents(records);
        setSaName(data.sa_name || records[0]?.sa_name || "");
        setMeta({
          total: data.total ?? records.length,
          pages: data.pages || 1,
          current: data.page || page,
        });
      } catch (e) {
        if (!cancelled) setError("Failed to load SA status events: " + e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [saCode, page]);

  // Show device dashboard full page on top (same page as BRAS table, keyed by sa_code)
  if (showDashboard) {
    return (
      <DeviceDashboardPage
        router={{ bts_code: saCode, bts_name: saName }}
        onClose={() => setShowDashboard(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-white font-bold text-lg">{saName || saCode}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-slate-400 text-sm font-mono">{saCode}</span>
              {meta && (
                <span className="text-xs text-slate-500">
                  {meta.total?.toLocaleString()} total events
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DashboardButton onClick={() => setShowDashboard(true)} />

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mode label */}
        <div className="px-6 pt-4 flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
            📡 SA Status Events
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 flex flex-col min-h-0 px-6 pb-0">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <svg className="w-8 h-8 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : error ? (
            <div className="text-center text-red-400 py-8">{error}</div>
          ) : events.length === 0 ? (
            <div className="text-center text-slate-500 py-8">No records found</div>
          ) : (
            <div className="overflow-auto flex-1 mt-4" style={{ maxHeight: "calc(90vh - 280px)" }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                    <th className="text-left pb-3 font-semibold pr-4">#</th>
                    <th className="text-left pb-3 font-semibold pr-4">Status</th>
                    <th className="text-left pb-3 font-semibold pr-4">Down Time</th>
                    <th className="text-left pb-3 font-semibold pr-4">Duration</th>
                    <th className="text-left pb-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {events.map((h, i) => (
                    <tr key={h.id || i} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 text-slate-500 font-mono text-xs pr-4">
                        {(page - 1) * limit + i + 1}
                      </td>
                      <td className="py-3 pr-4">
                        <SaStatusBadge status={h.status} />
                      </td>
                      <td className="py-3 text-red-400/80 font-mono text-xs pr-4">
                        {formatSeconds(h.down_time)}
                      </td>
                      <td className="py-3 text-slate-300 font-mono text-xs pr-4">
                        {fmtDuration(h.start_time, h.end_time)}
                      </td>
                      <td className="py-3 text-slate-400 font-mono text-xs">
                        {fmtDateRange(h.start_time, h.end_time)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {meta && meta.pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
            <span className="text-slate-400 text-sm">
              Page {meta.current} of {meta.pages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
                disabled={page >= meta.pages}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}