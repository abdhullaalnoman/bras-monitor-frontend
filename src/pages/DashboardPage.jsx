import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../config/AuthContext";
import { api } from "../utils/api";
import { formatSeconds, formatBackupHours, formatDateTimeBD } from "../utils/formatters";
import HistoryModal from "../components/HistoryModal";
import BatteryGauge from "../components/BatteryGauge";
import DownBtsPage from "./DownBtsPage";
import {
  SaStatusBadge,
  SaCodePromptModal,
  SystemPowerEventsModal,
  SaStatusEventsModal,
  PdbEventsModal,
  UpsEventsModal,
} from "../components/SystemPowerEventsModal";
import logo from "../../assets/logo.svg";

const REFRESH_INTERVAL = 30000;

function StatusBadge({ status }) {
  const isUp = status === "Up";
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

// ── PDB table helpers ─────────────────────────────────────────────────────
const PDB_HIDDEN_COLUMNS = new Set(["sa_code", "last_seen_at"]);

// "2.25pm 22/9/26" (Bangladesh time)
function formatLastSeenBD(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dhaka",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      day: "numeric",
      month: "numeric",
      year: "2-digit",
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const time = `${get("hour")}.${get("minute")}${(get("dayPeriod") || "").toLowerCase()}`;
    const date = `${Number(get("day"))}/${Number(get("month"))}/${get("year")}`;
    return `${time} ${date}`;
  } catch {
    return "—";
  }
}

// Highest downtime -> lowest downtime, then lowest uptime -> highest uptime
function sortByDowntime(a, b) {
  const dd = (Number(b?.down_time) || 0) - (Number(a?.down_time) || 0);
  if (dd !== 0) return dd;
  return (Number(a?.up_time) || 0) - (Number(b?.up_time) || 0);
}

// Split a column name into lowercase words: "pdb_downTime" -> ["pdb","down","time"]
function keyTokens(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Classify a PDB column like the BRAS table columns:
//   Down Time / Up Time / Down 24h / Up 24h  (values come in seconds)
// Returns { kind: "down"|"up", h24: boolean } or null when it is not one of them.
function pdbTimeKind(key) {
  const t = keyTokens(key);
  if (t.includes("status")) return null;
  if (t.some((w) => ["at", "start", "end", "date", "seen", "stamp", "since"].includes(w))) return null;
  const h24 = t.includes("24h") || (t.includes("24") && t.includes("last")) || t.includes("24");
  if (t.some((w) => w === "down" || w === "downtime")) return { kind: "down", h24 };
  if (t.some((w) => w === "up" || w === "uptime")) return { kind: "up", h24 };
  return null;
}

// The row's own key for a given kind (e.g. its down-time key), first match wins
function pdbTimeKey(row, kind, h24) {
  return Object.keys(row || {}).find((k) => {
    const c = pdbTimeKind(k);
    return c && c.kind === kind && c.h24 === h24;
  });
}

// NO_SIGNAL rows always go to the top (as an alert); everything else keeps the
// existing order — highest downtime -> lowest downtime, then lowest uptime -> highest uptime
function sortPdbByDowntime(a, b) {
  const aNoSig = pdbHasNoSignal(a);
  const bNoSig = pdbHasNoSignal(b);
  if (aNoSig !== bNoSig) return aNoSig ? -1 : 1;

  const dk = pdbTimeKey(a, "down", false) || pdbTimeKey(b, "down", false);
  const uk = pdbTimeKey(a, "up", false) || pdbTimeKey(b, "up", false);
  const dd = (Number(dk && b?.[dk]) || 0) - (Number(dk && a?.[dk]) || 0);
  if (dd !== 0) return dd;
  return (Number(uk && a?.[uk]) || 0) - (Number(uk && b?.[uk]) || 0);
}

// Signal column: "signal": "OK" | "NO_SIGNAL" (matches loosely on key + value).
// A row also counts as No Signal when its last_seen_at is more than 5 minutes
// old — even with no explicit signal field, stale data means the device has
// stopped reporting. Used by both the PDB and UPS tables.
const NO_SIGNAL_STALE_MS = 5 * 60 * 1000; // 5 minutes

function pdbSignalOf(d) {
  const k = Object.keys(d || {}).find((x) => keyTokens(x).includes("signal"));
  return k ? d[k] : null;
}

function pdbIsStale(lastSeenVal) {
  if (!lastSeenVal) return false;
  const t = new Date(lastSeenVal).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t > NO_SIGNAL_STALE_MS;
}

function pdbHasNoSignal(d) {
  const v = pdbSignalOf(d);
  if (String(v || "").trim().toUpperCase() === "NO_SIGNAL") return true;
  const lastSeenVal = pdbPick(d, "last_seen_at", "last_seen", "lastseen");
  return pdbIsStale(lastSeenVal);
}

function pdbStatusOf(d) {
  const k = Object.keys(d || {}).find((x) => keyTokens(x).includes("status"));
  return String(k ? d[k] : "").toLowerCase();
}

// Raw (original-case) status text, for display in the badge
function pdbRawStatus(d) {
  const k = Object.keys(d || {}).find((x) => keyTokens(x).includes("status"));
  return k ? d[k] : null;
}

// SA Down card count: number of rows the SA status table has (falls back to
// an explicit total/count field if the API sends one)
function getSysDownCount(res, arr) {
  if (Array.isArray(arr) && arr.length) return arr.length;
  if (res && res.total !== undefined && res.total !== null) return Number(res.total) || 0;
  if (res && res.count !== undefined && res.count !== null) return Number(res.count) || 0;
  return 0;
}

// Loosely read a field from a SA-status row, ignoring case / spaces / underscores
function saStatusPick(row, ...names) {
  if (!row) return null;
  const map = {};
  Object.keys(row).forEach((k) => {
    map[keyTokens(k).join("")] = row[k];
  });
  for (const n of names) {
    const key = keyTokens(n).join("");
    if (map[key] !== undefined) return map[key];
  }
  return null;
}

// true/false/1/0/"true"/"yes"/"down" all read as "down"
function saStatusIsDown(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "down";
}

// Transmission Down / Power Down fields can arrive either as a boolean-ish
// flag ("true"/"down"/1) or as a raw down-duration in seconds. This reads
// either shape and always returns { isDown, seconds } so the UI can show
// the actual down time (formatted like the BRAS table, e.g. "2h 30min")
// instead of a flat "Down"/"OK" label.
function saStatusDownInfo(v) {
  if (v === null || v === undefined || v === "") return { isDown: false, seconds: 0 };
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "yes" || s === "down") return { isDown: true, seconds: 0 };
  if (s === "false" || s === "no" || s === "up" || s === "ok") return { isDown: false, seconds: 0 };
  const num = Number(v);
  if (!isNaN(num)) return { isDown: num > 0, seconds: num };
  return { isDown: false, seconds: 0 };
}

