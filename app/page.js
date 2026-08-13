"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Car, Users, Calendar as CalendarIcon, Wallet, BarChart3, Plus, X,
  Trash2, Pencil, Check, AlertTriangle, ChevronLeft, ChevronRight,
  Phone, Loader2, TrendingUp, TrendingDown, Gauge, Shield, Wrench
} from "lucide-react";

/* ---------------------------------------------------------------
   Taxi Fleet Pro Cloud (web version)
   Data stored in Supabase via /api/data.
   Payment model: weekly. Each month is split into 4 fixed sections
   (1-7, 8-14, 15-21, 22-end). Sundays don't count toward the plan.
   If a car doesn't reach its monthly plan, the shortfall is added
   automatically to the next month's plan.
---------------------------------------------------------------- */

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const MONTHS_RO = ["Ianuarie","Februarie","Martie","Aprilie","Mai","Iunie","Iulie","August","Septembrie","Octombrie","Noiembrie","Decembrie"];
const MONTHS_RO_SHORT = ["Ian","Feb","Mar","Apr","Mai","Iun","Iul","Aug","Sep","Oct","Noi","Dec"];

const emptyData = () => ({
  cars: [],
  drivers: [],
  payments: {},        // legacy, unused
  weeklyPayments: {},  // key `${y}-${mm}__${carId}__${weekIdx}` -> {year,month,carId,weekIdx,paidCash,paidCard,paidAmount}
  expenses: [],
  incomes: [],
  insurances: [],
  inspections: [],
});

function fmtMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("ro-RO", { maximumFractionDigits: 0 }) + " lei";
}
function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function monthKey(y, m) { return `${y}-${String(m + 1).padStart(2, "0")}`; }
function isSunday(year, month, day) { return new Date(year, month, day).getDay() === 0; }

function workingDaysInRange(year, month, startDay, endDay) {
  let count = 0;
  for (let d = startDay; d <= endDay; d++) if (!isSunday(year, month, d)) count++;
  return count;
}
function weekRanges(year, month) {
  const last = daysInMonth(year, month);
  return [[1, 7], [8, 14], [15, 21], [22, last]]
    .filter(([s]) => s <= last)
    .map(([s, e]) => ({ start: s, end: Math.min(e, last) }));
}
function workingDaysInMonth(year, month) { return workingDaysInRange(year, month, 1, daysInMonth(year, month)); }

function dailyRate(car, year, month) {
  if (car.tarifPeriod === "luna") {
    const wd = workingDaysInMonth(year, month);
    return wd > 0 ? (Number(car.tarif) || 0) / wd : 0;
  }
  return Number(car.tarif) || 0;
}
function fmtRate(car) {
  return car.tarifPeriod === "luna" ? `${fmtMoney(car.tarif)}/lună` : `${fmtMoney(car.tarif)}/zi`;
}

function weekKey(year, month, carId, weekIdx) { return `${year}-${String(month + 1).padStart(2, "0")}__${carId}__${weekIdx}`; }
function weeklyRecord(data, year, month, carId, weekIdx) { return data.weeklyPayments[weekKey(year, month, carId, weekIdx)] || null; }
function weeklyPaid(data, year, month, carId, weekIdx) {
  const r = weeklyRecord(data, year, month, carId, weekIdx);
  return r ? Number(r.paidAmount || 0) : 0;
}
function workingDaysEffective(data, year, month, carId, weekIdx, ranges) {
  const r = ranges[weekIdx];
  const rec = weeklyRecord(data, year, month, carId, weekIdx);
  if (rec && rec.mode === "daily" && rec.dailyAmounts) {
    let count = 0;
    for (let d = r.start; d <= r.end; d++) {
      if (isSunday(year, month, d)) continue;
      const dayRec = rec.dailyAmounts[d];
      if (dayRec && dayRec.worked === false) continue;
      count++;
    }
    return count;
  }
  return workingDaysInRange(year, month, r.start, r.end);
}
function monthlyPlanBase(data, car, year, month) {
  const ranges = weekRanges(year, month);
  const rate = dailyRate(car, year, month);
  let total = 0;
  for (let i = 0; i < ranges.length; i++) total += rate * workingDaysEffective(data, year, month, car.id, i, ranges);
  return total;
}
function monthlyPaid(data, year, month, carId) {
  const ranges = weekRanges(year, month);
  let sum = 0;
  for (let i = 0; i < ranges.length; i++) sum += weeklyPaid(data, year, month, carId, i);
  return sum;
}
function hasAnyRecordForMonth(data, year, month, carId) {
  const ranges = weekRanges(year, month);
  for (let i = 0; i < ranges.length; i++) if (weeklyRecord(data, year, month, carId, i)) return true;
  return false;
}
function prevMonth(year, month) { return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }; }

function carryoverFromPrevMonth(data, car, year, month) {
  const pm = prevMonth(year, month);
  if (!hasAnyRecordForMonth(data, pm.year, pm.month, car.id)) return 0;
  const plan = monthlyPlanWithCarry(data, car, pm.year, pm.month);
  const paid = monthlyPaid(data, pm.year, pm.month, car.id);
  return Math.max(plan - paid, 0);
}
function monthlyPlanWithCarry(data, car, year, month) {
  return monthlyPlanBase(data, car, year, month) + carryoverFromPrevMonth(data, car, year, month);
}
function weekPlan(data, car, year, month, weekIdx, ranges) {
  const base = dailyRate(car, year, month) * workingDaysEffective(data, year, month, car.id, weekIdx, ranges);
  return weekIdx === 0 ? base + carryoverFromPrevMonth(data, car, year, month) : base;
}

const DAY_NAMES_RO = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];
function weekDays(year, month, weekIdx, ranges) {
  const r = ranges[weekIdx];
  const days = [];
  for (let d = r.start; d <= r.end; d++) if (!isSunday(year, month, d)) days.push(d);
  return days;
}
function dayLabel(year, month, day) {
  return `${DAY_NAMES_RO[new Date(year, month, day).getDay()].slice(0, 3)} ${day}`;
}
function weeklyMode(data, year, month, carId, weekIdx) {
  const r = weeklyRecord(data, year, month, carId, weekIdx);
  return r && r.mode === "daily" ? "daily" : "total";
}
function statusOf(due, paid) {
  if (paid == null) return "pending";
  if (paid <= 0) return "unpaid";
  if (paid >= due) return "paid";
  return "partial";
}
function currentWeekIndex(year, month, day, ranges) {
  const idx = ranges.findIndex((r) => day >= r.start && day <= r.end);
  return idx === -1 ? ranges.length - 1 : idx;
}

export default function TaxiFleetPro() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [tab, setTab] = useState("dashboard");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/data");
        const json = await res.json();
        setData(json && json.data ? { ...emptyData(), ...json.data } : emptyData());
      } catch {
        setData(emptyData());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback(async (next) => {
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      setSaveError(!res.ok);
    } catch {
      setSaveError(true);
    }
  }, []);

  const update = useCallback((fn) => {
    setData((prev) => {
      const next = fn(prev);
      persist(next);
      return next;
    });
  }, [persist]);

  if (loading || !data) {
    return (
      <Shell tab={tab} setTab={setTab} loading>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", padding: "60px 0", justifyContent: "center" }}>
          <Loader2 className="spin" size={20} />
          <span>Se încarcă datele flotei…</span>
        </div>
      </Shell>
    );
  }

  return (
    <Shell tab={tab} setTab={setTab} saveError={saveError}>
      {tab === "dashboard" && <Dashboard data={data} setTab={setTab} />}
      {tab === "cars" && <CarsView data={data} update={update} />}
      {tab === "drivers" && <DriversView data={data} update={update} />}
      {tab === "calendar" && <WeeklyCalendarView data={data} update={update} />}
      {tab === "insurance" && <InsuranceView data={data} update={update} />}
      {tab === "inspection" && <InspectionView data={data} update={update} />}
      {tab === "finance" && <FinanceView data={data} update={update} />}
      {tab === "reports" && <ReportsView data={data} />}
    </Shell>
  );
}

