import React, { useState, useEffect, useCallback } from "react";

const CATEGORIES_INCOME = ["Ventas turno mañana","Ventas turno tarde","Ventas turno noche","Venta diaria total","Servicios prestados","Cobro de deuda","Transferencia","Otros ingresos"];
const CATEGORIES_EXPENSE = ["Alquiler","Salarios","Servicios (luz/gas/agua)","Proveedores","Impuestos","Mantenimiento","Marketing","Transporte","Otros gastos"];

const formatCurrency = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
const formatDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
const todayStr = () => new Date().toISOString().split("T")[0];

const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxUbS17ty9agIwVK0pvhGghpaTlXz0C8bo78nZlPuBRUFh0inSwYQsa6qYk_0pHZUVOww/exec";

const loadLocal = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const saveLocal = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

const DEMO_ENTRIES = [
  { id: 1, type: "income", amount: 85000, description: "Ventas turno mañana - cafe y medialunas", category: "Ventas turno mañana", date: todayStr(), time: "12:30", status: "confirmed", reminder: false },
  { id: 2, type: "income", amount: 127000, description: "Ventas turno tarde - menu del dia", category: "Ventas turno tarde", date: todayStr(), time: "18:00", status: "confirmed", reminder: false },
  { id: 3, type: "expense", amount: 45000, description: "Pago alquiler local comercial", category: "Alquiler", date: todayStr(), time: "10:00", status: "confirmed", reminder: false },
  { id: 4, type: "expense", amount: 12500, description: "Factura de electricidad", category: "Servicios (luz/gas/agua)", date: todayStr(), time: "09:15", status: "confirmed", reminder: false },
  { id: 5, type: "expense", amount: 38000, description: "Pago proveedor verduras y frutas", category: "Proveedores", date: new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0], time: "11:00", status: "pending", reminder: true },
];

