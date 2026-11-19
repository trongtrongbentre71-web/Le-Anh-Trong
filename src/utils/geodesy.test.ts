import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAccessibleHeight,
  computeAzimuth,
  computeCurvatureRefraction,
  computeDetailSurvey,
  computeInaccessibleHeight,
  computeTraverse,
  computeTwoPointInverse,
  dmsToDeg,
  generateAutoCadScript,
  generateCivil3dCsv,
  parseDmsString,
  twoFaceVerticalCalc,
} from './geodesy';
import {
  INITIAL_CONTROL_POINTS,
  INITIAL_DETAIL_ROWS,
  INITIAL_DETAIL_UNITS,
  INITIAL_TRAVERSE_CONFIG,
  INITIAL_TRAVERSE_ROWS,
} from './seedData';

test('dmsToDeg preserves negative zero degrees (-0° 15\' 30")', () => {
  const deg = dmsToDeg({ deg: '-0', min: '15', sec: '30' });
  assert.ok(deg < 0, 'Expected negative decimal degrees');
  assert.ok(Math.abs(deg - -(15 / 60 + 30 / 3600)) < 1e-9);

  const parsed = parseDmsString("-0°15'30\"");
  assert.equal(parsed.deg, '-0');
  assert.ok(Math.abs(dmsToDeg(parsed) - deg) < 1e-9);
});

test('computeAzimuth covers all 4 geodetic quadrants (X=North, Y=East)', () => {
  assert.ok(Math.abs(computeAzimuth(1000, 2000, 1050, 2000) - 0) < 1e-9);
  assert.ok(Math.abs(computeAzimuth(1000, 2000, 1000, 2050) - 90) < 1e-9);
  assert.ok(Math.abs(computeAzimuth(1000, 2000, 950, 2000) - 180) < 1e-9);
  assert.ok(Math.abs(computeAzimuth(1000, 2000, 1000, 1950) - 270) < 1e-9);
});

test('twoFaceVerticalCalc eliminates MO in Zenith Z mode', () => {
  // True α = +2°, MO = +18" (0.005°) -> Z_L = 88.005°, Z_R = 272.005°
  const { moArcSec, alphaTbDeg } = twoFaceVerticalCalc(88.005, 272.005, 'Z');
  assert.ok(Math.abs(moArcSec - 18) < 1e-6);
  assert.ok(Math.abs(alphaTbDeg - 2) < 1e-9);
});

test('computeTraverse Bowditch adjustment closes polygon exactly to starting benchmark', () => {
  const result = computeTraverse(
    INITIAL_TRAVERSE_CONFIG,
    INITIAL_TRAVERSE_ROWS,
    INITIAL_CONTROL_POINTS
  );

  assert.equal(result.stationCount, 4);
  assert.equal(result.isAnglePass, true);
  assert.equal(result.isCoordPass, true);
  assert.equal(result.isElevationPass, true);
  assert.equal(result.isOverallPass, true);

  // Closing station must return exactly to M1 (1000.000, 2000.000, 10.000)
  const lastRow = result.rows[result.rows.length - 1];
  assert.ok(Math.abs(lastRow.xAdjusted - 1000.0) < 1e-6);
  assert.ok(Math.abs(lastRow.yAdjusted - 2000.0) < 1e-6);
  assert.ok(Math.abs(lastRow.hAdjusted - 10.0) < 1e-6);

  // T1, T2, T3 should be exported to adjustedStations
  const names = result.adjustedStations.map((s) => s.name);
  assert.deepEqual(names, ['T1', 'T2', 'T3']);
});

