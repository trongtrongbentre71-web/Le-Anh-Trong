import type {
  ControlPoint,
  DetailSurveyRow,
  DetailUnitSettings,
  LengthUnit,
  PointKind,
  TraverseRow,
  VerticalCircleMode,
} from '../types/survey';
import { metersToUnit, parseDmsString } from './geodesy';

export type OcrScanTarget = 'auto' | 'detail' | 'control' | 'traverse';
export type OcrDetectedType = 'detail' | 'control' | 'traverse' | 'unknown';

export interface OcrDetailCandidate {
  selected: boolean;
  pointName: string;
  stationName: string;
  orientName: string;
  instrumentHeightM: number;
  hzOrientStr: string;
  hzPointStr: string;
  vertAngleStr: string;
  verticalMode: VerticalCircleMode;
  miaAMm: number;
  miaLMm: number;
  miaBMm: number;
  kind: PointKind;
  note: string;
}

export interface OcrControlCandidate {
  selected: boolean;
  name: string;
  x: number;
  y: number;
  h: number;
  note: string;
}

export interface OcrTraverseCandidate {
  selected: boolean;
  stationName: string;
  targetName: string;
  instrumentHeightM: number;
  hzBackLStr: string;
  hzForeLStr: string;
  hzBackRStr: string;
  hzForeRStr: string;
  vertLStr: string;
  vertRStr: string;
  miaAMm: number;
  miaLMm: number;
  miaBMm: number;
}

export interface OcrScanResponse {
  detectedType: OcrDetectedType;
  sourceDescription: string;
  warnings: string[];
  detailRows: OcrDetailCandidate[];
  controlPoints: OcrControlCandidate[];
  traverseRows: OcrTraverseCandidate[];
}

export interface OcrDefaults {
  defaultStation: string;
  defaultOrient: string;
  defaultInstrumentHeightM: number;
  defaultVerticalMode: VerticalCircleMode;
  existingDetailCount: number;
}

/**
 * Extract pure base64 payload and MIME type from a browser Data URL.
 */
export function stripDataUrlPrefix(dataUrl: string): { mimeType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) {
    throw new Error('Dữ liệu ảnh không hợp lệ (không đúng định dạng base64).');
  }
  return { mimeType: match[1], base64: match[2] };
}

/**
 * Normalize a stadia reading to millimeters.
 * Field books often record stadia in meters (e.g. 1.650) OR millimeters (e.g. 1650).
 * Values > 0 and < 15 are unambiguously meters on a 3m-5m leveling rod.
 */
export function normalizeMiaToMm(val: unknown, fallbackMm: number): number {
  const n = typeof val === 'number' ? val : Number(String(val ?? '').replace(',', '.').trim());
  if (!Number.isFinite(n) || n <= 0) return fallbackMm;
  if (n < 15) return Math.round(n * 1000);
  if (n < 150) return Math.round(n * 10); // cm or dm rare case; > 15 and < 150 likely cm
  return Math.round(n);
}

/**
 * Normalize instrument height to meters.
 * If someone wrote 1450 (mm) or 145 (cm), convert sensibly to meters (0.5m - 3.0m).
 */
export function normalizeInstrumentHeightM(val: unknown, fallbackM: number): number {
  const n = typeof val === 'number' ? val : Number(String(val ?? '').replace(',', '.').trim());
  if (!Number.isFinite(n) || n <= 0) return fallbackM;
  if (n > 300) return Number((n / 1000).toFixed(3)); // mm -> m
  if (n > 10) return Number((n / 100).toFixed(3)); // cm -> m
  return Number(n.toFixed(3));
}

export function inferVerticalModeFromAngleStr(
  angleStr: string,
  explicitMode: unknown,
  fallback: VerticalCircleMode
): VerticalCircleMode {
  if (explicitMode === 'Z' || explicitMode === 'V') return explicitMode;
  const trimmed = (angleStr || '').trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('-')) return 'V';
  const degMatch = trimmed.match(/^(-?\d+)/);
  if (degMatch) {
    const deg = Math.abs(parseInt(degMatch[1], 10));
    if (deg >= 45 && deg <= 135) return 'Z';
    if (deg <= 35) return 'V';
  }
  return fallback;
}

/**
 * Calculate stadia verification error in mm: ((a + b) / 2) - l
 */
export function computeCandidateMiaErrorMm(aMm: number, lMm: number, bMm: number): number {
  return (aMm + bMm) / 2 - lMm;
}

