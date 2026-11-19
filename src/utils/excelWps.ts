import * as XLSX from 'xlsx';
import type {
  ComputedDetailRow,
  ComputedTraverseSummary,
  ControlPoint,
  DetailSurveyRow,
  MapPoint,
} from '../types/survey';
import { formatDms, parseDmsString } from './geodesy';

/**
 * Export full multi-sheet .xlsx workbook optimized for both WPS Spreadsheets and Microsoft Excel.
 * Uses explicit numeric types and column widths so formulas & Vietnamese headers render cleanly in WPS Office.
 */
export function exportFullExcelWorkbook(params: {
  controlPoints: ControlPoint[];
  traverseSummary: ComputedTraverseSummary;
  detailRows: ComputedDetailRow[];
  allMapPoints: MapPoint[];
  filename?: string;
}): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Mốc Khống Chế Gốc
  const sheet1Data = [
    ['Tên mốc', 'Tọa độ X - Bắc (m)', 'Tọa độ Y - Đông (m)', 'Cao độ H (m)', 'Ghi chú'],
    ...params.controlPoints.map((cp) => [cp.name, cp.x, cp.y, cp.h, cp.note]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  ws1['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Moc_Goc');

  // Sheet 2: Đường Chuyền 2 Mặt & Bình Sai
  const sheet2Data = [
    [
      'Trạm đo',
      'Điểm ngắm',
      'Chiều cao máy i (m)',
      'β_L',
      'β_R',
      '2C (")',
      'β_TB',
      'v_β (")',
      'β_BS',
      'MO (")',
      'α_TB',
      'D (m)',
      'Phương vị α',
      'ΔX_BS (m)',
      'ΔY_BS (m)',
      'h_BS (m)',
      'X_BS (m)',
      'Y_BS (m)',
      'H_BS (m)',
    ],
    ...params.traverseSummary.rows.map((r) => [
      r.stationName,
      r.targetName,
      r.instrumentHeight,
      formatDms(r.betaLDeg),
      formatDms(r.betaRDeg),
      Number(r.diff2CArcSec.toFixed(1)),
      formatDms(r.betaAvgDeg),
      Number(r.vBetaArcSec.toFixed(1)),
      formatDms(r.betaAdjustedDeg),
      Number(r.moArcSec.toFixed(1)),
      formatDms(r.alphaTbDeg),
      Number(r.distanceM.toFixed(3)),
      formatDms(r.azimuthDeg),
      Number(r.adjDeltaX.toFixed(4)),
      Number(r.adjDeltaY.toFixed(4)),
      Number(r.adjDeltaH.toFixed(4)),
      Number(r.xAdjusted.toFixed(3)),
      Number(r.yAdjusted.toFixed(3)),
      Number(r.hAdjusted.toFixed(3)),
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  ws2['!cols'] = Array(19).fill({ wch: 13 });
  XLSX.utils.book_append_sheet(wb, ws2, 'Duong_Chuyen_2Mat');

  // Sheet 3: Sổ Đo Chi Tiết
  const sheet3Data = [
    [
      'Điểm đo',
      'Trạm máy',
      'Điểm ĐH',
      'Chiều cao i',
      'Hz_ĐH',
      'Hz đo',
      'Góc đứng Z/V',
      'Chỉ trên a',
      'Chỉ giữa l',
      'Chỉ dưới b',
      'Sai số mia (mm)',
      'D ngang (m)',
      'Chênh cao h (m)',
      'Phương vị α_đo',
      'X - Bắc (m)',
      'Y - Đông (m)',
      'Cao độ H (m)',
      'Loại điểm',
      'Ghi chú',
    ],
    ...params.detailRows.map((r) => [
      r.pointName,
      r.stationName,
      r.orientName,
      r.instrumentHeight,
      `${r.hzOrient.deg}°${r.hzOrient.min}'${r.hzOrient.sec}"`,
      `${r.hzPoint.deg}°${r.hzPoint.min}'${r.hzPoint.sec}"`,
      `${r.vertAngle.deg}°${r.vertAngle.min}'${r.vertAngle.sec}"`,
      r.miaA,
      r.miaL,
      r.miaB,
      Number(r.miaErrorMm.toFixed(1)),
      Number(r.distanceM.toFixed(3)),
      Number(r.deltaHM.toFixed(3)),
      formatDms(r.pointAzimuthDeg),
      Number(r.x.toFixed(3)),
      Number(r.y.toFixed(3)),
      Number(r.h.toFixed(3)),
      r.kind === 'station' ? 'Trạm chuyền' : 'Điểm chi tiết',
      r.note,
    ]),
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
  ws3['!cols'] = Array(19).fill({ wch: 14 });
  ws3['!cols'][18] = { wch: 28 };
  XLSX.utils.book_append_sheet(wb, ws3, 'So_Do_Chi_Tiet');

  // Sheet 4: Tọa Độ Tổng Hợp (Chuẩn Civil 3D PENZD)
  const sheet4Data = [
    ['P (Tên điểm)', 'E (Y - Đông)', 'N (X - Bắc)', 'Z (Cao độ H)', 'D (Mô tả)'],
    ...params.allMapPoints.map((pt) => [
      pt.name,
      Number(pt.y.toFixed(3)),
      Number(pt.x.toFixed(3)),
      Number(pt.h.toFixed(3)),
      pt.note || pt.category,
    ]),
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(sheet4Data);
  ws4['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, ws4, 'Toa_Do_Civil3D');

  const fileName = params.filename || `GEOSURVEY_PRO_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName, { bookType: 'xlsx' });
}

/**
 * Import .xlsx / .xls / .csv files exported from WPS Office, Microsoft Excel, or GEOSURVEY PRO.
 * Automatically detects Moc_Goc (benchmarks) and So_Do_Chi_Tiet (detail fieldbook) sheets or generic CSV tables.
 */
export async function importExcelOrCsvFile(file: File): Promise<{
  controlPoints?: ControlPoint[];
  detailRows?: DetailSurveyRow[];
  summaryMessage: string;
}> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', codepage: 65001 });

  let importedControls: ControlPoint[] | undefined;
  let importedDetails: DetailSurveyRow[] | undefined;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    if (rows.length === 0) continue;

    const firstKeys = Object.keys(rows[0]).map((k) => k.toLowerCase());
    const looksLikeDetail =
      sheetName.toLowerCase().includes('chi_tiet') ||
      sheetName.toLowerCase().includes('detail') ||
      firstKeys.some((k) => k.includes('chỉ trên') || k.includes('mia') || k.includes('hz'));

    const looksLikeControl =
      sheetName.toLowerCase().includes('moc') ||
      sheetName.toLowerCase().includes('control') ||
      firstKeys.some((k) => k.includes('tên mốc') || k.includes('tọa độ x') || k === 'x' || k === 'n');

    if (looksLikeDetail) {
      const parsed: DetailSurveyRow[] = [];
      rows.forEach((r, idx) => {
        const get = (...keys: string[]) => {
          for (const k of Object.keys(r)) {
            const lk = k.toLowerCase();
            if (keys.some((target) => lk.includes(target))) return r[k];
          }
          return '';
        };
        const pointName = String(get('điểm đo', 'tên điểm', 'point') || `P${idx + 1}`).trim();
        const stationName = String(get('trạm máy', 'trạm', 'station') || 'M1').trim();
        const orientName = String(get('đh', 'định hướng', 'orient') || 'M0').trim();
        const instrumentHeight = parseFloat(String(get('chiều cao i', 'cao máy', 'i'))) || 1.48;
        const hzOrient = parseDmsString(String(get('hz_đh', 'hz đh', 'hzorient') || '0'));
        const hzPoint = parseDmsString(String(get('hz đo', 'hz điểm', 'hzpoint', 'hz') || '0'));
        const vertAngle = parseDmsString(String(get('góc đứng', 'z/v', 'vert') || '90'));
        const miaA = parseFloat(String(get('chỉ trên', 'miaa', 'a'))) || 1600;
        const miaL = parseFloat(String(get('chỉ giữa', 'mial', 'l'))) || 1500;
        const miaB = parseFloat(String(get('chỉ dưới', 'miab', 'b'))) || 1400;
        const kindStr = String(get('loại', 'kind') || '').toLowerCase();
        const kind = kindStr.includes('trạm') || kindStr === 'station' ? 'station' : 'detail';
        const note = String(get('ghi chú', 'mô tả', 'note') || '').trim();

        if (pointName) {
          parsed.push({
            id: `imp-dt-${Date.now()}-${idx}`,
            pointName,
            stationName,
            orientName,
            instrumentHeight,
            hzOrient,
            hzPoint,
            vertAngle,
            miaA,
            miaL,
            miaB,
            kind,
            note,
          });
        }
      });
      if (parsed.length > 0) importedDetails = parsed;
    } else if (looksLikeControl) {
      const parsed: ControlPoint[] = [];
      rows.forEach((r, idx) => {
        const get = (...keys: string[]) => {
          for (const k of Object.keys(r)) {
            const lk = k.toLowerCase();
            if (keys.some((target) => lk === target || lk.includes(target))) return r[k];
          }
          return '';
        };
        const name = String(get('tên mốc', 'tên điểm', 'p', 'name') || `M${idx}`).trim();
        const x = parseFloat(String(get('tọa độ x', 'bắc', 'n (', 'x', 'n')));
        const y = parseFloat(String(get('tọa độ y', 'đông', 'e (', 'y', 'e')));
        const h = parseFloat(String(get('cao độ', 'z (', 'h', 'z')));
        const note = String(get('ghi chú', 'mô tả', 'd (', 'note') || '').trim();

        if (name && Number.isFinite(x) && Number.isFinite(y)) {
          parsed.push({
            id: `imp-cp-${Date.now()}-${idx}`,
            name,
            x,
            y,
            h: Number.isFinite(h) ? h : 0,
            note,
          });
        }
      });
      if (parsed.length > 0) importedControls = parsed;
    }
  }

  const parts: string[] = [];
  if (importedControls) parts.push(`${importedControls.length} mốc gốc`);
  if (importedDetails) parts.push(`${importedDetails.length} điểm sổ đo chi tiết`);

  return {
    controlPoints: importedControls,
    detailRows: importedDetails,
    summaryMessage:
      parts.length > 0
        ? `Đã nhập thành công ${parts.join(' và ')} từ file ${file.name} (hỗ trợ WPS/Excel/CSV).`
        : `Không nhận diện được cột dữ liệu chuẩn trong file ${file.name}. Vui lòng tải file mẫu .xlsx để xem cấu trúc cột.`,
  };
}

export function triggerTextDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