function pdbIsDown(d) {
  return pdbStatusOf(d) === "down";
}

function pdbIsUp(d) {
  return pdbStatusOf(d) === "up";
}

// Read a field from a PDB row, ignoring case / spaces / underscores in the key
// (same matching style as DeviceDashboardPage's `pick`)
const normPdbKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
function pdbPick(row, ...names) {
  if (!row) return null;
  const map = {};
  Object.keys(row).forEach((k) => {
    map[normPdbKey(k)] = row[k];
  });
  for (const n of names) {
    const v = map[normPdbKey(n)];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function pdbNum(v, decimals = 0) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return decimals ? n.toFixed(decimals) : String(Math.round(n));
}

// Emergency icon + hover tooltip for a NO_SIGNAL row. Uses position:fixed
// (computed from the icon's own screen position) so the tooltip is never
// clipped by the table's overflow-hidden ancestors.
function NoSignalIcon({ lastSeen }) {
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);

  function show() {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.top, left: r.left + r.width / 2 });
  }

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex shrink-0"
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
    >
      <svg className="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2 1 21h22L12 2zm0 6.5c.55 0 1 .45 1 1V14a1 1 0 01-2 0V9.5c0-.55.45-1 1-1zM12 18a1.25 1.25 0 110-2.5A1.25 1.25 0 0112 18z" />
      </svg>
      {pos && (
        <span
          className="fixed whitespace-nowrap rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-[11px] text-slate-200 shadow-xl"
          style={{ top: pos.top - 8, left: pos.left, transform: "translate(-50%, -100%)", zIndex: 9999 }}
        >
          <span className="block font-semibold text-red-400">No Signal</span>
          <span className="block text-slate-400">Last seen: {formatLastSeenBD(lastSeen)}</span>
        </span>
      )}
    </span>
  );
}

