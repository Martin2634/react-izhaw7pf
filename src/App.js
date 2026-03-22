// =============================================
//  FlujoCaja — Google Apps Script V2
//  Con columna sucursal
// =============================================

const SHEET_NAME = "FlujoCaja";

function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;
    if (action === "getAll") result = getAllEntries();
    else if (action === "ping") result = { ok: true };
    else result = { ok: true, message: "FlujoCaja API V2 activa" };
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    let result;
    if (body.action === "add") result = addEntry(body.data);
    else if (body.action === "delete") result = deleteEntry(body.id);
    else result = { error: "Accion no reconocida" };
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["id","fecha","tipo","monto","descripcion","categoria","estado","sucursal","recordatorio"]);
    const h = sheet.getRange(1,1,1,9);
    h.setFontWeight("bold").setBackground("#1a1a2e").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(5, 220);
  }
  return sheet;
}

function getAllEntries() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { entries: [] };
  const headers = data[0];
  const entries = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
  return { entries, total: entries.length };
}

function addEntry(data) {
  const sheet = getSheet();
  
  // Detectar posicion de columnas por nombre de encabezado
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIndex = {};
  headers.forEach((h, i) => { colIndex[h] = i + 1; });
  
  const lastRow = sheet.getLastRow() + 1;
  const totalCols = sheet.getLastColumn();
  
  // Escribir cada campo en su columna correcta
  const setValue = (colName, value) => {
    if (colIndex[colName]) sheet.getRange(lastRow, colIndex[colName]).setValue(value);
  };
  
  setValue("id", String(data.id));
  setValue("fecha", String(data.date || ""));
  setValue("tipo", data.type);
  setValue("monto", data.amount);
  setValue("descripcion", data.description);
  setValue("categoria", data.category);
  setValue("estado", data.status);
  setValue("sucursal", data.sucursal || "");
  setValue("recordatorio", data.reminder ? "Si" : "No");
  
  // Formato fecha como texto
  if (colIndex["fecha"]) sheet.getRange(lastRow, colIndex["fecha"]).setNumberFormat("@");
  
  // Color por tipo
  const bgColor = data.type === "income" ? "#e6f9f0" : "#fdf0f0";
  sheet.getRange(lastRow, 1, 1, totalCols).setBackground(bgColor);
  
  return { success: true, row: lastRow };
}

function deleteEntry(id) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { error: "Registro no encontrado: " + id };
}