/**
 * Sanitize raw JSON payload from /api/gemini/ocr-survey into clean editable candidates.
 */
export function sanitizeOcrResponse(raw: unknown, defaults: OcrDefaults): OcrScanResponse {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawType = String(obj.detectedType ?? 'unknown');
  const detectedType: OcrDetectedType =
    rawType === 'detail' || rawType === 'control' || rawType === 'traverse' ? rawType : 'unknown';

  const sourceDescription =
    typeof obj.sourceDescription === 'string' && obj.sourceDescription.trim()
      ? obj.sourceDescription.trim()
      : 'Ảnh sổ đo / màn hình máy trắc địa';

  const warnings = Array.isArray(obj.warnings)
    ? obj.warnings.map((w) => String(w).trim()).filter(Boolean)
    : [];

  const rawDetails = Array.isArray(obj.detailRows) ? obj.detailRows : [];
  const detailRows: OcrDetailCandidate[] = rawDetails.map((item, idx) => {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const vertStr =
      typeof r.vertAngleStr === 'string' && r.vertAngleStr.trim()
        ? r.vertAngleStr.trim()
        : defaults.defaultVerticalMode === 'Z'
          ? '90°00\'00"'
          : '0°00\'00"';
    const vMode = inferVerticalModeFromAngleStr(vertStr, r.verticalMode, defaults.defaultVerticalMode);
    const miaLMm = normalizeMiaToMm(r.miaLMm, 1500);
    const miaAMm = normalizeMiaToMm(r.miaAMm, miaLMm + 150);
    const miaBMm = normalizeMiaToMm(r.miaBMm, Math.max(100, miaLMm - 150));

    return {
      selected: true,
      pointName:
        typeof r.pointName === 'string' && r.pointName.trim()
          ? r.pointName.trim()
          : `P${defaults.existingDetailCount + idx + 1}`,
      stationName:
        typeof r.stationName === 'string' && r.stationName.trim()
          ? r.stationName.trim()
          : defaults.defaultStation,
      orientName:
        typeof r.orientName === 'string' && r.orientName.trim()
          ? r.orientName.trim()
          : defaults.defaultOrient,
      instrumentHeightM: normalizeInstrumentHeightM(
        r.instrumentHeightM,
        defaults.defaultInstrumentHeightM
      ),
      hzOrientStr:
        typeof r.hzOrientStr === 'string' && r.hzOrientStr.trim()
          ? r.hzOrientStr.trim()
          : '0°00\'00"',
      hzPointStr:
        typeof r.hzPointStr === 'string' && r.hzPointStr.trim()
          ? r.hzPointStr.trim()
          : '0°00\'00"',
      vertAngleStr: vertStr,
      verticalMode: vMode,
      miaAMm,
      miaLMm,
      miaBMm,
      kind: r.kind === 'station' ? 'station' : 'detail',
      note: typeof r.note === 'string' ? r.note.trim() : 'Quét Camera AI',
    };
  });

  const rawControls = Array.isArray(obj.controlPoints) ? obj.controlPoints : [];
  const controlPoints: OcrControlCandidate[] = rawControls
    .map((item, idx) => {
      const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const x = Number(r.x);
      const y = Number(r.y);
      const h = Number(r.h);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        selected: true,
        name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : `M${idx + 2}`,
        x: Number(x.toFixed(3)),
        y: Number(y.toFixed(3)),
        h: Number((Number.isFinite(h) ? h : 0).toFixed(3)),
        note: typeof r.note === 'string' ? r.note.trim() : 'Quét Camera AI',
      };
    })
    .filter((x): x is OcrControlCandidate => x !== null);

  const rawTraverses = Array.isArray(obj.traverseRows) ? obj.traverseRows : [];
  const traverseRows: OcrTraverseCandidate[] = rawTraverses.map((item, idx) => {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const miaLMm = normalizeMiaToMm(r.miaLMm, 1500);
    const miaAMm = normalizeMiaToMm(r.miaAMm, miaLMm + 200);
    const miaBMm = normalizeMiaToMm(r.miaBMm, Math.max(100, miaLMm - 200));
    return {
      selected: true,
      stationName:
        typeof r.stationName === 'string' && r.stationName.trim()
          ? r.stationName.trim()
          : `T${idx + 1}`,
      targetName:
        typeof r.targetName === 'string' && r.targetName.trim()
          ? r.targetName.trim()
          : `T${idx + 2}`,
      instrumentHeightM: normalizeInstrumentHeightM(
        r.instrumentHeightM,
        defaults.defaultInstrumentHeightM
      ),
      hzBackLStr: typeof r.hzBackLStr === 'string' && r.hzBackLStr.trim() ? r.hzBackLStr.trim() : '0°00\'00"',
      hzForeLStr: typeof r.hzForeLStr === 'string' && r.hzForeLStr.trim() ? r.hzForeLStr.trim() : '90°00\'00"',
      hzBackRStr: typeof r.hzBackRStr === 'string' && r.hzBackRStr.trim() ? r.hzBackRStr.trim() : '180°00\'00"',
      hzForeRStr: typeof r.hzForeRStr === 'string' && r.hzForeRStr.trim() ? r.hzForeRStr.trim() : '270°00\'00"',
      vertLStr: typeof r.vertLStr === 'string' && r.vertLStr.trim() ? r.vertLStr.trim() : '90°00\'00"',
      vertRStr: typeof r.vertRStr === 'string' && r.vertRStr.trim() ? r.vertRStr.trim() : '270°00\'00"',
      miaAMm,
      miaLMm,
      miaBMm,
    };
  });

  return {
    detectedType,
    sourceDescription,
    warnings,
    detailRows,
    controlPoints,
    traverseRows,
  };
}

