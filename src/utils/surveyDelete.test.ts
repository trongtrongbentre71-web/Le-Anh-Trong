import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_CONTROL_POINTS,
  INITIAL_DETAIL_ROWS,
  INITIAL_DETAIL_UNITS,
  INITIAL_TRAVERSE_ROWS,
} from '../utils/seedData';
import { computeDetailSurvey } from './geodesy';
import {
  executeSurveyDelete,
  matchFlexibleName,
  normalizeDeleteTarget,
  normalizeNameToken,
} from './surveyDelete';

function makeBaseState(activeTab: 'control' | 'traverse' | 'detail' = 'detail') {
  const baseStations = INITIAL_CONTROL_POINTS.map((cp) => ({
    name: cp.name,
    x: cp.x,
    y: cp.y,
    h: cp.h,
    source: 'control' as const,
    sourceLabel: 'Mốc gốc',
    note: cp.note,
  }));
  const computed = computeDetailSurvey(
    INITIAL_DETAIL_ROWS,
    baseStations,
    INITIAL_DETAIL_UNITS,
    true,
    'Z'
  );
  return {
    controlPoints: INITIAL_CONTROL_POINTS,
    traverseRows: INITIAL_TRAVERSE_ROWS,
    detailRows: INITIAL_DETAIL_ROWS,
    computedDetailRows: computed.computedRows,
    activeTab,
  };
}

test('normalizeNameToken and matchFlexibleName strip Vietnamese prefixes and parenthetical notes', () => {
  assert.equal(normalizeNameToken('Điểm P4 (lỗi mia)'), 'p4');
  assert.equal(normalizeNameToken('Mốc M0'), 'm0');
  assert.equal(normalizeNameToken('Trạm T1'), 't1');
  assert.equal(matchFlexibleName('P4', ['Điểm P4 (lỗi mia)']), true);
  assert.equal(matchFlexibleName('M1', ['mốc m1']), true);
  assert.equal(matchFlexibleName('P1', ['P2']), false);
});

test('normalizeDeleteTarget maps aliases and current tab accurately', () => {
  assert.equal(normalizeDeleteTarget('control', 'detail'), 'controlPoints');
  assert.equal(normalizeDeleteTarget('tab2', 'detail'), 'traverseRows');
  assert.equal(normalizeDeleteTarget('chitiet', 'control'), 'detailRows');
  assert.equal(normalizeDeleteTarget('current', 'traverse'), 'traverseRows');
  assert.equal(normalizeDeleteTarget('tatca', 'detail'), 'all');
  assert.equal(normalizeDeleteTarget('reset', 'detail'), 'resetSample');
});

test('executeSurveyDelete deletes by stationNames without deleting the transfer station point itself', () => {
  const state = makeBaseState('detail');
  const res = executeSurveyDelete(
    { target: 'detailRows', stationNames: ['Trạm M2'] },
    state
  );
  // P5 and P6 are measured FROM station M2, while M2 itself is measured FROM station M1
  assert.equal(res.deletedCount, 2);
  assert.equal(res.detailRows.some((r) => r.pointName === 'P5'), false);
  assert.equal(res.detailRows.some((r) => r.pointName === 'P6'), false);
  assert.equal(res.detailRows.some((r) => r.pointName === 'M2'), true);
});

test('executeSurveyDelete deletes by 1-based rowIndices and deleteLastN', () => {
  const state = makeBaseState('detail');
  const r1 = executeSurveyDelete({ target: 'detailRows', rowIndices: [1, 2] }, state);
  assert.equal(r1.deletedCount, 2);
  assert.equal(r1.detailRows[0].pointName, 'P3');

  const r2 = executeSurveyDelete({ target: 'detailRows', deleteLastN: 2 }, state);
  assert.equal(r2.deletedCount, 2);
  assert.equal(r2.detailRows.length, state.detailRows.length - 2);
});

test('executeSurveyDelete deletes error mia rows (> 2mm) accurately', () => {
  const state = makeBaseState('detail');
  const res = executeSurveyDelete(
    { target: 'detailRows', deleteErrorMiaRows: true },
    state
  );
  assert.equal(res.deletedCount, 1);
  assert.equal(res.detailRows.some((r) => r.pointName === 'P4'), false);
});

test('executeSurveyDelete falls back across tables when AI guesses wrong target for a point name', () => {
  const state = makeBaseState('detail');
  // M0 is a control benchmark, not a detail row — passing target: "detailRows" should still find and delete M0 in Tab 1
  const res = executeSurveyDelete({ target: 'detailRows', names: ['Mốc M0'] }, state);
  assert.equal(res.deletedCount, 1);
  assert.equal(res.controlPoints.some((c) => c.name === 'M0'), false);
  assert.equal(res.affectedTab, 'control');
});

test('executeSurveyDelete clears table when clearAll is omitted and no filters are provided, and supports keepOnlyNames', () => {
  const state = makeBaseState('detail');
  const cleared = executeSurveyDelete({ target: 'detailRows' }, state);
  assert.equal(cleared.detailRows.length, 0);
  assert.equal(cleared.deletedCount, state.detailRows.length);

  const kept = executeSurveyDelete({ target: 'detailRows', keepOnlyNames: ['P1', 'P2'] }, state);
  assert.equal(kept.detailRows.length, 2);
  assert.deepEqual(
    kept.detailRows.map((r) => r.pointName),
    ['P1', 'P2']
  );
});

test('executeSurveyDelete clears all 3 tables cleanly on target="all"', () => {
  const state = makeBaseState('control');
  const res = executeSurveyDelete({ target: 'all', clearAll: true }, state);
  assert.equal(res.controlPoints.length, 0);
  assert.equal(res.traverseRows.length, 0);
  assert.equal(res.detailRows.length, 0);
  assert.equal(
    res.deletedCount,
    state.controlPoints.length + state.traverseRows.length + state.detailRows.length
  );
});