export default function FlujoCaja() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dashboard");
  const [incomeForm, setIncomeForm] = useState({ amount: "", description: "", category: "", date: todayStr(), reminder: false });
  const [expenseForm, setExpenseForm] = useState({ amount: "", description: "", category: "", date: todayStr(), reminder: false });
  const [classifying, setClassifying] = useState({ income: false, expense: false });
  const [toast, setToast] = useState(null);
  const [sheetsUrl, setSheetsUrl] = useState(SHEETS_URL);
  const [whatsappConfig, setWhatsappConfig] = useState(() => loadLocal("fc_whatsapp", { phone: "" }));
  const [syncing, setSyncing] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("week");
  const [summaryPeriod, setSummaryPeriod] = useState("week");

  // Siempre carga desde Sheets al abrir la app
  useEffect(() => { fetchFromSheets(); }, []);

  const fetchFromSheets = async () => {
    setLoading(true);
    setSyncing(true);
    try {
      const res = await fetch(`${SHEETS_URL}?action=getAll`);
      const text = await res.text();
      const data = JSON.parse(text);
      if (data.entries) {
        const mapped = data.entries.map(e => ({
          id: String(e.id),
          type: String(e.tipo),
          amount: parseFloat(e.monto) || 0,
          description: String(e.descripcion || ""),
          category: String(e.categoria || ""),
          date: String(e.fecha || ""),
          status: String(e.estado || "confirmed"),
          reminder: e.recordatorio === "Si",
          time: ""
        })).filter(e => e.type === "income" || e.type === "expense");
        setEntries(mapped);
      }
    } catch { showToast("No se pudo conectar con Sheets", "error"); }
    setSyncing(false);
    setLoading(false);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const classifyWithAI = useCallback(async (description, type, formSetter) => {
    if (!description || description.length < 4) return;
    setClassifying(prev => ({ ...prev, [type]: true }));
    try {
      const cats = type === "income" ? CATEGORIES_INCOME : CATEGORIES_EXPENSE;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 100,
          messages: [{ role: "user", content: `Clasifica esta transaccion en UNA categoria de la lista. Responde SOLO con la categoria exacta, sin mas texto.\n\nDescripcion: "${description}"\nTipo: ${type === "income" ? "INGRESO" : "EGRESO"}\nCategorias disponibles: ${cats.join(", ")}` }]
        })
      });
      const data = await res.json();
      const cat = data.content?.[0]?.text?.trim();
      if (cat && cats.includes(cat)) formSetter(prev => ({ ...prev, category: cat }));
    } catch {}
    setClassifying(prev => ({ ...prev, [type]: false }));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { if (incomeForm.description) classifyWithAI(incomeForm.description, "income", setIncomeForm); }, 900);
    return () => clearTimeout(t);
  }, [incomeForm.description]);

  useEffect(() => {
    const t = setTimeout(() => { if (expenseForm.description) classifyWithAI(expenseForm.description, "expense", setExpenseForm); }, 900);
    return () => clearTimeout(t);
  }, [expenseForm.description]);

  const sendToSheets = async (entry) => {
    if (!sheetsUrl) return;
    setSyncing(true);
    try {
      await fetch(sheetsUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "add", data: entry })
      });
      showToast("Guardado en Google Sheets");
    } catch { showToast("Error al sincronizar con Sheets", "error"); }
    setSyncing(false);
  };

  const deleteFromSheets = async (id) => {
    if (!sheetsUrl) return;
    try {
      await fetch(sheetsUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "delete", id })
      });
    } catch {}
  };

  const syncFromSheets = async () => {
    if (!sheetsUrl) { showToast("Primero configura la URL de Apps Script", "error"); return; }
    setSyncing(true);
    try {
      const res = await fetch(`${sheetsUrl}?action=getAll`);
      const text = await res.text();
      const data = JSON.parse(text);
      if (data.entries) {
        const mapped = data.entries.map(e => ({
          id: String(e.id),
          type: String(e.tipo),
          amount: parseFloat(e.monto) || 0,
          description: String(e.descripcion || ""),
          category: String(e.categoria || ""),
          date: String(e.fecha || ""),
          status: String(e.estado || "confirmed"),
          reminder: e.recordatorio === "Si",
          time: ""
        })).filter(e => e.type === "income" || e.type === "expense");
        setEntries(mapped);
        showToast(`${mapped.length} registros importados de Sheets`);
      } else if (data.error) {
        showToast("Error: " + data.error, "error");
      }
    } catch { showToast("No se pudo leer Sheets. Verifica la URL.", "error"); }
    setSyncing(false);
  };

  const addEntry = async (type) => {
    const form = type === "income" ? incomeForm : expenseForm;
    if (!form.amount || !form.description) { showToast("Completa monto y descripcion", "error"); return; }
    const entry = {
      id: Date.now(), type,
      amount: parseFloat(form.amount),
      description: form.description,
      category: form.category || (type === "income" ? "Otros ingresos" : "Otros gastos"),
      date: form.date,
      time: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
      status: form.date > todayStr() ? "pending" : "confirmed",
      reminder: form.reminder,
    };
    if (type === "income") setIncomeForm({ amount: "", description: "", category: "", date: todayStr(), reminder: false });
    else setExpenseForm({ amount: "", description: "", category: "", date: todayStr(), reminder: false });
    showToast(`${type === "income" ? "Ingreso" : "Egreso"} registrado. Sincronizando...`);
    await sendToSheets(entry);
    await fetchFromSheets();
  };

  const deleteEntry = async (id) => {
    await deleteFromSheets(id);
    showToast("Registro eliminado", "info");
    await fetchFromSheets();
  };

  const now = new Date();
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay() + 1); startOfWeek.setHours(0,0,0,0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const filterByPeriod = (list, period) => {
    const confirmed = list.filter(e => e.status === "confirmed");
    if (period === "today") return confirmed.filter(e => e.date === todayStr());
    if (period === "week") return confirmed.filter(e => new Date(e.date + "T00:00:00") >= startOfWeek);
    if (period === "month") return confirmed.filter(e => new Date(e.date + "T00:00:00") >= startOfMonth);
    return confirmed;
  };

  const totalIncome = (p) => filterByPeriod(entries.filter(e => e.type === "income"), p).reduce((s, e) => s + e.amount, 0);
  const totalExpense = (p) => filterByPeriod(entries.filter(e => e.type === "expense"), p).reduce((s, e) => s + e.amount, 0);
  const balance = (p) => totalIncome(p) - totalExpense(p);
  const upcomingReminders = entries.filter(e => e.reminder && e.date > todayStr()).sort((a, b) => a.date.localeCompare(b.date));

  const filteredHistory = entries
    .filter(e => filterType === "all" || e.type === filterType)
    .filter(e => {
      const d = new Date(e.date + "T00:00:00");
      if (filterPeriod === "today") return e.date === todayStr();
      if (filterPeriod === "week") return d >= startOfWeek;
      if (filterPeriod === "month") return d >= startOfMonth;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const categoryBreakdown = (type, period) => {
    const map = {};
    filterByPeriod(entries.filter(e => e.type === type), period).forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  };

  const generateWhatsappSummary = () => {
    const p = summaryPeriod;
    const inc = totalIncome(p), exp = totalExpense(p), bal = balance(p);
    const label = p === "week" ? "esta semana" : p === "month" ? "este mes" : "hoy";
    const msg = `RESUMEN FLUJO DE CAJA\n${p === "week" ? `Semana del ${startOfWeek.toLocaleDateString("es-AR")}` : p === "month" ? new Date().toLocaleDateString("es-AR",{month:"long",year:"numeric"}) : new Date().toLocaleDateString("es-AR")}\n\nINGRESOS ${label.toUpperCase()}: ${formatCurrency(inc)}\nEGRESOS ${label.toUpperCase()}: ${formatCurrency(exp)}\nBALANCE: ${formatCurrency(bal)}\n\nFlujoCaja`;
    const phone = whatsappConfig.phone.replace(/\D/g, "");
    if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    else showToast("Configura tu numero de WhatsApp en Ajustes", "error");
  };

  const G = "74,222,128"; const R = "248,113,113";
  const s = {
    app: { fontFamily: "'DM Sans', sans-serif", background: "#0b0f1a", minHeight: "100vh", color: "#e8eaf0", position: "relative" },
    bg: { position: "fixed", inset: 0, zIndex: 0, background: "radial-gradient(ellipse 80% 50% at 20% 20%, rgba(16,110,60,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(180,30,30,0.1) 0%, transparent 60%)", pointerEvents: "none" },
    wrap: { position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "0 16px 40px" },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 0 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexWrap: "wrap", gap: 10 },
    logo: { fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: "#fff" },
    logoAccent: { color: "#4ade80" },
    syncDot: { width: 7, height: 7, borderRadius: "50%", background: sheetsUrl ? (syncing ? "#fbbf24" : "#4ade80") : "#475569", display: "inline-block", marginLeft: 6, verticalAlign: "middle" },
    nav: { display: "flex", gap: 6, flexWrap: "wrap" },
    navBtn: (active) => ({ padding: "7px 16px", borderRadius: 8, border: "1px solid " + (active ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.1)"), background: active ? "rgba(74,222,128,0.12)" : "transparent", color: active ? "#4ade80" : "#94a3b8", cursor: "pointer", fontSize: 13, fontWeight: 500 }),
    balanceRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, margin: "24px 0 20px" },
    balCard: (color) => ({ background: `rgba(${color},0.08)`, border: `1px solid rgba(${color},0.2)`, borderRadius: 14, padding: "16px 20px" }),
    balLabel: { fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", marginBottom: 4 },
    balAmount: (pos) => ({ fontSize: 26, fontWeight: 700, color: pos ? "#4ade80" : "#f87171", letterSpacing: -0.5 }),
    balSub: { fontSize: 11, color: "#475569", marginTop: 2 },
    grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
    panel: (color) => ({ background: `rgba(${color},0.05)`, border: `1px solid rgba(${color},0.18)`, borderRadius: 16, padding: 20 }),
    panelHead: (color) => ({ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid rgba(${color},0.15)` }),
    panelTitle: (color) => ({ fontSize: 14, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: `rgb(${color})` }),
    dot: (color) => ({ width: 8, height: 8, borderRadius: "50%", background: `rgb(${color})`, boxShadow: `0 0 8px rgb(${color})` }),
    label: { fontSize: 11, fontWeight: 600, color: "#64748b", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4, display: "block" },
    input: (accent) => ({ width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid rgba(${accent},0.2)`, borderRadius: 8, padding: "9px 12px", color: "#e8eaf0", fontSize: 13, outline: "none", boxSizing: "border-box" }),
    select: (accent) => ({ width: "100%", background: "#131825", border: `1px solid rgba(${accent},0.2)`, borderRadius: 8, padding: "9px 12px", color: "#e8eaf0", fontSize: 13, outline: "none", cursor: "pointer", boxSizing: "border-box" }),
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 },
    mb10: { marginBottom: 10 },
    btn: (color) => ({ width: "100%", padding: "11px", borderRadius: 9, border: "none", background: `rgba(${color},0.85)`, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 4 }),
    aiTag: { display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 6, padding: "2px 8px", fontSize: 10, color: "#a78bfa", marginTop: 4 },
    entryList: { marginTop: 14, display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" },
    entryItem: (color) => ({ display: "flex", alignItems: "center", gap: 10, background: `rgba(${color},0.06)`, border: `1px solid rgba(${color},0.12)`, borderRadius: 9, padding: "8px 10px" }),
    entryAmt: (color) => ({ fontSize: 15, fontWeight: 700, color: `rgb(${color})`, minWidth: 80, textAlign: "right" }),
    entryDesc: { fontSize: 12, color: "#cbd5e1", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    entryCat: { fontSize: 10, color: "#475569", marginTop: 1 },
    delBtn: { background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14, padding: "0 2px" },
    section: { margin: "20px 0" },
    sectionTitle: { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#475569", marginBottom: 10 },
    reminderCard: { display: "flex", alignItems: "center", gap: 12, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 8 },
    reminderDot: { width: 8, height: 8, borderRadius: "50%", background: "#fbbf24", flexShrink: 0 },
    histTable: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
    histTh: { textAlign: "left", color: "#475569", fontWeight: 600, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
    histTd: { padding: "9px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)", verticalAlign: "middle" },
    badge: (type) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: type === "income" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)", color: type === "income" ? "#4ade80" : "#f87171" }),
    pendingBadge: { display: "inline-block", padding: "2px 8px", borderRadius: 5, fontSize: 10, background: "rgba(251,191,36,0.15)", color: "#fbbf24" },
    filterRow: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" },
    filterBtn: (active) => ({ padding: "5px 12px", borderRadius: 6, border: "1px solid " + (active ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.1)"), background: active ? "rgba(99,102,241,0.15)" : "transparent", color: active ? "#818cf8" : "#64748b", cursor: "pointer", fontSize: 11, fontWeight: 600 }),
    summaryCard: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20, marginBottom: 16 },
    catRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
    catBar: (pct, color) => ({ height: 4, borderRadius: 2, background: `rgb(${color})`, width: `${pct}%`, marginTop: 2 }),
    settingInput: { width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "9px 12px", color: "#e8eaf0", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 8 },
    settingLabel: { fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 6, display: "block" },
    infoBox: { background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, padding: 14, fontSize: 12, color: "#a5b4fc", lineHeight: 1.7 },
    checkRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 8 },
    toast: (type) => ({ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: type === "error" ? "#7f1d1d" : type === "info" ? "#1e3a5f" : "#14532d", border: `1px solid ${type === "error" ? "#ef4444" : type === "info" ? "#3b82f6" : "#22c55e"}`, color: "#fff", borderRadius: 10, padding: "12px 18px", fontSize: 13, fontWeight: 500, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }),
  };

  const renderDashboard = () => (
    <>
      <div style={s.balanceRow}>
        {[["today","Hoy"],["week","Esta Semana"],["month","Este Mes"]].map(([p,label]) => (
          <div key={p} style={s.balCard(balance(p) >= 0 ? G : R)}>
            <div style={s.balLabel}>{label}</div>
            <div style={s.balAmount(balance(p) >= 0)}>{formatCurrency(balance(p))}</div>
            <div style={s.balSub}>{`Ingresos: ${formatCurrency(totalIncome(p))} / Egresos: ${formatCurrency(totalExpense(p))}`}</div>
          </div>
        ))}
      </div>
      <div style={s.grid}>
        <div style={s.panel(G)}>
          <div style={s.panelHead(G)}><div style={s.dot(G)} /><span style={s.panelTitle(G)}>Ingresos</span></div>
          <div style={s.mb10}>
            <label style={s.label}>Monto ($)</label>
            <input style={s.input(G)} type="number" placeholder="0.00" value={incomeForm.amount} onChange={e => setIncomeForm(p => ({...p, amount: e.target.value}))} />
          </div>
          <div style={s.mb10}>
            <label style={s.label}>Descripcion</label>
            <input style={s.input(G)} placeholder="Ej: Ventas turno mañana" value={incomeForm.description} onChange={e => setIncomeForm(p => ({...p, description: e.target.value}))} />
            {classifying.income && <span style={s.aiTag}>Clasificando...</span>}
            {!classifying.income && incomeForm.category && <span style={s.aiTag}>{incomeForm.category}</span>}
          </div>
          <div style={s.row}>
            <div>
              <label style={s.label}>Categoria</label>
              <select style={s.select(G)} value={incomeForm.category} onChange={e => setIncomeForm(p => ({...p, category: e.target.value}))}>
                <option value="">Auto-detectar</option>
                {CATEGORIES_INCOME.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Fecha</label>
              <input type="date" style={s.input(G)} value={incomeForm.date} onChange={e => setIncomeForm(p => ({...p, date: e.target.value}))} />
            </div>
          </div>
          <div style={s.checkRow}>
            <input type="checkbox" id="inc-rem" checked={incomeForm.reminder} onChange={e => setIncomeForm(p => ({...p, reminder: e.target.checked}))} style={{accentColor:"#4ade80"}} />
            <label htmlFor="inc-rem" style={{fontSize:12,color:"#64748b",cursor:"pointer"}}>Agregar recordatorio</label>
          </div>
          <button style={s.btn("16,160,70")} onClick={() => addEntry("income")}>+ Registrar Ingreso</button>
          <div style={s.entryList}>
            {entries.filter(e => e.type === "income").slice(0,5).map(e => (
              <div key={e.id} style={s.entryItem(G)}>
                <div style={{flex:1,overflow:"hidden"}}>
                  <div style={s.entryDesc}>{e.description}</div>
                  <div style={s.entryCat}>{e.category} - {formatDate(e.date)}</div>
                </div>
                <div style={s.entryAmt(G)}>{formatCurrency(e.amount)}</div>
                <button style={s.delBtn} onClick={() => deleteEntry(e.id)}>x</button>
              </div>
            ))}
          </div>
        </div>
        <div style={s.panel(R)}>
          <div style={s.panelHead(R)}><div style={s.dot(R)} /><span style={s.panelTitle(R)}>Egresos</span></div>
          <div style={s.mb10}>
            <label style={s.label}>Monto ($)</label>
            <input style={s.input(R)} type="number" placeholder="0.00" value={expenseForm.amount} onChange={e => setExpenseForm(p => ({...p, amount: e.target.value}))} />
          </div>
          <div style={s.mb10}>
            <label style={s.label}>Descripcion</label>
            <input style={s.input(R)} placeholder="Ej: Pago alquiler local" value={expenseForm.description} onChange={e => setExpenseForm(p => ({...p, description: e.target.value}))} />
            {classifying.expense && <span style={s.aiTag}>Clasificando...</span>}
            {!classifying.expense && expenseForm.category && <span style={s.aiTag}>{expenseForm.category}</span>}
          </div>
          <div style={s.row}>
            <div>
              <label style={s.label}>Categoria</label>
              <select style={s.select(R)} value={expenseForm.category} onChange={e => setExpenseForm(p => ({...p, category: e.target.value}))}>
                <option value="">Auto-detectar</option>
                {CATEGORIES_EXPENSE.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Fecha</label>
              <input type="date" style={s.input(R)} value={expenseForm.date} onChange={e => setExpenseForm(p => ({...p, date: e.target.value}))} />
            </div>
          </div>
          <div style={s.checkRow}>
            <input type="checkbox" id="exp-rem" checked={expenseForm.reminder} onChange={e => setExpenseForm(p => ({...p, reminder: e.target.checked}))} style={{accentColor:"#f87171"}} />
            <label htmlFor="exp-rem" style={{fontSize:12,color:"#64748b",cursor:"pointer"}}>Agregar recordatorio</label>
          </div>
          <button style={s.btn("200,30,30")} onClick={() => addEntry("expense")}>+ Registrar Egreso</button>
          <div style={s.entryList}>
            {entries.filter(e => e.type === "expense").slice(0,5).map(e => (
              <div key={e.id} style={s.entryItem(R)}>
                <div style={{flex:1,overflow:"hidden"}}>
                  <div style={s.entryDesc}>{e.description}</div>
                  <div style={s.entryCat}>{e.category} - {formatDate(e.date)}</div>
                </div>
                <div style={s.entryAmt(R)}>-{formatCurrency(e.amount)}</div>
                <button style={s.delBtn} onClick={() => deleteEntry(e.id)}>x</button>
              </div>
            ))}
          </div>
        </div>
      </div>
      {upcomingReminders.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Recordatorios Proximos</div>
          {upcomingReminders.map(e => (
            <div key={e.id} style={s.reminderCard}>
              <div style={s.reminderDot} />
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:"#fbbf24"}}>{formatDate(e.date)}</div>
                <div style={{fontSize:12,color:"#94a3b8"}}>{e.description}</div>
              </div>
              <div style={{fontSize:14,fontWeight:700,color:e.type==="income"?"#4ade80":"#f87171"}}>{e.type==="expense"?"-":""}{formatCurrency(e.amount)}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const renderHistory = () => (
    <div style={{marginTop:20}}>
      <div style={s.filterRow}>
        <span style={{fontSize:12,color:"#475569",fontWeight:600}}>Tipo:</span>
        {[["all","Todos"],["income","Ingresos"],["expense","Egresos"]].map(([v,l]) => (
          <button key={v} style={s.filterBtn(filterType===v)} onClick={() => setFilterType(v)}>{l}</button>
        ))}
        <span style={{fontSize:12,color:"#475569",fontWeight:600,marginLeft:8}}>Periodo:</span>
        {[["today","Hoy"],["week","Semana"],["month","Mes"],["all","Todo"]].map(([v,l]) => (
          <button key={v} style={s.filterBtn(filterPeriod===v)} onClick={() => setFilterPeriod(v)}>{l}</button>
        ))}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={s.histTable}>
          <thead>
            <tr>{["Fecha","Tipo","Descripcion","Categoria","Monto","Estado",""].map(h => <th key={h} style={s.histTh}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filteredHistory.map(e => (
              <tr key={e.id} style={{opacity: e.status==="pending" ? 0.7 : 1}}>
                <td style={s.histTd}><span style={{fontSize:11,color:"#94a3b8"}}>{formatDate(e.date)}</span></td>
                <td style={s.histTd}><span style={s.badge(e.type)}>{e.type==="income"?"Ingreso":"Egreso"}</span></td>
                <td style={{...s.histTd,maxWidth:220}}><span style={{fontSize:12,color:"#cbd5e1"}}>{e.description}</span></td>
                <td style={s.histTd}><span style={{fontSize:11,color:"#64748b"}}>{e.category}</span></td>
                <td style={{...s.histTd,textAlign:"right"}}><span style={{fontSize:13,fontWeight:700,color:e.type==="income"?"#4ade80":"#f87171"}}>{e.type==="expense"?"-":""}{formatCurrency(e.amount)}</span></td>
                <td style={s.histTd}>{e.status==="pending"?<span style={s.pendingBadge}>Pendiente</span>:<span style={{fontSize:10,color:"#22c55e"}}>Confirmado</span>}</td>
                <td style={s.histTd}><button style={s.delBtn} onClick={() => deleteEntry(e.id)}>x</button></td>
              </tr>
            ))}
            {filteredHistory.length === 0 && <tr><td colSpan={7} style={{textAlign:"center",padding:30,color:"#475569",fontSize:13}}>Sin registros para el periodo seleccionado</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSummary = () => {
    const p = summaryPeriod;
    const inc = totalIncome(p), exp = totalExpense(p), bal = balance(p);
    const incomeCats = categoryBreakdown("income", p);
    const expenseCats = categoryBreakdown("expense", p);
    const maxInc = incomeCats[0]?.[1] || 1; const maxExp = expenseCats[0]?.[1] || 1;
    return (
      <div style={{marginTop:20}}>
        <div style={s.filterRow}>
          {[["today","Hoy"],["week","Esta Semana"],["month","Este Mes"]].map(([v,l]) => (
            <button key={v} style={s.filterBtn(p===v)} onClick={() => setSummaryPeriod(v)}>{l}</button>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
          <div style={{...s.balCard(G),textAlign:"center"}}><div style={s.balLabel}>Total Ingresos</div><div style={{...s.balAmount(true),fontSize:22}}>{formatCurrency(inc)}</div></div>
          <div style={{...s.balCard(R),textAlign:"center"}}><div style={s.balLabel}>Total Egresos</div><div style={{...s.balAmount(false),fontSize:22}}>{formatCurrency(exp)}</div></div>
          <div style={{...s.balCard(bal>=0?G:R),textAlign:"center"}}><div style={s.balLabel}>Balance Neto</div><div style={{...s.balAmount(bal>=0),fontSize:22}}>{formatCurrency(bal)}</div></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
          <div style={s.summaryCard}>
            <div style={{...s.sectionTitle,color:"#4ade80"}}>INGRESOS POR CATEGORIA</div>
            {incomeCats.length ? incomeCats.map(([cat,amt]) => (
              <div key={cat} style={{marginBottom:10}}>
                <div style={s.catRow}><span style={{fontSize:12,color:"#94a3b8"}}>{cat}</span><span style={{fontSize:13,fontWeight:700,color:"#4ade80"}}>{formatCurrency(amt)}</span></div>
                <div style={s.catBar((amt/maxInc)*100, G)} />
              </div>
            )) : <div style={{color:"#475569",fontSize:12}}>Sin datos</div>}
          </div>
          <div style={s.summaryCard}>
            <div style={{...s.sectionTitle,color:"#f87171"}}>EGRESOS POR CATEGORIA</div>
            {expenseCats.length ? expenseCats.map(([cat,amt]) => (
              <div key={cat} style={{marginBottom:10}}>
                <div style={s.catRow}><span style={{fontSize:12,color:"#94a3b8"}}>{cat}</span><span style={{fontSize:13,fontWeight:700,color:"#f87171"}}>{formatCurrency(amt)}</span></div>
                <div style={s.catBar((amt/maxExp)*100, R)} />
              </div>
            )) : <div style={{color:"#475569",fontSize:12}}>Sin datos</div>}
          </div>
        </div>
        <div style={s.summaryCard}>
          <div style={s.sectionTitle}>ENVIAR RESUMEN POR WHATSAPP</div>
          <p style={{fontSize:12,color:"#64748b",margin:"0 0 12px"}}>Genera y envia el resumen del periodo seleccionado directamente a WhatsApp.</p>
          <button onClick={generateWhatsappSummary} style={{...s.btn("37,99,235"),width:"auto",padding:"10px 24px",fontSize:13}}>
            Enviar resumen por WhatsApp
          </button>
          {!whatsappConfig.phone && <div style={{fontSize:11,color:"#f87171",marginTop:6}}>Configura tu numero en Ajustes primero</div>}
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div style={{marginTop:20,maxWidth:600}}>
      <div style={s.summaryCard}>
        <div style={{...s.sectionTitle,marginBottom:14}}>GOOGLE SHEETS</div>
        <label style={s.settingLabel}>URL del Web App (Apps Script)</label>
        <input style={s.settingInput} placeholder="https://script.google.com/macros/s/XXXX/exec" value={sheetsUrl} onChange={e => setSheetsUrl(e.target.value)} />
        <div style={s.infoBox}>
          <strong>Como obtener la URL:</strong><br/>
          1. En tu Google Sheets, abri Extensiones, luego Apps Script<br/>
          2. Pega el codigo del archivo FlujoCaja_AppsScript.js<br/>
          3. Clic en Implementar, luego Nueva implementacion<br/>
          4. Tipo: Aplicacion web - Acceso: Cualquier usuario<br/>
          5. Copiá la URL y pegala arriba
        </div>
        <div style={{display:"flex",gap:10,marginTop:12}}>
          <button onClick={async () => {
            saveLocal("fc_sheetsUrl", sheetsUrl);
            setSheetsUrl(sheetsUrl);
            setSyncing(true);
            showToast("Probando conexion...", "info");
            try {
              const res = await fetch(sheetsUrl + "?action=ping");
              const data = await res.json();
              if (data.ok) showToast("Conectado a Google Sheets!");
              else showToast("URL guardada (sin confirmacion)", "info");
            } catch { showToast("URL guardada. Si no sincroniza, revisa los permisos del script.", "info"); }
            setSyncing(false);
          }} style={{...s.btn("99,102,241"),width:"auto",padding:"9px 20px",fontSize:13}}>
            Guardar y probar conexion
          </button>
          <button onClick={syncFromSheets} disabled={syncing} style={{...s.btn("37,99,235"),width:"auto",padding:"9px 20px",fontSize:13,opacity:syncing?0.6:1}}>
            {syncing ? "Sincronizando..." : "Importar desde Sheets"}
          </button>
        </div>
      </div>
      <div style={s.summaryCard}>
        <div style={{...s.sectionTitle,marginBottom:14}}>WHATSAPP</div>
        <label style={s.settingLabel}>Numero con codigo de pais (sin + ni espacios)</label>
        <input style={s.settingInput} placeholder="5492614123456" value={whatsappConfig.phone} onChange={e => setWhatsappConfig(p => ({...p, phone: e.target.value}))} />
        <div style={s.infoBox}>
          Ejemplo Argentina: 5492614123456<br/>
          (54 = Argentina, 9 = celular, luego el numero sin el 0 ni el 15)
        </div>
        <button onClick={() => { saveLocal("fc_whatsapp", whatsappConfig); showToast("Numero guardado"); }} style={{...s.btn("22,163,74"),width:"auto",padding:"9px 20px",marginTop:12,fontSize:13}}>
          Guardar numero
        </button>
      </div>
      <div style={{...s.summaryCard,border:"1px solid rgba(248,113,113,0.2)"}}>
        <div style={{...s.sectionTitle,color:"#f87171",marginBottom:10}}>ZONA DE PELIGRO</div>
        <p style={{fontSize:12,color:"#64748b",marginBottom:12}}>Borra todos los registros guardados. Esta accion no se puede deshacer.</p>
        <button onClick={() => { if(window.confirm("Seguro? Se borraran todos los registros.")) { setEntries([]); saveLocal("fc_entries",[]); showToast("Datos borrados","info"); }}} style={{...s.btn("180,20,20"),width:"auto",padding:"8px 18px",fontSize:12}}>
          Borrar todos los datos
        </button>
      </div>
    </div>
  );

  return (
    <div style={s.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        input::-webkit-inner-spin-button { -webkit-appearance:none; }
        ::-webkit-scrollbar { width:4px; height:4px; } ::-webkit-scrollbar-track { background:transparent; } ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
        button:hover { filter:brightness(1.1); }
        input:focus, select:focus { border-color:rgba(99,102,241,0.5) !important; }
      `}</style>
      <div style={s.bg} />
      <div style={s.wrap}>
        <div style={s.header}>
          <div style={s.logo}>
            flujo<span style={s.logoAccent}>caja</span>
            <span style={s.syncDot} title={syncing ? "Sincronizando..." : "Conectado a Sheets"} />
            <button onClick={fetchFromSheets} disabled={syncing} title="Actualizar datos" style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:14,marginLeft:4,padding:0}}>
              {syncing ? "⟳" : "↺"}
            </button>
          </div>
          <nav style={s.nav}>
            {[["dashboard","Panel"],["history","Historial"],["summary","Resumenes"],["settings","Ajustes"]].map(([v,l]) => (
              <button key={v} style={s.navBtn(view===v)} onClick={() => setView(v)}>{l}</button>
            ))}
          </nav>
        </div>
        {loading ? (
        <div style={{textAlign:"center",padding:"80px 0",color:"#475569"}}>
          <div style={{fontSize:32,marginBottom:12}}>⟳</div>
          <div style={{fontSize:14}}>Cargando datos desde Google Sheets...</div>
        </div>
      ) : view === "dashboard" && renderDashboard()}
        {!loading && view === "history" && renderHistory()}
        {!loading && view === "summary" && renderSummary()}
        {!loading && view === "settings" && renderSettings()}
      </div>
      {toast && <div style={s.toast(toast.type)}>{toast.msg}</div>}
    </div>
  );
}
