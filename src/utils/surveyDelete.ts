import type {
  AiActionDeleteData,
  ComputedDetailRow,
  ControlPoint,
  DetailSurveyRow,
  TabKey,
  TraverseRow,
} from '../types/survey';

export type NormalizedDeleteTarget =
  | 'controlPoints'
  | 'traverseRows'
  | 'detailRows'
  | 'all'
  | 'resetSample';

export interface SurveyDeleteState {
  controlPoints: ControlPoint[];
  traverseRows: TraverseRow[];
  detailRows: DetailSurveyRow[];
  computedDetailRows: ComputedDetailRow[];
  activeTab: TabKey;
}

export interface SurveyDeleteResult {
  controlPoints: ControlPoint[];
  traverseRows: TraverseRow[];
  detailRows: DetailSurveyRow[];
  deletedCount: number;
  resetSample: boolean;
  summary: string;
  affectedTab?: TabKey;
}

/**
 * Strip Vietnamese diacritics for accent-tolerant keyword matching.
 */
export function stripVietnameseDiacritics(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Normalize point / benchmark / station name tokens so inputs like
 * "Điểm P4", "Mốc M0", "Trạm T1", or "P4 (lỗi mia)" match "P4" / "M0" / "T1".
 */
export function normalizeNameToken(raw: string): string {
  const cleaned = stripVietnameseDiacritics(raw)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^(diem|moc|tram|coc|point|station|benchmark|stt|dong|hang)\s*[:#-]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

export function matchFlexibleName(candidate: string, targetList: string[]): boolean {
  const normCand = normalizeNameToken(candidate);
  if (!normCand) return false;
  return targetList.some((t) => {
    const normT = normalizeNameToken(t);
    return Boolean(normT) && normT === normCand;
  });
}

export function normalizeDeleteTarget(
  rawTarget: string | undefined,
  activeTab: TabKey
): NormalizedDeleteTarget {
  const norm = stripVietnameseDiacritics(rawTarget || '').replace(/[\s_-]+/g, '');
  if (!norm || norm === 'current' || norm === 'active' || norm === 'tabhientai' || norm === 'hientai') {
    if (activeTab === 'control') return 'controlPoints';
    if (activeTab === 'traverse') return 'traverseRows';
    return 'detailRows';
  }
  if (
    norm === 'resetsample' ||
    norm === 'reset' ||
    norm === 'sample' ||
    norm === 'khoiphuc' ||
    norm === 'khoiphucmau' ||
    norm === 'dulieumau'
  ) {
    return 'resetSample';
  }
  if (
    norm === 'all' ||
    norm === 'everything' ||
    norm === 'tatca' ||
    norm === 'toanbo' ||
    norm === 'alltables'
  ) {
    return 'all';
  }
  if (
    norm === 'controlpoints' ||
    norm === 'control' ||
    norm === 'tab1' ||
    norm === 'mocgoc' ||
    norm === 'moc' ||
    norm === 'benchmarks'
  ) {
    return 'controlPoints';
  }
  if (
    norm === 'traverserows' ||
    norm === 'traverse' ||
    norm === 'tab2' ||
    norm === 'duongchuyen' ||
    norm === 'duongchuyen2mat'
  ) {
    return 'traverseRows';
  }
  if (
    norm === 'detailrows' ||
    norm === 'detail' ||
    norm === 'tab3' ||
    norm === 'sodochitiet' ||
    norm === 'chitiet' ||
    norm === 'points'
  ) {
    return 'detailRows';
  }
  return activeTab === 'control'
    ? 'controlPoints'
    : activeTab === 'traverse'
      ? 'traverseRows'
      : 'detailRows';
}

function buildRowIndexSet(rowIndices: number[] | undefined, length: number): Set<number> {
  const set = new Set<number>();
  if (!Array.isArray(rowIndices) || length <= 0) return set;
  for (const raw of rowIndices) {
    const num = Math.trunc(Number(raw));
    if (!Number.isFinite(num) || num === 0) continue;
    // 1-based positive index (e.g. 1 => idx 0), or negative from end (-1 => last row)
    const zeroIdx = num > 0 ? num - 1 : length + num;
    if (zeroIdx >= 0 && zeroIdx < length) {
      set.add(zeroIdx);
    }
  }
  return set;
}

function hasAnySpecificFilter(p: AiActionDeleteData['payload']): boolean {
  return Boolean(
    (Array.isArray(p.names) && p.names.length > 0) ||
      (Array.isArray(p.rowIndices) && p.rowIndices.length > 0) ||
      (typeof p.deleteLastN === 'number' && p.deleteLastN > 0) ||
      (Array.isArray(p.stationNames) && p.stationNames.length > 0) ||
      (Array.isArray(p.orientNames) && p.orientNames.length > 0) ||
      p.kind === 'detail' ||
      p.kind === 'station' ||
      (typeof p.noteContains === 'string' && p.noteContains.trim().length > 0) ||
      p.deleteErrorMiaRows === true ||
      (Array.isArray(p.keepOnlyNames) && p.keepOnlyNames.length > 0) ||
      p.deduplicate === true ||
      typeof p.minDistanceM === 'number' ||
      typeof p.maxDistanceM === 'number' ||
      typeof p.minH === 'number' ||
      typeof p.maxH === 'number'
  );
}

function formatRemovedNames(names: string[], maxShow = 6): string {
  const clean = names.filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length <= maxShow) return clean.join(', ');
  return `${clean.slice(0, maxShow).join(', ')} và ${clean.length - maxShow} mục khác`;
}

/**
 * Pure, comprehensive deletion engine supporting all 3 tables, row numbers,
 * station/orient filters, error mia filter, distance/elevation conditions,
 * keep-only, deduplicate, clear-all, cross-table fallback, and reset sample.
 */
export function executeSurveyDelete(
  payload: AiActionDeleteData['payload'],
  state: SurveyDeleteState
): SurveyDeleteResult {
  const p = payload || {};
  const target = normalizeDeleteTarget(p.target, state.activeTab);

  // 1. Reset to factory sample dataset
  if (target === 'resetSample') {
    return {
      controlPoints: state.controlPoints,
      traverseRows: state.traverseRows,
      detailRows: state.detailRows,
      deletedCount: 0,
      resetSample: true,
      summary: 'Đã khôi phục bộ dữ liệu mẫu gốc ban đầu',
    };
  }

  // 2. Wipe ALL 3 tables (or selective cross-table deletion when target === 'all' + filters)
  if (target === 'all') {
    const hasFilter = hasAnySpecificFilter(p);
    if (p.clearAll || !hasFilter) {
      const total =
        state.controlPoints.length + state.traverseRows.length + state.detailRows.length;
      return {
        controlPoints: [],
        traverseRows: [],
        detailRows: [],
        deletedCount: total,
        resetSample: false,
        summary: `Đã xóa sạch toàn bộ dữ liệu (${state.controlPoints.length} mốc gốc, ${state.traverseRows.length} trạm đường chuyền, ${state.detailRows.length} điểm chi tiết)`,
      };
    }

    // Apply filters across all 3 tables when target === 'all' with specific filters (e.g. names)
    const rControl = executeSurveyDelete({ ...p, target: 'controlPoints' }, state);
    const rTraverse = executeSurveyDelete({ ...p, target: 'traverseRows' }, {
      ...state,
      controlPoints: rControl.controlPoints,
    });
    const rDetail = executeSurveyDelete({ ...p, target: 'detailRows' }, {
      ...state,
      controlPoints: rControl.controlPoints,
      traverseRows: rTraverse.traverseRows,
    });
    const totalDeleted = rControl.deletedCount + rTraverse.deletedCount + rDetail.deletedCount;
    const parts = [rControl, rTraverse, rDetail]
      .filter((r) => r.deletedCount > 0)
      .map((r) => r.summary);
    return {
      controlPoints: rControl.controlPoints,
      traverseRows: rTraverse.traverseRows,
      detailRows: rDetail.detailRows,
      deletedCount: totalDeleted,
      resetSample: false,
      summary:
        totalDeleted > 0
          ? parts.join(' · ')
          : 'Không tìm thấy dữ liệu nào khớp điều kiện xóa trong các bảng.',
    };
  }

  const hasFilter = hasAnySpecificFilter(p);
  // If user called deleteData with target = specific table and NO filter & clearAll not explicitly false, treat as clearAll
  const shouldClearTable = p.clearAll === true || (!hasFilter && p.clearAll !== false);

  // 3. Tab 1: Control Benchmarks
  if (target === 'controlPoints') {
    if (shouldClearTable) {
      return {
        controlPoints: [],
        traverseRows: state.traverseRows,
        detailRows: state.detailRows,
        deletedCount: state.controlPoints.length,
        resetSample: false,
        affectedTab: 'control',
        summary: `Đã xóa sạch ${state.controlPoints.length} mốc gốc trong Tab 1`,
      };
    }

    const idxSet = buildRowIndexSet(p.rowIndices, state.controlPoints.length);
    const lastN =
      typeof p.deleteLastN === 'number' && p.deleteLastN > 0 ? Math.trunc(p.deleteLastN) : 0;
    const noteNeedle = p.noteContains ? stripVietnameseDiacritics(p.noteContains) : '';
    const seenNames = new Set<string>();
    const removed: ControlPoint[] = [];
    const kept: ControlPoint[] = [];

    state.controlPoints.forEach((cp, idx) => {
      let shouldRemove = false;

      if (p.names?.length && matchFlexibleName(cp.name, p.names)) shouldRemove = true;
      if (idxSet.has(idx)) shouldRemove = true;
      if (lastN > 0 && idx >= state.controlPoints.length - lastN) shouldRemove = true;
      if (noteNeedle && stripVietnameseDiacritics(cp.note).includes(noteNeedle)) shouldRemove = true;
      if (p.keepOnlyNames?.length && !matchFlexibleName(cp.name, p.keepOnlyNames)) shouldRemove = true;
      if (typeof p.minH === 'number' && cp.h > p.minH) shouldRemove = true;
      if (typeof p.maxH === 'number' && cp.h < p.maxH) shouldRemove = true;
      if (p.deduplicate) {
        const key = normalizeNameToken(cp.name);
        if (key && seenNames.has(key)) shouldRemove = true;
        else if (key) seenNames.add(key);
      }

      if (shouldRemove) removed.push(cp);
      else kept.push(cp);
    });

    // Cross-table fallback if AI guessed controlPoints for names that actually live in detailRows or traverseRows
    if (removed.length === 0 && p.names?.length && !p.keepOnlyNames?.length && !p.rowIndices?.length) {
      const detailFallback = executeSurveyDelete({ names: p.names, target: 'detailRows' }, state);
      if (detailFallback.deletedCount > 0) return detailFallback;
      const traverseFallback = executeSurveyDelete({ names: p.names, target: 'traverseRows' }, state);
      if (traverseFallback.deletedCount > 0) return traverseFallback;
    }

    return {
      controlPoints: kept,
      traverseRows: state.traverseRows,
      detailRows: state.detailRows,
      deletedCount: removed.length,
      resetSample: false,
      affectedTab: 'control',
      summary:
        removed.length > 0
          ? `Đã xóa ${removed.length} mốc gốc ở Tab 1 (${formatRemovedNames(removed.map((c) => c.name))})`
          : `Không tìm thấy mốc gốc nào khớp yêu cầu xóa${p.names?.length ? ` (${p.names.join(', ')})` : ''}`,
    };
  }

  // 4. Tab 2: Traverse Rows
  if (target === 'traverseRows') {
    if (shouldClearTable) {
      return {
        controlPoints: state.controlPoints,
        traverseRows: [],
        detailRows: state.detailRows,
        deletedCount: state.traverseRows.length,
        resetSample: false,
        affectedTab: 'traverse',
        summary: `Đã xóa sạch ${state.traverseRows.length} trạm đo trong Đường chuyền 2 mặt (Tab 2)`,
      };
    }

    const idxSet = buildRowIndexSet(p.rowIndices, state.traverseRows.length);
    const lastN =
      typeof p.deleteLastN === 'number' && p.deleteLastN > 0 ? Math.trunc(p.deleteLastN) : 0;
    const seenPairs = new Set<string>();
    const removed: TraverseRow[] = [];
    const kept: TraverseRow[] = [];

    state.traverseRows.forEach((row, idx) => {
      let shouldRemove = false;

      if (
        p.names?.length &&
        (matchFlexibleName(row.stationName, p.names) || matchFlexibleName(row.targetName, p.names))
      ) {
        shouldRemove = true;
      }
      if (p.stationNames?.length && matchFlexibleName(row.stationName, p.stationNames)) {
        shouldRemove = true;
      }
      if (idxSet.has(idx)) shouldRemove = true;
      if (lastN > 0 && idx >= state.traverseRows.length - lastN) shouldRemove = true;
      if (
        p.keepOnlyNames?.length &&
        !matchFlexibleName(row.stationName, p.keepOnlyNames) &&
        !matchFlexibleName(row.targetName, p.keepOnlyNames)
      ) {
        shouldRemove = true;
      }
      if (p.deduplicate) {
        const key = `${normalizeNameToken(row.stationName)}->${normalizeNameToken(row.targetName)}`;
        if (seenPairs.has(key)) shouldRemove = true;
        else seenPairs.add(key);
      }

      if (shouldRemove) removed.push(row);
      else kept.push(row);
    });

    // Cross-table fallback if AI guessed traverseRows for names that live in detailRows or controlPoints
    if (removed.length === 0 && p.names?.length && !p.keepOnlyNames?.length && !p.rowIndices?.length) {
      const detailFallback = executeSurveyDelete({ names: p.names, target: 'detailRows' }, state);
      if (detailFallback.deletedCount > 0) return detailFallback;
      const controlFallback = executeSurveyDelete({ names: p.names, target: 'controlPoints' }, state);
      if (controlFallback.deletedCount > 0) return controlFallback;
    }

    return {
      controlPoints: state.controlPoints,
      traverseRows: kept,
      detailRows: state.detailRows,
      deletedCount: removed.length,
      resetSample: false,
      affectedTab: 'traverse',
      summary:
        removed.length > 0
          ? `Đã xóa ${removed.length} dòng Đường chuyền ở Tab 2 (${formatRemovedNames(
              removed.map((r) => `${r.stationName}→${r.targetName}`)
            )})`
          : `Không tìm thấy dòng Đường chuyền nào khớp yêu cầu xóa${p.names?.length ? ` (${p.names.join(', ')})` : ''}`,
    };
  }

  // 5. Tab 3: Detail Survey Rows
  if (shouldClearTable) {
    return {
      controlPoints: state.controlPoints,
      traverseRows: state.traverseRows,
      detailRows: [],
      deletedCount: state.detailRows.length,
      resetSample: false,
      affectedTab: 'detail',
      summary: `Đã xóa sạch ${state.detailRows.length} điểm đo trong Sổ đo chi tiết (Tab 3)`,
    };
  }

  const computedById = new Map<string, ComputedDetailRow>();
  for (const cr of state.computedDetailRows) {
    computedById.set(cr.id, cr);
  }

  const idxSet = buildRowIndexSet(p.rowIndices, state.detailRows.length);
  const lastN =
    typeof p.deleteLastN === 'number' && p.deleteLastN > 0 ? Math.trunc(p.deleteLastN) : 0;
  const noteNeedle = p.noteContains ? stripVietnameseDiacritics(p.noteContains) : '';
  const seenPointNames = new Set<string>();
  const removed: DetailSurveyRow[] = [];
  const kept: DetailSurveyRow[] = [];

  state.detailRows.forEach((row, idx) => {
    const comp = computedById.get(row.id);
    let shouldRemove = false;

    if (p.names?.length && matchFlexibleName(row.pointName, p.names)) shouldRemove = true;
    if (p.stationNames?.length && matchFlexibleName(row.stationName, p.stationNames)) {
      shouldRemove = true;
    }
    if (p.orientNames?.length && matchFlexibleName(row.orientName, p.orientNames)) {
      shouldRemove = true;
    }
    if (idxSet.has(idx)) shouldRemove = true;
    if (lastN > 0 && idx >= state.detailRows.length - lastN) shouldRemove = true;
    if (p.kind === 'detail' && row.kind === 'detail') shouldRemove = true;
    if (p.kind === 'station' && row.kind === 'station') shouldRemove = true;
    if (noteNeedle && stripVietnameseDiacritics(row.note).includes(noteNeedle)) shouldRemove = true;
    if (p.deleteErrorMiaRows && comp && !comp.isMiaOk) shouldRemove = true;
    if (p.keepOnlyNames?.length && !matchFlexibleName(row.pointName, p.keepOnlyNames)) {
      shouldRemove = true;
    }
    if (typeof p.minDistanceM === 'number' && comp && comp.distanceM > p.minDistanceM) {
      shouldRemove = true;
    }
    if (typeof p.maxDistanceM === 'number' && comp && comp.distanceM < p.maxDistanceM) {
      shouldRemove = true;
    }
    if (typeof p.minH === 'number' && comp && comp.h > p.minH) {
      shouldRemove = true;
    }
    if (typeof p.maxH === 'number' && comp && comp.h < p.maxH) {
      shouldRemove = true;
    }
    if (p.deduplicate) {
      const key = normalizeNameToken(row.pointName);
      if (key && seenPointNames.has(key)) shouldRemove = true;
      else if (key) seenPointNames.add(key);
    }

    if (shouldRemove) removed.push(row);
    else kept.push(row);
  });

  // Cross-table fallback if AI guessed detailRows for names that live in controlPoints or traverseRows
  if (
    removed.length === 0 &&
    p.names?.length &&
    !p.stationNames?.length &&
    !p.orientNames?.length &&
    !p.deleteErrorMiaRows &&
    !p.keepOnlyNames?.length &&
    !p.rowIndices?.length
  ) {
    const controlFallback = executeSurveyDelete({ names: p.names, target: 'controlPoints' }, state);
    if (controlFallback.deletedCount > 0) return controlFallback;
    const traverseFallback = executeSurveyDelete({ names: p.names, target: 'traverseRows' }, state);
    if (traverseFallback.deletedCount > 0) return traverseFallback;
  }

  return {
    controlPoints: state.controlPoints,
    traverseRows: state.traverseRows,
    detailRows: kept,
    deletedCount: removed.length,
    resetSample: false,
    affectedTab: 'detail',
    summary:
      removed.length > 0
        ? `Đã xóa ${removed.length} điểm trong Sổ đo chi tiết (${formatRemovedNames(
            removed.map((r) => r.pointName)
          )})`
        : p.deleteErrorMiaRows
          ? 'Hiện không có điểm nào vượt sai số mia (> 2mm) để xóa'
          : `Không tìm thấy điểm đo nào khớp yêu cầu xóa${p.names?.length ? ` (${p.names.join(', ')})` : ''}`,
  };
}