/**
 * Convert selected detail OCR candidates into Tab 3 DetailSurveyRow items
 * matching the active unit configuration.
 */
export function buildDetailRowsFromCandidates(
  candidates: OcrDetailCandidate[],
  units: DetailUnitSettings
): DetailSurveyRow[] {
  const now = Date.now();
  return candidates
    .filter((c) => c.selected)
    .map((c, idx) => ({
      id: `cam-dt-${now}-${idx}`,
      pointName: c.pointName.trim() || `P${idx + 1}`,
      stationName: c.stationName.trim() || 'M1',
      orientName: c.orientName.trim() || 'M0',
      instrumentHeight: Number(metersToUnit(c.instrumentHeightM, units.instrumentHeightUnit).toFixed(3)),
      hzOrient: parseDmsString(c.hzOrientStr),
      hzPoint: parseDmsString(c.hzPointStr),
      vertAngle: parseDmsString(c.vertAngleStr),
      miaA: Number(metersToUnit(c.miaAMm / 1000, units.miaUnit).toFixed(3)),
      miaL: Number(metersToUnit(c.miaLMm / 1000, units.miaUnit).toFixed(3)),
      miaB: Number(metersToUnit(c.miaBMm / 1000, units.miaUnit).toFixed(3)),
      kind: c.kind,
      note: c.note.trim() || 'Quét Camera AI',
    }));
}

export function buildControlPointsFromCandidates(candidates: OcrControlCandidate[]): ControlPoint[] {
  const now = Date.now();
  return candidates
    .filter((c) => c.selected)
    .map((c, idx) => ({
      id: `cam-cp-${now}-${idx}`,
      name: c.name.trim() || `M${idx + 2}`,
      x: Number(c.x.toFixed(3)),
      y: Number(c.y.toFixed(3)),
      h: Number(c.h.toFixed(3)),
      note: c.note.trim() || 'Quét Camera AI',
    }));
}

export function buildTraverseRowsFromCandidates(
  candidates: OcrTraverseCandidate[],
  miaUnit: LengthUnit
): TraverseRow[] {
  const now = Date.now();
  return candidates
    .filter((c) => c.selected)
    .map((c, idx) => ({
      id: `cam-tr-${now}-${idx}`,
      stationName: c.stationName.trim() || `T${idx + 1}`,
      targetName: c.targetName.trim() || `T${idx + 2}`,
      instrumentHeight: Number(c.instrumentHeightM.toFixed(3)),
      hzBackL: parseDmsString(c.hzBackLStr),
      hzForeL: parseDmsString(c.hzForeLStr),
      hzBackR: parseDmsString(c.hzBackRStr),
      hzForeR: parseDmsString(c.hzForeRStr),
      vertL: parseDmsString(c.vertLStr),
      vertR: parseDmsString(c.vertRStr),
      miaA: Number(metersToUnit(c.miaAMm / 1000, miaUnit).toFixed(3)),
      miaL: Number(metersToUnit(c.miaLMm / 1000, miaUnit).toFixed(3)),
      miaB: Number(metersToUnit(c.miaBMm / 1000, miaUnit).toFixed(3)),
    }));
}
