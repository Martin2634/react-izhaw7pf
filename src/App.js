import React, { useState, useEffect } from "react";

// ── Configuración ─────────────────────────────────────────────
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbztrTTIm0IXTez76By4QVXWGWjDDjObwbALAaIQbjF5Az4WhW_3ib_lPdl2f0QkXbYBeA/exec";

const SUCURSALES_DEFAULT = ["Sucursal 1", "Sucursal 2"];
const COSTOS_FIJOS = ["Alquiler","Expensas","Luz","DirecTV","Internet","Sistema de ventas","Seguros","Suscripciones","Impuestos","Rupturas","Mejoras / Inversiones","Otros"];
const SUELDOS = ["Empleado 1","Empleado 2","Empleado 3","Empleado 4","Retiro Socio (Alejo)","Retiro Socio (Martin)"];
const BASE_PROVEEDORES = ["Rapanui","Eliana - Sandwiches","Chorbet - Tortas","El Molino","Vapers","Nestle","Amore","Stock (mercaderia)","Dulcimasco","Maquina Cafe insumos","AB Logistica","Lipstein","East distribuidora","Discuy","Coronel Rodriguez","EntreDos","Alem","Polietileno"];

// ── Helpers ───────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtCurrency = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
const fmtMonthLabel = (ym) => { const [y,m] = ym.split("-"); return new Date(y, m-1).toLocaleDateString("es-AR",{month:"long",year:"numeric"}); };

const formatAmountInput = (val) => {
  const clean = val.replace(/[^0-9,]/g, "");
  const parts = clean.split(",");
  const integers = parts[0].replace(/\./g, "");
  const formatted = integers.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.length > 1 ? formatted + "," + parts[1].slice(0, 2) : formatted;
};
const parseAmount = (val) => parseFloat(String(val).replace(/\./g, "").replace(",", ".")) || 0;

const parseDate = (val) => {
  if (!val) return todayStr();
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(val))) return String(val);
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return todayStr();
};

const loadLocal = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const saveLocal = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

// Generar lista de meses disponibles para filtro
const getMonthOptions = (entries) => {
  const set = new Set(entries.map(e => e.date?.slice(0,7)).filter(Boolean));
  return Array.from(set).sort().reverse();
};

