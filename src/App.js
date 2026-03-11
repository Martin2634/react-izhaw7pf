import React, { useState, useEffect, useCallback } from "react";

const CATEGORIES_INCOME = ["Ventas turno mañana","Ventas turno tarde","Ventas turno noche","Venta diaria total","Servicios prestados","Cobro de deuda","Transferencia","Otros ingresos"];
const CATEGORIES_EXPENSE = ["Alquiler","Salarios","Servicios (luz/gas/agua)","Proveedores","Impuestos","Mantenimiento","Marketing","Transporte","Otros gastos"];

const formatCurrency = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
const formatDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
const todayStr = () => new Date().toISOString().split("T")[0];

const initialEntries = [
  { id: 1, type: "income", amount: 85000, description: "Ventas turno mañana - café y medialunas", category: "Ventas turno mañana", date: todayStr(), time: "12:30", status: "confirmed", reminder: false },
  { id: 2, type: "income", amount: 127000, description: "Ventas turno tarde - menú del día", category: "Ventas turno tarde", date: todayStr(), time: "18:00", status: "confirmed", reminder: false },
  { id: 3, type: "expense", amount: 45000, description: "Pago alquiler local comercial", category: "Alquiler", date: todayStr(), time: "10:00", status: "confirmed", reminder: false },
  { id: 4, type: "expense", amount: 12500, description: "Factura de electricidad", category: "Servicios (luz/gas/agua)", date: todayStr(), time: "09:15", status: "confirmed", reminder: false },
  { id: 5, type: "expense", amount: 38000, description: "Pago proveedor verduras y frutas", category: "Proveedores", date: new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0], time: "11:00", status: "pending", reminder: true },
];

