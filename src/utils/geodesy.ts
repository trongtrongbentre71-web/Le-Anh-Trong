import type {
  ComputedDetailRow,
  ComputedTraverseRow,
  ComputedTraverseSummary,
  ControlPoint,
  DetailSurveyRow,
  DetailUnitSettings,
  DMSValue,
  LengthUnit,
  MapPoint,
  ToleranceGrade,
  TraverseConfig,
  TraverseRow,
  UnifiedStation,
  VerticalCircleMode,
} from '../types/survey';

const EARTH_RADIUS_M = 6371000;
const REFRACTION_K = 0.14;
const STADIA_CONSTANT_K = 100;

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function mod360(deg: number): number {
  const m = deg % 360;
  return m < 0 ? m + 360 : m;
}

/** Shortest signed angular difference (a - b) in [-180, 180) degrees */
export function shortestAngleDiffDeg(aDeg: number, bDeg: number): number {
  let diff = mod360(aDeg) - mod360(bDeg);
  if (diff >= 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

/** Circular average of two angles in [0, 360) */
export function averageAnglesDeg(aDeg: number, bDeg: number): number {
  const diff = shortestAngleDiffDeg(bDeg, aDeg);
  return mod360(aDeg + diff / 2);
}

/**
 * Convert DMSValue to decimal degrees.
 * Correctly preserves negative zero degrees such as "-0° 15' 30\"" -> -0.258333...°
 */
export function dmsToDeg(dms: DMSValue): number {
  const rawDegStr = (dms.deg ?? '').trim();
  const isNeg = rawDegStr.startsWith('-');
  const d = Math.abs(parseFloat(rawDegStr) || 0);
  const m = Math.abs(parseFloat(dms.min) || 0);
  const s = Math.abs(parseFloat(dms.sec) || 0);
  const absDeg = d + m / 60 + s / 3600;
  return isNeg ? -absDeg : absDeg;
}

export function degToDms(deg: number, secDecimals = 0): DMSValue {
  const isNeg = deg < 0;
  const absDeg = Math.abs(deg);
  let totalSec = Math.round(absDeg * 3600 * Math.pow(10, secDecimals)) / Math.pow(10, secDecimals);
  const d = Math.floor(totalSec / 3600);
  totalSec -= d * 3600;
  const m = Math.floor(totalSec / 60);
  const s = +(totalSec - m * 60).toFixed(secDecimals);
  const degStr = isNeg ? `-${d}` : `${d}`;
  return {
    deg: degStr,
    min: String(m).padStart(2, '0'),
    sec: secDecimals > 0 ? s.toFixed(secDecimals) : String(Math.round(s)).padStart(2, '0'),
  };
}

export function formatDms(deg: number, secDecimals = 0): string {
  if (!Number.isFinite(deg)) return '—';
  const { deg: d, min: m, sec: s } = degToDms(deg, secDecimals);
  return `${d}°${m}'${s}"`;
}

/**
 * Parse a free-form DMS or decimal string (e.g. "45°20'10''", "-0°15'30\"", "89 15 00", "45.5")
 */
export function parseDmsString(input: string | number | undefined | null): DMSValue {
  if (input === undefined || input === null || input === '') {
    return { deg: '0', min: '00', sec: '00' };
  }
  if (typeof input === 'number') {
    return degToDms(input);
  }
  const trimmed = String(input).trim();
  const isNeg = trimmed.startsWith('-');
  const cleaned = trimmed.replace(/[°'"”’″′]/g, ' ').replace(/,/g, '.').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    const val = parseFloat(parts[0]);
    if (!Number.isFinite(val)) return { deg: '0', min: '00', sec: '00' };
    return degToDms(val);
  }

  const d = Math.abs(parseFloat(parts[0]) || 0);
  const m = Math.abs(parseFloat(parts[1]) || 0);
  const s = Math.abs(parseFloat(parts[2]) || 0);
  return {
    deg: isNeg ? `-${Math.trunc(d)}` : String(Math.trunc(d)),
    min: String(Math.trunc(m)).padStart(2, '0'),
    sec: Number.isInteger(s) ? String(s).padStart(2, '0') : s.toFixed(1),
  };
}

export function unitToMeters(value: number, unit: LengthUnit): number {
  switch (unit) {
    case 'm':
      return value;
    case 'dm':
      return value * 0.1;
    case 'cm':
      return value * 0.01;
    case 'mm':
      return value * 0.001;
  }
}

export function metersToUnit(valueM: number, unit: LengthUnit): number {
  switch (unit) {
    case 'm':
      return valueM;
    case 'dm':
      return valueM * 10;
    case 'cm':
      return valueM * 100;
    case 'mm':
      return valueM * 1000;
  }
}

/**
 * Grid Azimuth α_AB = MOD(DEGREES(ATAN2(Y_B - Y_A, X_B - X_A)), 360)
 * X = North (Bắc), Y = East (Đông)
 */
export function computeAzimuth(xFrom: number, yFrom: number, xTo: number, yTo: number): number {
  const dx = xTo - xFrom;
  const dy = yTo - yFrom;
  if (dx === 0 && dy === 0) return 0;
  return mod360(radToDeg(Math.atan2(dy, dx)));
}

/**
 * Earth curvature & atmospheric refraction correction f_ck (meters)
 * Applied when enabled and D >= 150m: f_ck = ((1 - 0.14) / (2 * 6371000)) * D^2
 */
export function computeCurvatureRefraction(distanceM: number, enabled: boolean): number {
  if (!enabled || distanceM < 150) return 0;
  return ((1 - REFRACTION_K) / (2 * EARTH_RADIUS_M)) * distanceM * distanceM;
}

export function getToleranceSpec(grade: ToleranceGrade): {
  angleCoeff: number;
  relativeDenom: number;
  max2CArcSec: number;
  label: string;
} {
  switch (grade) {
    case 'grade1':
      return { angleCoeff: 30, relativeDenom: 5000, max2CArcSec: 30, label: "Cấp 1 (30''√n | 1/5000)" };
    case 'grade2':
      return { angleCoeff: 40, relativeDenom: 3000, max2CArcSec: 40, label: "Cấp 2 (40''√n | 1/3000)" };
    case 'grade3':
      return { angleCoeff: 60, relativeDenom: 2000, max2CArcSec: 60, label: "Cấp 3 (60''√n | 1/2000)" };
  }
}

/**
 * Compute slope angle α from a single-face vertical reading according to Z (zenith=90°) or V (horizon=0°)
 */
export function singleFaceSlopeAngleDeg(vertDeg: number, mode: VerticalCircleMode): number {
  return mode === 'Z' ? 90 - vertDeg : vertDeg;
}

/**
 * Compute MO (vertical index error, arcsec) and α_TB (mean vertical slope angle, deg) from two-face readings
 */
export function twoFaceVerticalCalc(
  vertLDeg: number,
  vertRDeg: number,
  mode: VerticalCircleMode
): { moArcSec: number; alphaTbDeg: number } {
  if (mode === 'Z') {
    // Zenith mode: Z_L ≈ 90° - α + MO, Z_R ≈ 270° + α + MO
    // MO = (Z_L + Z_R - 360°)/2 ; α_TB = (Z_R - Z_L - 180°)/2
    const moDeg = (vertLDeg + vertRDeg - 360) / 2;
    const alphaTbDeg = (vertRDeg - vertLDeg - 180) / 2;
    return { moArcSec: moDeg * 3600, alphaTbDeg };
  }
  // Vertical angle V mode (horizon = 0°):
  // Electronic theodolites report Face R either as (180° - α + MO) or (-α + MO)
  if (vertRDeg > 90) {
    const moDeg = (vertLDeg + vertRDeg - 180) / 2;
    const alphaTbDeg = (vertLDeg - vertRDeg + 180) / 2;
    return { moArcSec: moDeg * 3600, alphaTbDeg };
  }
  const moDeg = (vertLDeg + vertRDeg) / 2;
  const alphaTbDeg = (vertLDeg - vertRDeg) / 2;
  return { moArcSec: moDeg * 3600, alphaTbDeg };
}

/**
 * Tab 2: Full Two-Face Theodolite Traverse & Bowditch Adjustment Engine
 */
export function computeTraverse(
  config: TraverseConfig,
  rows: TraverseRow[],
  controlPoints: ControlPoint[]
): ComputedTraverseSummary {
  const n = rows.length;
  const spec = getToleranceSpec(config.toleranceGrade);
  const controlMap = new Map<string, ControlPoint>();
  for (const cp of controlPoints) {
    controlMap.set(cp.name.trim(), cp);
  }

  const startStation = controlMap.get(config.startStationName.trim()) ?? controlPoints[0];
  const startOrient = controlMap.get(config.startOrientName.trim()) ?? controlPoints[1] ?? startStation;
  const endStation =
    config.traverseType === 'connecting'
      ? controlMap.get(config.endStationName.trim()) ?? startStation
      : startStation;
  const endOrient =
    config.traverseType === 'connecting'
      ? controlMap.get(config.endOrientName.trim()) ?? null
      : null;

  const startAzimuthDeg =
    startStation && startOrient
      ? computeAzimuth(startStation.x, startStation.y, startOrient.x, startOrient.y)
      : 0;

  const endAzimuthDeg =
    config.traverseType === 'connecting' && endStation && endOrient
      ? computeAzimuth(endStation.x, endStation.y, endOrient.x, endOrient.y)
      : null;

  if (n === 0 || !startStation) {
    return {
      rows: [],
      stationCount: 0,
      totalDistance: 0,
      sumBetaMeasuredDeg: 0,
      sumBetaTheoreticalDeg: 0,
      fBetaArcSec: 0,
      fBetaLimitArcSec: 0,
      isAnglePass: true,
      fX: 0,
      fY: 0,
      fS: 0,
      relativeErrorDenominator: Infinity,
      relativeLimitDenominator: spec.relativeDenom,
      isCoordPass: true,
      fH: 0,
      fHMm: 0,
      fHLimitMm: 0,
      isElevationPass: true,
      isOverallPass: true,
      adjustedStations: [],
      startAzimuthDeg,
      endAzimuthDeg,
    };
  }

  // Step 1: Per-row two-face reductions
  const prelim = rows.map((row) => {
    const hzBL = dmsToDeg(row.hzBackL);
    const hzFL = dmsToDeg(row.hzForeL);
    const hzBR = dmsToDeg(row.hzBackR);
    const hzFR = dmsToDeg(row.hzForeR);

    const betaLDeg = mod360(hzFL - hzBL);
    const betaRDeg = mod360(hzFR - hzBR);
    const diff2CArcSec = Math.abs(shortestAngleDiffDeg(betaLDeg, betaRDeg)) * 3600;
    const is2COk = diff2CArcSec <= spec.max2CArcSec;
    const betaAvgDeg = averageAnglesDeg(betaLDeg, betaRDeg);

    const vL = dmsToDeg(row.vertL);
    const vR = dmsToDeg(row.vertR);
    const { moArcSec, alphaTbDeg } = twoFaceVerticalCalc(vL, vR, config.verticalMode);

    const aM = unitToMeters(row.miaA, config.miaUnit);
    const lM = unitToMeters(row.miaL, config.miaUnit);
    const bM = unitToMeters(row.miaB, config.miaUnit);

    const miaCheckMm = ((aM + bM) / 2 - lM) * 1000;
    const isMiaOk = Math.abs(miaCheckMm) <= 2.0001;

    const cosAlpha = Math.cos(degToRad(alphaTbDeg));
    const distanceM = STADIA_CONSTANT_K * Math.abs(aM - bM) * cosAlpha * cosAlpha;
    const fck = computeCurvatureRefraction(distanceM, config.useCurvatureCorrection);
    const rawDeltaH = distanceM * Math.tan(degToRad(alphaTbDeg)) + row.instrumentHeight - lM + fck;

    return {
      row,
      betaLDeg,
      betaRDeg,
      diff2CArcSec,
      is2COk,
      betaAvgDeg,
      moArcSec,
      alphaTbDeg,
      miaCheckMm,
      isMiaOk,
      distanceM,
      rawDeltaH,
    };
  });

  // Step 2: Angular closure f_β & equal distribution v_β = -f_β / n
  const sumBetaMeasuredDeg = prelim.reduce((acc, r) => acc + r.betaAvgDeg, 0);
  let sumBetaTheoreticalDeg = (n - 2) * 180;
  let fBetaDeg = 0;

  if (config.traverseType === 'closed') {
    // Choose (n - 2)*180 for interior angles or (n + 2)*180 if exterior angles were measured
    const interiorTheo = Math.max(0, n - 2) * 180;
    const exteriorTheo = (n + 2) * 180;
    sumBetaTheoreticalDeg =
      Math.abs(sumBetaMeasuredDeg - interiorTheo) <= Math.abs(sumBetaMeasuredDeg - exteriorTheo)
        ? interiorTheo
        : exteriorTheo;
    fBetaDeg = sumBetaMeasuredDeg - sumBetaTheoreticalDeg;
  } else {
    // Connecting traverse: propagate raw azimuths to compute closing azimuth discrepancy
    let rawAz = startAzimuthDeg;
    for (let i = 0; i < prelim.length; i++) {
      rawAz = i === 0 ? mod360(rawAz + prelim[i].betaAvgDeg) : mod360(rawAz + 180 + prelim[i].betaAvgDeg);
    }
    const targetAz = endAzimuthDeg ?? rawAz;
    fBetaDeg = shortestAngleDiffDeg(rawAz, targetAz);
    sumBetaTheoreticalDeg = sumBetaMeasuredDeg - fBetaDeg;
  }

  const fBetaArcSec = fBetaDeg * 3600;
  const fBetaLimitArcSec = spec.angleCoeff * Math.sqrt(n);
  const isAnglePass = Math.abs(fBetaArcSec) <= fBetaLimitArcSec;
  const vBetaArcSec = -fBetaArcSec / n;
  const vBetaDeg = vBetaArcSec / 3600;

  // Step 3: Adjusted azimuths & raw coordinate increments
  let currentAz = startAzimuthDeg;
  const withAz = prelim.map((item, idx) => {
    const betaAdjustedDeg = mod360(item.betaAvgDeg + vBetaDeg);
    // Leg 0 turns from start orientation azimuth; subsequent legs turn from back-azimuth (prev + 180)
    currentAz =
      idx === 0
        ? mod360(startAzimuthDeg + betaAdjustedDeg)
        : mod360(currentAz + 180 + betaAdjustedDeg);

    const azRad = degToRad(currentAz);
    const rawDeltaX = item.distanceM * Math.cos(azRad);
    const rawDeltaY = item.distanceM * Math.sin(azRad);

    return {
      ...item,
      vBetaArcSec,
      betaAdjustedDeg,
      azimuthDeg: currentAz,
      rawDeltaX,
      rawDeltaY,
    };
  });

  // Step 4: Bowditch coordinate adjustment & elevation adjustment
  const totalDistance = withAz.reduce((acc, r) => acc + r.distanceM, 0);
  const sumRawDeltaX = withAz.reduce((acc, r) => acc + r.rawDeltaX, 0);
  const sumRawDeltaY = withAz.reduce((acc, r) => acc + r.rawDeltaY, 0);
  const sumRawDeltaH = withAz.reduce((acc, r) => acc + r.rawDeltaH, 0);

  const targetDeltaX = endStation.x - startStation.x;
  const targetDeltaY = endStation.y - startStation.y;
  const targetDeltaH = endStation.h - startStation.h;

  const fX = sumRawDeltaX - targetDeltaX;
  const fY = sumRawDeltaY - targetDeltaY;
  const fS = Math.hypot(fX, fY);
  const relativeErrorDenominator = fS > 1e-9 ? totalDistance / fS : Infinity;
  const isCoordPass = fS <= 1e-9 || relativeErrorDenominator >= spec.relativeDenom;

  const fH = sumRawDeltaH - targetDeltaH;
  const fHMm = fH * 1000;
  const fHLimitMm = 40 * (totalDistance / 100);
  const isElevationPass = Math.abs(fHMm) <= fHLimitMm;

  let curX = startStation.x;
  let curY = startStation.y;
  let curH = startStation.h;

  const computedRows: ComputedTraverseRow[] = withAz.map((item) => {
    const weight = totalDistance > 0 ? item.distanceM / totalDistance : 1 / n;
    const vX = -fX * weight;
    const vY = -fY * weight;
    const vH = -fH * weight;

    const adjDeltaX = item.rawDeltaX + vX;
    const adjDeltaY = item.rawDeltaY + vY;
    const adjDeltaH = item.rawDeltaH + vH;

    curX += adjDeltaX;
    curY += adjDeltaY;
    curH += adjDeltaH;

    return {
      ...item.row,
      betaLDeg: item.betaLDeg,
      betaRDeg: item.betaRDeg,
      diff2CArcSec: item.diff2CArcSec,
      is2COk: item.is2COk,
      betaAvgDeg: item.betaAvgDeg,
      moArcSec: item.moArcSec,
      alphaTbDeg: item.alphaTbDeg,
      miaCheckMm: item.miaCheckMm,
      isMiaOk: item.isMiaOk,
      distanceM: item.distanceM,
      vBetaArcSec: item.vBetaArcSec,
      betaAdjustedDeg: item.betaAdjustedDeg,
      azimuthDeg: item.azimuthDeg,
      rawDeltaX: item.rawDeltaX,
      rawDeltaY: item.rawDeltaY,
      vX,
      vY,
      adjDeltaX,
      adjDeltaY,
      rawDeltaH: item.rawDeltaH,
      vH,
      adjDeltaH,
      xAdjusted: curX,
      yAdjusted: curY,
      hAdjusted: curH,
    };
  });

  // Collect newly adjusted traverse stations (excluding existing control benchmarks)
  const adjustedStations: UnifiedStation[] = [];
  const seen = new Set<string>(Array.from(controlMap.keys()));
  for (const r of computedRows) {
    const tName = r.targetName.trim();
    if (tName && !seen.has(tName)) {
      seen.add(tName);
      adjustedStations.push({
        name: tName,
        x: r.xAdjusted,
        y: r.yAdjusted,
        h: r.hAdjusted,
        source: 'traverse',
        sourceLabel: 'Đường chuyền 2 mặt (BS)',
        note: `Bình sai từ trạm ${r.stationName}`,
      });
    }
  }

  return {
    rows: computedRows,
    stationCount: n,
    totalDistance,
    sumBetaMeasuredDeg,
    sumBetaTheoreticalDeg,
    fBetaArcSec,
    fBetaLimitArcSec,
    isAnglePass,
    fX,
    fY,
    fS,
    relativeErrorDenominator,
    relativeLimitDenominator: spec.relativeDenom,
    isCoordPass,
    fH,
    fHMm,
    fHLimitMm,
    isElevationPass,
    isOverallPass: isAnglePass && isCoordPass && isElevationPass,
    adjustedStations,
    startAzimuthDeg,
    endAzimuthDeg,
  };
}

/**
 * Tab 3: Detail Survey & Sequential Station Chaining Engine
 * Points marked kind === 'station' (Trạm chuyền) immediately become available to subsequent rows.
 */
export function computeDetailSurvey(
  rows: DetailSurveyRow[],
  baseStations: UnifiedStation[],
  units: DetailUnitSettings,
  curvatureEnabled: boolean,
  verticalMode: VerticalCircleMode
): {
  computedRows: ComputedDetailRow[];
  transferStations: UnifiedStation[];
  allStations: UnifiedStation[];
} {
  const stationMap = new Map<string, UnifiedStation>();
  for (const st of baseStations) {
    stationMap.set(st.name.trim(), st);
  }

  const transferStations: UnifiedStation[] = [];
  const computedRows: ComputedDetailRow[] = [];

  for (const row of rows) {
    const st = stationMap.get(row.stationName.trim());
    const orient = stationMap.get(row.orientName.trim());

    const stationFound = Boolean(st);
    const orientFound = Boolean(orient);
    const stX = st?.x ?? 0;
    const stY = st?.y ?? 0;
    const stH = st?.h ?? 0;

    const orientAzimuthDeg =
      st && orient ? computeAzimuth(st.x, st.y, orient.x, orient.y) : 0;

    const aM = unitToMeters(row.miaA, units.miaUnit);
    const lM = unitToMeters(row.miaL, units.miaUnit);
    const bM = unitToMeters(row.miaB, units.miaUnit);
    const iM = unitToMeters(row.instrumentHeight, units.instrumentHeightUnit);

    const miaErrorMm = ((aM + bM) / 2 - lM) * 1000;
    const isMiaOk = Math.abs(miaErrorMm) <= 2.0001;

    const vertDeg = dmsToDeg(row.vertAngle);
    const slopeAngleDeg = singleFaceSlopeAngleDeg(vertDeg, verticalMode);
    const slopeRad = degToRad(slopeAngleDeg);
    const cosSlope = Math.cos(slopeRad);

    const distanceM = STADIA_CONSTANT_K * Math.abs(aM - bM) * cosSlope * cosSlope;
    const curvatureM = computeCurvatureRefraction(distanceM, curvatureEnabled);
    const deltaHM = distanceM * Math.tan(slopeRad) + iM - lM + curvatureM;

    const hzOrientDeg = dmsToDeg(row.hzOrient);
    const hzPointDeg = dmsToDeg(row.hzPoint);
    const pointAzimuthDeg = mod360(orientAzimuthDeg + (hzPointDeg - hzOrientDeg));
    const azRad = degToRad(pointAzimuthDeg);

    const x = stX + distanceM * Math.cos(azRad);
    const y = stY + distanceM * Math.sin(azRad);
    const h = stH + deltaHM;

    const computed: ComputedDetailRow = {
      ...row,
      stationFound,
      orientFound,
      stationX: stX,
      stationY: stY,
      stationH: stH,
      orientAzimuthDeg,
      miaErrorMm,
      isMiaOk,
      slopeAngleDeg,
      distanceM,
      distanceDisplay: metersToUnit(distanceM, units.outputUnit),
      curvatureM,
      deltaHM,
      deltaHDisplay: metersToUnit(deltaHM, units.outputUnit),
      pointAzimuthDeg,
      x,
      y,
      h,
    };

    computedRows.push(computed);

    // Continuous station chaining: register 'Trạm chuyền' immediately for subsequent rows
    const ptName = row.pointName.trim();
    if (row.kind === 'station' && ptName && stationFound && orientFound) {
      const transferred: UnifiedStation = {
        name: ptName,
        x,
        y,
        h,
        source: 'transfer',
        sourceLabel: 'Trạm chuyền chi tiết',
        note: row.note || `Chuyền từ ${row.stationName}`,
      };
      stationMap.set(ptName, transferred);
      transferStations.push(transferred);
    }
  }

  return {
    computedRows,
    transferStations,
    allStations: Array.from(stationMap.values()),
  };
}

/**
 * Tab 4 — Tool 1: Building Height (Accessible Base)
 * Mode A (angles): H = D * (tan α_top - tan α_bottom)
 * Mode B (mia): H = D * tan α_top + l_bottom
 */
export function computeAccessibleHeight(params: {
  mode: 'angles' | 'mia';
  distanceM: number;
  verticalMode: VerticalCircleMode;
  topAngle: DMSValue;
  bottomAngle: DMSValue;
  miaBottomM: number;
  baseElevationH?: number;
}): {
  alphaTopDeg: number;
  alphaBottomDeg: number;
  heightM: number;
  topElevationH: number;
} {
  const alphaTopDeg = singleFaceSlopeAngleDeg(dmsToDeg(params.topAngle), params.verticalMode);
  const alphaBottomDeg = singleFaceSlopeAngleDeg(dmsToDeg(params.bottomAngle), params.verticalMode);
  const heightM =
    params.mode === 'angles'
      ? params.distanceM * (Math.tan(degToRad(alphaTopDeg)) - Math.tan(degToRad(alphaBottomDeg)))
      : params.distanceM * Math.tan(degToRad(alphaTopDeg)) + params.miaBottomM;
  const topElevationH = (params.baseElevationH ?? 0) + heightM;
  return { alphaTopDeg, alphaBottomDeg, heightM, topElevationH };
}

/**
 * Tab 4 — Tool 2: Inaccessible High-Rise Building (Collinear 2-Station Vertical Intersection A & B)
 * Station B is closer to the building, Station A is further back by baseline b (m).
 * Axis elevations: H_axisA = H_A + i_A, H_axisB = H_B + i_B.
 * H_top = H_axisA + (b + D_B) * tan(α_A) = H_axisB + D_B * tan(α_B)
 * => D_B = ((H_axisA - H_axisB) + b * tan(α_A)) / (tan(α_B) - tan(α_A))
 */
export function computeInaccessibleHeight(params: {
  baselineB: number;
  axisElevA: number;
  axisElevB: number;
  verticalMode: VerticalCircleMode;
  topAngleA: DMSValue;
  topAngleB: DMSValue;
  bottomAngleB: DMSValue;
}): {
  alphaTopADeg: number;
  alphaTopBDeg: number;
  alphaBottomBDeg: number;
  distanceBM: number;
  distanceAM: number;
  topElevationH: number;
  bottomElevationH: number;
  buildingHeightM: number;
  isValid: boolean;
  errorMessage?: string;
} {
  const alphaTopADeg = singleFaceSlopeAngleDeg(dmsToDeg(params.topAngleA), params.verticalMode);
  const alphaTopBDeg = singleFaceSlopeAngleDeg(dmsToDeg(params.topAngleB), params.verticalMode);
  const alphaBottomBDeg = singleFaceSlopeAngleDeg(dmsToDeg(params.bottomAngleB), params.verticalMode);

  const tanA = Math.tan(degToRad(alphaTopADeg));
  const tanB = Math.tan(degToRad(alphaTopBDeg));
  const denom = tanB - tanA;

  if (Math.abs(denom) < 1e-7 || params.baselineB <= 0) {
    return {
      alphaTopADeg,
      alphaTopBDeg,
      alphaBottomBDeg,
      distanceBM: 0,
      distanceAM: 0,
      topElevationH: 0,
      bottomElevationH: 0,
      buildingHeightM: 0,
      isValid: false,
      errorMessage: 'Góc ngắm đỉnh tại trạm B phải lớn hơn trạm A và đáy b > 0.',
    };
  }

  const distanceBM = (params.axisElevA - params.axisElevB + params.baselineB * tanA) / denom;
  const distanceAM = distanceBM + params.baselineB;
  const topElevationH = params.axisElevB + distanceBM * tanB;
  const bottomElevationH = params.axisElevB + distanceBM * Math.tan(degToRad(alphaBottomBDeg));
  const buildingHeightM = topElevationH - bottomElevationH;

  if (distanceBM <= 0) {
    return {
      alphaTopADeg,
      alphaTopBDeg,
      alphaBottomBDeg,
      distanceBM,
      distanceAM,
      topElevationH,
      bottomElevationH,
      buildingHeightM,
      isValid: false,
      errorMessage: 'Khoảng cách D_B tính ra âm — kiểm tra lại thứ tự trạm A (xa) và B (gần) hoặc góc đứng.',
    };
  }

  return {
    alphaTopADeg,
    alphaTopBDeg,
    alphaBottomBDeg,
    distanceBM,
    distanceAM,
    topElevationH,
    bottomElevationH,
    buildingHeightM,
    isValid: true,
  };
}

/**
 * Tab 4 — Tool 3: Inverse Query between any two measured points A -> B
 */
export function computeTwoPointInverse(
  a: { x: number; y: number; h: number },
  b: { x: number; y: number; h: number }
): {
  horizontalDistanceM: number;
  slopeDistanceM: number;
  deltaHM: number;
  azimuthDeg: number;
  slopePercent: number;
} {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dh = b.h - a.h;
  const horizontalDistanceM = Math.hypot(dx, dy);
  const slopeDistanceM = Math.hypot(horizontalDistanceM, dh);
  const azimuthDeg = computeAzimuth(a.x, a.y, b.x, b.y);
  const slopePercent = horizontalDistanceM > 1e-9 ? (dh / horizontalDistanceM) * 100 : 0;
  return {
    horizontalDistanceM,
    slopeDistanceM,
    deltaHM: dh,
    azimuthDeg,
    slopePercent,
  };
}

/**
 * Tab 5: Generate AutoCAD Script (.scr) using E (Y), N (X), Z (H)
 */
export function generateAutoCadScript(points: MapPoint[], textHeight = 1.2): string {
  const th = Math.max(0.1, Number.isFinite(textHeight) ? textHeight : 1.2);
  const lines: string[] = [
    '; GEOSURVEY PRO - AutoCAD Coordinate & Elevation Script',
    '; Coordinate order: E (Y - Dong), N (X - Bac), Z (H - Cao do)',
    'OSMODE 0',
    'PDMODE 35',
    `PDSIZE ${(th * 0.45).toFixed(2)}`,
  ];

  for (const pt of points) {
    const e = pt.y.toFixed(3);
    const n = pt.x.toFixed(3);
    const z = pt.h.toFixed(3);
    const tx = (pt.y + th * 0.5).toFixed(3);
    const tyName = (pt.x + th * 0.4).toFixed(3);
    const tyElev = (pt.x - th * 0.95).toFixed(3);
    lines.push(`POINT ${e},${n},${z}`);
    lines.push(`-TEXT ${tx},${tyName} ${th.toFixed(2)} 0 ${pt.name}`);
    lines.push(`-TEXT ${tx},${tyElev} ${(th * 0.85).toFixed(2)} 0 H=${z}`);
  }

  lines.push('ZOOM E');
  lines.push('');
  return lines.join('\n');
}

/**
 * Tab 5: Generate Civil 3D PENZD CSV (Point, Easting Y, Northing X, Elevation Z, Description)
 * Includes UTF-8 BOM so WPS Office & Excel display Vietnamese descriptions cleanly.
 */
export function generateCivil3dCsv(points: MapPoint[], includeHeader = true): string {
  const rows: string[] = [];
  if (includeHeader) {
    rows.push('P,E,N,Z,D');
  }
  for (const pt of points) {
    const desc = (pt.note || pt.category).replace(/[\r\n,]+/g, ' ').trim();
    rows.push(`${pt.name},${pt.y.toFixed(3)},${pt.x.toFixed(3)},${pt.h.toFixed(3)},${desc}`);
  }
  return '\uFEFF' + rows.join('\r\n');
}
