import React, { useState, useEffect, useCallback, useRef, useId } from "react";
import { api } from "../utils/api";
import { formatDateTimeBD } from "../utils/formatters";

const REFRESH_MS = 10000;

// ── Link3-SA palette ────────────────────────────────────────────────────────
const C = {
  green: "#4ecdc4",
  blue: "#3867d6",
  orange: "#ff9800",
  yellow: "#fe9b13",
  red: "#ff5252",
  redText: "#fc5c65",
  muted: "#b0d0e8",
  dim: "#8d8d8d",
  panel: "#0f1c2d",
  border: "rgba(78, 205, 196, 0.12)",
  grid: "rgba(255, 255, 255, 0.06)",
};
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Open Sans', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

const CARD_STYLE = {
  background: "linear-gradient(145deg, #1a2a3d, #152232)",
  border: `1px solid ${C.border}`,
  borderRadius: 16,
};
const TILE_STYLE = {
  background: "linear-gradient(145deg, #1a2a3d, #152232)",
  border: `1px solid ${C.border}`,
  borderRadius: 14,
};

// load Open Sans once (JetBrains Mono is already loaded by App.jsx)
if (typeof document !== "undefined" && !document.getElementById("sa-open-sans")) {
  const l = document.createElement("link");
  l.id = "sa-open-sans";
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap";
  document.head.appendChild(l);
}

// Gauge zones — same ranges/colours as Link3-SA (PDB, UPS, Battery, Internal Battery)
const GAUGE_RANGES = {
  pdb: {
    max: 300,
    bands: [
      { from: 0, to: 160, color: "red" },
      { from: 160.01, to: 190, color: "yellow" },
      { from: 190.01, to: 250, color: "green" },
      { from: 250.01, to: 300, color: "red" },
    ],
  },
  ups1: {
    max: 300,
    bands: [
      { from: 0, to: 160, color: "red" },
      { from: 160.01, to: 190, color: "yellow" },
      { from: 190.01, to: 250, color: "green" },
      { from: 250.01, to: 300, color: "red" },
    ],
  },
  batt_volt: {
    max: 20,
    bands: [
      { from: 0, to: 11, color: "red" },
      { from: 11.1, to: 12, color: "yellow" },
      { from: 12.1, to: 20, color: "green" },
    ],
  },
  batt_curr: {
    max: 100,
    bands: [
      { from: 0, to: 60, color: "green" },
      { from: 60, to: 80, color: "yellow" },
      { from: 80, to: 100, color: "red" },
    ],
  },
  solar_volt: {
    max: 300,
    bands: [
      // { from: 0, to: 20, color: "yellow" },
      { from: 0, to: 300, color: "green" },
      // { from: 80, to: 100, color: "red" },
    ],
  },
  solar_curr: {
    max: 100,
    bands: [
      { from: 0, to: 100, color: "green" },
      // { from: 30, to: 40, color: "yellow" },
      // { from: 40, to: 50, color: "red" },
    ],
  },
  internal_batt: {
    max: 4.3,
    bands: [
      { from: 0, to: 3.4, color: "red" },
      { from: 3.5, to: 3.7, color: "yellow" },
      { from: 3.7, to: 4.3, color: "green" },
    ],
  },
};

const STATUS_OK_VALUE = 1;

const DECIMAL_PLACES = 2;
const GAUGES = [
  { range: "pdb", label: "PDB Voltage", icon: "bolt", unit: "V", decimal: false, names: ["pdb"] },
  { range: "ups1", label: "UPS Voltage", icon: "plug", unit: "V", decimal: false, names: ["ups1"] },
  { range: "batt_volt", label: "Battery Voltage", icon: "battery", unit: "V", decimal: true, names: ["batt_volt_1", "batt_volt", "battery voltage"] },
  { range: "batt_curr", label: "Battery Current", icon: "bolt", unit: "A", decimal: true, names: ["batt_curr_1", "batt_curr", "battery current"] },
  { range: "solar_volt", label: "Solar Voltage", icon: "sun", unit: "V", decimal: false, names: ["solar_volt", "solar voltage"] },
  { range: "solar_curr", label: "Solar Current", icon: "sun", unit: "A", decimal: true, names: ["solar_curr", "solar current"] },
  { range: "internal_batt", label: "Internal Battery", icon: "battery", unit: "V", decimal: true, names: ["internal_batt", "Internal Battery"] },
];

