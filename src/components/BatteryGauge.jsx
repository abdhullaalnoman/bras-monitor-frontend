import React from "react";

// Fixed color for each of the 5 battery cells, by the % range that cell represents
const CELL_COLORS = [
  { seg: "bg-red-500", ring: "shadow-[0_0_6px_rgba(239,68,68,0.55)]" }, // 0-20
  { seg: "bg-red-500", ring: "shadow-[0_0_6px_rgba(239,68,68,0.55)]" }, // 20-40
  { seg: "bg-yellow-400", ring: "shadow-[0_0_6px_rgba(250,204,21,0.55)]" }, // 40-60
  { seg: "bg-yellow-400", ring: "shadow-[0_0_6px_rgba(250,204,21,0.55)]" }, // 60-80
  { seg: "bg-emerald-500", ring: "shadow-[0_0_6px_rgba(16,185,129,0.55)]" }, // 80-100
];

// Overall status color (for the % label + shell border), based on soc range
function batteryColor(pct) {
  if (pct <= 40)
    return {
      text: "text-red-400",
      border: "border-red-500/60",
      nub: "bg-red-500/60",
    };
  if (pct <= 80)
    return {
      text: "text-yellow-400",
      border: "border-yellow-400/60",
      nub: "bg-yellow-400/60",
    };
  return {
    text: "text-emerald-400",
    border: "border-emerald-500/60",
    nub: "bg-emerald-500/60",
  };
}

export default function BatteryGauge({ soc, capacity, backupHour, compact = false, hideBackup = false }) {
  const hasSoc =
    soc !== null && soc !== undefined && soc !== "" && !isNaN(Number(soc));
  const pct = hasSoc ? Math.max(0, Math.min(100, Number(soc))) : null;
  const filled =
    pct === null ? 0 : Math.max(pct > 0 ? 1 : 0, Math.ceil(pct / 20));
  const c = batteryColor(pct ?? 0);

  const hasCapacity =
    capacity !== null &&
    capacity !== undefined &&
    capacity !== "" &&
    !isNaN(Number(capacity));
  const capacityLabel = hasCapacity
    ? `${Number(capacity).toFixed(2)}Ah`
    : "No capacity data";
  const hasBackup =
    backupHour !== null &&
    backupHour !== undefined &&
    backupHour !== "" &&
    !isNaN(Number(backupHour));
  const backupLabel = hasBackup
    ? (() => {
        const value = Number(backupHour);
        const hours = Math.floor(value);
        const minutes = Math.round((value - hours) * 60);
        if (hours === 0 && minutes === 0) return "0min";
        if (hours === 0) return `${minutes}min`;
        if (minutes === 0) return `${hours}h`;
        return `${hours}h ${minutes}min`;
      })()
    : "No backup data";

  if (compact) {
    return (
      <div className="group relative flex items-center gap-1.5 w-fit">
        <div className="flex items-center shrink-0">
          <div
            className={`flex items-center gap-[2px] bg-slate-950/60 border rounded-[3px] px-1 py-[3px] transition-colors duration-300 ${
              pct === null ? "border-slate-600" : c.border
            }`}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={`w-[3px] h-2.5 rounded-[1px] transition-all duration-300 ${
                  pct === null
                    ? "bg-slate-700/70"
                    : i < filled
                      ? CELL_COLORS[i].seg
                      : "bg-slate-700/70"
                }`}
              />
            ))}
          </div>
          <div
            className={`w-[2px] h-1.5 rounded-r-sm transition-colors duration-300 ${pct === null ? "bg-slate-600" : c.nub}`}
          />
        </div>

        <span
          className={`text-[10px] font-black leading-none ${pct === null ? "text-slate-500" : c.text}`}
        >
          {pct === null ? "—" : `${pct.toFixed(2)}%`}
        </span>

        {/* Capacity tooltip — shown on hover */}
        <div className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20 whitespace-nowrap">
          <div className="bg-slate-950 border border-slate-700 text-slate-200 text-[10px] font-mono rounded-lg px-2 py-1 shadow-xl flex flex-col gap-0.5">
            <div>
              Capacity:{" "}
              <span className="text-violet-400 font-bold">{capacityLabel}</span>
            </div>
            {!hideBackup && (
              <div>
                Backup:{" "}
                <span className="text-cyan-400 font-bold">{backupLabel}</span>
              </div>
            )}
          </div>
          <div className="w-1.5 h-1.5 bg-slate-950 border-r border-b border-slate-700 rotate-45 mx-auto -mt-[3px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex items-center gap-3 w-fit">
      {/* Battery body — each cell colored by its own 20% range */}
      <div className="flex items-center shrink-0">
        <div
          className={`flex items-center gap-[3px] bg-slate-950/60 border-2 rounded-md px-1.5 py-1.5 transition-colors duration-300 ${
            pct === null ? "border-slate-600" : c.border
          }`}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className={`w-[5px] h-5 rounded-[1.5px] transition-all duration-300 ${
                pct === null
                  ? "bg-slate-700/70"
                  : i < filled
                    ? `${CELL_COLORS[i].seg} ${CELL_COLORS[i].ring}`
                    : "bg-slate-700/70"
              }`}
            />
          ))}
        </div>
        <div
          className={`w-[3px] h-2.5 rounded-r-sm transition-colors duration-300 ${pct === null ? "bg-slate-600" : c.nub}`}
        />
      </div>

      {/* Label */}
      <span
        className={`text-sm font-black ${pct === null ? "text-slate-500" : c.text}`}
      >
        {pct === null ? "—" : `${pct.toFixed(2)}%`}
      </span>

      {/* Capacity tooltip — shown on hover */}
      <div className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-20 whitespace-nowrap">
        <div className="bg-slate-950 border border-slate-700 text-slate-200 text-xs font-mono rounded-lg px-2.5 py-1.5 shadow-xl flex flex-col gap-1">
          <div>
            Capacity:{" "}
            <span className="text-violet-400 font-bold">{capacityLabel}</span>
          </div>
          {!hideBackup && (
            <div>
              Backup:{" "}
              <span className="text-cyan-400 font-bold">{backupLabel}</span>
            </div>
          )}
        </div>
        <div className="w-2 h-2 bg-slate-950 border-r border-b border-slate-700 rotate-45 mx-auto -mt-1" />
      </div>
    </div>
  );
}