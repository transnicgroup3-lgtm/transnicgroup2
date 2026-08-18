"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  RefreshCw, Search, Users, Wallet, TrendingUp, Loader2,
  AlertTriangle, Car, ChevronLeft, ChevronRight, CalendarDays,
} from "lucide-react";

/* ---------------------------------------------------------------
   /admin/taxisti-incasari
   Dashboard: încasările zilnice ale taximetriștilor, sincronizate
   din Yandex Fleet API prin /api/yandex/sync.
---------------------------------------------------------------- */

function todayChisinauISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Chisinau",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function shiftISO(iso, deltaDays) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function fmtMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("ro-RO", { maximumFractionDigits: 0 }) + " lei";
}
function dateLabel(iso) {
  const today = todayChisinauISO();
  const yesterday = shiftISO(today, -1);
  if (iso === today) return "Azi";
  if (iso === yesterday) return "Ieri";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export default function TaxistiIncasariPage() {
  const [date, setDate] = useState(todayChisinauISO());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (d) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/yandex/sync?date=${d}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Eroare la încărcare");
      setRows(json.rows || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/yandex/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Eroare la sincronizare");
      setRows(json.rows || []);
      setLastSync(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.full_name?.toLowerCase().includes(q) || r.car_plate?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const kpis = useMemo(() => {
    const totalGross = rows.reduce((s, r) => s + r.total_gross, 0);
    const totalCommission = rows.reduce((s, r) => s + r.yandex_commission + r.park_commission, 0);
    const activeToday = rows.filter((r) => r.has_data && r.total_gross > 0).length;
    return { totalGross, totalCommission, activeToday };
  }, [rows]);

  return (
    <div style={{
      "--bg": "#14171c", "--panel": "#1c2029", "--amber": "#f2b705", "--orange": "#f2841c",
      "--green": "#2bb673", "--red": "#e5484d", "--text": "#eae7e0", "--muted": "#8b93a1", "--border": "#2a303b",
    }} className="yfp-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .yfp-root{background:var(--bg);color:var(--text);min-height:100vh;font-family:'Inter',system-ui,sans-serif}
        .yfp-root *{box-sizing:border-box}
        .yfp-disp{font-family:'Space Grotesk',sans-serif}
        .yfp-mono{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
        .yfp-header{padding:18px 20px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;position:sticky;top:0;background:var(--bg);z-index:5}
        .yfp-body{padding:20px;max-width:1180px;margin:0 auto}
        .yfp-card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:16px}
        .yfp-btn{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:8px;border:1px solid var(--border);background:#ffffff0d;color:var(--text);font-size:13.5px;font-weight:600;cursor:pointer;transition:.15s}
        .yfp-btn:hover{background:#ffffff1a}
        .yfp-btn:disabled{opacity:.6;cursor:default}
        .yfp-btn.primary{background:var(--amber);color:#14171c;border-color:var(--amber)}
        .yfp-btn.primary:hover{background:#ffcb2b}
        .yfp-input{background:#0f1216;border:1px solid var(--border);color:var(--text);border-radius:7px;padding:9px 11px;font-size:13.5px;font-family:inherit}
        .yfp-input:focus{outline:2px solid var(--amber);outline-offset:1px}
        .yfp-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}
        .yfp-filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
        .yfp-datepick{display:flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:4px}
        .yfp-search{flex:1;min-width:200px;display:flex;align-items:center;gap:8px;background:#0f1216;border:1px solid var(--border);border-radius:8px;padding:0 10px}
        .yfp-search input{background:transparent;border:none;color:var(--text);padding:9px 0;font-size:13.5px;width:100%}
        .yfp-search input:focus{outline:none}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{text-align:left;color:var(--muted);font-weight:600;padding:9px 10px;border-bottom:1px solid var(--border);font-size:11px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
        td{padding:10px;border-bottom:1px solid #ffffff0a;white-space:nowrap}
        tr:last-child td{border-bottom:none}
        .yfp-empty{color:var(--muted);font-size:13.5px;padding:40px 0;text-align:center}
        .yfp-error{display:flex;align-items:center;gap:8px;color:var(--red);background:#e5484d1a;border:1px solid #e5484d33;border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:14px}
        .yfp-spin{animation:yfp-spin 1s linear infinite}
        @keyframes yfp-spin{to{transform:rotate(360deg)}}
        @media (max-width: 720px){
          .yfp-kpis{grid-template-columns:1fr}
          .yfp-body{padding:14px}
          th,td{padding:9px 7px;font-size:12.5px}
        }
      `}</style>

      <div className="yfp-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "repeating-linear-gradient(45deg,var(--amber) 0 6px,#14171c 6px 12px)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Car size={16} color="#14171c" />
          </div>
          <div>
            <div className="yfp-disp" style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>Încasări taximetriști</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Sincronizat din Yandex Fleet</div>
          </div>
        </div>
        <button className="yfp-btn primary" onClick={sync} disabled={syncing}>
          {syncing ? <Loader2 size={15} className="yfp-spin" /> : <RefreshCw size={15} />}
          Sincronizează cu Yandex
        </button>
      </div>

      <div className="yfp-body">
        {error && (
          <div className="yfp-error"><AlertTriangle size={15} />{error}</div>
        )}

        <div className="yfp-filters">
          <div className="yfp-datepick">
            <button className="yfp-btn" style={{ padding: 8, border: "none" }} onClick={() => setDate((d) => shiftISO(d, -1))}><ChevronLeft size={15} /></button>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 4px" }}>
              <CalendarDays size={14} color="var(--muted)" />
              <span className="yfp-disp" style={{ fontWeight: 700, fontSize: 13.5, minWidth: 62, textAlign: "center" }}>{dateLabel(date)}</span>
            </div>
            <button className="yfp-btn" style={{ padding: 8, border: "none" }} onClick={() => setDate((d) => shiftISO(d, 1))} disabled={date >= todayChisinauISO()}><ChevronRight size={15} /></button>
            <input
              type="date" className="yfp-input" value={date} max={todayChisinauISO()}
              onChange={(e) => setDate(e.target.value)}
              style={{ marginLeft: 4, colorScheme: "dark" }}
            />
          </div>
          <div className="yfp-search">
            <Search size={14} color="var(--muted)" />
            <input placeholder="Caută după nume sau nr. înmatriculare…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="yfp-kpis">
          <KpiCard icon={Wallet} label="Total venituri parc" value={fmtMoney(kpis.totalGross)} color="var(--green)" />
          <KpiCard icon={Users} label="Șoferi activi azi" value={kpis.activeToday} color="var(--amber)" />
          <KpiCard icon={TrendingUp} label="Total comision parc" value={fmtMoney(kpis.totalCommission)} color="var(--orange)" />
        </div>

        <div className="yfp-card" style={{ overflowX: "auto", padding: 0 }}>
          {loading ? (
            <div className="yfp-empty" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Loader2 size={16} className="yfp-spin" /> Se încarcă...
            </div>
          ) : filtered.length === 0 ? (
            <div className="yfp-empty">
              {rows.length === 0
                ? 'Nu există date pentru ziua selectată încă. Apasă "Sincronizează cu Yandex".'
                : "Niciun rezultat pentru căutarea curentă."}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Șofer</th>
                  <th>Mașină</th>
                  <th>Cash</th>
                  <th>Card</th>
                  <th>Venit brut</th>
                  <th>Comision Yandex</th>
                  <th>Comision parc</th>
                  <th>Câștig net</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.driver_id}>
                    <td style={{ fontWeight: 600 }}>{r.full_name}</td>
                    <td>{r.car_plate || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td className="yfp-mono">{fmtMoney(r.total_cash)}</td>
                    <td className="yfp-mono">{fmtMoney(r.total_card)}</td>
                    <td className="yfp-mono" style={{ fontWeight: 700 }}>{fmtMoney(r.total_gross)}</td>
                    <td className="yfp-mono" style={{ color: "var(--orange)" }}>{fmtMoney(r.yandex_commission)}</td>
                    <td className="yfp-mono" style={{ color: "var(--orange)" }}>{fmtMoney(r.park_commission)}</td>
                    <td className="yfp-mono" style={{ color: "var(--green)", fontWeight: 700 }}>{fmtMoney(r.net_payout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {lastSync && (
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10, textAlign: "right" }}>
            Ultima sincronizare: {lastSync.toLocaleTimeString("ro-RO")}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color }) {
  return (
    <div className="yfp-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{label}</div>
        <Icon size={16} color={color} />
      </div>
      <div className="yfp-mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{value}</div>
    </div>
  );
}
