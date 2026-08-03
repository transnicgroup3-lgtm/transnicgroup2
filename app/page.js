"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Car, Users, Calendar as CalendarIcon, Wallet, BarChart3, Plus, X,
  Trash2, Pencil, Check, AlertTriangle, ChevronLeft, ChevronRight,
  Phone, Loader2, TrendingUp, TrendingDown, Gauge
} from "lucide-react";

/* ---------------------------------------------------------------
   Taxi Fleet Pro Cloud (web version)
   Data stored in Supabase via /api/data — same data on every
   device that opens this site.
---------------------------------------------------------------- */

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);
const MONTHS_RO = ["Ianuarie","Februarie","Martie","Aprilie","Mai","Iunie","Iulie","August","Septembrie","Octombrie","Noiembrie","Decembrie"];

const emptyData = () => ({
  cars: [],
  drivers: [],
  payments: {},   // key `${date}__${carId}` -> {date, carId, dueAmount, paidAmount, status}
  expenses: [],
  incomes: [],
});

function fmtMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("ro-RO", { maximumFractionDigits: 0 }) + " lei";
}
function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function monthKey(y, m) { return `${y}-${String(m + 1).padStart(2, "0")}`; }

function statusOf(due, paid) {
  if (paid == null) return "pending";
  if (paid <= 0) return "unpaid";
  if (paid >= due) return "paid";
  return "partial";
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
        setData(json && json.data ? json.data : emptyData());
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
      {tab === "calendar" && <CalendarView data={data} update={update} />}
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
      `}</style>

      <div className="tfp-header">
        <div className="tfp-title">
          <div className="tfp-badge"><Car size={16} color="#14171c" /></div>
          <div>
            <div className="disp" style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>Taxi Fleet Pro</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>sincronizat automat, telefon + calculator</div>
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
    </div>
  );
}

/* ============================== DASHBOARD ============================== */

function Dashboard({ data, setTab }) {
  const today = todayISO();
  const activeCars = data.cars.filter((c) => c.status === "activa").length;
  const inService = data.cars.filter((c) => c.status === "service").length;

  const todayRows = data.cars.map((c) => {
    const p = data.payments[`${today}__${c.id}`];
    const due = p ? p.dueAmount : c.tarif;
    const paid = p ? p.paidAmount : null;
    return { car: c, status: statusOf(due, paid), due, paid };
  });
  const incomeToday = todayRows.reduce((s, r) => s + (r.paid || 0), 0);
  const expensesToday = data.expenses.filter((e) => e.data === today).reduce((s, e) => s + Number(e.suma || 0), 0);
  const profitToday = incomeToday - expensesToday;
  const problemToday = todayRows.filter((r) => r.status === "unpaid" || r.status === "partial").length;

  const stats = [
    { label: "Mașini", value: data.cars.length, icon: Car, sub: `${activeCars} active · ${inService} service` },
    { label: "Șoferi", value: data.drivers.length, icon: Users, sub: `${data.drivers.filter((d) => d.activ).length} activi` },
    { label: "Încasări azi", value: fmtMoney(incomeToday), icon: Wallet, sub: `${todayRows.filter((r) => r.status === "paid").length}/${data.cars.length} plătite integral`, mono: true },
    { label: "Profit azi", value: fmtMoney(profitToday), icon: profitToday >= 0 ? TrendingUp : TrendingDown, sub: `cheltuieli ${fmtMoney(expensesToday)}`, mono: true, accent: profitToday >= 0 },
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

      {problemToday > 0 && (
        <div className="card" style={{ borderColor: "#e5484d55", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={17} color="var(--red)" />
          <div style={{ fontSize: 13.5 }}>{problemToday} mașin{problemToday === 1 ? "ă are" : "i au"} restanță astăzi.</div>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setTab("calendar")}>Deschide calendar</button>
        </div>
      )}

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 10 }} className="disp">Astăzi, pe mașini</div>
        {data.cars.length === 0 ? (
          <EmptyState text="Adaugă prima mașină din secțiunea Mașini." />
        ) : (
          <table>
            <thead><tr><th>Mașină</th><th>Șofer</th><th>Tarif</th><th>Achitat</th><th>Stare</th></tr></thead>
            <tbody>
              {todayRows.map(({ car, status, due, paid }) => {
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
    paid: { label: "Achitat", bg: "#2bb67322", color: "var(--green)" },
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

/* ============================== CARS ============================== */

function CarsView({ data, update }) {
  const [editing, setEditing] = useState(null);
  const empty = { nr: "", marca: "", model: "", tarif: 157, driverId: "", status: "activa" };

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
            <thead><tr><th>Nr.</th><th>Marcă / Model</th><th>Tarif/zi</th><th>Șofer</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.cars.map((c) => {
                const driver = data.drivers.find((d) => d.id === c.driverId);
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.nr}</td>
                    <td>{c.marca} {c.model}</td>
                    <td className="mono">{fmtMoney(c.tarif)}</td>
                    <td>{driver ? driver.nume : <span style={{ color: "var(--muted)" }}>nealocat</span>}</td>
                    <td><CarStatusPill status={c.status} /></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn" style={{ padding: 6, marginRight: 6 }} onClick={() => setEditing(c)}><Pencil size={14} /></button>
                      <button className="btn danger" style={{ padding: 6 }} onClick={() => remove(c.id)}><Trash2 size={14} /></button>
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
      <div className="field"><label>Tarif fix pe zi (lei)</label><input type="number" value={f.tarif} onChange={(e) => set("tarif", Number(e.target.value))} /></div>
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
                      <button className="btn danger" style={{ padding: 6 }} onClick={() => remove(d.id)}><Trash2 size={14} /></button>
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

/* ============================== CALENDAR ============================== */

function CalendarView({ data, update }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [sel, setSel] = useState(null); // {day, car}
  const nDays = daysInMonth(year, month);
  const days = Array.from({ length: nDays }, (_, i) => i + 1);

  const changeMonth = (delta) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setMonth(m); setYear(y);
  };

  const keyFor = (day, carId) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}__${carId}`;

  const saveDay = (day, car, paidAmount) => {
    const dateISO = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const k = keyFor(day, car.id);
    update((prev) => {
      const cur = prev.payments[k];
      const dueAmount = cur ? cur.dueAmount : car.tarif;
      const status = statusOf(dueAmount, paidAmount);
      return {
        ...prev,
        payments: { ...prev.payments, [k]: { date: dateISO, carId: car.id, dueAmount, paidAmount, status } },
      };
    });
    setSel(null);
  };

  if (data.cars.length === 0) {
    return <div className="card"><EmptyState text="Adaugă cel puțin o mașină pentru a folosi calendarul de sdare." /></div>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="btn" style={{ padding: 8 }} onClick={() => changeMonth(-1)}><ChevronLeft size={16} /></button>
        <div className="disp" style={{ fontSize: 18, fontWeight: 700, minWidth: 170, textAlign: "center" }}>{MONTHS_RO[month]} {year}</div>
        <button className="btn" style={{ padding: 8 }} onClick={() => changeMonth(1)}><ChevronRight size={16} /></button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Dot color="var(--green)" />Achitat</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Dot color="var(--orange)" />Parțial</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Dot color="var(--red)" />Neachitat</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Dot color="#3a4150" />Așteptăm</span>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto", padding: 10 }}>
        <table>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, background: "var(--panel)" }}>Mașină</th>
              {days.map((d) => <th key={d} style={{ textAlign: "center", padding: "6px 4px" }}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.cars.map((car) => (
              <tr key={car.id}>
                <td style={{ position: "sticky", left: 0, background: "var(--panel)", fontWeight: 600, whiteSpace: "nowrap" }}>{car.nr}</td>
                {days.map((d) => {
                  const p = data.payments[keyFor(d, car.id)];
                  const status = p ? p.status : "pending";
                  const colors = { paid: "var(--green)", unpaid: "var(--red)", partial: "var(--orange)", pending: "#3a4150" };
                  const title = p
                    ? `${fmtMoney(p.paidAmount)} din ${fmtMoney(p.dueAmount)}` + (p.dueAmount > p.paidAmount ? ` — mai are ${fmtMoney(p.dueAmount - p.paidAmount)}` : "")
                    : `Tarif ${fmtMoney(car.tarif)} — neatins`;
                  return (
                    <td key={d} style={{ padding: 3, textAlign: "center" }}>
                      <button
                        onClick={() => setSel({ day: d, car })}
                        title={title}
                        style={{ width: 26, height: 26, borderRadius: 6, border: "none", cursor: "pointer", background: colors[status], opacity: status === "pending" ? 0.55 : 1 }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Click pe o celulă pentru a marca suma achitată în acea zi. Dacă e mai mică decât tariful, restanța se calculează și se afișează automat.</div>

      {sel && (
        <DayPaymentModal
          day={sel.day} car={sel.car} year={year} month={month}
          record={data.payments[keyFor(sel.day, sel.car.id)]}
          onSave={(amount) => saveDay(sel.day, sel.car, amount)}
          onClose={() => setSel(null)}
        />
      )}
    </div>
  );
}

function DayPaymentModal({ day, car, year, month, record, onSave, onClose }) {
  const due = record ? record.dueAmount : car.tarif;
  const [amount, setAmount] = useState(record ? record.paidAmount : car.tarif);
  const restanta = Math.max(due - Number(amount || 0), 0);
  const dateLabel = `${String(day).padStart(2, "0")} ${MONTHS_RO[month]} ${year}`;

  return (
    <Modal onClose={onClose} title={`${car.nr} — ${dateLabel}`}>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>Tarif fix pe zi: <span className="mono" style={{ color: "var(--text)" }}>{fmtMoney(due)}</span></div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button className="quickbtn" onClick={() => setAmount(due)}>Achitat integral</button>
        <button className="quickbtn" onClick={() => setAmount(0)}>Neachitat</button>
      </div>

      <div className="field">
        <label>Sumă efectiv achitată (lei)</label>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>

      {restanta > 0 && (
        <div style={{ fontSize: 13, color: "var(--orange)", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle size={14} /> Mai are de dat: <span className="mono" style={{ fontWeight: 700 }}>{fmtMoney(restanta)}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => onSave(Number(amount || 0))}><Check size={15} />Salvează</button>
        <button className="btn" onClick={onClose}>Anulează</button>
      </div>
    </Modal>
  );
}

function Dot({ color }) {
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />;
}

/* ============================== FINANCE ============================== */

function FinanceView({ data, update }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const mk = monthKey(year, month);
  const [showExpense, setShowExpense] = useState(false);
  const [showIncome, setShowIncome] = useState(false);

  const monthPayments = Object.values(data.payments).filter((p) => p.date && p.date.startsWith(mk));
  const calendarIncome = monthPayments.reduce((s, p) => s + Number(p.paidAmount || 0), 0);
  const restante = monthPayments.reduce((s, p) => s + Math.max(Number(p.dueAmount || 0) - Number(p.paidAmount || 0), 0), 0);

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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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
                    <td style={{ textAlign: "right" }}><button className="btn danger" style={{ padding: 5 }} onClick={() => delIncome(i.id)}><Trash2 size={13} /></button></td>
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
                    <td style={{ textAlign: "right" }}><button className="btn danger" style={{ padding: 5 }} onClick={() => delExpense(e.id)}><Trash2 size={13} /></button></td>
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
  const mk = monthKey(year, month);

  const perCar = useMemo(() => data.cars.map((car) => {
    const pays = Object.values(data.payments).filter((p) => p.carId === car.id && p.date && p.date.startsWith(mk));
    const paid = pays.reduce((s, p) => s + Number(p.paidAmount || 0), 0);
    const restanta = pays.reduce((s, p) => s + Math.max(Number(p.dueAmount || 0) - Number(p.paidAmount || 0), 0), 0);
    const driver = data.drivers.find((d) => d.id === car.driverId);
    return { car, driver, paid, restanta };
  }).sort((a, b) => b.paid - a.paid), [data, mk]);

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
            <thead><tr><th>Mașină</th><th>Șofer</th><th>Încasat</th><th>Restanțe</th></tr></thead>
            <tbody>
              {perCar.map(({ car, driver, paid, restanta }) => (
                <tr key={car.id}>
                  <td style={{ fontWeight: 600 }}>{car.nr}</td>
                  <td>{driver ? driver.nume : "—"}</td>
                  <td className="mono" style={{ color: "var(--green)" }}>{fmtMoney(paid)}</td>
                  <td className="mono" style={{ color: restanta > 0 ? "var(--orange)" : "var(--muted)" }}>{fmtMoney(restanta)}</td>
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
