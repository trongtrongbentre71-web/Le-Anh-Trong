import type {
  AiActionImportControlPoints,
  AiActionImportDetailPoints,
  AiActionImportTraverseData,
  ControlPoint,
  DetailSurveyRow,
  DetailUnitSettings,
  LengthUnit,
  TraverseRow,
  VerticalCircleMode,
} from '../types/survey';
import { metersToUnit, parseDmsString, unitToMeters } from './geodesy';
import {
  inferVerticalModeFromAngleStr,
  normalizeInstrumentHeightM,
  normalizeMiaToMm,
} from './cameraOcr';

export type AttachmentCategory = 'image' | 'pdf' | 'spreadsheet' | 'text' | 'unsupported';

export interface AiChatAttachmentPayload {
  id: string;
  name: string;
  kind: 'image' | 'pdf' | 'text';
  mimeType: string;
  sizeBytes: number;
  base64?: string;
  extractedText?: string;
  previewUrl?: string;
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_TEXT_CHARS = 35000;

export function classifyAttachmentFile(fileName: string, mimeType: string): AttachmentCategory {
  const lowerName = (fileName || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();

  if (
    lowerMime.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(lowerName)
  ) {
    return 'image';
  }
  if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return 'pdf';
  }
  if (
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    lowerName.endsWith('.csv') ||
    lowerMime.includes('spreadsheet') ||
    lowerMime.includes('excel') ||
    lowerMime === 'text/csv'
  ) {
    return 'spreadsheet';
  }
  if (
    lowerMime.startsWith('text/') ||
    /\.(txt|md|json|scr|dat|asc)$/i.test(lowerName)
  ) {
    return 'text';
  }
  return 'unsupported';
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function truncateDocumentText(raw: string, maxChars = MAX_TEXT_CHARS): string {
  const cleaned = (raw || '').trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars)}\n...[Đã rút gọn phần còn lại do tài liệu quá dài]...`;
}

export function convertAiControlPoints(
  payload: AiActionImportControlPoints['payload']
): ControlPoint[] {
  const now = Date.now();
  const list = Array.isArray(payload?.points) ? payload.points : [];
  return list
    .map((p, idx) => {
      const x = Number(p?.x);
      const y = Number(p?.y);
      const h = Number(p?.h);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        id: `ai-cp-${now}-${idx}`,
        name: String(p?.name || `M${idx}`).trim(),
        x: Number(x.toFixed(3)),
        y: Number(y.toFixed(3)),
        h: Number((Number.isFinite(h) ? h : 0).toFixed(3)),
        note: String(p?.note || 'AI nhập từ đề bài / tài liệu').trim(),
      };
    })
    .filter((item): item is ControlPoint => item !== null);
}

export function convertAiTraverseRows(
  payload: AiActionImportTraverseData['payload'],
  miaUnit: LengthUnit
): TraverseRow[] {
  const now = Date.now();
  const list = Array.isArray(payload?.rows) ? payload.rows : [];
  return list.map((r, idx) => {
    const miaLMm = normalizeMiaToMm(r?.miaLMm, 1500);
    const miaAMm = normalizeMiaToMm(r?.miaAMm, miaLMm + 200);
    const miaBMm = normalizeMiaToMm(r?.miaBMm, Math.max(100, miaLMm - 200));
    return {
      id: `ai-tr-${now}-${idx}`,
      stationName: String(r?.stationName || `T${idx + 1}`).trim(),
      targetName: String(r?.targetName || `T${idx + 2}`).trim(),
      instrumentHeight: normalizeInstrumentHeightM(r?.instrumentHeightM, 1.48),
      hzBackL: parseDmsString(r?.hzBackLStr || '0°00\'00"'),
      hzForeL: parseDmsString(r?.hzForeLStr || '90°00\'00"'),
      hzBackR: parseDmsString(r?.hzBackRStr || '180°00\'00"'),
      hzForeR: parseDmsString(r?.hzForeRStr || '270°00\'00"'),
      vertL: parseDmsString(r?.vertLStr || '90°00\'00"'),
      vertR: parseDmsString(r?.vertRStr || '270°00\'00"'),
      miaA: Number(metersToUnit(miaAMm / 1000, miaUnit).toFixed(3)),
      miaL: Number(metersToUnit(miaLMm / 1000, miaUnit).toFixed(3)),
      miaB: Number(metersToUnit(miaBMm / 1000, miaUnit).toFixed(3)),
    };
  });
}

export function convertAiDetailRows(
  payload: AiActionImportDetailPoints['payload'],
  units: DetailUnitSettings,
  defaults: {
    defaultStation: string;
    defaultOrient: string;
    defaultVertMode: VerticalCircleMode;
    existingCount: number;
  }
): { rows: DetailSurveyRow[]; detectedVerticalMode?: VerticalCircleMode } {
  const now = Date.now();
  const list = Array.isArray(payload?.rows) ? payload.rows : [];
  let detectedVerticalMode: VerticalCircleMode | undefined = payload?.verticalMode;

  const rows: DetailSurveyRow[] = list.map((r, idx) => {
    const vertStr = String(
      r?.vertAngleStr || (defaults.defaultVertMode === 'Z' ? '90°00\'00"' : '0°00\'00"')
    ).trim();
    const rowMode = inferVerticalModeFromAngleStr(
      vertStr,
      r?.verticalMode || payload?.verticalMode,
      defaults.defaultVertMode
    );
    if (!detectedVerticalMode) detectedVerticalMode = rowMode;

    const miaLMm = normalizeMiaToMm(r?.miaLMm, 1500);
    const miaAMm = normalizeMiaToMm(r?.miaAMm, miaLMm + 150);
    const miaBMm = normalizeMiaToMm(r?.miaBMm, Math.max(100, miaLMm - 150));
    const iM = normalizeInstrumentHeightM(r?.instrumentHeightM, 1.48);

    return {
      id: `ai-dt-${now}-${idx}`,
      pointName: String(r?.pointName || `P${defaults.existingCount + idx + 1}`).trim(),
      stationName: String(r?.stationName || defaults.defaultStation).trim(),
      orientName: String(r?.orientName || defaults.defaultOrient).trim(),
      instrumentHeight: Number(metersToUnit(iM, units.instrumentHeightUnit).toFixed(3)),
      hzOrient: parseDmsString(r?.hzOrientStr || '0°00\'00"'),
      hzPoint: parseDmsString(r?.hzPointStr || '0°00\'00"'),
      vertAngle: parseDmsString(vertStr),
      miaA: Number(metersToUnit(miaAMm / 1000, units.miaUnit).toFixed(3)),
      miaL: Number(metersToUnit(miaLMm / 1000, units.miaUnit).toFixed(3)),
      miaB: Number(metersToUnit(miaBMm / 1000, units.miaUnit).toFixed(3)),
      kind: r?.kind === 'station' ? 'station' : 'detail',
      note: String(r?.note || 'AI nhập từ tài liệu / yêu cầu').trim(),
    };
  });

  return { rows, detectedVerticalMode };
}

/**
 * Convert existing detail rows numerically when changing mia or instrument height units
 * so physical measurements stay identical after switching e.g. mm -> m.
 */
export function convertDetailRowsUnitChange(
  rows: DetailSurveyRow[],
  prevUnits: DetailUnitSettings,
  nextUnits: DetailUnitSettings
): DetailSurveyRow[] {
  const miaChanged = prevUnits.miaUnit !== nextUnits.miaUnit;
  const iChanged = prevUnits.instrumentHeightUnit !== nextUnits.instrumentHeightUnit;
  if (!miaChanged && !iChanged) return rows;

  return rows.map((r) => ({
    ...r,
    instrumentHeight: iChanged
      ? Number(
          metersToUnit(
            unitToMeters(r.instrumentHeight, prevUnits.instrumentHeightUnit),
            nextUnits.instrumentHeightUnit
          ).toFixed(3)
        )
      : r.instrumentHeight,
    miaA: miaChanged
      ? Number(metersToUnit(unitToMeters(r.miaA, prevUnits.miaUnit), nextUnits.miaUnit).toFixed(3))
      : r.miaA,
    miaL: miaChanged
      ? Number(metersToUnit(unitToMeters(r.miaL, prevUnits.miaUnit), nextUnits.miaUnit).toFixed(3))
      : r.miaL,
    miaB: miaChanged
      ? Number(metersToUnit(unitToMeters(r.miaB, prevUnits.miaUnit), nextUnits.miaUnit).toFixed(3))
      : r.miaB,
  }));
}

export function convertTraverseRowsUnitChange(
  rows: TraverseRow[],
  prevUnit: LengthUnit,
  nextUnit: LengthUnit
): TraverseRow[] {
  if (prevUnit === nextUnit) return rows;
  return rows.map((r) => ({
    ...r,
    miaA: Number(metersToUnit(unitToMeters(r.miaA, prevUnit), nextUnit).toFixed(3)),
    miaL: Number(metersToUnit(unitToMeters(r.miaL, prevUnit), nextUnit).toFixed(3)),
    miaB: Number(metersToUnit(unitToMeters(r.miaB, prevUnit), nextUnit).toFixed(3)),
  }));
}

export function matchNameInList(name: string, targetNames: string[]): boolean {
  const norm = name.trim().toLowerCase();
  return targetNames.some((t) => t.trim().toLowerCase() === norm);
}