export default function DashboardPage({
  onAdminClick,
  onAskClick,
  onAnalyticsClick,
  onReportsClick,
  onLogout,
}) {
  const { logout } = useAuth();
  const [routers, setRouters] = useState([]);
  const [powerStatus, setPowerStatus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [countdown, setCountdown] = useState(30);
  const [historyRouter, setHistoryRouter] = useState(null);
  const [showDownSnapshot, setShowDownSnapshot] = useState(false);
  const [statusFilter, setStatusFilter] = useState(null);
  const [filteredByStatus, setFilteredByStatus] = useState([]);
  const [statusLoading, setStatusLoading] = useState(false);
  const [tableView, setTableView] = useState("bras"); // "bras" | "pdb" | "ups" | "sadown"
  const [pdbData, setPdbData] = useState([]);
  const [pdbLoading, setPdbLoading] = useState(false);
  const [upsData, setUpsData] = useState([]);
  const [upsLoading, setUpsLoading] = useState(false);
  const [systemDownCount, setSystemDownCount] = useState(0);
  const [sysDownData, setSysDownData] = useState([]);
  const [sysDownLoading, setSysDownLoading] = useState(false);
  const [sysDownIsSingle, setSysDownIsSingle] = useState(false); // true after "History" lookup
  const [saStatusPromptOpen, setSaStatusPromptOpen] = useState(false); // "History" button on the SA table
  const [historySa, setHistorySa] = useState(null); // sa_code string — opens SaStatusEventsModal
  const [promptOpen, setPromptOpen] = useState(false);
  const [historyPdbSa, setHistoryPdbSa] = useState(null); // sa_code string (PDB events modal)
  const [historyUpsSa, setHistoryUpsSa] = useState(null); // sa_code string (UPS events modal)
  const timerRef = useRef(null);
  const countdownRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [data, powerData, pdbRes, upsRes, sysDownRes] = await Promise.all([
        api.getRouters(),
        // Backup data is a separate, newer endpoint — don't let it failing
        // take down the whole dashboard, just leave the Backup column blank.
        api.getBrasPowerStatus().catch(() => []),
        // PDB + UPS + SA Down feed the top cards / tables; failures stay silent.
        api.getDeviceLiveSummary("pdb").catch(() => null),
        api.getDeviceLiveSummary("ups1").catch(() => null),
        api.getSaStatusList().catch(() => null),
      ]);
      const arr = Array.isArray(data) ? data : data.data || data.routers || [];
      setRouters(arr);
      const pArr = Array.isArray(powerData)
        ? powerData
        : powerData.data || powerData.routers || [];
      setPowerStatus(pArr);
      if (pdbRes) {
        setPdbData(Array.isArray(pdbRes) ? pdbRes : pdbRes.data || []);
      }
      if (upsRes) {
        setUpsData(Array.isArray(upsRes) ? upsRes : upsRes.data || []);
      }
      if (sysDownRes) {
        const sdArr = Array.isArray(sysDownRes) ? sysDownRes : sysDownRes.data || [];
        setSystemDownCount(getSysDownCount(sysDownRes, sdArr));
        setSysDownData(sdArr);
        setSysDownIsSingle(false);
      }
      setCountdown(30);
      setError("");
    } catch (e) {
      setError("API connection error: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Lookup map from /api/bras/power/status, keyed by both bts_code and
  // bts_name (normalized) so we match whichever field is present.
  const backupByKey = React.useMemo(() => {
    const map = new Map();
    for (const p of powerStatus) {
      const backup = p.ups_backup_time;
      if (p.bts_code) map.set(String(p.bts_code).trim().toLowerCase(), backup);
      if (p.bts_name) map.set(String(p.bts_name).trim().toLowerCase(), backup);
    }
    return map;
  }, [powerStatus]);

  function getBackupTime(r) {
    if (r.bts_code) {
      const v = backupByKey.get(String(r.bts_code).trim().toLowerCase());
      if (v !== undefined) return v;
    }
    if (r.bts_name) {
      const v = backupByKey.get(String(r.bts_name).trim().toLowerCase());
      if (v !== undefined) return v;
    }
    return null;
  }

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [fetchData]);

  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 30));
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, []);

  const downRouters = [...routers]
    .filter((r) => r.status === "Down")
    .sort((a, b) => (b.down_time || 0) - (a.down_time || 0));

  const upRouters = [...routers]
    .filter((r) => r.status === "Up")
    .sort((a, b) => (a.up_time || 0) - (b.up_time || 0));

  const allSorted = [...downRouters, ...upRouters];
  const baseList = statusFilter ? filteredByStatus : allSorted;
  const filtered = baseList.filter(
    (r) =>
      r.bts_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.ip_address?.includes(search),
  );

  const totalDown = routers.filter((r) => r.status === "Down").length;
  const totalUp = routers.filter((r) => r.status === "Up").length;

  function handleSearch(v) {
    setSearch(v);
  }

  async function handleCardClick(type) {
    if (statusFilter === type) {
      setStatusFilter(null);
      setFilteredByStatus([]);
      return;
    }
    setStatusFilter(type);
    setStatusLoading(true);
    try {
      const data = await api.getRoutersByStatus(type);
      const arr = Array.isArray(data) ? data : data.data || data.routers || [];
      setFilteredByStatus(arr);
    } catch (e) {
      setFilteredByStatus([]);
    } finally {
      setStatusLoading(false);
    }
  }

  function handleBrasCardClick() {
    setTableView("bras");
    setSearch("");
  }

  async function handlePdbCardClick() {
    setTableView("pdb");
    setSearch("");
    setStatusFilter(null);
    setFilteredByStatus([]);
    setPdbLoading(true);
    try {
      const data = await api.getDeviceLiveSummary("pdb");
      setPdbData(Array.isArray(data) ? data : data.data || []);
    } catch (e) {
      setError("API connection error: " + e.message);
    } finally {
      setPdbLoading(false);
    }
  }

  async function handleUpsCardClick() {
    setTableView("ups");
    setSearch("");
    setStatusFilter(null);
    setFilteredByStatus([]);
    setUpsLoading(true);
    try {
      const data = await api.getDeviceLiveSummary("ups1");
      setUpsData(Array.isArray(data) ? data : data.data || []);
    } catch (e) {
      setError("API connection error: " + e.message);
    } finally {
      setUpsLoading(false);
    }
  }

  async function handleSystemDownCardClick() {
    setTableView("sadown");
    setSearch("");
    setStatusFilter(null);
    setFilteredByStatus([]);
    setSysDownIsSingle(false);
    setSysDownLoading(true);
    try {
      const data = await api.getSaStatusList();
      const arr = Array.isArray(data) ? data : data.data || [];
      setSysDownData(arr);
      setSystemDownCount(getSysDownCount(data, arr));
    } catch (e) {
      setError("API connection error: " + e.message);
    } finally {
      setSysDownLoading(false);
    }
  }

  // "History" button on the SA Down table — look up one SA by code and show
  // only that row (GET /api/sa-status/:sa_code)
  async function handleSaStatusHistorySubmit(code) {
    setPromptOpen(false);
    setSysDownLoading(true);
    try {
      const data = await api.getSaStatusByCode(code);
      const row = Array.isArray(data) ? data[0] : data?.data || data;
      setSysDownData(row ? [row] : []);
      setSysDownIsSingle(true);
    } catch (e) {
      setError("API connection error: " + e.message);
      setSysDownData([]);
      setSysDownIsSingle(true);
    } finally {
      setSysDownLoading(false);
    }
  }

  const saStatusFiltered = sysDownData.filter(
    (r) =>
      !search ||
      String(saStatusPick(r, "sa_name") || "").toLowerCase().includes(search.toLowerCase()),
  );

  // SA System Monitoring table (highest downtime first)
  // PDB table: fixed column set — Status, Down/Up Time, Down/Up 24h, PDB, UPS, Load, Charging Watt, Battery
  const pdbFiltered = [...pdbData].sort(sortPdbByDowntime).filter((d) =>
    !search
      ? true
      : Object.entries(d).some(
          ([k, v]) =>
            !PDB_HIDDEN_COLUMNS.has(k) &&
            String(v ?? "").toLowerCase().includes(search.toLowerCase()),
        ),
  );
  const pdbUp = pdbData.filter(pdbIsUp).length;
  const pdbDown = pdbData.filter(pdbIsDown).length;

  // UPS table — same fixed set (#, SA Name, Status, Down Time, Up Time, Down 24h,
  // Up 24h, UPS) and the same highest-downtime -> lowest-uptime sort as PDB.
  const upsFiltered = [...upsData].sort(sortPdbByDowntime).filter((d) =>
    !search
      ? true
      : Object.entries(d).some(
          ([k, v]) =>
            !PDB_HIDDEN_COLUMNS.has(k) &&
            String(v ?? "").toLowerCase().includes(search.toLowerCase()),
        ),
  );
  const upsUp = upsData.filter(pdbIsUp).length;
  const upsDown = upsData.filter(pdbIsDown).length;

  const handleLogout = async () => {
    await logout();
    onLogout?.();
  };

  return (
    <div className="min-h-screen bg-[#080c18] text-white flex flex-col">
      {/* Top Nav */}
      <nav className="sticky top-0 z-40 bg-[#0a0e1a]/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-16 h-16 flex items-center justify-center">
              <img src={logo} alt="Logo" width={50} height={150} />
            </div>
            <div>
              <div
                className="text-base font-black tracking-tight"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                LINK3 BRAS MONITOR
              </div>
            </div>
          </div>

          <div className="flex-1 max-w-md hidden sm:block">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search BRAS name or IP..."
                className="w-full bg-slate-800/60 border border-slate-700/50 text-white rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 placeholder-slate-500 transition-all"
              />
              {search && (
                <button
                  onClick={() => handleSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-1.5">
              <div className="relative w-3 h-3">
                <span className="absolute inset-0 rounded-full bg-cyan-500 animate-ping opacity-40" />
                <span className="relative block w-3 h-3 rounded-full bg-cyan-500" />
              </div>
              <span className="text-xs text-slate-400">
                Refresh in{" "}
                <span className="text-cyan-400 font-bold">{countdown}s</span>
              </span>
            </div>

            <button
              onClick={() => {
                fetchData();
                setCountdown(30);
              }}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-cyan-400 transition-all"
              title="Refresh now"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>

            <button
              onClick={onAskClick}
              className="flex items-center gap-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-xl px-3 py-2 text-xs font-bold transition-all"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              Ask
            </button>

            {onAnalyticsClick && (
              <button
                onClick={onAnalyticsClick}
                className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl px-3 py-2 text-xs font-bold transition-all"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                Analytics
              </button>
            )}

            {onReportsClick && (
              <button
                onClick={onReportsClick}
                className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-xl px-3 py-2 text-xs font-bold transition-all"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Reports
              </button>
            )}

            <button
              onClick={onAdminClick}
              className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-xl px-3 py-2 text-xs font-bold transition-all"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              BTS Admin
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white rounded-xl px-3 py-2 text-xs font-semibold transition-all"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex flex-col max-w-screen-2xl mx-auto w-full px-4 sm:px-6 py-6">
        {/* Stats Cards — BRAS / PDB / UPS / SA Down */}
        <style>{`
          @keyframes saSlowBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
          .sa-slow-blink { animation: saSlowBlink 2.4s ease-in-out infinite; }
        `}</style>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* BRAS — clickable */}
          <div
            onClick={handleBrasCardClick}
            className={`bg-slate-900/60 border rounded-2xl p-4 transition-all select-none cursor-pointer hover:border-slate-600 ${
              tableView === "bras"
                ? "border-emerald-500/60 ring-1 ring-emerald-500/30 bg-emerald-500/5"
                : "border-slate-800"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                Bras
              </span>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-400">
              {totalUp}
              <span className="text-sm font-semibold text-slate-500"> up</span>
              <span className="text-slate-700 mx-2">/</span>
              <span className={totalDown > 0 ? "text-red-400" : "text-slate-400"}>{totalDown}</span>
              <span className="text-sm font-semibold text-slate-500"> down</span>
            </div>
          </div>

          {/* PDB — clickable */}
          <div
            onClick={handlePdbCardClick}
            className={`bg-slate-900/60 border rounded-2xl p-4 transition-all select-none cursor-pointer hover:border-slate-600 ${
              tableView === "pdb"
                ? "border-amber-500/60 ring-1 ring-amber-500/30 bg-amber-500/5"
                : "border-slate-800"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                PDB Status of SA (40%)
              </span>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-black text-amber-400">
              {pdbUp}
              <span className="text-sm font-semibold text-slate-500"> up</span>
              <span className="text-slate-700 mx-2">/</span>
              <span className={pdbDown > 0 ? "text-red-400" : "text-slate-400"}>{pdbDown}</span>
              <span className="text-sm font-semibold text-slate-500"> down</span>
            </div>
          </div>

          {/* UPS — clickable */}
          <div
            onClick={handleUpsCardClick}
            className={`bg-slate-900/60 border rounded-2xl p-4 transition-all select-none cursor-pointer hover:border-slate-600 ${
              tableView === "ups"
                ? "border-blue-500/60 ring-1 ring-blue-500/30 bg-blue-500/5"
                : "border-slate-800"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                UPS
              </span>
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-black text-blue-400">
              {upsUp}
              <span className="text-sm font-semibold text-slate-500"> up</span>
              <span className="text-slate-700 mx-2">/</span>
              <span className={upsDown > 0 ? "text-red-400" : "text-slate-400"}>{upsDown}</span>
              <span className="text-sm font-semibold text-slate-500"> down</span>
            </div>
          </div>

          {/* SA Down — clickable, opens the SA System Monitoring page */}
          <div
            onClick={handleSystemDownCardClick}
            className={`bg-slate-900/60 border rounded-2xl p-4 transition-all select-none cursor-pointer ${
              systemDownCount > 0
                ? "border-red-500 ring-1 ring-red-500/40 bg-red-500/5 hover:border-red-400"
                : tableView === "sadown"
                  ? "border-slate-500 ring-1 ring-slate-500/30"
                  : "border-slate-800 hover:border-slate-600"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                SA Down
              </span>
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  systemDownCount > 0 ? "bg-red-500/15" : "bg-slate-500/10"
                }`}
              >
                <svg
                  className={`w-5 h-5 ${
                    systemDownCount > 0 ? "text-red-500 sa-slow-blink" : "text-slate-500"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <div
              className={`text-2xl font-black ${
                systemDownCount > 0 ? "text-red-400" : "text-slate-400"
              }`}
            >
              {systemDownCount}
              <span className="text-sm font-semibold text-slate-500"> down</span>
            </div>
          </div>
        </div>

        {/* Previous 3-card layout (Total BRAS / Online / Offline) — kept for reference
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          {[
            {
              label: "Total BRAS",
              value: routers.length,
              color: "cyan",
              clickable: false,
              icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
            },
            {
              label: "Online",
              value: totalUp,
              color: "emerald",
              clickable: true,
              filterKey: "up",
              icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
            },
            {
              label: "Offline",
              value: totalDown,
              color: "red",
              clickable: true,
              filterKey: "down",
              icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z",
            },
          ].map((stat) => {
            const isActive = stat.clickable && statusFilter === stat.filterKey;
            return (
              <div
                key={stat.label}
                onClick={() =>
                  stat.clickable && handleCardClick(stat.filterKey)
                }
                className={`bg-slate-900/60 border rounded-2xl p-4 transition-all select-none
                  ${stat.clickable ? "cursor-pointer hover:border-slate-600" : ""}
                  ${
                    isActive
                      ? `border-${stat.color}-500/60 ring-1 ring-${stat.color}-500/30 bg-${stat.color}-500/5`
                      : "border-slate-800"
                  }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    {stat.label}
                  </span>
                  <div
                    className={`w-8 h-8 rounded-lg bg-${stat.color}-500/10 flex items-center justify-center`}
                  >
                    <svg
                      className={`w-4 h-4 text-${stat.color}-400`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={stat.icon}
                      />
                    </svg>
                  </div>
                </div>
                <div className={`text-2xl font-black text-${stat.color}-400`}>
                  {stat.value}
                </div>
                {stat.clickable && (
                  <div
                    className={`text-xs mt-1 ${isActive ? `text-${stat.color}-400` : "text-slate-600"}`}
                  >
                    {isActive
                      ? "● Filtering active — click to clear"
                      : "Click to filter"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        */}

        {/* Status filter banner */}
        {statusFilter && (
          <div
            className={`flex items-center justify-between rounded-xl px-4 py-2.5 mb-4 border text-sm
            ${
              statusFilter === "up"
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                : "bg-red-500/10 border-red-500/25 text-red-400"
            }`}
          >
            <span className="font-semibold">
              Showing {statusFilter === "up" ? "Online" : "Offline"} BTS only
              {statusLoading
                ? " — loading..."
                : ` — ${filtered.length} routers`}
            </span>
            <button
              onClick={() => {
                setStatusFilter(null);
                setFilteredByStatus([]);
              }}
              className="text-xs underline opacity-70 hover:opacity-100"
            >
              Clear filter
            </button>
          </div>
        )}

        {/* Mobile search */}
        <div className="sm:hidden mb-4">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search BTS name or IP..."
              className="w-full bg-slate-800/60 border border-slate-700/50 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500/50 placeholder-slate-500"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-5 text-red-400 text-sm">
            <svg
              className="w-5 h-5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {error}
          </div>
        )}

        {/* ── TABLE — sticky header fix:
            The trick is to NOT use overflow-x-auto on the same element as the table container.
            Instead we use a fixed-height scrollable wrapper with overflow:auto, and the thead
            uses sticky + top-0 with a z-index. The key is the scroll container must be the
            one that clips the content — not a parent with overflow:visible. ── */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0">
          {/* Table header bar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-white font-bold text-sm">
                {tableView === "pdb"
                  ? "PDB Monitoring Table"
                  : tableView === "ups"
                    ? "UPS Monitoring Table"
                    : tableView === "sadown"
                      ? "SA System Monitoring Table"
                      : "BRAS Monitoring Table"}
              </span>
              {search && (
                <span className="text-xs text-slate-400 bg-slate-800 rounded-lg px-2 py-1">
                  {tableView === "pdb" ? pdbFiltered.length : tableView === "ups" ? upsFiltered.length : tableView === "sadown" ? saStatusFiltered.length : filtered.length} results for "{search}"
                </span>
              )}
              {!search && !statusFilter && (
                <span className="text-xs text-slate-600">
                  {tableView === "pdb" ? pdbFiltered.length : tableView === "ups" ? upsFiltered.length : tableView === "sadown" ? saStatusFiltered.length : filtered.length} total
                </span>
              )}
            </div>

            {/* History button — SA Down view only. Looks up one SA by code
                (GET /api/sa-status/:sa_code) and shows just that row. */}
            {tableView === "sadown" && (
              <button
                onClick={() => setPromptOpen(true)}
                className="flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-xl px-4 py-2 text-xs font-bold transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                History
              </button>
            )}

            {/* Down Snapshot button — removed from all tables
            {tableView !== "sadown" && (
              <button
                onClick={() => setShowDownSnapshot(true)}
                title="Down BTS snapshot (for sharing)"
                className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl px-3 py-2 text-xs font-bold transition-all"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Down Snapshot
                {totalDown > 0 && (
                  <span className="bg-red-500/25 text-red-300 rounded-full px-1.5 py-0.5 text-[10px] font-black">
                    {totalDown}
                  </span>
                )}
              </button>
            )}
            */}
          </div>

          {loading || statusLoading || (tableView === "pdb" && pdbLoading) || (tableView === "ups" && upsLoading) || (tableView === "sadown" && sysDownLoading) ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <svg
                  className="w-10 h-10 animate-spin text-cyan-400 mx-auto mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <p className="text-slate-400 text-sm">Loading BTS data...</p>
              </div>
            </div>
          ) : tableView === "sadown" ? (
            /* SA Down Table (/api/sa-status) — click a row for its events */
            <div
              className="overflow-auto flex-1"
              style={{ maxHeight: "calc(100vh - 150px)" }}
            >
              {sysDownIsSingle && (
                <div className="flex items-center justify-between px-5 pt-4 pb-1">
                  <span className="text-xs text-slate-500">Showing 1 result from History lookup</span>
                  <button
                    onClick={handleSystemDownCardClick}
                    className="text-xs font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    ← Show all SA
                  </button>
                </div>
              )}
              <table className="w-full text-sm" style={{ minWidth: "760px" }}>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">#</th>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">SA Name</th>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">Bras</th>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">UPS</th>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">Transmission Down</th>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">Power Down</th>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">RCA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {saStatusFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-slate-500">
                        {search ? "No SA found matching your search" : "No SA data available"}
                      </td>
                    </tr>
                  ) : (
                    saStatusFiltered.map((r, i) => {
                      const saName = saStatusPick(r, "sa_name");
                      const rasStatus = saStatusPick(r, "router_status");
                      const upsStatus = saStatusPick(r, "system_status");
                      const transInfo = saStatusDownInfo(
                        saStatusPick(r, "transmission_down", "transmission_down_time", "transmission_downtime")
                      );
                      const powerInfo = saStatusDownInfo(
                        saStatusPick(r, "power_down", "power_down_time", "power_downtime")
                      );
                      const transDown = transInfo.isDown;
                      const powerDown = powerInfo.isDown;
                      const rca = saStatusPick(r, "rca");
                      const code = saStatusPick(r, "sa_code", "code", "bts_code") || saName;
                      const alert = transDown || powerDown;
                      return (
                        <tr
                          key={code || i}
                          onClick={() => code && setHistorySa(code)}
                          className={`cursor-pointer transition-colors hover:bg-slate-800/30 border-l-2 ${
                            alert ? "bg-red-500/5 border-l-red-500" : "border-l-emerald-500/10"
                          }`}
                        >
                          <td className="px-5 py-3.5 text-slate-500 font-mono text-xs">{i + 1}</td>
                          <td className="px-5 py-3.5">
                            <span className="text-white font-medium text-sm leading-tight">{saName || "—"}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            {rasStatus ? <SaStatusBadge status={rasStatus} /> : <span className="text-slate-600 text-xs">—</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            {upsStatus ? <SaStatusBadge status={upsStatus} /> : <span className="text-slate-600 text-xs">—</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`font-mono text-xs font-semibold ${transDown ? "text-red-400" : "text-emerald-400/80"}`}>
                              {formatSeconds(transInfo.seconds)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`font-mono text-xs font-semibold ${powerDown ? "text-red-400" : "text-emerald-400/80"}`}>
                              {formatSeconds(powerInfo.seconds)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-slate-300 text-xs">{rca || "—"}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : tableView === "ups" ? (
            /* UPS Monitoring Table — same as PDB, but only # / SA Name / Status /
               Down Time / Up Time / Down 24h / Up 24h / UPS */
            <div className="flex-1">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: "4%" }} />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "10%" }} />
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom">#</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">SA Name</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">Status</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">Down Time</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">Up Time</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">Down 24h</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">Up 24h</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">UPS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {upsFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-16 text-slate-500">
                        {search ? "No UPS found matching your search" : "No UPS data available"}
                      </td>
                    </tr>
                  ) : (
                    upsFiltered.map((d, i) => {
                      const downKey = pdbTimeKey(d, "down", false);
                      const upKey = pdbTimeKey(d, "up", false);
                      const down24Key = pdbTimeKey(d, "down", true);
                      const up24Key = pdbTimeKey(d, "up", true);
                      const isDown = pdbIsDown(d);
                      const isUp = pdbIsUp(d);
                      const noSignal = pdbHasNoSignal(d);
                      const lastSeenVal = pdbPick(d, "last_seen_at", "last_seen", "lastseen");
                      const upsVal = pdbPick(d, "ups", "ups1", "ups_voltage");
                      return (
                        <tr
                          key={d.sa_code || i}
                          onClick={() => d.sa_code && setHistoryUpsSa(d.sa_code)}
                          className={`cursor-pointer transition-colors border-l-2 ${
                            noSignal
                              ? "bg-red-500/10 hover:bg-red-500/15 border-l-red-500"
                              : "hover:bg-slate-800/30 border-l-blue-500/20"
                          }`}
                        >
                          <td className="px-1.5 py-3 text-slate-500 font-mono text-xs">
                            <span className="flex items-center gap-1.5">
                              {noSignal && <NoSignalIcon lastSeen={lastSeenVal} />}
                              {i + 1}
                            </span>
                          </td>
                          <td
                            className="px-1.5 py-3 text-white font-medium text-sm leading-tight break-words"
                            title={d.sa_name || ""}
                          >
                            {d.sa_name || "—"}
                          </td>
                          <td className="px-1.5 py-3">
                            <SaStatusBadge status={pdbRawStatus(d) ?? "—"} />
                          </td>
                          <td className={`px-1.5 py-3 font-mono text-xs ${isDown ? "text-red-400" : "text-slate-400"}`}>
                            {formatSeconds(downKey ? d[downKey] : null)}
                          </td>
                          <td className={`px-1.5 py-3 font-mono text-xs ${isUp ? "text-emerald-400" : "text-slate-400"}`}>
                            {formatSeconds(upKey ? d[upKey] : null)}
                          </td>
                          <td className="px-1.5 py-3 font-mono text-xs text-orange-400/80">
                            {formatSeconds(down24Key ? d[down24Key] : null)}
                          </td>
                          <td className="px-1.5 py-3 font-mono text-xs text-teal-400/80">
                            {formatSeconds(up24Key ? d[up24Key] : null)}
                          </td>
                          <td className="px-1.5 py-3 font-mono text-xs text-blue-400 font-semibold">
                            {upsVal === null ? "—" : `${pdbNum(upsVal)}V`}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : tableView === "pdb" ? (
            /* PDB Monitoring Table — no inner scrollbar, fixed column set */
            <div className="flex-1">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: "3%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "9%" }} />
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom">#</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">SA Name</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">Status</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">Down Time</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">Up Time</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">Down 24h</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">Up 24h</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">PDB</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">UPS</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">Load</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">Charging Watt</th>
                    <th className="text-left px-1.5 py-2.5 font-semibold align-bottom leading-tight break-words">Battery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {pdbFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-16 text-slate-500">
                        {search ? "No PDB found matching your search" : "No PDB data available"}
                      </td>
                    </tr>
                  ) : (
                    pdbFiltered.map((d, i) => {
                      const downKey = pdbTimeKey(d, "down", false);
                      const upKey = pdbTimeKey(d, "up", false);
                      const down24Key = pdbTimeKey(d, "down", true);
                      const up24Key = pdbTimeKey(d, "up", true);
                      const isDown = pdbIsDown(d);
                      const isUp = pdbIsUp(d);
                      const noSignal = pdbHasNoSignal(d);
                      const lastSeenVal = pdbPick(d, "last_seen_at", "last_seen", "lastseen");
                      const pdbVal = pdbPick(d, "pdb", "pdb_voltage", "pdbvoltage");
                      const upsVal = pdbPick(d, "ups", "ups1", "ups_voltage");
                      const loadVal = pdbPick(d, "load", "load_current", "load_amp");
                      const wattVal = pdbPick(d, "charging_watt", "charge_watt", "charging_power", "watt");
                      const socVal = pdbPick(d, "battery_soc", "batt_soc", "soc");
                      const capVal = pdbPick(d, "battery_current_capacity", "batt_current_capacity", "current_capacity", "capacity");
                      return (
                        <tr
                          key={d.sa_code || i}
                          onClick={() => d.sa_code && setHistoryPdbSa(d.sa_code)}
                          className={`cursor-pointer transition-colors border-l-2 ${
                            noSignal
                              ? "bg-red-500/10 hover:bg-red-500/15 border-l-red-500"
                              : "hover:bg-slate-800/30 border-l-amber-500/20"
                          }`}
                        >
                          <td className="px-1.5 py-3 text-slate-500 font-mono text-xs">
                            <span className="flex items-center gap-1.5">
                              {noSignal && <NoSignalIcon lastSeen={lastSeenVal} />}
                              {i + 1}
                            </span>
                          </td>
                          <td
                            className="px-1.5 py-3 text-white font-medium text-sm leading-tight break-words"
                            title={d.sa_name || ""}
                          >
                            {d.sa_name || "—"}
                          </td>
                          <td className="px-1.5 py-3">
                            <SaStatusBadge status={pdbRawStatus(d) ?? "—"} />
                          </td>
                          <td className={`px-1.5 py-3 font-mono text-xs ${isDown ? "text-red-400" : "text-slate-400"}`}>
                            {formatSeconds(downKey ? d[downKey] : null)}
                          </td>
                          <td className={`px-1.5 py-3 font-mono text-xs ${isUp ? "text-emerald-400" : "text-slate-400"}`}>
                            {formatSeconds(upKey ? d[upKey] : null)}
                          </td>
                          <td className="px-1.5 py-3 font-mono text-xs text-orange-400/80">
                            {formatSeconds(down24Key ? d[down24Key] : null)}
                          </td>
                          <td className="px-1.5 py-3 font-mono text-xs text-teal-400/80">
                            {formatSeconds(up24Key ? d[up24Key] : null)}
                          </td>
                          <td className="px-1.5 py-3 font-mono text-xs text-cyan-400 font-semibold">
                            {pdbVal === null ? "—" : `${pdbNum(pdbVal)}V`}
                          </td>
                          <td className="px-1.5 py-3 font-mono text-xs text-blue-400 font-semibold">
                            {upsVal === null ? "—" : `${pdbNum(upsVal)}V`}
                          </td>
                          <td className="px-1.5 py-3 font-mono text-xs text-violet-400 font-semibold">
                            {loadVal === null ? "—" : `${pdbNum(loadVal, 2)}W`}
                          </td>
                          <td className="px-1.5 py-3 font-mono text-xs text-amber-400 font-semibold">
                            {wattVal === null ? "—" : `${pdbNum(wattVal, 2)}W`}
                          </td>
                          <td className="px-1.5 py-3">
                            <BatteryGauge soc={socVal} capacity={capVal} hideBackup compact />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* Scroll container — overflow:auto here enables sticky thead */
            <div
              className="overflow-auto flex-1"
              style={{ maxHeight: "calc(100vh - 150px)" }}
            >
              <table className="w-full text-sm" style={{ minWidth: "900px" }}>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">
                      #
                    </th>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">
                      BRAS Name
                    </th>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">
                      IP Address
                    </th>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">
                      Status
                    </th>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">
                      Down Time
                    </th>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">
                      Up Time
                    </th>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">
                      Down 24h
                    </th>
                    <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">
                      Up 24h
                    </th>
                    {/* <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">
                      Backup
                    </th> */}
                    {/* <th className="text-left px-5 py-3 font-semibold whitespace-nowrap">
                      Battery
                    </th> */}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="text-center py-16 text-slate-500"
                      >
                        {search
                          ? "No BTS found matching your search"
                          : "No routers available"}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r, i) => {
                      const isDown = r.status === "Down";
                      return (
                        <tr
                          key={r.ip_address}
                          onClick={() => setHistoryRouter(r)}
                          className={`cursor-pointer transition-colors hover:bg-slate-800/30 ${isDown ? "border-l-2 border-l-red-500/30" : "border-l-2 border-l-emerald-500/10"}`}
                        >
                          <td className="px-5 py-3.5 text-slate-500 font-mono text-xs">
                            {i + 1}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-white font-medium text-sm leading-tight">
                              {r.bts_name}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-mono text-cyan-400/80 text-xs bg-slate-800/60 px-2 py-1 rounded-lg">
                              {r.ip_address}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusBadge status={r.status} />
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`font-mono text-xs ${isDown ? "text-red-400" : "text-slate-400"}`}
                            >
                              {formatSeconds(r.down_time)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`font-mono text-xs ${!isDown ? "text-emerald-400" : "text-slate-400"}`}
                            >
                              {formatSeconds(r.up_time)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-mono text-xs text-orange-400/80">
                              {formatSeconds(r.down_time_last_24h)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-mono text-xs text-teal-400/80">
                              {formatSeconds(r.up_time_last_24h)}
                            </span>
                          </td>
                          {/* <td className="px-5 py-3.5">
                            <span className="font-mono text-xs text-cyan-400/80">
                              {formatBackupHours(getBackupTime(r))}
                            </span>
                          </td> */}
                          {/* <td className="px-5 py-3.5">
                            <BatteryGauge
                              soc={r.battery_soc}
                              capacity={r.battery_current_capacity}
                              backupHour={r.backup_hour}
                            />
                          </td> */}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {historyRouter && (
        <HistoryModal
          router={historyRouter}
          onClose={() => setHistoryRouter(null)}
        />
      )}

      {promptOpen && (
        <SaCodePromptModal
          onClose={() => setPromptOpen(false)}
          onSubmit={handleSaStatusHistorySubmit}
        />
      )}

      {historySa && (
        <SaStatusEventsModal saCode={historySa} onClose={() => setHistorySa(null)} />
      )}

      {historyPdbSa && (
        <PdbEventsModal saCode={historyPdbSa} onClose={() => setHistoryPdbSa(null)} />
      )}

      {historyUpsSa && (
        <UpsEventsModal saCode={historyUpsSa} onClose={() => setHistoryUpsSa(null)} />
      )}

      {showDownSnapshot && (
        <DownBtsPage onClose={() => setShowDownSnapshot(false)} />
      )}
    </div>
  );
}