import type {
  ComputedDetailRow,
  ComputedTraverseSummary,
  ControlPoint,
  DetailSurveyRow,
  MapPoint,
} from '../types/survey';
import { formatDms, parseDmsString } from './geodesy';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface SpreadsheetMeta {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheetTitles: string[];
}

async function sheetsFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ||
      `Lỗi kết nối Google Sheets (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

export async function fetchSpreadsheetMeta(
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetMeta> {
  const data = await sheetsFetch<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    properties?: { title?: string };
    sheets?: Array<{ properties?: { title?: string } }>;
  }>(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title`,
    accessToken
  );

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'Bảng tính Google Sheets',
    spreadsheetUrl: data.spreadsheetUrl,
    sheetTitles: (data.sheets ?? [])
      .map((s) => s.properties?.title || '')
      .filter(Boolean),
  };
}

export async function createGeoSurveySpreadsheet(
  accessToken: string,
  title = `GEOSURVEY PRO — Sổ Đo (${new Date().toISOString().slice(0, 10)})`
): Promise<SpreadsheetMeta> {
  const created = await sheetsFetch<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    properties?: { title?: string };
    sheets?: Array<{ properties?: { title?: string } }>;
  }>(SHEETS_API, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: 'Moc_Goc' } },
        { properties: { title: 'Duong_Chuyen_2Mat' } },
        { properties: { title: 'So_Do_Chi_Tiet' } },
        { properties: { title: 'Toa_Do_Tong_Hop' } },
      ],
    }),
  });

  return {
    spreadsheetId: created.spreadsheetId,
    title: created.properties?.title || title,
    spreadsheetUrl: created.spreadsheetUrl,
    sheetTitles: (created.sheets ?? []).map((s) => s.properties?.title || '').filter(Boolean),
  };
}

/**
 * Push all 4 survey tables to Google Sheets (creates missing tabs if needed, then batch-updates values).
 * Caller MUST confirm with user before calling this mutating operation.
 */
