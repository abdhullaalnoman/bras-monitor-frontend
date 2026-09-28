import React, { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api";

// Read a field ignoring case / spaces / underscores in the key
// (so "Internal Battery", "internal_batt", "internalBattery" all match).
const normKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
function pick(row, ...names) {
  if (!row) return null;
  const map = {};
  Object.keys(row).forEach((k) => {
    map[normKey(k)] = row[k];
  });
  for (const n of names) {
    const v = map[normKey(n)];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function fmtDec(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n.toFixed(2);
}
function fmtInt(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : String(Math.round(n));
}

// "27/09/26,11:33AM" (Asia/Dhaka)
function fmtRowDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dhaka",
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const date = `${get("day")}/${get("month")}/${get("year")}`;
    const time = `${get("hour")}:${get("minute")}${(get("dayPeriod") || "").toUpperCase()}`;
    return `${date},${time}`;
  } catch {
    return "—";
  }
}

// type: "num2" = 2 decimal places, "num0" = rounded integer, "text" = as-is
const COLUMNS = [
  { label: "PDB", names: ["pdb"], type: "num0", color: "text-cyan-400", w: 5 },
  { label: "UPS", names: ["ups1", "ups"], type: "num0", color: "text-blue-400", w: 5 },
  { label: "Batt Volt", names: ["batt_volt_1"], type: "num2", color: "text-violet-400", w: 7 },
  { label: "Batt Curr", names: ["batt_curr_1"], type: "num2", color: "text-fuchsia-400", w: 7 },
  { label: "Solar Volt", names: ["solar_volt"], type: "num0", color: "text-yellow-400", w: 5 },
  { label: "Solar Curr", names: ["solar_curr"], type: "num2", color: "text-amber-400", w: 5 },
  { label: "Temp", names: ["temp1"], type: "num2", color: "text-orange-400", w: 5 },
  { label: "Hum", names: ["hum1"], type: "num0", color: "text-sky-400", w: 5 },
  { label: "IB", names: ["internal_batt", "Internal Battery"], type: "num2", color: "text-emerald-400", w: 6 },
  { label: "PSU1", names: ["PSU1"], type: "num0", color: "text-teal-400", w: 5 },
  { label: "PSU2", names: ["PSU2"], type: "num0", color: "text-lime-400", w: 5 },
  { label: "Op", names: ["Operator"], type: "text", color: "text-slate-300", w: 5 },
  { label: "SS", names: ["Signal_Strength"], type: "num0", color: "text-indigo-400", w: 5 },
  { label: "Server1", names: ["server1"], type: "num0", color: "text-rose-400", w: 5 },
  { label: "Server2", names: ["server2"], type: "num0", color: "text-pink-400", w: 5 },
  { label: "DC", names: ["data_counter"], type: "num0", color: "text-slate-300", w: 5 },
];

function cellValue(row, col) {
  const raw = pick(row, ...col.names);
  if (col.type === "text") return raw === null ? "—" : String(raw);
  return col.type === "num2" ? fmtDec(raw) : fmtInt(raw);
}

function isoDate(d) {
  return d.toISOString().split("T")[0];
}

// ── Raw sensor history — row per reading (/api/devices/:sa_code/raw) ────────
export function RawHistoryModal({ saCode, saName, onClose }) {
  const today = new Date();
  const defaultStart = new Date(today);
  defaultStart.setDate(defaultStart.getDate() - 3); // last 3 days by default

  const [startDate, setStartDate] = useState(isoDate(defaultStart));
  const [endDate, setEndDate] = useState(isoDate(today));
  const [customRange, setCustomRange] = useState(false); // true once the user picks a date themselves
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const PAGE_LIMIT = 500;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setRecords([]);
    setCursor(null);
    setHasMore(false);
    try {
      const data = await api.getRawHistory(saCode, {
        start_date: startDate,
        end_date: endDate,
        limit: PAGE_LIMIT,
      });
      const list = data.records || data.data || data.rows || data.events || (Array.isArray(data) ? data : []);
      setRecords(list);
      setTotal(data.total ?? list.length);
      const last = list[list.length - 1];
      const nextCursor = last
        ? {
            after_created_at: pick(last, "created_at", "createdAt", "timestamp", "recorded_at"),
            after_id: pick(last, "id", "_id"),
          }
        : null;
      setCursor(nextCursor);
      setHasMore(list.length >= PAGE_LIMIT && !!nextCursor?.after_created_at);
    } catch (e) {
      setError("Failed to load history: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [saCode, startDate, endDate]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saCode]);

  async function loadMore() {
    if (!cursor?.after_created_at || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const data = await api.getRawHistory(saCode, {
        start_date: startDate,
        end_date: endDate,
        limit: PAGE_LIMIT,
        after_created_at: cursor.after_created_at,
        after_id: cursor.after_id,
      });
      const list = data.records || data.data || data.rows || data.events || (Array.isArray(data) ? data : []);
      // Underlying `records` always stays oldest→newest (append at the end);
      // display order is derived at render time below.
      setRecords((prev) => [...prev, ...list]);
      const last = list[list.length - 1];
      const nextCursor = last
        ? {
            after_created_at: pick(last, "created_at", "createdAt", "timestamp", "recorded_at"),
            after_id: pick(last, "id", "_id"),
          }
        : null;
      setCursor(nextCursor);
      setHasMore(list.length >= PAGE_LIMIT && !!nextCursor?.after_created_at);
    } catch (e) {
      setError("Failed to load more: " + e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  // No date picked yet (still on the default last-3-days range) -> newest first.
  // Once the user picks a date themselves -> chronological, oldest first (as-is).
  const displayRecords = customRange ? records : [...records].slice().reverse();

  // Chronologically latest loaded record's "active" value (device active date),
  // shown once in the header rather than repeated on every row.
  const deviceActive = records.length ? pick(records[records.length - 1], "active") : null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-7xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-white font-bold text-lg">{saName || saCode}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-slate-400 text-sm font-mono">{saCode}</span>
              {total !== null && !loading && (
                <span className="text-xs text-slate-500">
                  {records.length.toLocaleString()} loaded
                  {total ? ` of ${total.toLocaleString()}` : ""}
                </span>
              )}
              {deviceActive && !loading && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Device Active: {deviceActive}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mode label + date range */}
        <div className="px-6 pt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            📋 More History
          </span>

          <div className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCustomRange(true);
                }}
                max={isoDate(new Date())}
                className="bg-slate-800/60 border border-slate-700/50 text-white rounded-xl pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500/50 transition-all [color-scheme:dark]"
              />
            </div>
            <span className="text-slate-500 text-xs">to</span>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCustomRange(true);
                }}
                max={isoDate(new Date())}
                className="bg-slate-800/60 border border-slate-700/50 text-white rounded-xl pl-8 pr-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500/50 transition-all [color-scheme:dark]"
              />
            </div>
            <button
              onClick={load}
              disabled={loading || !startDate || !endDate}
              className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "..." : "Search"}
            </button>
          </div>
        </div>

        {/* Table — fixed column widths, no horizontal scrollbar */}
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
          ) : records.length === 0 ? (
            <div className="text-center text-slate-500 py-8">No records found</div>
          ) : (
            <div className="overflow-y-auto overflow-x-hidden flex-1 mt-3" style={{ maxHeight: "calc(90vh - 300px)" }}>
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: "2%" }} />
                  <col style={{ width: "13%" }} />
                  {COLUMNS.map((col) => (
                    <col key={col.label} style={{ width: `${col.w}%` }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                    <th className="text-left py-1.5 px-1 font-semibold align-bottom">#</th>
                    <th className="text-left py-1.5 px-1 font-semibold align-bottom leading-tight break-words">
                      Date &amp; Time
                    </th>
                    {COLUMNS.map((col) => (
                      <th key={col.label} className="text-left py-1.5 px-1 font-semibold align-bottom leading-tight break-words">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {displayRecords.map((r, i) => (
                    <tr key={pick(r, "id", "_id") ?? i} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-1.5 px-1 text-slate-500 font-mono text-xs">{i + 1}</td>
                      <td className="py-1.5 px-1 text-slate-400 font-mono text-xs whitespace-nowrap overflow-hidden">
                        {fmtRowDateTime(pick(r, "created_at", "createdAt", "timestamp", "recorded_at"))}
                      </td>
                      {COLUMNS.map((col) => (
                        <td key={col.label} className={`py-1.5 px-1 font-mono text-xs font-semibold truncate ${col.color}`}>
                          {cellValue(r, col)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Load more */}
        {!loading && !error && records.length > 0 && (
          <div className="flex items-center justify-center px-6 py-3 border-t border-slate-700">
            {hasMore ? (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loadingMore ? "Loading…" : "Load More"}
              </button>
            ) : (
              <span className="text-slate-600 text-xs">End of records for this range</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}