const ZONE_HEX = { green: C.green, yellow: C.yellow, red: C.red };

const ICONS = {
  operator:
    "M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0",
  signal: "M3 21h4V9H3v12zm7 0h4V3h-4v18zm7 0h4v-9h-4v9z",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  counter: "M7 20l4-16m2 16l4-16M6 9h14M4 15h14",
  bolt: "M13 10V3L4 14h7v7l9-11h-7z",
  plug: "M9 3v4m6-4v4M7 7h10v4a5 5 0 01-10 0V7zm5 9v5",
  battery: "M3 9h15a1 1 0 011 1v4a1 1 0 01-1 1H3a1 1 0 01-1-1v-4a1 1 0 011-1zm18 2v2",
  sun: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
  server:
    "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01",
  chart: "M3 3v18h18M7 14l4-4 4 4 5-6",
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

function Icon({ name, size = 16, color }) {
  return (
    <svg width={size} height={size} fill="none" stroke={color || "currentColor"} viewBox="0 0 24 24" className="shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONS[name]} />
    </svg>
  );
}

function CardTitle({ icon, children }) {
  return (
    <div className="flex items-center gap-2 mb-3.5" style={{ fontSize: "1rem", fontWeight: 600, color: "#fff" }}>
      <span style={{ color: C.green, display: "inline-flex" }}>
        <Icon name={icon} />
      </span>
      {children}
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

// Read a field from the API data, ignoring case / spaces / underscores
function pick(data, ...names) {
  if (!data) return null;
  const map = {};
  Object.keys(data).forEach((k) => {
    map[norm(k)] = data[k];
  });
  for (const n of names) {
    const v = map[norm(n)];
    if (v !== undefined) return v;
  }
  return null;
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// decimal -> 12.50 | whole number -> 140
function fmtValue(v, decimal) {
  const n = toNum(v);
  if (n === null) return "N/A";
  return decimal ? n.toFixed(DECIMAL_PLACES) : String(Math.round(n));
}

// zone colour for a value; values in the small gaps between zones fall into the next zone up
function zoneColorFor(value, range) {
  const band = range.bands.find((b) => value <= b.to);
  return ZONE_HEX[(band || range.bands[range.bands.length - 1]).color];
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      timeZone: "Asia/Dhaka",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

function fmtDay(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      timeZone: "Asia/Dhaka",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return "";
  }
}

function fmtClockSec(d) {
  try {
    return d.toLocaleTimeString("en-GB", {
      timeZone: "Asia/Dhaka",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

// ── Gauge (ring — Link3-SA look: thin rounded arc, faint track, zone colour) ─
function Gauge({ label, icon, unit, value, range, decimal }) {
  const size = 130;
  const cx = size / 2;
  const r = 52;
  const c = 2 * Math.PI * r;
  const max = range.max > 0 ? range.max : 1;

  const n = toNum(value);
  const hasValue = n !== null;
  const color = hasValue ? zoneColorFor(n, range) : C.green;
  const frac = hasValue ? Math.min(Math.max(n / max, 0), 1) : 0;

  return (
    <div className="flex flex-col items-center min-w-0" style={{ ...CARD_STYLE, padding: 12 }}>
      <div
        className="flex items-center gap-1.5 w-full justify-center whitespace-nowrap"
        style={{ fontSize: "0.82rem", fontWeight: 600, color: "#fff", marginBottom: 6 }}
      >
        <span style={{ color: C.green, display: "inline-flex" }}>
          <Icon name={icon} size={14} />
        </span>
        <span className="truncate">{label}</span>
      </div>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[150px] h-auto">
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={C.grid} strokeWidth="8" />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${frac * c} ${c}`}
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.3s ease" }}
        />
        <text x={cx} y={cx + 6} textAnchor="middle" fill="#fff" fontSize="17" fontWeight="700" fontFamily={MONO}>
          {hasValue ? `${fmtValue(value, decimal)}${unit}` : "--"}
        </text>
      </svg>
      <div style={{ fontFamily: MONO, fontSize: "0.7rem", color: C.muted, opacity: 0.75, marginTop: -2 }}>
        0 – {max}
        {unit}
      </div>
    </div>
  );
}

// ── Line chart: Temperature + Humidity in ONE chart, ALL points ─────────────
// Fixed height; the width follows the card so every reading gets a slot.
const CHART_HEIGHT = 290; // <- chart height in px (make smaller / bigger here)

function buildSegments(pts) {
  const segs = [];
  let cur = [];
  pts.forEach((p) => {
    if (p) cur.push(p);
    else if (cur.length) {
      segs.push(cur);
      cur = [];
    }
  });
  if (cur.length) segs.push(cur);
  return segs;
}

function linePath(seg) {
  if (seg.length === 1) return `M${seg[0].x},${seg[0].y}`;
  let d = `M${seg[0].x},${seg[0].y}`;
  for (let i = 1; i < seg.length; i += 1) {
    const p0 = seg[i - 1];
    const p1 = seg[i];
    const mx = (p0.x + p1.x) / 2;
    d += ` C${mx},${p0.y} ${mx},${p1.y} ${p1.x},${p1.y}`;
  }
  return d;
}

function EnvLineChart({ labels, series }) {
  const H = CHART_HEIGHT;
  const padL = 40;
  const padR = 16;
  const padT = 20;
  const padB = 46;
  const [hover, setHover] = useState(null);
  const [W, setW] = useState(600);
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const uid = useId().replace(/:/g, "");

  // keep the SVG 1:1 with the card width, so text and lines never get scaled
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setW(w);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // every reading in the response gets a point, even if the arrays differ in length
  const n = Math.max(labels.length, ...series.map((s) => s.values.length));
  const nums = series.flatMap((s) => s.values).filter((v) => v !== null && v !== undefined);
  const rawMax = nums.length ? Math.max(...nums) : 10;
  const yMax = Math.max(10, Math.ceil((rawMax * 1.15) / 10) * 10);

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const edge = 10; // small gap between the y-axis / right edge and first / last point
  const step = n > 1 ? (innerW - edge * 2) / (n - 1) : 0;
  const xAt = (i) => (n > 1 ? padL + edge + i * step : padL + innerW / 2);
  const yAt = (v) => padT + (1 - v / yMax) * innerH;
  const yBase = padT + innerH;

  const slot = n > 1 ? step : innerW;
  const showDots = slot >= 14;
  const rotate = slot < 40;
  const labelStep = rotate ? Math.max(1, Math.ceil(14 / slot)) : Math.max(1, Math.ceil(44 / slot));

  const yTicks = Array.from({ length: 5 }, (_, i) => (yMax * i) / 4);

  // latest reading of each series (shown in the legend)
  const latest = (s) => {
    for (let i = s.values.length - 1; i >= 0; i -= 1) if (s.values[i] !== null && s.values[i] !== undefined) return s.values[i];
    return null;
  };

  function onMove(e) {
    if (!svgRef.current || n === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xv = e.clientX - rect.left;
    const idx = n > 1 ? Math.round((xv - padL - edge) / step) : 0;
    setHover(idx >= 0 && idx < n ? idx : null);
  }

  return (
    <div className="h-full" style={{ ...CARD_STYLE, padding: 16 }}>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-2">
        <div>
          <CardTitle icon="chart">Temperature &amp; Humidity</CardTitle>
          <div style={{ fontSize: "0.72rem", color: C.dim, marginTop: -8 }}>Last {n} readings</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {series.map((s) => (
            <div
              key={s.name}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5"
              style={{ background: "rgba(56, 103, 214, 0.12)", border: "1px solid rgba(56, 103, 214, 0.28)" }}
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              <span style={{ color: C.muted, fontSize: "0.72rem" }}>{s.name}</span>
              <span style={{ color: "#fff", fontSize: "0.82rem", fontWeight: 700, fontFamily: MONO }}>
                {fmtValue(latest(s), s.decimal)}
                <span style={{ color: C.dim, fontSize: "0.7rem", fontWeight: 400, marginLeft: 2 }}>
                  {latest(s) === null ? "" : s.unit}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className="w-full">
        {n === 0 ? (
          <div className="flex items-center justify-center text-sm" style={{ height: H, color: C.muted }}>
            No chart data
          </div>
        ) : (
          <svg
            ref={svgRef}
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="block"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              {series.map((s, i) => (
                <linearGradient key={i} id={`${uid}-a${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.32" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
                </linearGradient>
              ))}
            </defs>

            {/* grid + y labels */}
            {yTicks.map((t, i) => (
              <g key={i}>
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={yAt(t)}
                  y2={yAt(t)}
                  stroke={C.grid}
                  strokeWidth="1"
                  strokeDasharray={i === 0 ? "0" : "3 4"}
                />
                <text x={padL - 8} y={yAt(t) + 4} textAnchor="end" fill={C.muted} fontSize="11">
                  {Math.round(t)}
                </text>
              </g>
            ))}

            {/* x labels: time (+ date) */}
            {Array.from({ length: n }, (_, i) => {
              const l = labels[i];
              if (!l || i % labelStep !== 0) return null;
              const x = xAt(i);
              return rotate ? (
                <text key={i} transform={`translate(${x},${yBase + 14}) rotate(-50)`} textAnchor="end" fill={C.muted} fontSize="10">
                  {fmtTime(l)}
                </text>
              ) : (
                <g key={i}>
                  <text x={x} y={yBase + 17} textAnchor="middle" fill={C.muted} fontSize="11">
                    {fmtTime(l)}
                  </text>
                  <text x={x} y={yBase + 31} textAnchor="middle" fill={C.dim} fontSize="10">
                    {fmtDay(l)}
                  </text>
                </g>
              );
            })}

            {/* area + line for each series */}
            {series.map((s, si) => {
              const pts = Array.from({ length: n }, (_, i) => {
                const v = s.values[i];
                return v === null || v === undefined ? null : { x: xAt(i), y: yAt(v), v };
              });
              const segs = buildSegments(pts);
              return (
                <g key={s.name}>
                  {segs.map((seg, k) =>
                    seg.length > 1 ? (
                      <path
                        key={`a${k}`}
                        d={`${linePath(seg)} L${seg[seg.length - 1].x},${yBase} L${seg[0].x},${yBase} Z`}
                        fill={`url(#${uid}-a${si})`}
                      />
                    ) : null
                  )}
                  {segs.map((seg, k) => (
                    <path
                      key={`l${k}`}
                      d={linePath(seg)}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {showDots &&
                    pts.map((p, i) =>
                      p ? <circle key={i} cx={p.x} cy={p.y} r="3" fill="#152232" stroke={s.color} strokeWidth="2" /> : null
                    )}
                </g>
              );
            })}

            {/* hover crosshair + highlighted points */}
            {hover !== null && (
              <g>
                <line x1={xAt(hover)} x2={xAt(hover)} y1={padT} y2={yBase} stroke={C.green} strokeOpacity="0.35" strokeDasharray="3 3" />
                {series.map((s) => {
                  const v = s.values[hover];
                  if (v === null || v === undefined) return null;
                  return <circle key={s.name} cx={xAt(hover)} cy={yAt(v)} r="5" fill={s.color} stroke="#fff" strokeWidth="1.5" />;
                })}
              </g>
            )}

            {/* tooltip */}
            {hover !== null &&
              (() => {
                const boxW = 168;
                const boxH = 28 + series.length * 18;
                const x0 = xAt(hover);
                const bx = x0 > W / 2 ? x0 - boxW - 12 : x0 + 12;
                return (
                  <g>
                    <rect x={bx} y={padT} width={boxW} height={boxH} rx="8" fill={C.panel} stroke="rgba(78, 205, 196, 0.3)" />
                    <text x={bx + 10} y={padT + 18} fill={C.muted} fontSize="11">
                      {labels[hover] ? formatDateTimeBD(labels[hover]) : `Reading ${hover + 1}`}
                    </text>
                    {series.map((s, i) => (
                      <text key={s.name} x={bx + 10} y={padT + 38 + i * 18} fill={s.color} fontSize="12" fontWeight="600">
                        {s.name}: {s.values[hover] === null || s.values[hover] === undefined ? "N/A" : `${fmtValue(s.values[hover], s.decimal)} ${s.unit}`}
                      </text>
                    ))}
                  </g>
                );
              })()}
          </svg>
        )}
      </div>
    </div>
  );
}

// ── Device information tiles (icon badge + label + big value, tone by state) ─
const TONES = {
  ok: { c: C.green, bg: "rgba(78, 205, 196, 0.14)", bd: "rgba(78, 205, 196, 0.32)" },
  fail: { c: C.redText, bg: "rgba(252, 92, 101, 0.16)", bd: "rgba(252, 92, 101, 0.4)" },
  warn: { c: C.yellow, bg: "rgba(254, 155, 19, 0.15)", bd: "rgba(254, 155, 19, 0.38)" },
  info: { c: "#8fb2ff", bg: "rgba(56, 103, 214, 0.18)", bd: "rgba(56, 103, 214, 0.4)" },
  na: { c: C.dim, bg: "rgba(141, 141, 141, 0.12)", bd: "rgba(141, 141, 141, 0.25)" },
};

function InfoTile({ icon, label, tone = "info", children }) {
  const t = TONES[tone];
  const failed = tone === "fail";
  return (
    <div
      className="relative overflow-hidden flex items-center gap-2.5 min-w-0"
      style={{
        ...TILE_STYLE,
        padding: "8px 12px 8px 14px",
        borderColor: failed ? "rgba(252, 92, 101, 0.45)" : C.border,
        background: failed
          ? "linear-gradient(145deg, rgba(252, 92, 101, 0.14), #152232)"
          : TILE_STYLE.background,
      }}
    >
      {/* left accent bar */}
      <span
        className="absolute left-0 top-0 bottom-0"
        style={{ width: 3, background: t.c, opacity: tone === "na" ? 0.4 : 0.9 }}
      />
      {/* icon badge */}
      <span
        className="shrink-0 flex items-center justify-center"
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: t.bg,
          border: `1px solid ${t.bd}`,
          color: t.c,
        }}
      >
        <Icon name={icon} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="truncate"
          style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: C.dim }}
        >
          {label}
        </div>
        <div className="mt-0.5 min-w-0">{children}</div>
      </div>
    </div>
  );
}

const VALUE_STYLE = { fontFamily: MONO, fontSize: "0.92rem", fontWeight: 700, color: "#fff", lineHeight: 1.2 };

function StatusValue({ value }) {
  const v = toNum(value);
  if (v === null) return <span style={{ ...VALUE_STYLE, color: C.dim }}>N/A</span>;
  const ok = v === STATUS_OK_VALUE;
  const col = ok ? C.green : C.redText;
  return (
    <span className="inline-flex items-center gap-2" style={{ ...VALUE_STYLE, color: col }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: col,
          boxShadow: `0 0 8px ${col}`,
          animation: ok ? "saPulse 1.6s infinite" : "none",
        }}
      />
      {ok ? "OK" : "Failed"}
    </span>
  );
}

const statusTone = (v) => {
  const n = toNum(v);
  if (n === null) return "na";
  return n === STATUS_OK_VALUE ? "ok" : "fail";
};

// Signal colour bands (same as Link3-SA): 0–40 red, 41–60 yellow, above 60 green
function signalTone(p) {
  if (p <= 40) return "fail";
  if (p <= 60) return "warn";
  return "ok";
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function DeviceDashboardPage({ router, onClose }) {
  const btsCode = router?.bts_code || "";
  const [data, setData] = useState(null);
  const [charts, setCharts] = useState(null);
  const [loading, setLoading] = useState(!!btsCode);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);

  const fetchData = useCallback(async () => {
    if (!btsCode) return;
    try {
      const res = await api.getLatestData(btsCode);
      if (res && res.success === false) throw new Error(res.message || "No data");
      if (!res || !res.data) throw new Error("No data found for this BTS code");
      setData(res.data);
      setCharts(res.charts || null);
      setUpdatedAt(new Date());
      setError("");
      setCountdown(REFRESH_MS / 1000);
    } catch (e) {
      setError(e.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [btsCode]);

  // This page has its own scrollbar, so lock the page behind it (no double scrollbar)
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  useEffect(() => {
    if (!btsCode) return undefined;
    fetchData();
    const t = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(t);
  }, [btsCode, fetchData]);

  useEffect(() => {
    const t = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : REFRESH_MS / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // chart data — temperature + humidity together, every point
  const tempLabels = charts?.temperature?.labels || [];
  const humLabels = charts?.humidity?.labels || [];
  const chartLabels = tempLabels.length >= humLabels.length ? tempLabels : humLabels;
  const toSeries = (arr) => (arr || []).map(toNum);

  const psu1 = pick(data, "psu1");
  const psu2 = pick(data, "psu2");
  const server1 = pick(data, "server1");
  const server2 = pick(data, "server2");
  const signal = toNum(pick(data, "signal_strength"));
  const signalPct = signal === null ? null : Math.min(Math.max(Math.round(signal), 0), 100);
  const sigTone = signalPct === null ? "na" : signalTone(signalPct);
  const isLive = !error && !!data;

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto text-white"
      style={{
        fontFamily: SANS,
        background: "radial-gradient(circle at 15% 0%, #142338 0%, #0a141f 55%, #070d16 100%)",
      }}
    >
      <style>{`
        @keyframes saPing { 0% { transform: scale(0.4); opacity: 0.8; } 100% { transform: scale(1.25); opacity: 0; } }
        @keyframes saPulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(1.4); } 100% { opacity: 1; transform: scale(1); } }
      `}</style>

      {/* Top Nav */}
      <nav
        className="sticky top-0 z-40"
        style={{
          background: "rgba(15, 28, 45, 0.6)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onClose}
              className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center transition-all"
              style={{ ...CARD_STYLE, borderRadius: 10, color: "#fff" }}
              title="Back"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0">
              <div className="truncate" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                {router?.bts_name ? router.bts_name : "Dashboard"}
              </div>
              {btsCode && (
                <div style={{ fontFamily: MONO, fontSize: "0.72rem", color: C.muted }}>{btsCode}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {btsCode && (
              <span
                className="flex items-center gap-1.5"
                style={{ fontSize: "0.72rem", color: isLive ? C.green : C.redText }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "currentColor",
                    animation: isLive ? "saPulse 1.6s infinite" : "none",
                  }}
                />
                {/* {isLive ? "Live" : loading ? "Connecting…" : "Disconnected"} */}
              </span>
            )}
            {updatedAt && (
              <span className="hidden sm:inline" style={{ fontFamily: MONO, fontSize: "0.75rem", color: C.muted }}>
                Refresh in {countdown}s
              </span>
            )}
            <button
              onClick={fetchData}
              className="w-9 h-9 flex items-center justify-center transition-all"
              style={{ ...CARD_STYLE, borderRadius: 10, color: C.green }}
              title="Refresh now"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {error && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{ background: "rgba(252, 92, 101, 0.12)", border: "1px solid rgba(252, 92, 101, 0.35)", color: C.redText }}
          >
            {error}
          </div>
        )}

        {!btsCode ? (
          <div className="text-center py-24" style={{ color: C.dim }}>
            This SA has no PDB Monitoring Device!
          </div>
        ) : loading && !data ? (
          <div className="flex flex-col items-center justify-center gap-4 h-72">
            <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
              {[40, 66, 92].map((s, i) => (
                <span
                  key={s}
                  className="absolute rounded-full"
                  style={{
                    width: s,
                    height: s,
                    border: `2px solid ${C.green}`,
                    opacity: 0,
                    animation: `saPing 2.2s ease-out ${i * 0.55}s infinite`,
                  }}
                />
              ))}
              <svg width="34" height="34" fill="none" stroke={C.green} viewBox="0 0 24 24" style={{ zIndex: 2 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONS.operator} />
              </svg>
            </div>
            <p style={{ fontSize: "0.9rem", color: C.muted }}>
              Waiting for live data from <strong style={{ color: "#fff", fontFamily: MONO }}>{btsCode}</strong>…
            </p>
          </div>
        ) : data ? (
          <>
            {/* Gauges */}
            <section className="overflow-x-auto pb-1">
              <div className="grid grid-cols-7 gap-3.5" style={{ minWidth: "980px" }}>
                {GAUGES.map((g) => (
                  <Gauge
                    key={g.range}
                    label={g.label}
                    icon={g.icon}
                    unit={g.unit}
                    decimal={g.decimal}
                    value={pick(data, ...g.names)}
                    range={GAUGE_RANGES[g.range]}
                  />
                ))}
              </div>
            </section>

            {/* Half row: Temperature + Humidity line chart | Half row: Device Information */}
            <section className="grid grid-cols-1 lg:grid-cols-2 items-stretch" style={{ gap: 18 }}>
              <div className="min-w-0">
                <EnvLineChart
                  labels={chartLabels}
                  series={[
                    { name: "Temperature", unit: "°C", decimal: true, color: C.orange, values: toSeries(charts?.temperature?.temp1) },
                    { name: "Humidity", unit: "%", decimal: false, color: C.blue, values: toSeries(charts?.humidity?.hum1) },
                  ]}
                />
              </div>

              <div className="min-w-0 flex flex-col" style={{ ...CARD_STYLE, padding: 16 }}>
                <CardTitle icon="info">Device Information</CardTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 flex-1 content-between">
                  <InfoTile icon="bolt" label="PSU 1" tone={statusTone(psu1)}>
                    <StatusValue value={psu1} />
                  </InfoTile>

                  <InfoTile icon="bolt" label="PSU 2" tone={statusTone(psu2)}>
                    <StatusValue value={psu2} />
                  </InfoTile>

                  <InfoTile icon="server" label="Server 1" tone={statusTone(server1)}>
                    <StatusValue value={server1} />
                  </InfoTile>

                  <InfoTile icon="server" label="Server 2" tone={statusTone(server2)}>
                    <StatusValue value={server2} />
                  </InfoTile>

                  <InfoTile icon="operator" label="Operator" tone="info">
                    <div className="truncate" style={VALUE_STYLE}>{pick(data, "operator") || "—"}</div>
                  </InfoTile>

                  <InfoTile icon="signal" label="Signal Strength" tone={sigTone}>
                    {signalPct === null ? (
                      <span style={{ ...VALUE_STYLE, color: C.dim }}>N/A</span>
                    ) : (
                      <>
                        <div style={{ ...VALUE_STYLE, color: TONES[sigTone].c }}>{signalPct}%</div>
                        <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: C.grid }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${signalPct}%`, background: TONES[sigTone].c }}
                          />
                        </div>
                      </>
                    )}
                  </InfoTile>

                  <InfoTile icon="calendar" label="Active Since" tone="info">
                    <div className="truncate" style={{ ...VALUE_STYLE, fontSize: "0.8rem" }}>{pick(data, "active") || "—"}</div>
                  </InfoTile>

                  <InfoTile icon="counter" label="Data Counter" tone="info">
                    <div className="truncate" style={VALUE_STYLE}>{fmtValue(pick(data, "data_counter"), false)}</div>
                  </InfoTile>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}