/* ============================== SHELL ============================== */

function Shell({ tab, setTab, children, loading, saveError }) {
  const nav = [
    { id: "dashboard", label: "Dashboard", icon: Gauge },
    { id: "cars", label: "Mașini", icon: Car },
    { id: "drivers", label: "Șoferi", icon: Users },
    { id: "calendar", label: "Calendar", icon: CalendarIcon },
    { id: "insurance", label: "Asigurări", icon: Shield },
    { id: "inspection", label: "Revizie tehnică", icon: Wrench },
    { id: "finance", label: "Finanțe", icon: Wallet },
    { id: "reports", label: "Rapoarte", icon: BarChart3 },
  ];

  return (
    <div style={{ "--bg": "#14171c", "--panel": "#1c2029", "--amber": "#f2b705", "--orange": "#f2841c", "--green": "#2bb673", "--red": "#e5484d", "--text": "#eae7e0", "--muted": "#8b93a1", "--border": "#2a303b" }}
      className="tfp-root">
      <style>{`
        .tfp-root{background:var(--bg);color:var(--text);min-height:100vh;font-family:'Inter',system-ui,sans-serif;display:flex;flex-direction:column}
        .tfp-root *{box-sizing:border-box}
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .disp{font-family:'Space Grotesk',sans-serif}
        .mono{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
        .spin{animation:spin 1s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .tfp-header{padding:18px 20px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;position:sticky;top:0;background:var(--bg);z-index:5}
        .tfp-title{display:flex;align-items:center;gap:10px}
        .tfp-badge{width:34px;height:34px;border-radius:8px;background:repeating-linear-gradient(45deg,var(--amber) 0 6px,#14171c 6px 12px);display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .tfp-nav{display:flex;gap:4px;padding:10px 14px;border-bottom:1px solid var(--border);overflow-x:auto;-webkit-overflow-scrolling:touch}
        .tfp-nav::-webkit-scrollbar{display:none}
        .tfp-navbtn{display:flex;align-items:center;gap:7px;padding:8px 13px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--muted);font-size:13.5px;font-weight:600;white-space:nowrap;cursor:pointer;transition:.15s}
        .tfp-navbtn:hover{color:var(--text);background:#ffffff08}
        .tfp-navbtn.active{color:#14171c;background:var(--amber)}
        .tfp-body{padding:20px;flex:1;max-width:1100px;margin:0 auto;width:100%}
        .card{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:16px}
        .btn{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:8px;border:1px solid var(--border);background:#ffffff0d;color:var(--text);font-size:13.5px;font-weight:600;cursor:pointer;transition:.15s}
        .btn:hover{background:#ffffff1a}
        .btn.primary{background:var(--amber);color:#14171c;border-color:var(--amber)}
        .btn.primary:hover{background:#ffcb2b}
        .btn.danger{color:var(--red);border-color:#e5484d33}
        .btn.danger:hover{background:#e5484d1a}
        input,select,textarea{background:#0f1216;border:1px solid var(--border);color:var(--text);border-radius:7px;padding:8px 10px;font-size:13.5px;font-family:inherit;width:100%}
        input:focus,select:focus,textarea:focus{outline:2px solid var(--amber);outline-offset:1px}
        table{width:100%;border-collapse:collapse;font-size:13.5px}
        th{text-align:left;color:var(--muted);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--border);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
        td{padding:9px 10px;border-bottom:1px solid #ffffff0a}
        .modal-backdrop{position:fixed;inset:0;background:#000a;display:flex;align-items:center;justify-content:center;z-index:50;padding:16px}
        .modal{background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:20px;width:100%;max-width:420px;max-height:88vh;overflow:auto}
        .pill{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:99px;font-size:12px;font-weight:600}
        .field{margin-bottom:12px}
        .field label{display:block;font-size:12px;color:var(--muted);margin-bottom:5px;font-weight:600}
        .save-warn{font-size:12px;color:var(--red);display:flex;align-items:center;gap:5px}
        .quickbtn{flex:1;padding:9px 6px;border-radius:8px;border:1px solid var(--border);background:#ffffff0d;color:var(--text);font-size:12.5px;font-weight:700;cursor:pointer}
        .quickbtn:hover{background:#ffffff1a}
        .tfp-footer{padding:16px 20px;border-top:1px solid var(--border);text-align:center;font-size:12px;color:var(--muted)}
        .finance-grid{grid-template-columns:1fr 1fr}
        .weekrow{padding:9px 0;border-top:1px solid #ffffff0a}
        .weekrow:first-child{border-top:none}
        .modetoggle{display:flex;border:1px solid var(--border);border-radius:7px;overflow:hidden}
        .modetoggle button{padding:6px 9px;font-size:11.5px;font-weight:600;background:transparent;color:var(--muted);border:none;cursor:pointer}
        .modetoggle button+button{border-left:1px solid var(--border)}
        .modetoggle button.active{background:var(--amber);color:#14171c}
        .dayrow{padding-bottom:6px;border-bottom:1px solid #ffffff08}
        .dayrow:last-child{border-bottom:none;padding-bottom:0}
        @media (max-width: 680px){
          .finance-grid{grid-template-columns:1fr}
          .tfp-navbtn{padding:11px 14px;font-size:14px}
          .btn{padding:11px 15px;font-size:14.5px}
          .tfp-body{padding:14px}
          th,td{padding:10px 8px}
          input,select,textarea{padding:11px 12px;font-size:15px}
          .weekrow{grid-template-columns:1fr;gap:6px}
        }
      `}</style>

      <div className="tfp-header">
        <div className="tfp-title">
          <div className="tfp-badge"><Car size={16} color="#14171c" /></div>
          <div>
            <div className="disp" style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>Taxi Fleet Pro</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Gestionare taxi</div>
          </div>
        </div>
        {saveError && <div className="save-warn"><AlertTriangle size={14} />Salvarea a eșuat</div>}
      </div>

      <div className="tfp-nav">
        {nav.map((n) => (
          <button key={n.id} className={"tfp-navbtn" + (tab === n.id ? " active" : "")} onClick={() => !loading && setTab(n.id)}>
            <n.icon size={15} />{n.label}
          </button>
        ))}
      </div>

      <div className="tfp-body">{children}</div>

      <div className="tfp-footer">© {new Date().getFullYear()} Nichita Ivanov. Toate drepturile rezervate.</div>
    </div>
  );
}

/* ============================== DASHBOARD ============================== */

