import { API_BASE_URL } from "../config/config";

const base = API_BASE_URL;

// JSON request helper for the SA endpoints — surfaces the server's own error message
async function saRequest(url, method, body, failMsg) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) throw new Error((json && (json.error || json.message)) || failMsg);
  return json;
}

export const api = {
  async getRouters() {
    const res = await fetch(`${base}/api/routers`);
    if (!res.ok) throw new Error("Failed to fetch routers");
    return res.json();
  },

  async getRoutersByStatus(status) {
    const res = await fetch(`${base}/api/routers/status/${status}`);
    if (!res.ok) throw new Error("Failed to fetch routers by status");
    return res.json();
  },

  async getDownRouters() {
    const res = await fetch(`${base}/api/routers/status/down`);
    if (!res.ok) throw new Error("Failed to fetch down routers");
    return res.json();
  },

  async getRouterLastEvents(ip) {
    const res = await fetch(`${base}/api/routers/${ip}/last-events`);
    if (!res.ok) throw new Error("Failed to fetch last events");
    return res.json();
  },

  async getRouter(ip) {
    const res = await fetch(`${base}/api/routers/${ip}`);
    if (!res.ok) throw new Error("Failed to fetch router");
    return res.json();
  },

  async getRouterHistory(ip, page = 1, limit = 1000) {
    const res = await fetch(`${base}/api/routers/${ip}/history?page=${page}&limit=${limit}`);
    if (!res.ok) throw new Error("Failed to fetch history");
    return res.json();
  },

  async getAnalytics(ip, period) {
    const res = await fetch(`${base}/api/analytics/summary/${ip}?period=${period}`);
    if (!res.ok) throw new Error("Failed to fetch analytics");
    return res.json();
  },

  async getAllAnalytics(period) {
    const res = await fetch(`${base}/api/analytics/all?period=${period}`);
    if (!res.ok) throw new Error("Failed to fetch all analytics");
    return res.json();
  },

  async downloadExcel(period) {
    const res = await fetch(`${base}/api/analytics/report/excel/${period}`);
    if (!res.ok) throw new Error("Failed to download report");
    return res.blob();
  },

  // ── BRAS Power Status (backup time) ─────────────────────────────────────
  async getBrasPowerStatus() {
    const res = await fetch(`${base}/api/bras/power/status`);
    if (!res.ok) throw new Error("Failed to fetch BRAS power status");
    return res.json();
  },

  // ── SA / Devices (PDB live summary, system down, system power events) ───
  async getDeviceLiveSummary(component) {
    const res = await fetch(`${base}/api/devices/live-summary?component=${encodeURIComponent(component)}`);
    if (!res.ok) throw new Error("Failed to fetch live summary");
    return res.json();
  },

  async getSystemDown() {
    const res = await fetch(`${base}/api/devices/system-down`);
    if (!res.ok) throw new Error("Failed to fetch system down");
    return res.json();
  },

  async getLatestData(sa_code) {
    const res = await fetch(`${base}/api/devices/latest-data/${encodeURIComponent(sa_code)}`);
    if (!res.ok) throw new Error("Failed to fetch latest data");
    return res.json();
  },

  async getSystemPowerEvents(sa_code, page = 1, limit = 300) {
    const res = await fetch(`${base}/api/devices/${encodeURIComponent(sa_code)}/system-power-events?page=${page}&limit=${limit}`);
    if (!res.ok) throw new Error("Failed to fetch system power events");
    return res.json();
  },

  async getPdbEvents(sa_code, page = 1, limit = 300) {
    const res = await fetch(`${base}/api/devices/${encodeURIComponent(sa_code)}/pdb-events?page=${page}&limit=${limit}`);
    if (!res.ok) throw new Error("Failed to fetch PDB events");
    return res.json();
  },

  // Raw sensor readings — row per reading, cursor-paginated with
  // after_created_at / after_id (used by the "More History" button on the
  // PDB / UPS events modals).
  async getRawHistory(sa_code, { start_date, end_date, limit = 500, after_created_at, after_id } = {}) {
    const params = new URLSearchParams();
    if (start_date) params.set("start_date", start_date);
    if (end_date) params.set("end_date", end_date);
    params.set("limit", limit);
    if (after_created_at) params.set("after_created_at", after_created_at);
    if (after_id !== undefined && after_id !== null) params.set("after_id", after_id);
    const res = await fetch(`${base}/api/devices/${encodeURIComponent(sa_code)}/raw?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch raw history");
    return res.json();
  },

  async getUpsEvents(sa_code, page = 1, limit = 300) {
    const res = await fetch(`${base}/api/devices/${encodeURIComponent(sa_code)}/ups1-events?page=${page}&limit=${limit}`);
    if (!res.ok) throw new Error("Failed to fetch UPS events");
    return res.json();
  },

  // ── SA Down table (replaces the old /api/devices/system-down table) ────────
  async getSaStatusList() {
    const res = await fetch(`${base}/api/sa-status`);
    if (!res.ok) throw new Error("Failed to fetch SA status list");
    return res.json();
  },

  // History button — look up a single SA by its code
  async getSaStatusByCode(sa_code) {
    const res = await fetch(`${base}/api/sa-status/${encodeURIComponent(sa_code)}`);
    if (!res.ok) throw new Error("Failed to fetch SA status");
    return res.json();
  },

  async getSaStatusEvents(sa_code, page = 1, limit = 300) {
    const res = await fetch(`${base}/api/sa-status/${encodeURIComponent(sa_code)}/events?page=${page}&limit=${limit}`);
    if (!res.ok) throw new Error("Failed to fetch SA status events");
    return res.json();
  },

  async ask(question) {
    const res = await fetch(`${base}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) throw new Error("Failed to get answer");
    return res.json();
  },

  async addRouter(bts_name, ip_address, bts_code) {
    const res = await fetch(`${base}/api/routers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bts_name, ip_address, bts_code }),
    });
    if (!res.ok) throw new Error("Failed to add router");
    return res.json();
  },

  async updateRouter(ip, data) {
    const res = await fetch(`${base}/api/routers/${ip}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update router");
    return res.json();
  },

  async deleteRouter(ip) {
    const res = await fetch(`${base}/api/routers/${ip}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete router");
    return res.json();
  },

  // ── SA (Site Profile) CRUD ──────────────────────────────────────────────
  async getSAList() {
    return saRequest(`${base}/api/sa`, "GET", undefined, "Failed to fetch SA list");
  },

  async getSA(sa_code) {
    return saRequest(`${base}/api/sa/${encodeURIComponent(sa_code)}`, "GET", undefined, "Failed to fetch SA");
  },

  async addSA(data) {
    return saRequest(`${base}/api/sa`, "POST", data, "Failed to add SA");
  },

  // Full update (PUT)
  async updateSA(sa_code, data) {
    return saRequest(`${base}/api/sa/${encodeURIComponent(sa_code)}`, "PUT", data, "Failed to update SA");
  },

  // Partial update (PATCH)
  async patchSA(sa_code, data) {
    return saRequest(`${base}/api/sa/${encodeURIComponent(sa_code)}`, "PATCH", data, "Failed to update SA");
  },

  async deleteSA(sa_code) {
    return saRequest(`${base}/api/sa/${encodeURIComponent(sa_code)}`, "DELETE", undefined, "Failed to delete SA");
  },

  // ── BTS Information (battery-info) ──────────────────────────────────────
  async getBatteryInfoMonths() {
    const res = await fetch(`${base}/api/battery-info/months`);
    if (!res.ok) throw new Error("Failed to fetch months");
    return res.json();
  },

  async getBatteryInfoAll(month) {
    const url = month
      ? `${base}/api/battery-info?month=${month}`
      : `${base}/api/battery-info`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch BTS information");
    return res.json();
  },

  async getBatteryInfoByName(bts_name, month) {
    const url = month
      ? `${base}/api/battery-info/${encodeURIComponent(bts_name)}?month=${month}`
      : `${base}/api/battery-info/${encodeURIComponent(bts_name)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch BTS detail");
    return res.json();
  },

  async getBatteryInfoHistory(bts_name) {
    const res = await fetch(`${base}/api/battery-info/${encodeURIComponent(bts_name)}/history`);
    if (!res.ok) throw new Error("Failed to fetch BTS history");
    return res.json();
  },

  async updateBatteryInfo(bts_name, data, month) {
    const url = month
      ? `${base}/api/battery-info/${encodeURIComponent(bts_name)}?month=${month}`
      : `${base}/api/battery-info/${encodeURIComponent(bts_name)}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update BTS information");
    return res.json();
  },

  async deleteBatteryInfo(bts_name, month) {
    const url = month
      ? `${base}/api/battery-info/${encodeURIComponent(bts_name)}?month=${month}`
      : `${base}/api/battery-info/${encodeURIComponent(bts_name)}`;
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete BTS information");
    return res.json();
  },

  // ── Battery Data (battery-latest) ───────────────────────────────────────
  async getBatteryLatestAll() {
    const res = await fetch(`${base}/api/battery-latest`);
    if (!res.ok) throw new Error("Failed to fetch battery data");
    return res.json();
  },

  async getBatteryLatestByIp(ip) {
    const res = await fetch(`${base}/api/battery-latest/${ip}`);
    if (!res.ok) throw new Error("Failed to fetch battery detail");
    return res.json();
  },

  async searchBatteryLatestByName(bts_name) {
    const res = await fetch(`${base}/api/battery-latest/search/by-name/${encodeURIComponent(bts_name)}`);
    if (!res.ok) throw new Error("Failed to search battery data");
    return res.json();
  },

  async updateBatteryLatest(ip, data) {
    const res = await fetch(`${base}/api/battery-latest/${ip}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update battery data");
    return res.json();
  },

  async deleteBatteryLatest(ip) {
    const res = await fetch(`${base}/api/battery-latest/${ip}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete battery data");
    return res.json();
  },

  async uploadBatteryLatest(file) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${base}/api/battery-latest/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Failed to upload battery data file");
    return res.json();
  },

  async uploadBatteryInfo(file) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${base}/api/battery-info/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Failed to upload BTS information file");
    return res.json();
  },
};