export default function FlujoCaja() {
  const [entries, setEntries] = useState(initialEntries);
  const [view, setView] = useState("dashboard"); // dashboard | history | settings | summary
  const [incomeForm, setIncomeForm] = useState({ amount: "", description: "", category: "", date: todayStr(), reminder: false });
  const [expenseForm, setExpenseForm] = useState({ amount: "", description: "", category: "", date: todayStr(), reminder: false });
  const [classifying, setClassifying] = useState({ income: false, expense: false });
  const [toast, setToast] = useState(null);
  const [sheetsConfig, setSheetsConfig] = useState({ spreadsheetId: "", apiKey: "", sheetName: "FlujoCaja" });
  const [whatsappConfig, setWhatsappConfig] = useState({ phone: "", twilioSid: "", twilioToken: "" });
  const [filterType, setFilterType] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("week");
  const [summaryPeriod, setSummaryPeriod] = useState("week");

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
          messages: [{
            role: "user",
            content: `Clasifica esta transacción en UNA categoría de la lista. Responde SOLO con la categoría exacta, sin más texto.\n\nDescripción: "${description}"\nTipo: ${type === "income" ? "INGRESO" : "EGRESO"}\nCategorías disponibles: ${cats.join(", ")}`
          }]
        })
      });
      const data = await res.json();
      const cat = data.content?.[0]?.text?.trim();
      if (cat && cats.includes(cat)) {
        formSetter(prev => ({ ...prev, category: cat }));
      }
    } catch {}
    setClassifying(prev => ({ ...prev, [type]: false }));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (incomeForm.description) classifyWithAI(incomeForm.description, "income", setIncomeForm);
    }, 900);
    return () => clearTimeout(timer);
  }, [incomeForm.description]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (expenseForm.description) classifyWithAI(expenseForm.description, "expense", setExpenseForm);
    }, 900);
    return () => clearTimeout(timer);
  }, [expenseForm.description]);

  const addEntry = (type) => {
    const form = type === "income" ? incomeForm : expenseForm;
    if (!form.amount || !form.description) { showToast("Completa monto y descripción", "error"); return; }
    const entry = {
      id: Date.now(),
      type,
      amount: parseFloat(form.amount),
      description: form.description,
      category: form.category || (type === "income" ? "Otros ingresos" : "Otros gastos"),
      date: form.date,
      time: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
      status: form.date > todayStr() ? "pending" : "confirmed",
      reminder: form.reminder,
    };
    setEntries(prev => [entry, ...prev]);
    if (type === "income") setIncomeForm({ amount: "", description: "", category: "", date: todayStr(), reminder: false });
    else setExpenseForm({ amount: "", description: "", category: "", date: todayStr(), reminder: false });
    showToast(`${type === "income" ? "Ingreso" : "Egreso"} registrado ✓`);
    sendToSheets(entry);
  };

  const sendToSheets = async (entry) => {
    if (!sheetsConfig.spreadsheetId || !sheetsConfig.apiKey) return;
    showToast("Sincronizando con Google Sheets...", "info");
  };

  const deleteEntry = (id) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    showToast("Registro eliminado", "info");
  };

  // Calculations
  const now = new Date();
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay() + 1); startOfWeek.setHours(0,0,0,0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const filterByPeriod = (entries, period) => {
    const confirmed = entries.filter(e => e.status === "confirmed");
    if (period === "today") return confirmed.filter(e => e.date === todayStr());
    if (period === "week") return confirmed.filter(e => new Date(e.date + "T00:00:00") >= startOfWeek);
    if (period === "month") return confirmed.filter(e => new Date(e.date + "T00:00:00") >= startOfMonth);
    return confirmed;
  };

  const totalIncome = (period) => filterByPeriod(entries.filter(e => e.type === "income"), period).reduce((s, e) => s + e.amount, 0);
  const totalExpense = (period) => filterByPeriod(entries.filter(e => e.type === "expense"), period).reduce((s, e) => s + e.amount, 0);
  const balance = (period) => totalIncome(period) - totalExpense(period);

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
    const data = filterByPeriod(entries.filter(e => e.type === type), period);
    const map = {};
    data.forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  };

  const generateWhatsappSummary = () => {
    const period = summaryPeriod;
    const inc = totalIncome(period); const exp = totalExpense(period); const bal = balance(period);
    const label = period === "week" ? "esta semana" : period === "month" ? "este mes" : "hoy";
    const msg = `📊 *RESUMEN FLUJO DE CAJA*\n📅 ${period === "week" ? `Sem. ${startOfWeek.toLocaleDateString("es-AR")}` : period === "month" ? new Date().toLocaleDateString("es-AR", {month:"long",year:"numeric"}) : new Date().toLocaleDateString("es-AR")}\n\n✅ *INGRESOS ${label.toUpperCase()}*\n${formatCurrency(inc)}\n\n❌ *EGRESOS ${label.toUpperCase()}*\n${formatCurrency(exp)}\n\n${bal >= 0 ? "📈" : "📉"} *BALANCE: ${formatCurrency(bal)}*\n\n_Enviado desde FlujoCaja_`;
    const phone = whatsappConfig.phone.replace(/\D/g, "");
    if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
    else showToast("Configura tu número de WhatsApp en Ajustes", "error");
  };

  const balToday = balance("today"); const balWeek = balance("week"); const balMonth = balance("month");

  // Styles
  const s = {
    app: { fontFamily: "'DM Sans', sans-serif", background: "#0b0f1a", minHeight: "100vh", color: "#e8eaf0", position: "relative", overflow: "hidden" },
    bg: { position: "fixed", inset: 0, zIndex: 0, background: "radial-gradient(ellipse 80% 50% at 20% 20%, rgba(16,110,60,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(180,30,30,0.1) 0%, transparent 60%)", pointerEvents: "none" },
    wrap: { position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "0 16px 40px" },
    header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 0 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" },
    logo: { fontSize: 22, fontWeight: 700, letterSpacing: -0.5, color: "#fff" },
    logoAccent: { color: "#4ade80" },
    nav: { display: "flex", gap: 6, flexWrap: "wrap" },
    navBtn: (active) => ({ padding: "7px 16px", borderRadius: 8, border: "1px solid " + (active ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.1)"), background: active ? "rgba(74,222,128,0.12)" : "transparent", color: active ? "#4ade80" : "#94a3b8", cursor: "pointer", fontSize: 13, fontWeight: 500, transition: "all .2s" }),
    balanceRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, margin: "24px 0 20px" },
    balCard: (color) => ({ background: `rgba(${color},0.08)`, border: `1px solid rgba(${color},0.2)`, borderRadius: 14, padding: "16px 20px" }),
    balLabel: { fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", marginBottom: 4 },
    balAmount: (positive) => ({ fontSize: 26, fontWeight: 700, color: positive ? "#4ade80" : "#f87171", letterSpacing: -0.5 }),
    balSub: { fontSize: 11, color: "#475569", marginTop: 2 },
    grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
    panel: (color) => ({ background: `rgba(${color},0.05)`, border: `1px solid rgba(${color},0.18)`, borderRadius: 16, padding: 20 }),
    panelHead: (color) => ({ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid rgba(${color},0.15)` }),
    panelTitle: (color) => ({ fontSize: 14, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: `rgb(${color})` }),
    dot: (color) => ({ width: 8, height: 8, borderRadius: "50%", background: `rgb(${color})`, boxShadow: `0 0 8px rgb(${color})` }),
    label: { fontSize: 11, fontWeight: 600, color: "#64748b", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4, display: "block" },
    input: (accent) => ({ width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid rgba(${accent},0.2)`, borderRadius: 8, padding: "9px 12px", color: "#e8eaf0", fontSize: 13, outline: "none", boxSizing: "border-box", transition: "border .2s" }),
    select: (accent) => ({ width: "100%", background: "#131825", border: `1px solid rgba(${accent},0.2)`, borderRadius: 8, padding: "9px 12px", color: "#e8eaf0", fontSize: 13, outline: "none", cursor: "pointer", boxSizing: "border-box" }),
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 },
    mb10: { marginBottom: 10 },
    btn: (color) => ({ width: "100%", padding: "11px", borderRadius: 9, border: "none", background: `rgba(${color},0.85)`, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", letterSpacing: 0.3, transition: "all .2s", marginTop: 4 }),
    aiTag: { display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 6, padding: "2px 8px", fontSize: 10, color: "#a78bfa", marginTop: 4 },
    entryList: { marginTop: 14, display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" },
    entryItem: (color) => ({ display: "flex", alignItems: "center", gap: 10, background: `rgba(${color},0.06)`, border: `1px solid rgba(${color},0.12)`, borderRadius: 9, padding: "8px 10px" }),
    entryAmt: (color) => ({ fontSize: 15, fontWeight: 700, color: `rgb(${color})`, minWidth: 80, textAlign: "right" }),
    entryDesc: { fontSize: 12, color: "#cbd5e1", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    entryCat: { fontSize: 10, color: "#475569", marginTop: 1 },
    entryDate: { fontSize: 10, color: "#475569" },
    delBtn: { background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1 },
    section: { margin: "20px 0" },
    sectionTitle: { fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#475569", marginBottom: 10 },
    reminderCard: { display: "flex", alignItems: "center", gap: 12, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 8 },
    reminderDot: { width: 8, height: 8, borderRadius: "50%", background: "#fbbf24", flexShrink: 0 },
    histTable: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
    histTh: { textAlign: "left", color: "#475569", fontWeight: 600, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
    histTd: { padding: "9px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)", verticalAlign: "middle" },
    badge: (type) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: type === "income" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)", color: type === "income" ? "#4ade80" : "#f87171" }),
    pendingBadge: { display: "inline-block", padding: "2px 8px", borderRadius: 5, fontSize: 10, background: "rgba(251,191,36,0.15)", color: "#fbbf24" },
    filterRow: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
    filterBtn: (active) => ({ padding: "5px 12px", borderRadius: 6, border: "1px solid " + (active ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.1)"), background: active ? "rgba(99,102,241,0.15)" : "transparent", color: active ? "#818cf8" : "#64748b", cursor: "pointer", fontSize: 11, fontWeight: 600 }),
    summaryCard: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20, marginBottom: 16 },
    catRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
    catBar: (pct, color) => ({ height: 4, borderRadius: 2, background: `rgb(${color})`, width: `${pct}%`, transition: "width .5s", marginTop: 2 }),
    settingGroup: { marginBottom: 20 },
    settingLabel: { fontSize: 12, fontWeight: 600, color: "#94a3b8", marginBottom: 6, display: "block" },
    settingInput: { width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "9px 12px", color: "#e8eaf0", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 8 },
    infoBox: { background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, padding: 14, fontSize: 12, color: "#a5b4fc", lineHeight: 1.7 },
    checkRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 8 },
    toast: (type) => ({ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: type === "error" ? "#7f1d1d" : type === "info" ? "#1e3a5f" : "#14532d", border: `1px solid ${type === "error" ? "#ef4444" : type === "info" ? "#3b82f6" : "#22c55e"}`, color: "#fff", borderRadius: 10, padding: "12px 18px", fontSize: 13, fontWeight: 500, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "fadeIn .3s ease" }),
  };

  const G = "74,222,128"; const R = "248,113,113";

  const renderDashboard = () => (
    <>
      {/* Balance Row */}
      <div style={s.balanceRow}>
        {[["today","Hoy"],["week","Esta Semana"],["month","Este Mes"]].map(([p,label]) => (
          <div key={p} style={s.balCard(balance(p) >= 0 ? G : R)}>
            <div style={s.balLabel}>{label}</div>
            <div style={s.balAmount(balance(p) >= 0)}>{formatCurrency(balance(p))}</div>
            <div style={s.balSub}>↑ {formatCurrency(totalIncome(p))} · ↓ {formatCurrency(totalExpense(p))}</div>
          </div>
        ))}
      </div>

      {/* Income / Expense panels */}
      <div style={s.grid}>
        {/* INCOME */}
        <div style={s.panel(G)}>
          <div style={s.panelHead(G)}>
            <div style={s.dot(G)} />
            <span style={s.panelTitle(G)}>Ingresos</span>
          </div>
          <div style={s.mb10}>
            <label style={s.label}>Monto ($)</label>
            <input style={s.input(G)} type="number" placeholder="0.00" value={incomeForm.amount} onChange={e => setIncomeForm(p => ({...p, amount: e.target.value}))} />
          </div>
          <div style={s.mb10}>
            <label style={s.label}>Descripción</label>
            <input style={s.input(G)} placeholder="Ej: Ventas turno mañana" value={incomeForm.description} onChange={e => setIncomeForm(p => ({...p, description: e.target.value}))} />
            {classifying.income && <span style={s.aiTag}>⚡ Clasificando...</span>}
            {!classifying.income && incomeForm.category && <span style={s.aiTag}>✦ {incomeForm.category}</span>}
          </div>
          <div style={s.row}>
            <div>
              <label style={s.label}>Categoría</label>
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
          <button style={s.btn("16,160,70")} onClick={() => addEntry("income")}>＋ Registrar Ingreso</button>
          <div style={s.entryList}>
            {entries.filter(e => e.type === "income" && (e.date === todayStr() || e.status === "confirmed")).slice(0,5).map(e => (
              <div key={e.id} style={s.entryItem(G)}>
                <div style={{flex:1, overflow:"hidden"}}>
                  <div style={s.entryDesc}>{e.description}</div>
                  <div style={s.entryCat}>{e.category} · {formatDate(e.date)}</div>
                </div>
                <div style={s.entryAmt(G)}>{formatCurrency(e.amount)}</div>
                <button style={s.delBtn} onClick={() => deleteEntry(e.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* EXPENSES */}
        <div style={s.panel(R)}>
          <div style={s.panelHead(R)}>
            <div style={s.dot(R)} />
            <span style={s.panelTitle(R)}>Egresos</span>
          </div>
          <div style={s.mb10}>
            <label style={s.label}>Monto ($)</label>
            <input style={s.input(R)} type="number" placeholder="0.00" value={expenseForm.amount} onChange={e => setExpenseForm(p => ({...p, amount: e.target.value}))} />
          </div>
          <div style={s.mb10}>
            <label style={s.label}>Descripción</label>
            <input style={s.input(R)} placeholder="Ej: Pago alquiler local" value={expenseForm.description} onChange={e => setExpenseForm(p => ({...p, description: e.target.value}))} />
            {classifying.expense && <span style={s.aiTag}>⚡ Clasificando...</span>}
            {!classifying.expense && expenseForm.category && <span style={s.aiTag}>✦ {expenseForm.category}</span>}
          </div>
          <div style={s.row}>
            <div>
              <label style={s.label}>Categoría</label>
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
          <button style={s.btn("200,30,30")} onClick={() => addEntry("expense")}>＋ Registrar Egreso</button>
          <div style={s.entryList}>
            {entries.filter(e => e.type === "expense" && (e.date === todayStr() || e.status === "confirmed")).slice(0,5).map(e => (
              <div key={e.id} style={s.entryItem(R)}>
                <div style={{flex:1, overflow:"hidden"}}>
                  <div style={s.entryDesc}>{e.description}</div>
                  <div style={s.entryCat}>{e.category} · {formatDate(e.date)}</div>
                </div>
                <div style={s.entryAmt(R)}>-{formatCurrency(e.amount)}</div>
                <button style={s.delBtn} onClick={() => deleteEntry(e.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reminders */}
      {upcomingReminders.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>⏰ Recordatorios Próximos</div>
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
        <span style={{fontSize:12,color:"#475569",alignSelf:"center",fontWeight:600}}>Tipo:</span>
        {[["all","Todos"],["income","Ingresos"],["expense","Egresos"]].map(([v,l]) => (
          <button key={v} style={s.filterBtn(filterType===v)} onClick={() => setFilterType(v)}>{l}</button>
        ))}
        <span style={{fontSize:12,color:"#475569",alignSelf:"center",fontWeight:600,marginLeft:8}}>Período:</span>
        {[["today","Hoy"],["week","Semana"],["month","Mes"],["all","Todo"]].map(([v,l]) => (
          <button key={v} style={s.filterBtn(filterPeriod===v)} onClick={() => setFilterPeriod(v)}>{l}</button>
        ))}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={s.histTable}>
          <thead>
            <tr>
              {["Fecha","Tipo","Descripción","Categoría","Monto","Estado",""].map(h => <th key={h} style={s.histTh}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filteredHistory.map(e => (
              <tr key={e.id} style={{opacity: e.status==="pending" ? 0.7 : 1}}>
                <td style={s.histTd}><span style={{fontSize:11,color:"#94a3b8"}}>{formatDate(e.date)}</span></td>
                <td style={s.histTd}><span style={s.badge(e.type)}>{e.type==="income"?"↑ Ingreso":"↓ Egreso"}</span></td>
                <td style={{...s.histTd,maxWidth:220}}><span style={{fontSize:12,color:"#cbd5e1"}}>{e.description}</span></td>
                <td style={s.histTd}><span style={{fontSize:11,color:"#64748b"}}>{e.category}</span></td>
                <td style={{...s.histTd,textAlign:"right"}}><span style={{fontSize:13,fontWeight:700,color:e.type==="income"?"#4ade80":"#f87171"}}>{e.type==="expense"?"-":""}{formatCurrency(e.amount)}</span></td>
                <td style={s.histTd}>{e.status==="pending"?<span style={s.pendingBadge}>⏳ Pendiente</span>:<span style={{fontSize:10,color:"#22c55e"}}>✓ Confirmado</span>}</td>
                <td style={s.histTd}><button style={s.delBtn} onClick={() => deleteEntry(e.id)}>✕</button></td>
              </tr>
            ))}
            {filteredHistory.length === 0 && <tr><td colSpan={7} style={{textAlign:"center",padding:30,color:"#475569",fontSize:13}}>Sin registros para el período seleccionado</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSummary = () => {
    const periods = [["today","Hoy"],["week","Esta Semana"],["month","Este Mes"]];
    const selected = summaryPeriod;
    const inc = totalIncome(selected); const exp = totalExpense(selected); const bal = balance(selected);
    const incomeCats = categoryBreakdown("income", selected);
    const expenseCats = categoryBreakdown("expense", selected);
    const maxInc = incomeCats[0]?.[1] || 1; const maxExp = expenseCats[0]?.[1] || 1;
    return (
      <div style={{marginTop:20}}>
        <div style={s.filterRow}>
          {periods.map(([v,l]) => <button key={v} style={s.filterBtn(selected===v)} onClick={() => setSummaryPeriod(v)}>{l}</button>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:20}}>
          <div style={{...s.balCard(G),textAlign:"center"}}>
            <div style={s.balLabel}>Total Ingresos</div>
            <div style={{...s.balAmount(true),fontSize:22}}>{formatCurrency(inc)}</div>
          </div>
          <div style={{...s.balCard(R),textAlign:"center"}}>
            <div style={s.balLabel}>Total Egresos</div>
            <div style={{...s.balAmount(false),fontSize:22}}>{formatCurrency(exp)}</div>
          </div>
          <div style={{...s.balCard(bal>=0?G:R),textAlign:"center"}}>
            <div style={s.balLabel}>Balance Neto</div>
            <div style={{...s.balAmount(bal>=0),fontSize:22}}>{formatCurrency(bal)}</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div style={s.summaryCard}>
            <div style={{...s.sectionTitle,color:"#4ade80"}}>INGRESOS POR CATEGORÍA</div>
            {incomeCats.length ? incomeCats.map(([cat,amt]) => (
              <div key={cat} style={{marginBottom:10}}>
                <div style={s.catRow}><span style={{fontSize:12,color:"#94a3b8"}}>{cat}</span><span style={{fontSize:13,fontWeight:700,color:"#4ade80"}}>{formatCurrency(amt)}</span></div>
                <div style={s.catBar((amt/maxInc)*100, G)} />
              </div>
            )) : <div style={{color:"#475569",fontSize:12}}>Sin datos</div>}
          </div>
          <div style={s.summaryCard}>
            <div style={{...s.sectionTitle,color:"#f87171"}}>EGRESOS POR CATEGORÍA</div>
            {expenseCats.length ? expenseCats.map(([cat,amt]) => (
              <div key={cat} style={{marginBottom:10}}>
                <div style={s.catRow}><span style={{fontSize:12,color:"#94a3b8"}}>{cat}</span><span style={{fontSize:13,fontWeight:700,color:"#f87171"}}>{formatCurrency(amt)}</span></div>
                <div style={s.catBar((amt/maxExp)*100, R)} />
              </div>
            )) : <div style={{color:"#475569",fontSize:12}}>Sin datos</div>}
          </div>
        </div>
        <div style={{...s.summaryCard,marginTop:0}}>
          <div style={s.sectionTitle}>📱 ENVIAR RESUMEN POR WHATSAPP</div>
          <p style={{fontSize:12,color:"#64748b",margin:"0 0 12px"}}>Genera y envía el resumen del período seleccionado directamente a WhatsApp.</p>
          <button onClick={generateWhatsappSummary} style={{...s.btn("37,99,235"),width:"auto",padding:"10px 24px",fontSize:13}}>
            📲 Enviar resumen por WhatsApp
          </button>
          {!whatsappConfig.phone && <div style={{fontSize:11,color:"#f87171",marginTop:6}}>⚠ Configura tu número en Ajustes primero</div>}
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div style={{marginTop:20,maxWidth:600}}>
      <div style={s.summaryCard}>
        <div style={{...s.sectionTitle,marginBottom:14}}>📊 GOOGLE SHEETS</div>
        <div style={s.settingGroup}>
          <label style={s.settingLabel}>ID del Spreadsheet</label>
          <input style={s.settingInput} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" value={sheetsConfig.spreadsheetId} onChange={e => setSheetsConfig(p=>({...p,spreadsheetId:e.target.value}))} />
          <label style={s.settingLabel}>Nombre de la Hoja</label>
          <input style={s.settingInput} placeholder="FlujoCaja" value={sheetsConfig.sheetName} onChange={e => setSheetsConfig(p=>({...p,sheetName:e.target.value}))} />
        </div>
        <div style={s.infoBox}>
          <strong>Cómo configurar Google Sheets:</strong><br/>
          1. Crear un nuevo Google Spreadsheet<br/>
          2. Copiar el ID de la URL (entre /d/ y /edit)<br/>
          3. Activar la API en Google Cloud Console<br/>
          4. Crear credenciales de Cuenta de Servicio<br/>
          5. Compartir el sheet con el email de la cuenta
        </div>
      </div>
      <div style={s.summaryCard}>
        <div style={{...s.sectionTitle,marginBottom:14}}>📱 WHATSAPP</div>
        <div style={s.settingGroup}>
          <label style={s.settingLabel}>Número de WhatsApp (con código de país)</label>
          <input style={s.settingInput} placeholder="5491112345678" value={whatsappConfig.phone} onChange={e => setWhatsappConfig(p=>({...p,phone:e.target.value}))} />
        </div>
        <div style={s.infoBox}>
          <strong>Opciones de integración WhatsApp:</strong><br/>
          <br/>
          <strong>✅ V1 (ya disponible):</strong> El botón "Enviar resumen" abre WhatsApp Web con el mensaje pre-cargado listo para enviar.<br/>
          <br/>
          <strong>🔜 V2 (bot automatizado):</strong> Requiere Twilio + WhatsApp Business API. Podés registrar gastos enviando un mensaje como "gasto 5000 alquiler" y el bot lo clasifica e inserta automáticamente.
        </div>
        <button onClick={() => { setSheetsConfig(p => ({...p})); setWhatsappConfig(p => ({...p})); showToast("Configuración guardada"); }} style={{...s.btn("99,102,241"),width:"auto",padding:"9px 20px",marginTop:12,fontSize:13}}>
          Guardar configuración
        </button>
      </div>
    </div>
  );

  return (
    <div style={s.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        input::-webkit-inner-spin-button { -webkit-appearance: none; }
        ::-webkit-scrollbar { width:4px; height:4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius:2px; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        button:hover { filter: brightness(1.1); }
        input:focus, select:focus { border-color: rgba(99,102,241,0.5) !important; }
      `}</style>
      <div style={s.bg} />
      <div style={s.wrap}>
        <div style={s.header}>
          <div style={s.logo}>flujo<span style={s.logoAccent}>caja</span></div>
          <nav style={s.nav}>
            {[["dashboard","📊 Panel"],["history","📋 Historial"],["summary","📈 Resúmenes"],["settings","⚙ Ajustes"]].map(([v,l]) => (
              <button key={v} style={s.navBtn(view===v)} onClick={() => setView(v)}>{l}</button>
            ))}
          </nav>
        </div>
        {view === "dashboard" && renderDashboard()}
        {view === "history" && renderHistory()}
        {view === "summary" && renderSummary()}
        {view === "settings" && renderSettings()}
      </div>
      {toast && <div style={s.toast(toast.type)}>{toast.msg}</div>}
    </div>
  );
}