function Dashboard({ data, setTab }) {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth(), day = now.getDate();
  const ranges = weekRanges(year, month);
  const wIdx = currentWeekIndex(year, month, day, ranges);
  const range = ranges[wIdx];

  const activeCars = data.cars.filter((c) => c.status === "activa").length;
  const inService = data.cars.filter((c) => c.status === "service").length;

  const weekRows = data.cars.map((c) => {
    const rec = weeklyRecord(data, year, month, c.id, wIdx);
    const due = weekPlan(data, c, year, month, wIdx, ranges);
    const paid = rec ? rec.paidAmount : null;
    return { car: c, due, paid, status: statusOf(due, paid) };
  });
  const incomeWeek = weekRows.reduce((s, r) => s + (r.paid || 0), 0);
  const expensesWeek = data.expenses
    .filter((e) => e.data && e.data.startsWith(monthKey(year, month)) && Number(e.data.slice(8, 10)) >= range.start && Number(e.data.slice(8, 10)) <= range.end)
    .reduce((s, e) => s + Number(e.suma || 0), 0);
  const profitWeek = incomeWeek - expensesWeek;
  const problemCount = weekRows.filter((r) => r.status === "unpaid" || r.status === "partial").length;

  const insuranceAlerts = data.insurances.filter((ins) => { const d = daysUntil(ins.dataExpirare); return d != null && d <= 30; });
  const inspectionAlerts = data.inspections.filter((insp) => { const d = daysUntil(insp.dataExpirare); return d != null && d <= 30; });

  const stats = [
    { label: "Mașini", value: data.cars.length, icon: Car, sub: `${activeCars} active · ${inService} service` },
    { label: "Șoferi", value: data.drivers.length, icon: Users, sub: `${data.drivers.filter((d) => d.activ).length} activi` },
    { label: "Încasări săpt.", value: fmtMoney(incomeWeek), icon: Wallet, sub: `${weekRows.filter((r) => r.status === "paid").length}/${data.cars.length} la zi`, mono: true },
    { label: "Profit săpt.", value: fmtMoney(profitWeek), icon: profitWeek >= 0 ? TrendingUp : TrendingDown, sub: `cheltuieli ${fmtMoney(expensesWeek)}`, mono: true, accent: profitWeek >= 0 },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {stats.map((s) => (
          <div className="card" key={s.label}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{s.label}</div>
              <s.icon size={16} color={s.accent === false ? "var(--red)" : s.accent === true ? "var(--green)" : "var(--amber)"} />
            </div>
            <div className={s.mono ? "mono" : "disp"} style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{s.value}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {problemCount > 0 && (
        <div className="card" style={{ borderColor: "#e5484d55", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={17} color="var(--red)" />
          <div style={{ fontSize: 13.5 }}>{problemCount} mașin{problemCount === 1 ? "ă are" : "i au"} restanță în săptămâna asta.</div>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setTab("calendar")}>Deschide calendar</button>
        </div>
      )}
      {insuranceAlerts.length > 0 && (
        <div className="card" style={{ borderColor: "#f2841c55", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <Shield size={17} color="var(--orange)" />
          <div style={{ fontSize: 13.5 }}>{insuranceAlerts.length} asigurăr{insuranceAlerts.length === 1 ? "e expiră" : "i expiră"} în curând sau au expirat.</div>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setTab("insurance")}>Deschide asigurări</button>
        </div>
      )}
      {inspectionAlerts.length > 0 && (
        <div className="card" style={{ borderColor: "#f2841c55", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <Wrench size={17} color="var(--orange)" />
          <div style={{ fontSize: 13.5 }}>{inspectionAlerts.length} revizi{inspectionAlerts.length === 1 ? "e tehnică expiră" : "i tehnice expiră"} în curând sau au expirat.</div>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setTab("inspection")}>Deschide revizii</button>
        </div>
      )}

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 4 }} className="disp">Săptămâna aceasta, pe mașini</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>{range.start}–{range.end} {MONTHS_RO[month]}</div>
        {data.cars.length === 0 ? (
          <EmptyState text="Adaugă prima mașină din secțiunea Mașini." />
        ) : (
          <table>
            <thead><tr><th>Mașină</th><th>Șofer</th><th>Plan săpt.</th><th>Adus</th><th>Stare</th></tr></thead>
            <tbody>
              {weekRows.map(({ car, status, due, paid }) => {
                const driver = data.drivers.find((d) => d.id === car.driverId);
                return (
                  <tr key={car.id}>
                    <td>{car.nr} <span style={{ color: "var(--muted)" }}>· {car.marca} {car.model}</span></td>
                    <td>{driver ? driver.nume : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td className="mono">{fmtMoney(due)}</td>
                    <td className="mono">{paid == null ? "—" : fmtMoney(paid)}</td>
                    <td><StatusPill status={status} restanta={due - (paid || 0)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status, restanta }) {
  const map = {
    paid: { label: "Plan îndeplinit", bg: "#2bb67322", color: "var(--green)" },
    unpaid: { label: "Neachitat", bg: "#e5484d22", color: "var(--red)" },
    partial: { label: `Mai are ${fmtMoney(restanta)}`, bg: "#f2841c22", color: "var(--orange)" },
    pending: { label: "Așteptăm", bg: "#f2b70522", color: "var(--amber)" },
  };
  const m = map[status] || map.pending;
  return <span className="pill" style={{ background: m.bg, color: m.color }}>{m.label}</span>;
}

function EmptyState({ text }) {
  return <div style={{ color: "var(--muted)", fontSize: 13.5, padding: "18px 0", textAlign: "center" }}>{text}</div>;
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <AlertTriangle size={20} color="var(--red)" />
          <div className="disp" style={{ fontWeight: 700, fontSize: 16 }}>Confirmă ștergerea</div>
        </div>
        <div style={{ fontSize: 13.5, marginBottom: 18 }}>{message}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn danger" style={{ flex: 1, justifyContent: "center" }} onClick={onConfirm}><Trash2 size={15} />Șterge</button>
          <button className="btn" style={{ flex: 1, justifyContent: "center" }} onClick={onCancel}>Anulează</button>
        </div>
      </div>
    </div>
  );
}

/* ============================== CARS ============================== */

function CarsView({ data, update }) {
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const empty = { nr: "", marca: "", model: "", an: "", tarif: 157, tarifPeriod: "zi", driverId: "", status: "activa" };
  const sortedCars = useMemo(
    () => [...data.cars].sort((a, b) => a.nr.localeCompare(b.nr, "ro", { sensitivity: "base", numeric: true })),
    [data.cars]
  );

  const save = (car) => {
    update((prev) => {
      const cars = car.id ? prev.cars.map((c) => (c.id === car.id ? car : c)) : [...prev.cars, { ...car, id: uid() }];
      return { ...prev, cars };
    });
    setEditing(null);
  };
  const remove = (id) => update((prev) => ({ ...prev, cars: prev.cars.filter((c) => c.id !== id) }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="disp" style={{ fontSize: 18, fontWeight: 700 }}>Mașini ({data.cars.length})</div>
        <button className="btn primary" onClick={() => setEditing({ ...empty })}><Plus size={15} />Adaugă mașină</button>
      </div>

      {data.cars.length === 0 ? (
        <div className="card"><EmptyState text="Nicio mașină încă. Adaugă prima mașină pentru a începe." /></div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Nr.</th><th>Marcă / Model</th><th>An</th><th>Tarif</th><th>Șofer</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {sortedCars.map((c) => {
                const driver = data.drivers.find((d) => d.id === c.driverId);
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.nr}</td>
                    <td>{c.marca} {c.model}</td>
                    <td className="mono">{c.an || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td className="mono">{fmtRate(c)}</td>
                    <td>{driver ? driver.nume : <span style={{ color: "var(--muted)" }}>nealocat</span>}</td>
                    <td><CarStatusPill status={c.status} /></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn" style={{ padding: 6, marginRight: 6 }} onClick={() => setEditing(c)}><Pencil size={14} /></button>
                      <button className="btn danger" style={{ padding: 6 }} onClick={() => setConfirm({ message: `Ștergi mașina ${c.nr}? Această acțiune nu poate fi anulată.`, action: () => remove(c.id) })}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.id ? "Editează mașina" : "Adaugă mașină"}>
          <CarForm car={editing} drivers={data.drivers} onSave={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {confirm && (
        <ConfirmModal message={confirm.message} onCancel={() => setConfirm(null)} onConfirm={() => { confirm.action(); setConfirm(null); }} />
      )}
    </div>
  );
}

function CarStatusPill({ status }) {
  const map = {
    activa: { label: "Activă", bg: "#2bb67322", color: "var(--green)" },
    service: { label: "În service", bg: "#f2b70522", color: "var(--amber)" },
    vanduta: { label: "Vândută", bg: "#8b93a122", color: "var(--muted)" },
  };
  const m = map[status] || map.activa;
  return <span className="pill" style={{ background: m.bg, color: m.color }}>{m.label}</span>;
}

function CarForm({ car, drivers, onSave, onCancel }) {
  const [f, setF] = useState(car);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div>
      <div className="field"><label>Număr înmatriculare</label><input value={f.nr} onChange={(e) => set("nr", e.target.value)} placeholder="EWM 110" /></div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="field" style={{ flex: 1 }}><label>Marcă</label><input value={f.marca} onChange={(e) => set("marca", e.target.value)} placeholder="BMW" /></div>
        <div className="field" style={{ flex: 1 }}><label>Model</label><input value={f.model} onChange={(e) => set("model", e.target.value)} placeholder="520D" /></div>
      </div>
      <div className="field"><label>An fabricație</label><input type="number" value={f.an || ""} onChange={(e) => set("an", e.target.value)} placeholder="2018" /></div>
      <div className="field">
        <label>Tarif</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="number" style={{ flex: 1 }} value={f.tarif} onChange={(e) => set("tarif", Number(e.target.value))} />
          <select style={{ flex: 1 }} value={f.tarifPeriod || "zi"} onChange={(e) => set("tarifPeriod", e.target.value)}>
            <option value="zi">lei / zi</option>
            <option value="luna">lei / lună</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Șofer alocat</label>
        <select value={f.driverId} onChange={(e) => set("driverId", e.target.value)}>
          <option value="">— nealocat —</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.nume}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Status</label>
        <select value={f.status} onChange={(e) => set("status", e.target.value)}>
          <option value="activa">Activă</option>
          <option value="service">În service</option>
          <option value="vanduta">Vândută</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => f.nr && onSave(f)}><Check size={15} />Salvează</button>
        <button className="btn" onClick={onCancel}>Anulează</button>
      </div>
    </div>
  );
}

/* ============================== DRIVERS ============================== */

function DriversView({ data, update }) {
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const empty = { nume: "", telefon: "", activ: true };

  const save = (drv) => {
    update((prev) => {
      const drivers = drv.id ? prev.drivers.map((d) => (d.id === drv.id ? drv : d)) : [...prev.drivers, { ...drv, id: uid() }];
      return { ...prev, drivers };
    });
    setEditing(null);
  };
  const remove = (id) => {
    update((prev) => ({
      ...prev,
      drivers: prev.drivers.filter((d) => d.id !== id),
      cars: prev.cars.map((c) => (c.driverId === id ? { ...c, driverId: "" } : c)),
    }));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="disp" style={{ fontSize: 18, fontWeight: 700 }}>Șoferi ({data.drivers.length})</div>
        <button className="btn primary" onClick={() => setEditing({ ...empty })}><Plus size={15} />Adaugă șofer</button>
      </div>

      {data.drivers.length === 0 ? (
        <div className="card"><EmptyState text="Niciun șofer încă." /></div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Nume</th><th>Telefon</th><th>Mașină</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.drivers.map((d) => {
                const car = data.cars.find((c) => c.driverId === d.id);
                return (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.nume}</td>
                    <td>{d.telefon ? <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Phone size={12} />{d.telefon}</span> : "—"}</td>
                    <td>{car ? car.nr : <span style={{ color: "var(--muted)" }}>nealocat</span>}</td>
                    <td><span className="pill" style={{ background: d.activ ? "#2bb67322" : "#8b93a122", color: d.activ ? "var(--green)" : "var(--muted)" }}>{d.activ ? "Activ" : "Inactiv"}</span></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn" style={{ padding: 6, marginRight: 6 }} onClick={() => setEditing(d)}><Pencil size={14} /></button>
                      <button className="btn danger" style={{ padding: 6 }} onClick={() => setConfirm({ message: `Ștergi șoferul ${d.nume}? Această acțiune nu poate fi anulată.`, action: () => remove(d.id) })}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.id ? "Editează șofer" : "Adaugă șofer"}>
          <DriverForm driver={editing} onSave={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {confirm && (
        <ConfirmModal message={confirm.message} onCancel={() => setConfirm(null)} onConfirm={() => { confirm.action(); setConfirm(null); }} />
      )}
    </div>
  );
}

function DriverForm({ driver, onSave, onCancel }) {
  const [f, setF] = useState(driver);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div>
      <div className="field"><label>Nume complet</label><input value={f.nume} onChange={(e) => set("nume", e.target.value)} placeholder="Bordian Vladimir" /></div>
      <div className="field"><label>Telefon</label><input value={f.telefon} onChange={(e) => set("telefon", e.target.value)} placeholder="+373 6X XXX XXX" /></div>
      <div className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" style={{ width: "auto" }} checked={f.activ} onChange={(e) => set("activ", e.target.checked)} id="activ-chk" />
        <label htmlFor="activ-chk" style={{ margin: 0 }}>Șofer activ</label>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => f.nume && onSave(f)}><Check size={15} />Salvează</button>
        <button className="btn" onClick={onCancel}>Anulează</button>
      </div>
    </div>
  );
}

/* ============================== WEEKLY CALENDAR ============================== */

function WeeklyCalendarView({ data, update }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const ranges = weekRanges(year, month);
  const todayIdx = (year === now.getFullYear() && month === now.getMonth()) ? currentWeekIndex(year, month, now.getDate(), ranges) : -1;

  const filteredCars = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...data.cars]
      .filter((c) => !term || c.nr.toLowerCase().includes(term) || `${c.marca} ${c.model}`.toLowerCase().includes(term))
      .sort((a, b) => a.nr.localeCompare(b.nr, "ro", { sensitivity: "base", numeric: true }));
  }, [data.cars, search]);

  const changeMonth = (delta) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setMonth(m); setYear(y);
  };

  const setWeekTotal = (car, weekIdx, cash, card) => {
    const k = weekKey(year, month, car.id, weekIdx);
    const paidAmount = Number(cash || 0) + Number(card || 0);
    update((prev) => ({
      ...prev,
      weeklyPayments: {
        ...prev.weeklyPayments,
        [k]: { ...(prev.weeklyPayments[k] || {}), year, month, carId: car.id, weekIdx, mode: "total", paidCash: Number(cash || 0), paidCard: Number(card || 0), paidAmount },
      },
    }));
  };

  const setWeekMode = (car, weekIdx, mode) => {
    const k = weekKey(year, month, car.id, weekIdx);
    update((prev) => {
      const existing = prev.weeklyPayments[k];
      const rec = existing
        ? { ...existing, mode }
        : { year, month, carId: car.id, weekIdx, mode, paidCash: 0, paidCard: 0, paidAmount: 0, dailyAmounts: {} };
      return { ...prev, weeklyPayments: { ...prev.weeklyPayments, [k]: rec } };
    });
  };

  const setWeekDay = (car, weekIdx, day, entry) => {
    const k = weekKey(year, month, car.id, weekIdx);
    update((prev) => {
      const existing = prev.weeklyPayments[k] || { year, month, carId: car.id, weekIdx, mode: "daily", paidCash: 0, paidCard: 0, paidAmount: 0, dailyAmounts: {} };
      const prevDay = (existing.dailyAmounts || {})[day] || {};
      const merged = { worked: true, cash: 0, card: 0, note: "", ...prevDay, ...entry };
      if (!merged.worked) { merged.cash = 0; merged.card = 0; }
      const dailyAmounts = { ...(existing.dailyAmounts || {}), [day]: merged };
      const paidCash = Object.values(dailyAmounts).reduce((s, d) => s + (d.worked === false ? 0 : Number(d.cash || 0)), 0);
      const paidCard = Object.values(dailyAmounts).reduce((s, d) => s + (d.worked === false ? 0 : Number(d.card || 0)), 0);
      const paidAmount = paidCash + paidCard;
      const rec = { ...existing, year, month, carId: car.id, weekIdx, mode: "daily", dailyAmounts, paidCash, paidCard, paidAmount };
      return { ...prev, weeklyPayments: { ...prev.weeklyPayments, [k]: rec } };
    });
  };

  if (data.cars.length === 0) {
    return <div className="card"><EmptyState text="Adaugă cel puțin o mașină pentru a folosi calendarul." /></div>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="btn" style={{ padding: 8 }} onClick={() => changeMonth(-1)}><ChevronLeft size={16} /></button>
        <div className="disp" style={{ fontSize: 18, fontWeight: 700, minWidth: 170, textAlign: "center" }}>{MONTHS_RO[month]} {year}</div>
        <button className="btn" style={{ padding: 8 }} onClick={() => changeMonth(1)}><ChevronRight size={16} /></button>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Caută mașină după număr, marcă sau model…" />
      </div>

      {filteredCars.length === 0 ? (
        <div className="card"><EmptyState text="Nicio mașină găsită pentru căutarea asta." /></div>
      ) : (
        filteredCars.map((car) => (
          <CarWeekCard
            key={car.id} car={car} data={data} year={year} month={month} ranges={ranges}
            todayIdx={todayIdx} driver={data.drivers.find((d) => d.id === car.driverId)}
            expanded={expandedId === car.id}
            onToggle={() => setExpandedId(expandedId === car.id ? null : car.id)}
            onSetWeekTotal={(weekIdx, cash, card) => setWeekTotal(car, weekIdx, cash, card)}
            onSetWeekMode={(weekIdx, mode) => setWeekMode(car, weekIdx, mode)}
            onSetWeekDay={(weekIdx, day, entry) => setWeekDay(car, weekIdx, day, entry)}
          />
        ))
      )}
    </div>
  );
}

function CarWeekCard({ car, data, year, month, ranges, todayIdx, driver, expanded, onToggle, onSetWeekTotal, onSetWeekMode, onSetWeekDay }) {
  const carryover = carryoverFromPrevMonth(data, car, year, month);
  const planTotal = monthlyPlanWithCarry(data, car, year, month);
  const paidTotal = monthlyPaid(data, year, month, car.id);
  const restTotal = Math.max(planTotal - paidTotal, 0);
  const rowStatus = restTotal <= 0 ? "paid" : paidTotal > 0 ? "partial" : "unpaid";

  return (
    <div className="card" style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", color: "var(--text)", textAlign: "left" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <ChevronRight size={16} color="var(--muted)" style={{ transform: expanded ? "rotate(90deg)" : "none", transition: ".15s", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div className="disp" style={{ fontWeight: 700, fontSize: 15 }}>{car.nr}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{driver ? driver.nume : "nealocat"} · {fmtRate(car)}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <StatusPill status={rowStatus} restanta={restTotal} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10.5, color: "var(--muted)" }}>Plan lună</div>
            <div className="mono" style={{ fontWeight: 700, fontSize: 13.5 }}>{fmtMoney(planTotal)}</div>
          </div>
        </div>
      </button>

      {expanded && (
        <div style={{ padding: "0 16px 16px" }}>
          {carryover > 0 && (
            <div style={{ fontSize: 12, color: "var(--orange)", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <AlertTriangle size={13} /> din care {fmtMoney(carryover)} restanță din luna trecută
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            {ranges.map((r, i) => (
              <WeekRow
                key={i} car={car} data={data} year={year} month={month} weekIdx={i} range={r} ranges={ranges} isCurrent={i === todayIdx}
                onSetTotal={(cash, card) => onSetWeekTotal(i, cash, card)}
                onSetMode={(mode) => onSetWeekMode(i, mode)}
                onSetDay={(day, cash, card) => onSetWeekDay(i, day, cash, card)}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: 16, fontSize: 12.5, borderTop: "1px solid var(--border)", paddingTop: 8, flexWrap: "wrap" }}>
            <div>Adus: <span className="mono" style={{ color: "var(--green)", fontWeight: 700 }}>{fmtMoney(paidTotal)}</span></div>
            <div>Rest: <span className="mono" style={{ color: restTotal > 0 ? "var(--orange)" : "var(--muted)", fontWeight: 700 }}>{fmtMoney(restTotal)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

function WeekRow({ car, data, year, month, weekIdx, range, ranges, isCurrent, onSetTotal, onSetMode, onSetDay }) {
  const rec = weeklyRecord(data, year, month, car.id, weekIdx);
  const plan = weekPlan(data, car, year, month, weekIdx, weekRanges(year, month));
  const mode = rec && rec.mode === "daily" ? "daily" : "total";
  const [cash, setCash] = useState(rec ? rec.paidCash : "");
  const [card, setCard] = useState(rec ? rec.paidCard : "");

  useEffect(() => {
    setCash(rec ? rec.paidCash : "");
    setCard(rec ? rec.paidCard : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, weekIdx, mode]);

  const paid = rec ? rec.paidAmount : null;
  const status = statusOf(plan, paid);
  const colors = { paid: "var(--green)", unpaid: "var(--red)", partial: "var(--orange)", pending: "var(--muted)" };
  const rest = Math.max(plan - (paid || 0), 0);

  const commitTotal = () => onSetTotal(cash, card);
  const days = weekDays(year, month, weekIdx, ranges);

  return (
    <div className="weekrow" style={{ display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: isCurrent ? 700 : 500, display: "flex", alignItems: "center", gap: 6 }}>
            Săpt {weekIdx + 1} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({range.start}–{range.end})</span>
            {isCurrent && <span className="pill" style={{ background: "#f2b70522", color: "var(--amber)" }}>curentă</span>}
          </div>
          <div style={{ fontSize: 11.5, color: colors[status] }}>
            Plan {fmtMoney(plan)}{paid != null ? ` · adus ${fmtMoney(paid)}` : ""}{status === "partial" ? ` · mai are ${fmtMoney(rest)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="modetoggle">
            <button type="button" className={mode === "total" ? "active" : ""} onClick={() => onSetMode("total")}>Total</button>
            <button type="button" className={mode === "daily" ? "active" : ""} onClick={() => onSetMode("daily")}>Pe zile</button>
          </div>
          <StatusPill status={status} restanta={rest} />
        </div>
      </div>

      {mode === "total" ? (
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <div style={{ width: 90 }}>
            <input type="number" placeholder="Numerar" value={cash} onChange={(e) => setCash(e.target.value)} onBlur={commitTotal} />
          </div>
          <div style={{ width: 90 }}>
            <input type="number" placeholder="Card" value={card} onChange={(e) => setCard(e.target.value)} onBlur={commitTotal} />
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {days.map((day) => (
            <DayRow key={day} year={year} month={month} day={day} rec={rec} onSetDay={onSetDay} />
          ))}
        </div>
      )}
    </div>
  );
}

function DayRow({ year, month, day, rec, onSetDay }) {
  const existing = rec && rec.dailyAmounts ? rec.dailyAmounts[day] : null;
  const worked = existing ? existing.worked !== false : true;
  const [cash, setCash] = useState(existing ? existing.cash : "");
  const [card, setCard] = useState(existing ? existing.card : "");
  const [note, setNote] = useState(existing ? existing.note || "" : "");

  useEffect(() => {
    setCash(existing ? existing.cash : "");
    setCard(existing ? existing.card : "");
    setNote(existing ? existing.note || "" : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, day]);

  const commitAmounts = () => onSetDay(day, { cash, card, worked: true });
  const commitNote = (val) => onSetDay(day, { note: val, worked: false });
  const toggleWorked = (nextWorked) => {
    if (nextWorked) onSetDay(day, { worked: true });
    else onSetDay(day, { worked: false, note });
  };

  return (
    <div className="dayrow" style={{ display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 12, color: "var(--muted)", width: 62, flexShrink: 0 }}>{dayLabel(year, month, day)}</div>
        <div className="modetoggle">
          <button type="button" className={worked ? "active" : ""} onClick={() => toggleWorked(true)}>A lucrat</button>
          <button type="button" className={!worked ? "active" : ""} onClick={() => toggleWorked(false)}>Nu a lucrat</button>
        </div>
      </div>
      {worked ? (
        <div style={{ display: "flex", gap: 8, marginTop: 6, marginLeft: 70 }}>
          <input type="number" placeholder="Numerar" value={cash} onChange={(e) => setCash(e.target.value)} onBlur={commitAmounts} />
          <input type="number" placeholder="Card" value={card} onChange={(e) => setCard(e.target.value)} onBlur={commitAmounts} />
        </div>
      ) : (
        <div style={{ marginTop: 6, marginLeft: 70 }}>
          <input
            type="text" placeholder="Motiv (ex: service, liber, concediu)"
            value={note} onChange={(e) => setNote(e.target.value)} onBlur={(e) => commitNote(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

/* ============================== INSURANCE ============================== */

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(todayISO());
  const target = new Date(dateStr);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}
function insuranceStatus(days) {
  if (days == null) return "unknown";
  if (days < 0) return "expired";
  if (days <= 30) return "soon";
  return "ok";
}

function InsuranceView({ data, update }) {
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("toate");
  const empty = { carId: data.cars[0] ? data.cars[0].id : "", tip: "Asigurare simplă", dataExpirare: "" };

  const save = (ins) => {
    update((prev) => {
      const insurances = ins.id ? prev.insurances.map((i) => (i.id === ins.id ? ins : i)) : [...prev.insurances, { ...ins, id: uid() }];
      return { ...prev, insurances };
    });
    setEditing(null);
  };
  const remove = (id) => update((prev) => ({ ...prev, insurances: prev.insurances.filter((i) => i.id !== id) }));

  const sorted = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...data.insurances]
      .filter((ins) => {
        if (statusFilter !== "toate" && insuranceStatus(daysUntil(ins.dataExpirare)) !== statusFilter) return false;
        if (!term) return true;
        const car = data.cars.find((c) => c.id === ins.carId);
        return car && (car.nr.toLowerCase().includes(term) || `${car.marca} ${car.model}`.toLowerCase().includes(term));
      })
      .sort((a, b) => (a.dataExpirare || "").localeCompare(b.dataExpirare || ""));
  }, [data.insurances, data.cars, search, statusFilter]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="disp" style={{ fontSize: 18, fontWeight: 700 }}>Asigurări & documente ({data.insurances.length})</div>
        <button className="btn primary" disabled={data.cars.length === 0} onClick={() => setEditing({ ...empty })}><Plus size={15} />Adaugă</button>
      </div>

      {data.cars.length === 0 ? (
        <div className="card"><EmptyState text="Adaugă mai întâi o mașină, apoi îi poți atașa asigurări." /></div>
      ) : (
        <>
          <div className="field" style={{ marginBottom: 10 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Caută mașină după număr, marcă sau model…" />
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { id: "toate", label: "Toate" },
              { id: "ok", label: "Valabile" },
              { id: "soon", label: "Expiră curând" },
              { id: "expired", label: "Expirate" },
            ].map((f) => (
              <button key={f.id} className={"btn" + (statusFilter === f.id ? " primary" : "")} style={{ padding: "7px 12px", fontSize: 12.5 }} onClick={() => setStatusFilter(f.id)}>{f.label}</button>
            ))}
          </div>
          {sorted.length === 0 ? (
            <div className="card"><EmptyState text="Nimic găsit pentru filtrul ales." /></div>
          ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Mașină</th><th>Tip</th><th>Expiră</th><th>Stare</th><th></th></tr></thead>
            <tbody>
              {sorted.map((ins) => {
                const car = data.cars.find((c) => c.id === ins.carId);
                const days = daysUntil(ins.dataExpirare);
                const status = insuranceStatus(days);
                return (
                  <tr key={ins.id}>
                    <td style={{ fontWeight: 600 }}>{car ? car.nr : <span style={{ color: "var(--muted)" }}>mașină ștearsă</span>}</td>
                    <td>{ins.tip}</td>
                    <td className="mono">{ins.dataExpirare || "—"}</td>
                    <td><InsuranceStatusPill status={status} days={days} /></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn" style={{ padding: 6, marginRight: 6 }} onClick={() => setEditing(ins)}><Pencil size={14} /></button>
                      <button className="btn danger" style={{ padding: 6 }} onClick={() => setConfirm({ message: "Ștergi această asigurare? Această acțiune nu poate fi anulată.", action: () => remove(ins.id) })}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.id ? "Editează" : "Adaugă asigurare/document"}>
          <InsuranceForm ins={editing} cars={data.cars} onSave={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {confirm && (
        <ConfirmModal message={confirm.message} onCancel={() => setConfirm(null)} onConfirm={() => { confirm.action(); setConfirm(null); }} />
      )}
    </div>
  );
}

function InsuranceStatusPill({ status, days }) {
  const map = {
    ok: { label: `Valabilă (${days} zile)`, bg: "#2bb67322", color: "var(--green)" },
    soon: { label: days < 0 ? "Expiră azi" : `Expiră în ${days} zile`, bg: "#f2841c22", color: "var(--orange)" },
    expired: { label: `Expirată de ${Math.abs(days)} zile`, bg: "#e5484d22", color: "var(--red)" },
    unknown: { label: "Fără dată", bg: "#8b93a122", color: "var(--muted)" },
  };
  const m = map[status] || map.unknown;
  return <span className="pill" style={{ background: m.bg, color: m.color }}>{m.label}</span>;
}

function InsuranceForm({ ins, cars, onSave, onCancel }) {
  const [f, setF] = useState(ins);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div>
      <div className="field">
        <label>Mașină</label>
        <select value={f.carId} onChange={(e) => set("carId", e.target.value)}>
          {cars.map((c) => <option key={c.id} value={c.id}>{c.nr} — {c.marca} {c.model}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Tip</label>
        <select value={f.tip} onChange={(e) => set("tip", e.target.value)}>
          {["Asigurare simplă", "Asigurare taxi"].map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="field"><label>Data expirării</label><input type="date" value={f.dataExpirare} onChange={(e) => set("dataExpirare", e.target.value)} /></div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => f.carId && f.dataExpirare && onSave(f)}><Check size={15} />Salvează</button>
        <button className="btn" onClick={onCancel}>Anulează</button>
      </div>
    </div>
  );
}

/* ============================== TECHNICAL INSPECTION ============================== */

function InspectionView({ data, update }) {
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("toate");
  const empty = { carId: data.cars[0] ? data.cars[0].id : "", dataExpirare: "" };

  const save = (insp) => {
    update((prev) => {
      const inspections = insp.id ? prev.inspections.map((i) => (i.id === insp.id ? insp : i)) : [...prev.inspections, { ...insp, id: uid() }];
      return { ...prev, inspections };
    });
    setEditing(null);
  };
  const remove = (id) => update((prev) => ({ ...prev, inspections: prev.inspections.filter((i) => i.id !== id) }));

  const sorted = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...data.inspections]
      .filter((insp) => {
        if (statusFilter !== "toate" && insuranceStatus(daysUntil(insp.dataExpirare)) !== statusFilter) return false;
        if (!term) return true;
        const car = data.cars.find((c) => c.id === insp.carId);
        return car && (car.nr.toLowerCase().includes(term) || `${car.marca} ${car.model}`.toLowerCase().includes(term));
      })
      .sort((a, b) => (a.dataExpirare || "").localeCompare(b.dataExpirare || ""));
  }, [data.inspections, data.cars, search, statusFilter]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="disp" style={{ fontSize: 18, fontWeight: 700 }}>Revizie tehnică ({data.inspections.length})</div>
        <button className="btn primary" disabled={data.cars.length === 0} onClick={() => setEditing({ ...empty })}><Plus size={15} />Adaugă</button>
      </div>

      {data.cars.length === 0 ? (
        <div className="card"><EmptyState text="Adaugă mai întâi o mașină, apoi îi poți atașa o revizie tehnică." /></div>
      ) : (
        <>
          <div className="field" style={{ marginBottom: 10 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Caută mașină după număr, marcă sau model…" />
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { id: "toate", label: "Toate" },
              { id: "ok", label: "Valabile" },
              { id: "soon", label: "Expiră curând" },
              { id: "expired", label: "Expirate" },
            ].map((f) => (
              <button key={f.id} className={"btn" + (statusFilter === f.id ? " primary" : "")} style={{ padding: "7px 12px", fontSize: 12.5 }} onClick={() => setStatusFilter(f.id)}>{f.label}</button>
            ))}
          </div>
          {sorted.length === 0 ? (
            <div className="card"><EmptyState text="Nimic găsit pentru filtrul ales." /></div>
          ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Mașină</th><th>Valabilă până la</th><th>Stare</th><th></th></tr></thead>
            <tbody>
              {sorted.map((insp) => {
                const car = data.cars.find((c) => c.id === insp.carId);
                const days = daysUntil(insp.dataExpirare);
                const status = insuranceStatus(days);
                return (
                  <tr key={insp.id}>
                    <td style={{ fontWeight: 600 }}>{car ? car.nr : <span style={{ color: "var(--muted)" }}>mașină ștearsă</span>}</td>
                    <td className="mono">{insp.dataExpirare || "—"}</td>
                    <td><InsuranceStatusPill status={status} days={days} /></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn" style={{ padding: 6, marginRight: 6 }} onClick={() => setEditing(insp)}><Pencil size={14} /></button>
                      <button className="btn danger" style={{ padding: 6 }} onClick={() => setConfirm({ message: "Ștergi această revizie tehnică? Această acțiune nu poate fi anulată.", action: () => remove(insp.id) })}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.id ? "Editează" : "Adaugă revizie tehnică"}>
          <InspectionForm insp={editing} cars={data.cars} onSave={save} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {confirm && (
        <ConfirmModal message={confirm.message} onCancel={() => setConfirm(null)} onConfirm={() => { confirm.action(); setConfirm(null); }} />
      )}
    </div>
  );
}

function InspectionForm({ insp, cars, onSave, onCancel }) {
  const [f, setF] = useState(insp);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div>
      <div className="field">
        <label>Mașină</label>
        <select value={f.carId} onChange={(e) => set("carId", e.target.value)}>
          {cars.map((c) => <option key={c.id} value={c.id}>{c.nr} — {c.marca} {c.model}</option>)}
        </select>
      </div>
      <div className="field"><label>Valabilă până la</label><input type="date" value={f.dataExpirare} onChange={(e) => set("dataExpirare", e.target.value)} /></div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => f.carId && f.dataExpirare && onSave(f)}><Check size={15} />Salvează</button>
        <button className="btn" onClick={onCancel}>Anulează</button>
      </div>
    </div>
  );
}

/* ============================== FINANCE ============================== */

function FinanceView({ data, update }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const mk = monthKey(year, month);
  const [showExpense, setShowExpense] = useState(false);
  const [showIncome, setShowIncome] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const calendarIncome = Object.values(data.weeklyPayments)
    .filter((p) => p.year === year && p.month === month)
    .reduce((s, p) => s + Number(p.paidAmount || 0), 0);

  const restante = data.cars.reduce((s, car) => {
    const plan = monthlyPlanWithCarry(data, car, year, month);
    const paid = monthlyPaid(data, year, month, car.id);
    return s + Math.max(plan - paid, 0);
  }, 0);

  const extraIncome = data.incomes.filter((i) => i.data.startsWith(mk)).reduce((s, i) => s + Number(i.suma || 0), 0);
  const expensesMonth = data.expenses.filter((e) => e.data.startsWith(mk));
  const totalExpenses = expensesMonth.reduce((s, e) => s + Number(e.suma || 0), 0);
  const totalIncome = calendarIncome + extraIncome;
  const profit = totalIncome - totalExpenses;

  const addExpense = (e) => update((prev) => ({ ...prev, expenses: [...prev.expenses, { ...e, id: uid() }] }));
  const addIncome = (i) => update((prev) => ({ ...prev, incomes: [...prev.incomes, { ...i, id: uid() }] }));
  const delExpense = (id) => update((prev) => ({ ...prev, expenses: prev.expenses.filter((e) => e.id !== id) }));
  const delIncome = (id) => update((prev) => ({ ...prev, incomes: prev.incomes.filter((i) => i.id !== id) }));

  const changeMonth = (delta) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setMonth(m); setYear(y);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button className="btn" style={{ padding: 8 }} onClick={() => changeMonth(-1)}><ChevronLeft size={16} /></button>
        <div className="disp" style={{ fontSize: 18, fontWeight: 700, minWidth: 170, textAlign: "center" }}>{MONTHS_RO[month]} {year}</div>
        <button className="btn" style={{ padding: 8 }} onClick={() => changeMonth(1)}><ChevronRight size={16} /></button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 12, marginBottom: 18 }}>
        <MiniStat label="Venituri" value={fmtMoney(totalIncome)} color="var(--green)" />
        <MiniStat label="Cheltuieli" value={fmtMoney(totalExpenses)} color="var(--red)" />
        <MiniStat label="Profit" value={fmtMoney(profit)} color={profit >= 0 ? "var(--green)" : "var(--red)"} />
        <MiniStat label="Restanțe" value={fmtMoney(restante)} color="var(--orange)" />
      </div>

      <div className="finance-grid" style={{ display: "grid", gap: 14 }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="disp" style={{ fontWeight: 700 }}>Venituri extra</div>
            <button className="btn" onClick={() => setShowIncome(true)}><Plus size={14} />Adaugă</button>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Încasările din calendar ({fmtMoney(calendarIncome)}) intră automat mai sus.</div>
          {data.incomes.filter((i) => i.data.startsWith(mk)).length === 0 ? <EmptyState text="Niciun venit extra luna asta." /> : (
            <table>
              <tbody>
                {data.incomes.filter((i) => i.data.startsWith(mk)).map((i) => (
                  <tr key={i.id}>
                    <td>{i.descriere}</td><td className="mono" style={{ color: "var(--green)" }}>{fmtMoney(i.suma)}</td>
                    <td style={{ textAlign: "right" }}><button className="btn danger" style={{ padding: 5 }} onClick={() => setConfirm({ message: "Ștergi acest venit? Această acțiune nu poate fi anulată.", action: () => delIncome(i.id) })}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="disp" style={{ fontWeight: 700 }}>Cheltuieli</div>
            <button className="btn" onClick={() => setShowExpense(true)}><Plus size={14} />Adaugă</button>
          </div>
          {expensesMonth.length === 0 ? <EmptyState text="Nicio cheltuială luna asta." /> : (
            <table>
              <tbody>
                {expensesMonth.map((e) => (
                  <tr key={e.id}>
                    <td>{e.descriere}<div style={{ fontSize: 11, color: "var(--muted)" }}>{e.categorie}</div></td>
                    <td className="mono" style={{ color: "var(--red)" }}>{fmtMoney(e.suma)}</td>
                    <td style={{ textAlign: "right" }}><button className="btn danger" style={{ padding: 5 }} onClick={() => setConfirm({ message: "Ștergi această cheltuială? Această acțiune nu poate fi anulată.", action: () => delExpense(e.id) })}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showExpense && (
        <Modal onClose={() => setShowExpense(false)} title="Adaugă cheltuială">
          <ExpenseForm onSave={(e) => { addExpense(e); setShowExpense(false); }} onCancel={() => setShowExpense(false)} />
        </Modal>
      )}
      {showIncome && (
        <Modal onClose={() => setShowIncome(false)} title="Adaugă venit extra">
          <IncomeForm onSave={(i) => { addIncome(i); setShowIncome(false); }} onCancel={() => setShowIncome(false)} />
        </Modal>
      )}
      {confirm && (
        <ConfirmModal message={confirm.message} onCancel={() => setConfirm(null)} onConfirm={() => { confirm.action(); setConfirm(null); }} />
      )}
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div className="card">
      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function ExpenseForm({ onSave, onCancel }) {
  const [f, setF] = useState({ data: todayISO(), descriere: "", suma: "", categorie: "Motorină" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div>
      <div className="field"><label>Dată</label><input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} /></div>
      <div className="field"><label>Descriere</label><input value={f.descriere} onChange={(e) => set("descriere", e.target.value)} placeholder="Schimb ulei BMW 520D" /></div>
      <div className="field"><label>Categorie</label>
        <select value={f.categorie} onChange={(e) => set("categorie", e.target.value)}>
          {["Motorină", "Ulei/Service", "Reparații", "Spălătorie", "Asigurare", "Impozite", "Altele"].map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="field"><label>Sumă (lei)</label><input type="number" value={f.suma} onChange={(e) => set("suma", e.target.value)} /></div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => f.descriere && f.suma && onSave({ ...f, suma: Number(f.suma) })}><Check size={15} />Salvează</button>
        <button className="btn" onClick={onCancel}>Anulează</button>
      </div>
    </div>
  );
}

function IncomeForm({ onSave, onCancel }) {
  const [f, setF] = useState({ data: todayISO(), descriere: "", suma: "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div>
      <div className="field"><label>Dată</label><input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} /></div>
      <div className="field"><label>Descriere</label><input value={f.descriere} onChange={(e) => set("descriere", e.target.value)} placeholder="Închiriere ocazională" /></div>
      <div className="field"><label>Sumă (lei)</label><input type="number" value={f.suma} onChange={(e) => set("suma", e.target.value)} /></div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => f.descriere && f.suma && onSave({ ...f, suma: Number(f.suma) })}><Check size={15} />Salvează</button>
        <button className="btn" onClick={onCancel}>Anulează</button>
      </div>
    </div>
  );
}

/* ============================== REPORTS ============================== */

function ReportsView({ data }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const perCar = useMemo(() => data.cars.map((car) => {
    const plan = monthlyPlanWithCarry(data, car, year, month);
    const paid = monthlyPaid(data, year, month, car.id);
    const carryover = carryoverFromPrevMonth(data, car, year, month);
    const driver = data.drivers.find((d) => d.id === car.driverId);
    return { car, driver, plan, paid, rest: Math.max(plan - paid, 0), carryover };
  }).sort((a, b) => b.paid - a.paid), [data, year, month]);

  const changeMonth = (delta) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setMonth(m); setYear(y);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button className="btn" style={{ padding: 8 }} onClick={() => changeMonth(-1)}><ChevronLeft size={16} /></button>
        <div className="disp" style={{ fontSize: 18, fontWeight: 700, minWidth: 170, textAlign: "center" }}>{MONTHS_RO[month]} {year}</div>
        <button className="btn" style={{ padding: 8 }} onClick={() => changeMonth(1)}><ChevronRight size={16} /></button>
      </div>

      {data.cars.length === 0 ? (
        <div className="card"><EmptyState text="Adaugă mașini pentru a vedea rapoarte." /></div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Mașină</th><th>Șofer</th><th>Plan lună</th><th>Adus</th><th>Rest</th></tr></thead>
            <tbody>
              {perCar.map(({ car, driver, plan, paid, rest, carryover }) => (
                <tr key={car.id}>
                  <td style={{ fontWeight: 600 }}>{car.nr}</td>
                  <td>{driver ? driver.nume : "—"}</td>
                  <td className="mono">{fmtMoney(plan)}{carryover > 0 ? <div style={{ fontSize: 10.5, color: "var(--orange)" }}>+{fmtMoney(carryover)} restanță</div> : null}</td>
                  <td className="mono" style={{ color: "var(--green)" }}>{fmtMoney(paid)}</td>
                  <td className="mono" style={{ color: rest > 0 ? "var(--orange)" : "var(--muted)" }}>{fmtMoney(rest)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================== MODAL ============================== */

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="disp" style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
          <button className="btn" style={{ padding: 6 }} onClick={onClose}><X size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