test('computeDetailSurvey handles stadia checks, curvature >= 150m, and sequential station chaining', () => {
  const baseStations = INITIAL_CONTROL_POINTS.map((cp) => ({
    name: cp.name,
    x: cp.x,
    y: cp.y,
    h: cp.h,
    source: 'control' as const,
    sourceLabel: 'Mốc gốc',
    note: cp.note,
  }));

  const detail = computeDetailSurvey(
    INITIAL_DETAIL_ROWS,
    baseStations,
    INITIAL_DETAIL_UNITS,
    true,
    'Z'
  );

  // P4 has intentional +3.0mm stadia error
  const p4 = detail.computedRows.find((r) => r.pointName === 'P4');
  assert.ok(p4);
  assert.equal(p4.isMiaOk, false);
  assert.ok(Math.abs(p4.miaErrorMm - 3.0) < 1e-6);

  // M2 is marked Trạm chuyền -> P5 measured from M2 must resolve stationFound = true
  const p5 = detail.computedRows.find((r) => r.pointName === 'P5');
  assert.ok(p5);
  assert.equal(p5.stationFound, true);
  assert.equal(p5.orientFound, true);
  assert.ok(detail.transferStations.some((s) => s.name === 'M2'));

  // Curvature correction check: 0 below 150m, positive at 200m
  assert.equal(computeCurvatureRefraction(149.9, true), 0);
  const fck200 = computeCurvatureRefraction(200, true);
  const expected200 = ((1 - 0.14) / (2 * 6371000)) * 200 * 200;
  assert.ok(Math.abs(fck200 - expected200) < 1e-12);
});

test('Tab 4 building height and inverse query math', () => {
  // Accessible base: D = 40m, α_top = +30°, α_bot = -5° (Z_top = 60°, Z_bot = 95°)
  const acc = computeAccessibleHeight({
    mode: 'angles',
    distanceM: 40,
    verticalMode: 'Z',
    topAngle: { deg: '60', min: '00', sec: '00' },
    bottomAngle: { deg: '95', min: '00', sec: '00' },
    miaBottomM: 0,
    baseElevationH: 10,
  });
  const expectedH = 40 * (Math.tan((30 * Math.PI) / 180) - Math.tan((-5 * Math.PI) / 180));
  assert.ok(Math.abs(acc.heightM - expectedH) < 1e-6);

  // Inaccessible 2-station intersection: true D_B = 50m, b = 25m, H_axisA = H_axisB = 11.5m, H_top = 61.5m (α_B = 45°, tan α_A = 50/75)
  const alphaADeg = (Math.atan(50 / 75) * 180) / Math.PI;
  const zA = 90 - alphaADeg;
  const inacc = computeInaccessibleHeight({
    baselineB: 25,
    axisElevA: 11.5,
    axisElevB: 11.5,
    verticalMode: 'Z',
    topAngleA: parseDmsString(zA),
    topAngleB: { deg: '45', min: '00', sec: '00' },
    bottomAngleB: { deg: '90', min: '00', sec: '00' },
  });
  assert.equal(inacc.isValid, true);
  assert.ok(Math.abs(inacc.distanceBM - 50) < 0.05);
  assert.ok(Math.abs(inacc.buildingHeightM - 50) < 0.05);

  // Inverse query A -> B
  const inv = computeTwoPointInverse({ x: 1000, y: 2000, h: 10 }, { x: 1030, y: 2040, h: 12.5 });
  assert.ok(Math.abs(inv.horizontalDistanceM - 50) < 1e-9);
  assert.ok(Math.abs(inv.deltaHM - 2.5) < 1e-9);
  assert.ok(Math.abs(inv.slopePercent - 5.0) < 1e-9);
});

test('AutoCAD .scr and Civil 3D CSV (with UTF-8 BOM for WPS) generation', () => {
  const pts = [
    { name: 'M1', x: 1000, y: 2000, h: 10, category: 'control' as const, note: 'Mốc gốc' },
  ];
  const scr = generateAutoCadScript(pts, 1.5);
  assert.ok(scr.includes('POINT 2000.000,1000.000,10.000'));
  assert.ok(scr.includes('-TEXT'));

  const csv = generateCivil3dCsv(pts);
  assert.ok(csv.startsWith('\uFEFFP,E,N,Z,D'));
  assert.ok(csv.includes('M1,2000.000,1000.000,10.000,Mốc gốc'));
});