export async function pushSurveyDataToSheets(params: {
  spreadsheetId: string;
  accessToken: string;
  controlPoints: ControlPoint[];
  traverseSummary: ComputedTraverseSummary;
  detailRows: ComputedDetailRow[];
  allMapPoints: MapPoint[];
}): Promise<{ updatedCells: number; spreadsheetUrl: string }> {
  const { spreadsheetId, accessToken } = params;
  const meta = await fetchSpreadsheetMeta(spreadsheetId, accessToken);
  const requiredTabs = ['Moc_Goc', 'Duong_Chuyen_2Mat', 'So_Do_Chi_Tiet', 'Toa_Do_Tong_Hop'];
  const missingTabs = requiredTabs.filter((t) => !meta.sheetTitles.includes(t));

  if (missingTabs.length > 0) {
    await sheetsFetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        requests: missingTabs.map((title) => ({ addSheet: { properties: { title } } })),
      }),
    });
  }

  // Clear existing ranges first to prevent trailing stale rows
  await sheetsFetch(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchClear`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        ranges: requiredTabs.map((t) => `'${t}'!A1:Z1000`),
      }),
    }
  );

  const mocValues = [
    ['Tên mốc', 'X - Bắc (m)', 'Y - Đông (m)', 'Cao độ H (m)', 'Ghi chú'],
    ...params.controlPoints.map((cp) => [cp.name, cp.x, cp.y, cp.h, cp.note]),
  ];

  const traverseValues = [
    [
      'Trạm',
      'Điểm ngắm',
      'i (m)',
      'β_L',
      'β_R',
      '2C (")',
      'β_BS',
      'MO (")',
      'α_TB',
      'D (m)',
      'α cạnh',
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
      formatDms(r.betaAdjustedDeg),
      Number(r.moArcSec.toFixed(1)),
      formatDms(r.alphaTbDeg),
      Number(r.distanceM.toFixed(3)),
      formatDms(r.azimuthDeg),
      Number(r.xAdjusted.toFixed(3)),
      Number(r.yAdjusted.toFixed(3)),
      Number(r.hAdjusted.toFixed(3)),
    ]),
  ];

  const detailValues = [
    [
      'Điểm đo',
      'Trạm máy',
      'Điểm ĐH',
      'Chiều cao i',
      'Hz_ĐH',
      'Hz đo',
      'Góc đứng',
      'Chỉ trên a',
      'Chỉ giữa l',
      'Chỉ dưới b',
      'Sai số mia (mm)',
      'D (m)',
      'h (m)',
      'X (m)',
      'Y (m)',
      'H (m)',
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
      Number(r.x.toFixed(3)),
      Number(r.y.toFixed(3)),
      Number(r.h.toFixed(3)),
      r.kind === 'station' ? 'Trạm chuyền' : 'Điểm chi tiết',
      r.note,
    ]),
  ];

  const mapValues = [
    ['P', 'E (Y - Đông)', 'N (X - Bắc)', 'Z (Cao độ H)', 'D (Mô tả)'],
    ...params.allMapPoints.map((pt) => [
      pt.name,
      Number(pt.y.toFixed(3)),
      Number(pt.x.toFixed(3)),
      Number(pt.h.toFixed(3)),
      pt.note || pt.category,
    ]),
  ];

  const res = await sheetsFetch<{ totalUpdatedCells?: number }>(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `'Moc_Goc'!A1`, values: mocValues },
          { range: `'Duong_Chuyen_2Mat'!A1`, values: traverseValues },
          { range: `'So_Do_Chi_Tiet'!A1`, values: detailValues },
          { range: `'Toa_Do_Tong_Hop'!A1`, values: mapValues },
        ],
      }),
    }
  );

  return {
    updatedCells: res.totalUpdatedCells ?? 0,
    spreadsheetUrl: meta.spreadsheetUrl,
  };
}

/**
 * Pull control points and detail survey rows from an existing Google Sheet.
 * Dynamically inspects actual sheet titles (never hardcoding "Sheet1").
 */
export async function pullSurveyDataFromSheets(params: {
  spreadsheetId: string;
  accessToken: string;
}): Promise<{
  controlPoints: ControlPoint[];
  detailRows: DetailSurveyRow[];
  sheetTitle: string;
}> {
  const { spreadsheetId, accessToken } = params;
  const meta = await fetchSpreadsheetMeta(spreadsheetId, accessToken);

  const mocTab =
    meta.sheetTitles.find((t) => t.toLowerCase().includes('moc')) ?? meta.sheetTitles[0];
  const detailTab = meta.sheetTitles.find((t) => t.toLowerCase().includes('chi_tiet'));

  const controlPoints: ControlPoint[] = [];
  const detailRows: DetailSurveyRow[] = [];

  if (mocTab) {
    const res = await sheetsFetch<{ values?: string[][] }>(
      `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${mocTab}'!A2:E500`)}`,
      accessToken
    );
    (res.values ?? []).forEach((row, idx) => {
      const name = (row[0] ?? '').trim();
      const x = parseFloat(row[1]);
      const y = parseFloat(row[2]);
      const h = parseFloat(row[3]);
      if (name && Number.isFinite(x) && Number.isFinite(y)) {
        controlPoints.push({
          id: `gs-cp-${Date.now()}-${idx}`,
          name,
          x,
          y,
          h: Number.isFinite(h) ? h : 0,
          note: (row[4] ?? '').trim(),
        });
      }
    });
  }

  if (detailTab) {
    const res = await sheetsFetch<{ values?: string[][] }>(
      `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${detailTab}'!A2:R500`)}`,
      accessToken
    );
    (res.values ?? []).forEach((row, idx) => {
      const pointName = (row[0] ?? '').trim();
      if (!pointName) return;
      const kindStr = (row[16] ?? '').toLowerCase();
      detailRows.push({
        id: `gs-dt-${Date.now()}-${idx}`,
        pointName,
        stationName: (row[1] ?? 'M1').trim(),
        orientName: (row[2] ?? 'M0').trim(),
        instrumentHeight: parseFloat(row[3]) || 1.48,
        hzOrient: parseDmsString(row[4] ?? '0'),
        hzPoint: parseDmsString(row[5] ?? '0'),
        vertAngle: parseDmsString(row[6] ?? '90'),
        miaA: parseFloat(row[7]) || 1600,
        miaL: parseFloat(row[8]) || 1500,
        miaB: parseFloat(row[9]) || 1400,
        kind: kindStr.includes('trạm') || kindStr === 'station' ? 'station' : 'detail',
        note: (row[17] ?? '').trim(),
      });
    });
  }

  return { controlPoints, detailRows, sheetTitle: meta.title };
}
