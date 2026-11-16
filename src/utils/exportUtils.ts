import * as XLSX from 'xlsx';

export function exportToExcel(rows: Record<string, unknown>[], filename: string, sheetName = 'Report') {
  if (!rows || rows.length === 0) {
    const emptyWs = XLSX.utils.json_to_sheet([{ Message: 'No records available' }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, emptyWs, sheetName);
    XLSX.writeFile(wb, `${filename}.xlsx`);
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