export default function FlujoCaja() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState("dashboard");

  // Sucursales
  const [sucursales, setSucursales] = useState(() => loadLocal("fc_sucursales", SUCURSALES_DEFAULT));
  const [sucursalActiva, setSucursalActiva] = useState(() => loadLocal("fc_sucursal_activa", SUCURSALES_DEFAULT[0]));
  const [nuevaSucursal, setNuevaSucursal] = useState("");

  // Proveedores
  const [customProveedores, setCustomProveedores] = useState(() => loadLocal("fc_proveedores", []));
  const [newProveedor, setNewProveedor] = useState("");
  const allProveedores = [...BASE_PROVEEDORES, ...customProveedores];

  // Formularios
  const [incomeForm, setIncomeForm] = useState({ amount: "", tipo: "", date: todayStr(), reminder: false });
  const [expenseForm, setExpenseForm] = useState({ amount: "", subcategory: "", item: "", otroTexto: "", date: todayStr(), reminder: false });

  // Filtros historial
  const [filterType, setFilterType] = useState("all");
  const [filterSucursal, setFilterSucursal] = useState("all");
  const [filterMode, setFilterMode] = useState("period"); // period | month | range
  const [filterPeriod, setFilterPeriod] = useState("week");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState(todayStr());

  // Filtros resumen
  const [summaryMode, setSummaryMode] = useState("period");
  const [summaryPeriod, setSummaryPeriod] = useState("week");
  const [summaryMonth, setSummaryMonth] = useState("");
  const [summaryFrom, setSummaryFrom] = useState("");
  const [summaryTo, setSummaryTo] = useState(todayStr());
  const [summarySucursal, setSummarySucursal] = useState("all");

  // WhatsApp
  const [whatsappPhone, setWhatsappPhone] = useState(() => loadLocal("fc_whatsapp_phone", ""));

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  // ── Cargar desde Sheets ──────────────────────────────────────
  useEffect(() => { fetchFromSheets(); }, []);

  const fetchFromSheets = async () => {
    setLoading(true); setSyncing(true);
    try {
      const res = await fetch(`${SHEETS_URL}?action=getAll`);
      const data = await res.json();
      if (data.entries) {
        const mapped = data.entries.map(e => ({
          id: String(e.id),
          type: String(e.tipo),
          amount: parseFloat(e.monto) || 0,
          description: String(e.descripcion || ""),
          category: String(e.categoria || ""),
          date: parseDate(e.fecha),
          status: String(e.estado || "confirmed"),
          sucursal: String(e.sucursal || ""),
          reminder: e.recordatorio === "Si",
          time: ""
        })).filter(e => e.type === "income" || e.type === "expense");
        setEntries(mapped);
      }
    } catch { showToast("No se pudo conectar con Sheets", "error"); }
    setSyncing(false); setLoading(false);
  };

  const sendToSheets = async (entry) => {
    try {
      await fetch(SHEETS_URL, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "add", data: entry })
      });
    } catch {}
  };

  const deleteFromSheets = async (id) => {
    try {
      await fetch(SHEETS_URL, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "delete", id })
      });
    } catch {}
  };

  // ── Agregar registro ─────────────────────────────────────────
  const addEntry = async (type) => {
    const form = type === "income" ? incomeForm : expenseForm;
    if (!form.amount) { showToast("Completá el monto", "error"); return; }

    let description = "", category = "";
    if (type === "income") {
      if (!form.tipo) { showToast("Seleccioná el tipo de ingreso", "error"); return; }
      description = form.tipo; category = form.tipo;
    } else {
      if (!form.subcategory) { showToast("Seleccioná la categoría", "error"); return; }
      if (!form.item) { showToast("Seleccioná el concepto", "error"); return; }
      if (form.item === "Otros" && !form.otroTexto) { showToast("Describí el concepto", "error"); return; }
      description = form.item === "Otros" ? form.otroTexto : form.item;
      category = form.subcategory;
    }

    const entry = {
      id: Date.now(), type,
      amount: parseAmount(form.amount),
      description, category,
      date: form.date,
      sucursal: sucursalActiva,
      time: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
      status: form.date > todayStr() ? "pending" : "confirmed",
      reminder: form.reminder,
    };

    if (type === "income") setIncomeForm({ amount: "", tipo: "", date: todayStr(), reminder: false });
    else setExpenseForm({ amount: "", subcategory: "", item: "", otroTexto: "", date: todayStr(), reminder: false });

    showToast(`${type === "income" ? "Ingreso" : "Egreso"} registrado. Sincronizando...`);
    await sendToSheets(entry);
    await fetchFromSheets();
  };

  const deleteEntry = async (id) => {
    await deleteFromSheets(id);
    showToast("Registro eliminado", "info");
    await fetchFromSheets();
  };

  // ── Cálculos ─────────────────────────────────────────────────
  const now = new Date();
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay() + 1); startOfWeek.setHours(0,0,0,0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const applyDateFilter = (list, mode, period, month, from, to) => {
    if (mode === "period") {
      const confirmed = list.filter(e => e.status === "confirmed");
      if (period === "today") return confirmed.filter(e => e.date === todayStr());
      if (period === "week") return confirmed.filter(e => new Date(e.date+"T00:00:00") >= startOfWeek);
      if (period === "month") return confirmed.filter(e => new Date(e.date+"T00:00:00") >= startOfMonth);
      return confirmed;
    }
    if (mode === "month" && month) return list.filter(e => e.date?.startsWith(month) && e.status === "confirmed");
    if (mode === "range" && from) return list.filter(e => e.date >= from && e.date <= (to || todayStr()) && e.status === "confirmed");
    return list.filter(e => e.status === "confirmed");
  };

  const applySucursalFilter = (list, suc) => suc === "all" ? list : list.filter(e => !e.sucursal || e.sucursal === suc);

  const calcTotals = (list) => {
    const inc = list.filter(e => e.type === "income").reduce((s,e) => s+e.amount, 0);
    const exp = list.filter(e => e.type === "expense").reduce((s,e) => s+e.amount, 0);
    return { inc, exp, bal: inc - exp };
  };

  const getSummaryEntries = () => {
    let list = applyDateFilter(entries, summaryMode, summaryPeriod, summaryMonth, summaryFrom, summaryTo);
    return applySucursalFilter(list, summarySucursal);
  };

  const getHistoryEntries = () => {
    let list = entries
      .filter(e => filterType === "all" || e.type === filterType)
      .filter(e => filterSucursal === "all" || e.sucursal === filterSucursal);
    list = applyDateFilter(list, filterMode, filterPeriod, filterMonth, filterFrom, filterTo);
    return list.sort((a,b) => b.date.localeCompare(a.date) || b.id - a.id);
  };

  const upcomingReminders = entries.filter(e => e.reminder && e.date > todayStr()).sort((a,b) => a.date.localeCompare(b.date));
  const monthOptions = getMonthOptions(entries);

  // Balances dashboard (sucursal activa)
  const dashEntries = (period) => {
    const list = applyDateFilter(applySucursalFilter(entries, sucursalActiva), "period", period, "", "", "");
    return calcTotals(list);
  };

  const categoryBreakdown = (type, summaryList) => {
    const map = {};
    summaryList.filter(e => e.type === type).forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  };

  // WhatsApp
  const sendWhatsapp = () => {
    const list = getSummaryEntries();
    const { inc, exp, bal } = calcTotals(list);
    const sucLabel = summarySucursal === "all" ? "Todas las sucursales" : summarySucursal;
    const msg = `RESUMEN FLUJOCAJA\n${sucLabel}\n\nINGRESOS: ${fmtCurrency(inc)}\nEGRESOS: ${fmtCurrency(exp)}\nBALANCE: ${fmtCurrency(bal)}\n\nFlujoCaja`;
    const phone = whatsappPhone.replace(/\D/g,"");
    if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    else showToast("Configurá tu número en Ajustes", "error");
  };

  // ── Estilos ───────────────────────────────────────────────────
  const G = "74,222,128"; const R = "248,113,113";
  const s = {
    app: { fontFamily:"'DM Sans',sans-serif", background:"#0b0f1a", minHeight:"100vh", color:"#e8eaf0" },
    bg: { position:"fixed", inset:0, zIndex:0, background:"radial-gradient(ellipse 80% 50% at 20% 20%,rgba(16,110,60,0.12) 0%,transparent 60%),radial-gradient(ellipse 60% 40% at 80% 80%,rgba(180,30,30,0.1) 0%,transparent 60%)", pointerEvents:"none" },
    wrap: { position:"relative", zIndex:1, maxWidth:1200, margin:"0 auto", padding:"0 12px 40px" },

    // Header responsive
    header: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 0 10px", borderBottom:"1px solid rgba(255,255,255,0.07)", flexWrap:"wrap", gap:8 },
    logo: { fontSize:20, fontWeight:700, letterSpacing:-0.5, color:"#fff" },
    logoAccent: { color:"#4ade80" },
    syncDot: { width:7, height:7, borderRadius:"50%", background: syncing ? "#fbbf24" : "#4ade80", display:"inline-block", marginLeft:5, verticalAlign:"middle" },
    refreshBtn: { background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:14, marginLeft:2, padding:0, verticalAlign:"middle" },

    // Sucursal selector
    sucursalBar: { display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", padding:"8px 0" },
    sucBtn: (active) => ({ padding:"5px 14px", borderRadius:20, border:`1px solid ${active?"rgba(99,102,241,0.7)":"rgba(255,255,255,0.1)"}`, background:active?"rgba(99,102,241,0.2)":"transparent", color:active?"#818cf8":"#64748b", cursor:"pointer", fontSize:12, fontWeight:600, transition:"all .2s" }),

    // Nav responsive
    nav: { display:"flex", gap:4, flexWrap:"wrap" },
    navBtn: (active) => ({ padding:"6px 12px", borderRadius:8, border:`1px solid ${active?"rgba(74,222,128,0.5)":"rgba(255,255,255,0.1)"}`, background:active?"rgba(74,222,128,0.12)":"transparent", color:active?"#4ade80":"#94a3b8", cursor:"pointer", fontSize:12, fontWeight:500 }),

    // Balance cards responsive
    balanceRow: { display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, margin:"16px 0 14px" },
    balCard: (color) => ({ background:`rgba(${color},0.08)`, border:`1px solid rgba(${color},0.2)`, borderRadius:12, padding:"12px 14px" }),
    balLabel: { fontSize:10, fontWeight:600, letterSpacing:1, textTransform:"uppercase", color:"#64748b", marginBottom:3 },
    balAmount: (pos) => ({ fontSize:20, fontWeight:700, color:pos?"#4ade80":"#f87171", letterSpacing:-0.5 }),
    balSub: { fontSize:10, color:"#475569", marginTop:2 },

    // Grid responsive
    grid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 },
    panel: (color) => ({ background:`rgba(${color},0.05)`, border:`1px solid rgba(${color},0.18)`, borderRadius:14, padding:16 }),
    panelHead: (color) => ({ display:"flex", alignItems:"center", gap:8, marginBottom:14, paddingBottom:10, borderBottom:`1px solid rgba(${color},0.15)` }),
    panelTitle: (color) => ({ fontSize:13, fontWeight:700, letterSpacing:0.5, textTransform:"uppercase", color:`rgb(${color})` }),
    dot: (color) => ({ width:7, height:7, borderRadius:"50%", background:`rgb(${color})`, boxShadow:`0 0 7px rgb(${color})`, flexShrink:0 }),

    label: { fontSize:10, fontWeight:600, color:"#64748b", letterSpacing:0.5, textTransform:"uppercase", marginBottom:3, display:"block" },
    input: (accent) => ({ width:"100%", background:"rgba(255,255,255,0.05)", border:`1px solid rgba(${accent},0.2)`, borderRadius:7, padding:"8px 10px", color:"#e8eaf0", fontSize:13, outline:"none", boxSizing:"border-box" }),
    select: (accent) => ({ width:"100%", background:"#131825", border:`1px solid rgba(${accent},0.2)`, borderRadius:7, padding:"8px 10px", color:"#e8eaf0", fontSize:13, outline:"none", cursor:"pointer", boxSizing:"border-box" }),
    mb8: { marginBottom:8 },
    row2: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 },
    btn: (color) => ({ width:"100%", padding:"10px", borderRadius:8, border:"none", background:`rgba(${color},0.85)`, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", marginTop:4 }),
    checkRow: { display:"flex", alignItems:"center", gap:6 },

    // Subcategory buttons
    subCatRow: { display:"flex", gap:6, marginBottom:8 },
    subCatBtn: (active, color) => ({ flex:1, padding:"7px 4px", borderRadius:7, border:`1px solid rgba(${color},${active?"0.6":"0.2"})`, background:active?`rgba(${color},0.18)`:`rgba(${color},0.04)`, color:active?`rgb(${color})`:"#64748b", cursor:"pointer", fontSize:10, fontWeight:600, textAlign:"center", lineHeight:1.4 }),

    entryList: { marginTop:10, display:"flex", flexDirection:"column", gap:5, maxHeight:180, overflowY:"auto" },
    entryItem: (color) => ({ display:"flex", alignItems:"center", gap:8, background:`rgba(${color},0.06)`, border:`1px solid rgba(${color},0.12)`, borderRadius:8, padding:"7px 9px" }),
    entryAmt: (color) => ({ fontSize:14, fontWeight:700, color:`rgb(${color})`, minWidth:70, textAlign:"right", flexShrink:0 }),
    entryDesc: { fontSize:11, color:"#cbd5e1", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
    entryCat: { fontSize:9, color:"#475569", marginTop:1 },
    delBtn: { background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:13, padding:"0 2px", flexShrink:0 },

    // Reminders
    reminderCard: { display:"flex", alignItems:"center", gap:10, background:"rgba(251,191,36,0.07)", border:"1px solid rgba(251,191,36,0.2)", borderRadius:9, padding:"9px 12px", marginBottom:7 },
    reminderDot: { width:7, height:7, borderRadius:"50%", background:"#fbbf24", flexShrink:0 },

    // Filter bar
    filterBar: { display:"flex", gap:6, marginBottom:12, flexWrap:"wrap", alignItems:"center" },
    filterBtn: (active) => ({ padding:"4px 10px", borderRadius:6, border:`1px solid ${active?"rgba(99,102,241,0.5)":"rgba(255,255,255,0.1)"}`, background:active?"rgba(99,102,241,0.15)":"transparent", color:active?"#818cf8":"#64748b", cursor:"pointer", fontSize:11, fontWeight:600 }),
    filterLabel: { fontSize:11, color:"#475569", fontWeight:600 },
    filterInput: { background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:6, padding:"4px 8px", color:"#e8eaf0", fontSize:11, outline:"none" },

    // History table
    tableWrap: { overflowX:"auto", WebkitOverflowScrolling:"touch" },
    histTable: { width:"100%", borderCollapse:"collapse", fontSize:11, minWidth:520 },
    histTh: { textAlign:"left", color:"#475569", fontWeight:600, fontSize:9, letterSpacing:0.5, textTransform:"uppercase", padding:"5px 8px", borderBottom:"1px solid rgba(255,255,255,0.06)" },
    histTd: { padding:"8px", borderBottom:"1px solid rgba(255,255,255,0.04)", verticalAlign:"middle" },
    badge: (type) => ({ display:"inline-block", padding:"2px 7px", borderRadius:4, fontSize:9, fontWeight:600, background:type==="income"?"rgba(74,222,128,0.15)":"rgba(248,113,113,0.15)", color:type==="income"?"#4ade80":"#f87171" }),
    sucBadge: { display:"inline-block", padding:"2px 6px", borderRadius:4, fontSize:9, background:"rgba(99,102,241,0.15)", color:"#818cf8" },
    pendingBadge: { display:"inline-block", padding:"2px 7px", borderRadius:4, fontSize:9, background:"rgba(251,191,36,0.15)", color:"#fbbf24" },

    // Summary
    summaryCard: { background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:16, marginBottom:12 },
    sectionTitle: { fontSize:11, fontWeight:700, letterSpacing:1, textTransform:"uppercase", color:"#475569", marginBottom:8 },
    catRow: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 },
    catBar: (pct,color) => ({ height:3, borderRadius:2, background:`rgb(${color})`, width:`${pct}%`, marginTop:1 }),

    // Settings
    settingInput: { width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:7, padding:"8px 10px", color:"#e8eaf0", fontSize:12, outline:"none", boxSizing:"border-box", marginBottom:6 },
    settingLabel: { fontSize:11, fontWeight:600, color:"#94a3b8", marginBottom:5, display:"block" },
    infoBox: { background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:9, padding:12, fontSize:11, color:"#a5b4fc", lineHeight:1.7 },

    toast: (type) => ({ position:"fixed", bottom:20, right:16, left:16, zIndex:9999, background:type==="error"?"#7f1d1d":type==="info"?"#1e3a5f":"#14532d", border:`1px solid ${type==="error"?"#ef4444":type==="info"?"#3b82f6":"#22c55e"}`, color:"#fff", borderRadius:9, padding:"11px 16px", fontSize:12, fontWeight:500, boxShadow:"0 8px 32px rgba(0,0,0,0.4)", maxWidth:500, margin:"0 auto" }),
  };

  // ── Date filter UI helper ─────────────────────────────────────
  const renderDateFilters = (mode, setMode, period, setPeriod, month, setMonth, from, setFrom, to, setTo) => (
    <div style={s.filterBar}>
      <span style={s.filterLabel}>Período:</span>
      {[["period","Rápido"],["month","Por mes"],["range","Rango"]].map(([v,l]) => (
        <button key={v} style={s.filterBtn(mode===v)} onClick={() => setMode(v)}>{l}</button>
      ))}
      {mode === "period" && [["today","Hoy"],["week","Semana"],["month","Mes"],["all","Todo"]].map(([v,l]) => (
        <button key={v} style={s.filterBtn(period===v)} onClick={() => setPeriod(v)}>{l}</button>
      ))}
      {mode === "month" && (
        <select style={s.filterInput} value={month} onChange={e => setMonth(e.target.value)}>
          <option value="">Seleccionar mes...</option>
          {monthOptions.map(m => <option key={m} value={m}>{fmtMonthLabel(m)}</option>)}
        </select>
      )}
      {mode === "range" && <>
        <input type="date" style={s.filterInput} value={from} onChange={e => setFrom(e.target.value)} />
        <span style={s.filterLabel}>→</span>
        <input type="date" style={s.filterInput} value={to} onChange={e => setTo(e.target.value)} />
      </>}
    </div>
  );

  // ── Render Dashboard ─────────────────────────────────────────
  const renderDashboard = () => (
    <>
      {/* Balance cards */}
      <div style={s.balanceRow}>
        {[["today","Hoy"],["week","Semana"],["month","Mes"]].map(([p,label]) => {
          const {inc,exp,bal} = dashEntries(p);
          return (
            <div key={p} style={s.balCard(bal>=0?G:R)}>
              <div style={s.balLabel}>{label}</div>
              <div style={s.balAmount(bal>=0)}>{fmtCurrency(bal)}</div>
              <div style={s.balSub}>↑{fmtCurrency(inc)} ↓{fmtCurrency(exp)}</div>
            </div>
          );
        })}
      </div>

      {/* Panels */}
      <div style={s.grid}>
        {/* INGRESOS */}
        <div style={s.panel(G)}>
          <div style={s.panelHead(G)}><div style={s.dot(G)} /><span style={s.panelTitle(G)}>Ingresos</span></div>
          <div style={s.mb8}>
            <label style={s.label}>Tipo de ingreso</label>
            <select style={s.select(G)} value={incomeForm.tipo} onChange={e => setIncomeForm(p=>({...p,tipo:e.target.value}))}>
              <option value="">Seleccionar...</option>
              {["Venta turno mañana","Venta turno tarde","Venta turno noche","Aporte capital","Ingresos extras"].map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={s.mb8}>
            <label style={s.label}>Monto ($)</label>
            <input style={s.input(G)} type="text" inputMode="decimal" placeholder="0" value={incomeForm.amount} onChange={e=>setIncomeForm(p=>({...p,amount:formatAmountInput(e.target.value)}))} />
          </div>
          <div style={s.row2}>
            <div>
              <label style={s.label}>Fecha</label>
              <input type="date" style={s.input(G)} value={incomeForm.date} onChange={e=>setIncomeForm(p=>({...p,date:e.target.value}))} />
            </div>
            <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}>
              <div style={s.checkRow}>
                <input type="checkbox" id="inc-rem" checked={incomeForm.reminder} onChange={e=>setIncomeForm(p=>({...p,reminder:e.target.checked}))} style={{accentColor:"#4ade80"}} />
                <label htmlFor="inc-rem" style={{fontSize:11,color:"#64748b",cursor:"pointer"}}>Recordatorio</label>
              </div>
            </div>
          </div>
          <button style={s.btn("16,160,70")} onClick={()=>addEntry("income")}>+ Registrar Ingreso</button>
          <div style={s.entryList}>
            {entries.filter(e=>e.type==="income"&&e.sucursal===sucursalActiva).slice(0,5).map(e=>(
              <div key={e.id} style={s.entryItem(G)}>
                <div style={{flex:1,overflow:"hidden"}}>
                  <div style={s.entryDesc}>{e.description}</div>
                  <div style={s.entryCat}>{fmtDate(e.date)}</div>
                </div>
                <div style={s.entryAmt(G)}>{fmtCurrency(e.amount)}</div>
                <button style={s.delBtn} onClick={()=>deleteEntry(e.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* EGRESOS */}
        <div style={s.panel(R)}>
          <div style={s.panelHead(R)}><div style={s.dot(R)} /><span style={s.panelTitle(R)}>Egresos</span></div>
          <div style={s.mb8}>
            <label style={s.label}>Categoría</label>
            <div style={s.subCatRow}>
              {[["Costos fijos","💰"],["Proveedores","🚚"],["Sueldos","👤"]].map(([cat,icon])=>(
                <button key={cat} onClick={()=>setExpenseForm(p=>({...p,subcategory:cat,item:""}))}
                  style={s.subCatBtn(expenseForm.subcategory===cat,R)}>
                  {icon}<br/>{cat}
                </button>
              ))}
            </div>
          </div>
          {expenseForm.subcategory==="Costos fijos" && (
            <div style={s.mb8}>
              <label style={s.label}>Concepto</label>
              <select style={s.select(R)} value={expenseForm.item} onChange={e=>setExpenseForm(p=>({...p,item:e.target.value,otroTexto:""}))}>
                <option value="">Seleccionar...</option>
                {COSTOS_FIJOS.map(c=><option key={c}>{c}</option>)}
              </select>
              {expenseForm.item==="Otros" && <input style={{...s.input(R),marginTop:5}} placeholder="Describir..." value={expenseForm.otroTexto} onChange={e=>setExpenseForm(p=>({...p,otroTexto:e.target.value}))} />}
            </div>
          )}
          {expenseForm.subcategory==="Proveedores" && (
            <div style={s.mb8}>
              <label style={s.label}>Proveedor</label>
              <select style={s.select(R)} value={expenseForm.item} onChange={e=>setExpenseForm(p=>({...p,item:e.target.value}))}>
                <option value="">Seleccionar...</option>
                {allProveedores.map(c=><option key={c}>{c}</option>)}
              </select>
              <div style={{display:"flex",gap:5,marginTop:5}}>
                <input style={{...s.input(R),flex:1}} placeholder="Nuevo proveedor..." value={newProveedor} onChange={e=>setNewProveedor(e.target.value)} />
                <button onClick={()=>{if(newProveedor.trim()){const u=[...customProveedores,newProveedor.trim()];setCustomProveedores(u);saveLocal("fc_proveedores",u);setNewProveedor("");showToast("Proveedor agregado");}}} style={{padding:"7px 10px",borderRadius:7,border:"1px solid rgba(248,113,113,0.3)",background:"rgba(248,113,113,0.1)",color:"#f87171",cursor:"pointer",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>+ Agregar</button>
              </div>
            </div>
          )}
          {expenseForm.subcategory==="Sueldos" && (
            <div style={s.mb8}>
              <label style={s.label}>Empleado / Socio</label>
              <select style={s.select(R)} value={expenseForm.item} onChange={e=>setExpenseForm(p=>({...p,item:e.target.value}))}>
                <option value="">Seleccionar...</option>
                {SUELDOS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div style={s.mb8}>
            <label style={s.label}>Monto ($)</label>
            <input style={s.input(R)} type="text" inputMode="decimal" placeholder="0" value={expenseForm.amount} onChange={e=>setExpenseForm(p=>({...p,amount:formatAmountInput(e.target.value)}))} />
          </div>
          <div style={s.row2}>
            <div>
              <label style={s.label}>Fecha</label>
              <input type="date" style={s.input(R)} value={expenseForm.date} onChange={e=>setExpenseForm(p=>({...p,date:e.target.value}))} />
            </div>
            <div style={{display:"flex",alignItems:"flex-end",paddingBottom:2}}>
              <div style={s.checkRow}>
                <input type="checkbox" id="exp-rem" checked={expenseForm.reminder} onChange={e=>setExpenseForm(p=>({...p,reminder:e.target.checked}))} style={{accentColor:"#f87171"}} />
                <label htmlFor="exp-rem" style={{fontSize:11,color:"#64748b",cursor:"pointer"}}>Recordatorio</label>
              </div>
            </div>
          </div>
          <button style={s.btn("200,30,30")} onClick={()=>addEntry("expense")}>+ Registrar Egreso</button>
          <div style={s.entryList}>
            {entries.filter(e=>e.type==="expense"&&e.sucursal===sucursalActiva).slice(0,5).map(e=>(
              <div key={e.id} style={s.entryItem(R)}>
                <div style={{flex:1,overflow:"hidden"}}>
                  <div style={s.entryDesc}>{e.description}</div>
                  <div style={s.entryCat}>{e.category} · {fmtDate(e.date)}</div>
                </div>
                <div style={s.entryAmt(R)}>-{fmtCurrency(e.amount)}</div>
                <button style={s.delBtn} onClick={()=>deleteEntry(e.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recordatorios */}
      {upcomingReminders.length > 0 && (
        <div style={{margin:"14px 0"}}>
          <div style={s.sectionTitle}>⏰ Recordatorios próximos</div>
          {upcomingReminders.map(e=>(
            <div key={e.id} style={s.reminderCard}>
              <div style={s.reminderDot}/>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:600,color:"#fbbf24"}}>{fmtDate(e.date)}</div>
                <div style={{fontSize:11,color:"#94a3b8"}}>{e.description} · {e.sucursal}</div>
              </div>
              <div style={{fontSize:13,fontWeight:700,color:e.type==="income"?"#4ade80":"#f87171"}}>{e.type==="expense"?"-":""}{fmtCurrency(e.amount)}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // ── Render Historial ─────────────────────────────────────────
  const renderHistory = () => {
    const list = getHistoryEntries();
    return (
      <div style={{marginTop:14}}>
        <div style={s.filterBar}>
          <span style={s.filterLabel}>Tipo:</span>
          {[["all","Todos"],["income","Ingresos"],["expense","Egresos"]].map(([v,l])=>(
            <button key={v} style={s.filterBtn(filterType===v)} onClick={()=>setFilterType(v)}>{l}</button>
          ))}
          <span style={s.filterLabel}>Sucursal:</span>
          <button style={s.filterBtn(filterSucursal==="all")} onClick={()=>setFilterSucursal("all")}>Todas</button>
          {sucursales.map(s2=>(
            <button key={s2} style={s.filterBtn(filterSucursal===s2)} onClick={()=>setFilterSucursal(s2)}>{s2}</button>
          ))}
        </div>
        {renderDateFilters(filterMode,setFilterMode,filterPeriod,setFilterPeriod,filterMonth,setFilterMonth,filterFrom,setFilterFrom,filterTo,setFilterTo)}
        <div style={{fontSize:11,color:"#475569",marginBottom:8}}>{list.length} registros · {fmtCurrency(calcTotals(list.filter(e=>e.type==="income")).inc)} ingresos · {fmtCurrency(calcTotals(list.filter(e=>e.type==="expense")).exp)} egresos</div>
        <div style={s.tableWrap}>
          <table style={s.histTable}>
            <thead>
              <tr>{["Fecha","Tipo","Descripción","Categoría","Sucursal","Monto","Estado",""].map(h=><th key={h} style={s.histTh}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {list.map(e=>(
                <tr key={e.id} style={{opacity:e.status==="pending"?0.7:1}}>
                  <td style={s.histTd}><span style={{fontSize:10,color:"#94a3b8"}}>{fmtDate(e.date)}</span></td>
                  <td style={s.histTd}><span style={s.badge(e.type)}>{e.type==="income"?"Ingreso":"Egreso"}</span></td>
                  <td style={{...s.histTd,maxWidth:160}}><span style={{fontSize:11,color:"#cbd5e1"}}>{e.description}</span></td>
                  <td style={s.histTd}><span style={{fontSize:10,color:"#64748b"}}>{e.category}</span></td>
                  <td style={s.histTd}><span style={s.sucBadge}>{e.sucursal}</span></td>
                  <td style={{...s.histTd,textAlign:"right"}}><span style={{fontSize:12,fontWeight:700,color:e.type==="income"?"#4ade80":"#f87171"}}>{e.type==="expense"?"-":""}{fmtCurrency(e.amount)}</span></td>
                  <td style={s.histTd}>{e.status==="pending"?<span style={s.pendingBadge}>Pendiente</span>:<span style={{fontSize:9,color:"#22c55e"}}>✓</span>}</td>
                  <td style={s.histTd}><button style={s.delBtn} onClick={()=>deleteEntry(e.id)}>✕</button></td>
                </tr>
              ))}
              {list.length===0 && <tr><td colSpan={8} style={{textAlign:"center",padding:24,color:"#475569",fontSize:12}}>Sin registros para los filtros seleccionados</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Render Resúmenes ─────────────────────────────────────────
  const renderSummary = () => {
    const list = getSummaryEntries();
    const {inc,exp,bal} = calcTotals(list);
    const incomeCats = categoryBreakdown("income", list);
    const expenseCats = categoryBreakdown("expense", list);
    const maxInc = incomeCats[0]?.[1]||1;
    const maxExp = expenseCats[0]?.[1]||1;
    return (
      <div style={{marginTop:14}}>
        <div style={s.filterBar}>
          <span style={s.filterLabel}>Sucursal:</span>
          <button style={s.filterBtn(summarySucursal==="all")} onClick={()=>setSummarySucursal("all")}>Todas</button>
          {sucursales.map(s2=>(
            <button key={s2} style={s.filterBtn(summarySucursal===s2)} onClick={()=>setSummarySucursal(s2)}>{s2}</button>
          ))}
        </div>
        {renderDateFilters(summaryMode,setSummaryMode,summaryPeriod,setSummaryPeriod,summaryMonth,setSummaryMonth,summaryFrom,setSummaryFrom,summaryTo,setSummaryTo)}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          <div style={{...s.balCard(G),textAlign:"center"}}><div style={s.balLabel}>Ingresos</div><div style={{...s.balAmount(true),fontSize:18}}>{fmtCurrency(inc)}</div></div>
          <div style={{...s.balCard(R),textAlign:"center"}}><div style={s.balLabel}>Egresos</div><div style={{...s.balAmount(false),fontSize:18}}>{fmtCurrency(exp)}</div></div>
          <div style={{...s.balCard(bal>=0?G:R),textAlign:"center"}}><div style={s.balLabel}>Balance</div><div style={{...s.balAmount(bal>=0),fontSize:18}}>{fmtCurrency(bal)}</div></div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
          <div style={s.summaryCard}>
            <div style={{...s.sectionTitle,color:"#4ade80"}}>Ingresos por categoría</div>
            {incomeCats.length ? incomeCats.map(([cat,amt])=>(
              <div key={cat} style={{marginBottom:8}}>
                <div style={s.catRow}><span style={{fontSize:11,color:"#94a3b8"}}>{cat}</span><span style={{fontSize:12,fontWeight:700,color:"#4ade80"}}>{fmtCurrency(amt)}</span></div>
                <div style={s.catBar((amt/maxInc)*100,G)}/>
              </div>
            )) : <div style={{color:"#475569",fontSize:11}}>Sin datos</div>}
          </div>
          <div style={s.summaryCard}>
            <div style={{...s.sectionTitle,color:"#f87171"}}>Egresos por categoría</div>
            {expenseCats.length ? expenseCats.map(([cat,amt])=>(
              <div key={cat} style={{marginBottom:8}}>
                <div style={s.catRow}><span style={{fontSize:11,color:"#94a3b8"}}>{cat}</span><span style={{fontSize:12,fontWeight:700,color:"#f87171"}}>{fmtCurrency(amt)}</span></div>
                <div style={s.catBar((amt/maxExp)*100,R)}/>
              </div>
            )) : <div style={{color:"#475569",fontSize:11}}>Sin datos</div>}
          </div>
        </div>

        <div style={s.summaryCard}>
          <div style={s.sectionTitle}>📱 Enviar por WhatsApp</div>
          <button onClick={sendWhatsapp} style={{...s.btn("37,99,235"),width:"auto",padding:"9px 20px",fontSize:12}}>Enviar resumen por WhatsApp</button>
          {!whatsappPhone && <div style={{fontSize:10,color:"#f87171",marginTop:5}}>Configurá tu número en Ajustes</div>}
        </div>
      </div>
    );
  };

  // ── Render Ajustes ───────────────────────────────────────────
  const renderSettings = () => (
    <div style={{marginTop:14,maxWidth:560}}>
      <div style={s.summaryCard}>
        <div style={{...s.sectionTitle,marginBottom:10}}>🏢 SUCURSALES</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          {sucursales.map((suc,i)=>(
            <div key={suc} style={{display:"flex",alignItems:"center",gap:4,background:"rgba(99,102,241,0.1)",border:"1px solid rgba(99,102,241,0.3)",borderRadius:6,padding:"4px 10px"}}>
              <span style={{fontSize:12,color:"#818cf8"}}>{suc}</span>
              {sucursales.length > 1 && <button onClick={()=>{const u=sucursales.filter((_,j)=>j!==i);setSucursales(u);saveLocal("fc_sucursales",u);if(sucursalActiva===suc){setSucursalActiva(u[0]);saveLocal("fc_sucursal_activa",u[0]);}}} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:11,padding:0}}>✕</button>}
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:6}}>
          <input style={{...s.settingInput,flex:1,margin:0}} placeholder="Nombre nueva sucursal..." value={nuevaSucursal} onChange={e=>setNuevaSucursal(e.target.value)} />
          <button onClick={()=>{if(nuevaSucursal.trim()&&!sucursales.includes(nuevaSucursal.trim())){const u=[...sucursales,nuevaSucursal.trim()];setSucursales(u);saveLocal("fc_sucursales",u);setNuevaSucursal("");showToast("Sucursal agregada");}}} style={{padding:"7px 14px",borderRadius:7,border:"1px solid rgba(99,102,241,0.4)",background:"rgba(99,102,241,0.15)",color:"#818cf8",cursor:"pointer",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>+ Agregar</button>
        </div>
      </div>

      <div style={s.summaryCard}>
        <div style={{...s.sectionTitle,marginBottom:10}}>📱 WHATSAPP</div>
        <label style={s.settingLabel}>Número con código de país (sin + ni espacios)</label>
        <input style={s.settingInput} placeholder="5492614123456" value={whatsappPhone} onChange={e=>setWhatsappPhone(e.target.value)} />
        <div style={s.infoBox}>Ejemplo Argentina: 5492614123456<br/>(54 = país · 9 = celular · número sin 0 ni 15)</div>
        <button onClick={()=>{saveLocal("fc_whatsapp_phone",whatsappPhone);showToast("Número guardado");}} style={{...s.btn("22,163,74"),width:"auto",padding:"8px 18px",marginTop:10,fontSize:12}}>Guardar número</button>
      </div>

      <div style={{...s.summaryCard,border:"1px solid rgba(248,113,113,0.2)"}}>
        <div style={{...s.sectionTitle,color:"#f87171",marginBottom:8}}>⚠ ZONA DE PELIGRO</div>
        <button onClick={()=>{if(window.confirm("¿Seguro? Se borrará la caché local. Los datos en Sheets no se afectan.")){{saveLocal("fc_entries",[]);showToast("Caché local borrada","info");}}}} style={{...s.btn("180,20,20"),width:"auto",padding:"7px 16px",fontSize:11}}>Borrar caché local</button>
      </div>
    </div>
  );

  // ── Main render ───────────────────────────────────────────────
  return (
    <div style={s.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        ::-webkit-scrollbar{width:3px;height:3px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:2px;}
        button:hover{filter:brightness(1.1);}
        input:focus,select:focus{border-color:rgba(99,102,241,0.5)!important;outline:none;}
        @media(max-width:640px){
          .fc-grid{grid-template-columns:1fr!important;}
          .fc-balance-row{grid-template-columns:1fr 1fr!important;}
          .fc-summary-grid{grid-template-columns:1fr!important;}
          .fc-bal-3{grid-template-columns:1fr 1fr 1fr!important;}
        }
      `}</style>
      <div style={s.bg}/>
      <div style={s.wrap}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.logo}>
            flujo<span style={s.logoAccent}>caja</span>
            <span style={s.syncDot}/>
            <button style={s.refreshBtn} onClick={fetchFromSheets} title="Actualizar">↺</button>
          </div>

          {/* Selector sucursal */}
          <div style={s.sucursalBar}>
            {sucursales.map(suc=>(
              <button key={suc} style={s.sucBtn(sucursalActiva===suc)} onClick={()=>{setSucursalActiva(suc);saveLocal("fc_sucursal_activa",suc);}}>
                {suc}
              </button>
            ))}
          </div>

          {/* Nav */}
          <nav style={s.nav}>
            {[["dashboard","Panel"],["history","Historial"],["summary","Resúmenes"],["settings","Ajustes"]].map(([v,l])=>(
              <button key={v} style={s.navBtn(view===v)} onClick={()=>setView(v)}>{l}</button>
            ))}
          </nav>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{textAlign:"center",padding:"60px 0",color:"#475569"}}>
            <div style={{fontSize:28,marginBottom:10}}>⟳</div>
            <div style={{fontSize:13}}>Cargando datos desde Google Sheets...</div>
          </div>
        ) : (
          <>
            {view==="dashboard" && renderDashboard()}
            {view==="history" && renderHistory()}
            {view==="summary" && renderSummary()}
            {view==="settings" && renderSettings()}
          </>
        )}
      </div>

      {toast && <div style={s.toast(toast.type)}>{toast.msg}</div>}
    </div>
  );
}
