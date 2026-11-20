import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Camera,
  Cloud,
  FileSpreadsheet,
  Upload,
  Bot,
  CheckCircle2,
  X,
} from 'lucide-react';
import type {
  AiActionExportData,
  AiSurveyAction,
  ControlPoint,
  DetailSurveyRow,
  DetailUnitSettings,
  LengthUnit,
  MapPoint,
  TraverseConfig,
  TraverseRow,
  UnifiedStation,
  VerticalCircleMode,
} from './types/survey';
import {
  INITIAL_CONTROL_POINTS,
  INITIAL_DETAIL_ROWS,
  INITIAL_DETAIL_UNITS,
  INITIAL_TRAVERSE_CONFIG,
  INITIAL_TRAVERSE_ROWS,
} from './utils/seedData';
import {
  computeDetailSurvey,
  computeTraverse,
  generateAutoCadScript,
  generateCivil3dCsv,
  metersToUnit,
  parseDmsString,
} from './utils/geodesy';
import {
  exportFullExcelWorkbook,
  importExcelOrCsvFile,
  triggerTextDownload,
} from './utils/excelWps';
import {
  convertAiControlPoints,
  convertAiDetailRows,
  convertAiTraverseRows,
  convertDetailRowsUnitChange,
  convertTraverseRowsUnitChange,
  matchNameInList,
} from './utils/chatAttachments';
import { normalizeInstrumentHeightM, normalizeMiaToMm } from './utils/cameraOcr';
import { ControlBenchmarksTab } from './components/ControlBenchmarksTab';
import { TraverseTab } from './components/TraverseTab';
import { DetailSurveyTab } from './components/DetailSurveyTab';
import { BuildingHeightTab } from './components/BuildingHeightTab';
import { MapAndExportTab } from './components/MapAndExportTab';
import { AiAssistantSidebar } from './components/AiAssistantSidebar';
import { InstrumentGuideModal } from './components/InstrumentGuideModal';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { CameraScannerModal } from './components/CameraScannerModal';

type TabKey = 'control' | 'traverse' | 'detail' | 'height' | 'map';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'control', label: '1. Mốc gốc' },
  { key: 'traverse', label: '2. Đường chuyền 2 mặt' },
  { key: 'detail', label: '3. Sổ đo chi tiết' },
  { key: 'height', label: '4. Đo cao & Tra cứu' },
  { key: 'map', label: '5. Bình đồ & Xuất file' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('control');

  // Tab 1 State
  const [controlPoints, setControlPoints] = useState<ControlPoint[]>(INITIAL_CONTROL_POINTS);

  // Tab 2 State
  const [traverseConfig, setTraverseConfig] = useState<TraverseConfig>(INITIAL_TRAVERSE_CONFIG);
  const [traverseRows, setTraverseRows] = useState<TraverseRow[]>(INITIAL_TRAVERSE_ROWS);

  // Tab 3 State
  const [detailUnits, setDetailUnits] = useState<DetailUnitSettings>(INITIAL_DETAIL_UNITS);
  const [detailCurvature, setDetailCurvature] = useState<boolean>(true);
  const [detailVertMode, setDetailVertMode] = useState<VerticalCircleMode>('Z');
  const [detailRows, setDetailRows] = useState<DetailSurveyRow[]>(INITIAL_DETAIL_ROWS);

  // UI Overlays & Sidebar
  const [aiOpen, setAiOpen] = useState<boolean>(true);
  const [guideOpen, setGuideOpen] = useState<boolean>(false);
  const [sheetsOpen, setSheetsOpen] = useState<boolean>(false);
  const [cameraOpen, setCameraOpen] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingExport, setPendingExport] = useState<AiActionExportData['payload'] | null>(null);

  const quickFileInputRef = useRef<HTMLInputElement | null>(null);
  const detailUnitsRef = useRef<DetailUnitSettings>(detailUnits);
  const detailVertModeRef = useRef<VerticalCircleMode>(detailVertMode);
  const traverseConfigRef = useRef<TraverseConfig>(traverseConfig);
  detailUnitsRef.current = detailUnits;
  detailVertModeRef.current = detailVertMode;
  traverseConfigRef.current = traverseConfig;

  // 1. Compute Tab 2 Two-Face Traverse & Bowditch Adjustment
  const traverseSummary = useMemo(
    () => computeTraverse(traverseConfig, traverseRows, controlPoints),
    [traverseConfig, traverseRows, controlPoints]
  );

  // 2. Base stations = [Control Benchmarks] + [Adjusted 2-Face Traverse Stations]
  const baseStations = useMemo<UnifiedStation[]>(() => {
    const controls: UnifiedStation[] = controlPoints.map((cp) => ({
      name: cp.name.trim(),
      x: cp.x,
      y: cp.y,
      h: cp.h,
      source: 'control',
      sourceLabel: 'Mốc khống chế gốc',
      note: cp.note,
    }));
    return [...controls, ...traverseSummary.adjustedStations];
  }, [controlPoints, traverseSummary.adjustedStations]);

  // 3. Compute Tab 3 Detail Survey & Continuous Transfer Stations
  const detailComputed = useMemo(
    () =>
      computeDetailSurvey(
        detailRows,
        baseStations,
        detailUnits,
        detailCurvature,
        detailVertMode
      ),
    [detailRows, baseStations, detailUnits, detailCurvature, detailVertMode]
  );

  // 4. Unified Stations = Control + Adjusted Traverse + Detail Transfer Stations
  const unifiedStations = detailComputed.allStations;

  // 5. All Map Points for Tab 4 Inverse Query, Tab 5 Map, Profile, AutoCAD, Civil 3D & AI Context
  const allMapPoints = useMemo<MapPoint[]>(() => {
    const map = new Map<string, MapPoint>();
    for (const st of baseStations) {
      map.set(st.name, {
        name: st.name,
        x: st.x,
        y: st.y,
        h: st.h,
        category: st.source === 'control' ? 'control' : 'traverse',
        note: st.note,
      });
    }
    for (const r of detailComputed.computedRows) {
      const nm = r.pointName.trim();
      if (!nm) continue;
      map.set(nm, {
        name: nm,
        x: r.x,
        y: r.y,
        h: r.h,
        category: r.kind === 'station' ? 'transfer' : 'detail',
        note: r.note,
        stationFrom: r.stationName,
      });
    }
    return Array.from(map.values());
  }, [baseStations, detailComputed.computedRows]);

  const traversePathNames = useMemo(() => {
    if (traverseRows.length === 0) return [];
    return [traverseRows[0].stationName, ...traverseRows.map((r) => r.targetName)];
  }, [traverseRows]);

  // Serialize live project context for Gemini AI Assistant
  const surveyContext = useMemo(
    () => ({
      controlPoints,
      traverseSummary: {
        type: traverseConfig.traverseType,
        grade: traverseConfig.toleranceGrade,
        stationCount: traverseSummary.stationCount,
        totalDistanceM: Number(traverseSummary.totalDistance.toFixed(3)),
        fBetaArcSec: Number(traverseSummary.fBetaArcSec.toFixed(1)),
        fBetaLimitArcSec: Number(traverseSummary.fBetaLimitArcSec.toFixed(1)),
        isAnglePass: traverseSummary.isAnglePass,
        fS: Number(traverseSummary.fS.toFixed(4)),
        relativeError: Number.isFinite(traverseSummary.relativeErrorDenominator)
          ? `1/${Math.round(traverseSummary.relativeErrorDenominator)}`
          : '0',
        isCoordPass: traverseSummary.isCoordPass,
        fHMm: Number(traverseSummary.fHMm.toFixed(1)),
        fHLimitMm: Number(traverseSummary.fHLimitMm.toFixed(1)),
        isElevationPass: traverseSummary.isElevationPass,
        adjustedStations: traverseSummary.adjustedStations,
      },
      detailUnits,
      detailVerticalMode: detailVertMode,
      detailRows: detailComputed.computedRows.map((r) => ({
        pointName: r.pointName,
        stationName: r.stationName,
        orientName: r.orientName,
        miaErrorMm: Number(r.miaErrorMm.toFixed(1)),
        isMiaOk: r.isMiaOk,
        distanceM: Number(r.distanceM.toFixed(3)),
        deltaHM: Number(r.deltaHM.toFixed(3)),
        x: Number(r.x.toFixed(3)),
        y: Number(r.y.toFixed(3)),
        h: Number(r.h.toFixed(3)),
        kind: r.kind,
        note: r.note,
      })),
    }),
    [
      controlPoints,
      traverseConfig,
      traverseSummary,
      detailUnits,
      detailVertMode,
      detailComputed.computedRows,
    ]
  );

  const showNotice = (msg: string) => {
    setNotice(msg);
  };

  const handleExportExcel = () => {
    exportFullExcelWorkbook({
      controlPoints,
      traverseSummary,
      detailRows: detailComputed.computedRows,
      allMapPoints,
    });
    showNotice('Đã xuất file Excel (.xlsx) tương thích chuẩn WPS Spreadsheets & Microsoft Excel.');
  };

  const handleImportExcelFile = async (file: File) => {
    try {
      const res = await importExcelOrCsvFile(file);
      if (res.controlPoints) setControlPoints(res.controlPoints);
      if (res.detailRows) setDetailRows(res.detailRows);
      showNotice(res.summaryMessage);
    } catch (err: unknown) {
      showNotice(
        `Lỗi đọc file ${file.name}: ${err instanceof Error ? err.message : 'Định dạng không hợp lệ.'}`
      );
    }
  };

  // Flush deferred AI export after React commits any chained edits/deletes/imports in the same turn
  useEffect(() => {
    if (!pendingExport) return;
    const { format, cadTextHeight } = pendingExport;
    setPendingExport(null);

    const dateTag = new Date().toISOString().slice(0, 10);
    if (format === 'excel_wps') {
      exportFullExcelWorkbook({
        controlPoints,
        traverseSummary,
        detailRows: detailComputed.computedRows,
        allMapPoints,
      });
      showNotice('Trợ lý AI đã xuất file Excel (.xlsx) chuẩn WPS Spreadsheets.');
    } else if (format === 'civil3d_csv') {
      const csv = generateCivil3dCsv(allMapPoints, true);
      triggerTextDownload(csv, `GEOSURVEY_Civil3D_PENZD_${dateTag}.csv`, 'text/csv;charset=utf-8');
      showNotice('Trợ lý AI đã xuất file CSV Civil 3D (P,E,N,Z,D có UTF-8 BOM).');
    } else if (format === 'autocad_scr') {
      const scr = generateAutoCadScript(allMapPoints, cadTextHeight || 1.2);
      triggerTextDownload(scr, `GEOSURVEY_AutoCAD_${dateTag}.scr`, 'text/plain;charset=utf-8');
      showNotice(`Trợ lý AI đã xuất file Script AutoCAD (.scr, cao chữ ${cadTextHeight || 1.2}).`);
    }
  }, [pendingExport, controlPoints, traverseSummary, detailComputed.computedRows, allMapPoints]);

  const handleExecuteAiAction = (action: AiSurveyAction): string => {
    if (action.type === 'updateSettings') {
      const p = action.payload;
      const changes: string[] = [];
      const validUnits: LengthUnit[] = ['m', 'dm', 'cm', 'mm'];

      const curDetailUnits = detailUnitsRef.current;
      const nextUnits: DetailUnitSettings = {
        miaUnit: p.detailMiaUnit && validUnits.includes(p.detailMiaUnit) ? p.detailMiaUnit : curDetailUnits.miaUnit,
        instrumentHeightUnit:
          p.detailInstrumentHeightUnit && validUnits.includes(p.detailInstrumentHeightUnit)
            ? p.detailInstrumentHeightUnit
            : curDetailUnits.instrumentHeightUnit,
        outputUnit:
          p.detailOutputUnit && validUnits.includes(p.detailOutputUnit)
            ? p.detailOutputUnit
            : curDetailUnits.outputUnit,
      };

      const unitsChanged =
        nextUnits.miaUnit !== curDetailUnits.miaUnit ||
        nextUnits.instrumentHeightUnit !== curDetailUnits.instrumentHeightUnit ||
        nextUnits.outputUnit !== curDetailUnits.outputUnit;

      if (unitsChanged) {
        if (p.convertExistingDetailValues !== false) {
          setDetailRows((prev) => convertDetailRowsUnitChange(prev, curDetailUnits, nextUnits));
        }
        detailUnitsRef.current = nextUnits;
        setDetailUnits(nextUnits);
        changes.push(`Đơn vị Tab 3: mia=${nextUnits.miaUnit}, i=${nextUnits.instrumentHeightUnit}, xuất=${nextUnits.outputUnit}`);
      }

      if (p.detailVerticalMode === 'Z' || p.detailVerticalMode === 'V') {
        detailVertModeRef.current = p.detailVerticalMode;
        setDetailVertMode(p.detailVerticalMode);
        changes.push(`Góc đứng Tab 3: ${p.detailVerticalMode}`);
      }
      if (typeof p.detailCurvatureEnabled === 'boolean') {
        setDetailCurvature(p.detailCurvatureEnabled);
        changes.push(`Hiệu chỉnh f_ck Tab 3: ${p.detailCurvatureEnabled ? 'Bật' : 'Tắt'}`);
      }

      const hasTraverseCfgChange =
        p.traverseVerticalMode ||
        p.traverseType ||
        p.toleranceGrade ||
        p.traverseMiaUnit ||
        typeof p.traverseCurvatureEnabled === 'boolean' ||
        p.startStationName ||
        p.startOrientName ||
        p.endStationName ||
        p.endOrientName;

      if (hasTraverseCfgChange) {
        const curTrCfg = traverseConfigRef.current;
        const nextTrMia =
          p.traverseMiaUnit && validUnits.includes(p.traverseMiaUnit)
            ? p.traverseMiaUnit
            : curTrCfg.miaUnit;
        if (nextTrMia !== curTrCfg.miaUnit) {
          setTraverseRows((prev) => convertTraverseRowsUnitChange(prev, curTrCfg.miaUnit, nextTrMia));
          changes.push(`Đơn vị mia Tab 2: ${nextTrMia}`);
        }
        const nextTrCfg: TraverseConfig = {
          ...curTrCfg,
          verticalMode:
            p.traverseVerticalMode === 'Z' || p.traverseVerticalMode === 'V'
              ? p.traverseVerticalMode
              : curTrCfg.verticalMode,
          traverseType:
            p.traverseType === 'closed' || p.traverseType === 'connecting'
              ? p.traverseType
              : curTrCfg.traverseType,
          toleranceGrade:
            p.toleranceGrade === 'grade1' ||
            p.toleranceGrade === 'grade2' ||
            p.toleranceGrade === 'grade3'
              ? p.toleranceGrade
              : curTrCfg.toleranceGrade,
          miaUnit: nextTrMia,
          useCurvatureCorrection:
            typeof p.traverseCurvatureEnabled === 'boolean'
              ? p.traverseCurvatureEnabled
              : curTrCfg.useCurvatureCorrection,
          startStationName: p.startStationName?.trim() || curTrCfg.startStationName,
          startOrientName: p.startOrientName?.trim() || curTrCfg.startOrientName,
          endStationName: p.endStationName?.trim() || curTrCfg.endStationName,
          endOrientName: p.endOrientName?.trim() || curTrCfg.endOrientName,
        };
        traverseConfigRef.current = nextTrCfg;
        setTraverseConfig(nextTrCfg);
        if (p.traverseType) changes.push(`Đường chuyền: ${p.traverseType === 'closed' ? 'Khép kín' : 'Phù hợp'}`);
        if (p.toleranceGrade) changes.push(`Cấp hạng: ${p.toleranceGrade}`);
        if (p.traverseVerticalMode) changes.push(`Góc đứng Tab 2: ${p.traverseVerticalMode}`);
      }

      if (changes.length === 0) return '';
      const label = `Cập nhật cài đặt (${changes.join(' · ')})`;
      showNotice(`Trợ lý AI: ${label}.`);
      return label;
    }

    if (action.type === 'updatePoints') {
      const p = action.payload;
      const summaries: string[] = [];

      if (Array.isArray(p.controlUpdates) && p.controlUpdates.length > 0) {
        setControlPoints((prev) =>
          prev.map((cp) => {
            const upd = p.controlUpdates!.find(
              (u) => u.name.trim().toLowerCase() === cp.name.trim().toLowerCase()
            );
            if (!upd) return cp;
            return {
              ...cp,
              name: upd.newName?.trim() || cp.name,
              x: typeof upd.x === 'number' && Number.isFinite(upd.x) ? Number(upd.x.toFixed(3)) : cp.x,
              y: typeof upd.y === 'number' && Number.isFinite(upd.y) ? Number(upd.y.toFixed(3)) : cp.y,
              h: typeof upd.h === 'number' && Number.isFinite(upd.h) ? Number(upd.h.toFixed(3)) : cp.h,
              note: typeof upd.note === 'string' ? upd.note : cp.note,
            };
          })
        );
        summaries.push(`Sửa ${p.controlUpdates.length} mốc gốc (${p.controlUpdates.map((u) => u.name).join(', ')})`);
      }

      if (Array.isArray(p.detailUpdates) && p.detailUpdates.length > 0) {
        const activeDetailUnits = detailUnitsRef.current;
        setDetailRows((prev) =>
          prev.map((row) => {
            const upd = p.detailUpdates!.find(
              (u) => u.pointName.trim().toLowerCase() === row.pointName.trim().toLowerCase()
            );
            if (!upd) return row;
            return {
              ...row,
              pointName: upd.newPointName?.trim() || row.pointName,
              stationName: upd.stationName?.trim() || row.stationName,
              orientName: upd.orientName?.trim() || row.orientName,
              instrumentHeight:
                typeof upd.instrumentHeightM === 'number'
                  ? Number(
                      metersToUnit(
                        normalizeInstrumentHeightM(upd.instrumentHeightM, 1.48),
                        activeDetailUnits.instrumentHeightUnit
                      ).toFixed(3)
                    )
                  : row.instrumentHeight,
              hzOrient: upd.hzOrientStr ? parseDmsString(upd.hzOrientStr) : row.hzOrient,
              hzPoint: upd.hzPointStr ? parseDmsString(upd.hzPointStr) : row.hzPoint,
              vertAngle: upd.vertAngleStr ? parseDmsString(upd.vertAngleStr) : row.vertAngle,
              miaA:
                typeof upd.miaAMm === 'number'
                  ? Number(metersToUnit(normalizeMiaToMm(upd.miaAMm, 1600) / 1000, activeDetailUnits.miaUnit).toFixed(3))
                  : row.miaA,
              miaL:
                typeof upd.miaLMm === 'number'
                  ? Number(metersToUnit(normalizeMiaToMm(upd.miaLMm, 1500) / 1000, activeDetailUnits.miaUnit).toFixed(3))
                  : row.miaL,
              miaB:
                typeof upd.miaBMm === 'number'
                  ? Number(metersToUnit(normalizeMiaToMm(upd.miaBMm, 1400) / 1000, activeDetailUnits.miaUnit).toFixed(3))
                  : row.miaB,
              kind: upd.kind === 'station' || upd.kind === 'detail' ? upd.kind : row.kind,
              note: typeof upd.note === 'string' ? upd.note : row.note,
            };
          })
        );
        summaries.push(`Sửa ${p.detailUpdates.length} điểm chi tiết (${p.detailUpdates.map((u) => u.pointName).join(', ')})`);
      }

      if (Array.isArray(p.traverseUpdates) && p.traverseUpdates.length > 0) {
        const activeTrMia = traverseConfigRef.current.miaUnit;
        setTraverseRows((prev) =>
          prev.map((row) => {
            const upd = p.traverseUpdates!.find(
              (u) => u.stationName.trim().toLowerCase() === row.stationName.trim().toLowerCase()
            );
            if (!upd) return row;
            return {
              ...row,
              targetName: upd.targetName?.trim() || row.targetName,
              instrumentHeight:
                typeof upd.instrumentHeightM === 'number'
                  ? normalizeInstrumentHeightM(upd.instrumentHeightM, row.instrumentHeight)
                  : row.instrumentHeight,
              hzBackL: upd.hzBackLStr ? parseDmsString(upd.hzBackLStr) : row.hzBackL,
              hzForeL: upd.hzForeLStr ? parseDmsString(upd.hzForeLStr) : row.hzForeL,
              hzBackR: upd.hzBackRStr ? parseDmsString(upd.hzBackRStr) : row.hzBackR,
              hzForeR: upd.hzForeRStr ? parseDmsString(upd.hzForeRStr) : row.hzForeR,
              vertL: upd.vertLStr ? parseDmsString(upd.vertLStr) : row.vertL,
              vertR: upd.vertRStr ? parseDmsString(upd.vertRStr) : row.vertR,
              miaA:
                typeof upd.miaAMm === 'number'
                  ? Number(metersToUnit(normalizeMiaToMm(upd.miaAMm, 1600) / 1000, activeTrMia).toFixed(3))
                  : row.miaA,
              miaL:
                typeof upd.miaLMm === 'number'
                  ? Number(metersToUnit(normalizeMiaToMm(upd.miaLMm, 1500) / 1000, activeTrMia).toFixed(3))
                  : row.miaL,
              miaB:
                typeof upd.miaBMm === 'number'
                  ? Number(metersToUnit(normalizeMiaToMm(upd.miaBMm, 1400) / 1000, activeTrMia).toFixed(3))
                  : row.miaB,
            };
          })
        );
        summaries.push(`Sửa ${p.traverseUpdates.length} trạm đường chuyền`);
      }

      if (summaries.length === 0) return '';
      const label = summaries.join(' · ');
      showNotice(`Trợ lý AI: ${label}.`);
      return label;
    }

    if (action.type === 'deleteData') {
      const p = action.payload;
      if (p.target === 'resetSample') {
        traverseConfigRef.current = INITIAL_TRAVERSE_CONFIG;
        detailUnitsRef.current = INITIAL_DETAIL_UNITS;
        detailVertModeRef.current = 'Z';
        setControlPoints(INITIAL_CONTROL_POINTS);
        setTraverseConfig(INITIAL_TRAVERSE_CONFIG);
        setTraverseRows(INITIAL_TRAVERSE_ROWS);
        setDetailUnits(INITIAL_DETAIL_UNITS);
        setDetailCurvature(true);
        setDetailVertMode('Z');
        setDetailRows(INITIAL_DETAIL_ROWS);
        showNotice('Trợ lý AI đã khôi phục lại toàn bộ dữ liệu mẫu ban đầu.');
        return 'Đã khôi phục bộ dữ liệu mẫu gốc';
      }

      if (p.target === 'all') {
        setControlPoints([]);
        setTraverseRows([]);
        setDetailRows([]);
        showNotice('Trợ lý AI đã xóa sạch dữ liệu cả 3 bảng để bạn bắt đầu khu đo mới.');
        return 'Đã xóa sạch dữ liệu Mốc gốc, Đường chuyền và Sổ đo chi tiết';
      }

      if (p.target === 'controlPoints') {
        if (p.clearAll) {
          setControlPoints([]);
          showNotice('Trợ lý AI đã xóa toàn bộ bảng Mốc gốc (Tab 1).');
          return 'Đã xóa sạch bảng Mốc gốc (Tab 1)';
        }
        const names = p.names || [];
        if (names.length > 0) {
          setControlPoints((prev) => prev.filter((c) => !matchNameInList(c.name, names)));
          const label = `Đã xóa mốc gốc: ${names.join(', ')}`;
          showNotice(`Trợ lý AI: ${label}.`);
          return label;
        }
      }

      if (p.target === 'traverseRows') {
        if (p.clearAll) {
          setTraverseRows([]);
          showNotice('Trợ lý AI đã xóa toàn bộ bảng Đường chuyền 2 mặt (Tab 2).');
          return 'Đã xóa sạch bảng Đường chuyền 2 mặt (Tab 2)';
        }
        const names = p.names || [];
        if (names.length > 0) {
          setTraverseRows((prev) =>
            prev.filter((r) => !matchNameInList(r.stationName, names) && !matchNameInList(r.targetName, names))
          );
          const label = `Đã xóa trạm đường chuyền: ${names.join(', ')}`;
          showNotice(`Trợ lý AI: ${label}.`);
          return label;
        }
      }

      if (p.target === 'detailRows') {
        if (p.clearAll) {
          setDetailRows([]);
          showNotice('Trợ lý AI đã xóa toàn bộ Sổ đo chi tiết (Tab 3).');
          return 'Đã xóa sạch Sổ đo chi tiết (Tab 3)';
        }
        if (p.deleteErrorMiaRows) {
          const badIds = new Set(detailComputed.computedRows.filter((r) => !r.isMiaOk).map((r) => r.id));
          setDetailRows((prev) => prev.filter((r) => !badIds.has(r.id)));
          const label = `Đã xóa ${badIds.size} điểm vượt sai số mia (> 2mm)`;
          showNotice(`Trợ lý AI: ${label}.`);
          return label;
        }
        const names = p.names || [];
        if (names.length > 0) {
          setDetailRows((prev) => prev.filter((r) => !matchNameInList(r.pointName, names)));
          const label = `Đã xóa điểm chi tiết: ${names.join(', ')}`;
          showNotice(`Trợ lý AI: ${label}.`);
          return label;
        }
      }
      return '';
    }

    if (action.type === 'exportData') {
      setPendingExport(action.payload);
      const fmt =
        action.payload.format === 'excel_wps'
          ? 'Excel WPS (.xlsx)'
          : action.payload.format === 'civil3d_csv'
            ? 'CSV Civil 3D (.csv)'
            : 'AutoCAD Script (.scr)';
      return `Đang tải xuống file ${fmt}`;
    }

    if (action.type === 'navigateOrOpenTool') {
      const p = action.payload;
      const parts: string[] = [];
      if (p.tab) {
        setActiveTab(p.tab);
        const tabLabels: Record<TabKey, string> = {
          control: 'Tab 1 (Mốc gốc)',
          traverse: 'Tab 2 (Đường chuyền 2 mặt)',
          detail: 'Tab 3 (Sổ đo chi tiết)',
          height: 'Tab 4 (Đo cao & Tra cứu)',
          map: 'Tab 5 (Bình đồ & Xuất file)',
        };
        parts.push(`Chuyển sang ${tabLabels[p.tab]}`);
      }
      if (p.openModal === 'guide') {
        setGuideOpen(true);
        parts.push('Mở Hướng dẫn Máy & Mia');
      } else if (p.openModal === 'sheets') {
        setSheetsOpen(true);
        parts.push('Mở đồng bộ Google Sheets');
      } else if (p.openModal === 'camera') {
        setCameraOpen(true);
        parts.push('Mở Camera quét số liệu');
      } else if (p.openModal === 'import_file') {
        quickFileInputRef.current?.click();
        parts.push('Mở hộp thoại chọn file WPS/Excel/CSV');
      }
      return parts.join(' · ');
    }

    if (action.type === 'importControlPoints') {
      const converted = convertAiControlPoints(action.payload);
      if (converted.length === 0) return '';
      const mode = action.payload.mode === 'replace' ? 'replace' : 'append';
      setControlPoints((prev) => (mode === 'replace' ? converted : [...prev, ...converted]));
      setActiveTab('control');
      const label = `Đã ${mode === 'replace' ? 'thay thế' : 'thêm'} ${converted.length} mốc gốc vào Tab 1 (${converted.map((c) => c.name).join(', ')})`;
      showNotice(`Trợ lý AI: ${label}.`);
      return label;
    }

    if (action.type === 'importTraverseData') {
      const cfg = action.payload.config;
      if (cfg) {
        setTraverseConfig((prev) => ({
          ...prev,
          verticalMode: cfg.verticalMode === 'V' || cfg.verticalMode === 'Z' ? cfg.verticalMode : prev.verticalMode,
          traverseType:
            cfg.traverseType === 'closed' || cfg.traverseType === 'connecting'
              ? cfg.traverseType
              : prev.traverseType,
          toleranceGrade:
            cfg.toleranceGrade === 'grade1' ||
            cfg.toleranceGrade === 'grade2' ||
            cfg.toleranceGrade === 'grade3'
              ? cfg.toleranceGrade
              : prev.toleranceGrade,
          startStationName: cfg.startStationName?.trim() || prev.startStationName,
          startOrientName: cfg.startOrientName?.trim() || prev.startOrientName,
          endStationName: cfg.endStationName?.trim() || prev.endStationName,
          endOrientName: cfg.endOrientName?.trim() || prev.endOrientName,
        }));
      }
      const converted = convertAiTraverseRows(action.payload, traverseConfigRef.current.miaUnit);
      if (converted.length === 0) return '';
      const mode = action.payload.mode === 'replace' ? 'replace' : 'append';
      setTraverseRows((prev) => (mode === 'replace' ? converted : [...prev, ...converted]));
      setActiveTab('traverse');
      const label = `Đã ${mode === 'replace' ? 'thay thế' : 'thêm'} ${converted.length} trạm đo 2 mặt vào Tab 2 & tự bình sai`;
      showNotice(`Trợ lý AI: ${label}.`);
      return label;
    }

    if (action.type === 'importDetailPoints') {
      const activeUnits = detailUnitsRef.current;
      const activeVertMode = detailVertModeRef.current;
      const { rows: converted, detectedVerticalMode } = convertAiDetailRows(
        action.payload,
        activeUnits,
        {
          defaultStation: unifiedStations[1]?.name || unifiedStations[0]?.name || 'M1',
          defaultOrient: unifiedStations[0]?.name || 'M0',
          defaultVertMode: activeVertMode,
          existingCount: detailRows.length,
        }
      );
      if (converted.length === 0) return '';
      if (detectedVerticalMode && detectedVerticalMode !== activeVertMode) {
        detailVertModeRef.current = detectedVerticalMode;
        setDetailVertMode(detectedVerticalMode);
      }
      const mode = action.payload.mode === 'replace' ? 'replace' : 'append';
      setDetailRows((prev) => (mode === 'replace' ? converted : [...prev, ...converted]));
      setActiveTab('detail');
      const label = `Đã ${mode === 'replace' ? 'thay thế' : 'thêm'} ${converted.length} điểm đo vào Tab 3 (Sổ đo chi tiết)`;
      showNotice(`Trợ lý AI: ${label}.`);
      return label;
    }

    // Legacy single-point addDetailPoint action
    const p = action.payload;
    const activeUnits = detailUnitsRef.current;
    const activeVertMode = detailVertModeRef.current;
    const miaA = metersToUnit((p.miaAMm || 1600) / 1000, activeUnits.miaUnit);
    const miaL = metersToUnit((p.miaLMm || 1500) / 1000, activeUnits.miaUnit);
    const miaB = metersToUnit((p.miaBMm || 1400) / 1000, activeUnits.miaUnit);
    const iVal = metersToUnit(p.instrumentHeightM || 1.48, activeUnits.instrumentHeightUnit);

    if (p.verticalMode && p.verticalMode !== activeVertMode) {
      detailVertModeRef.current = p.verticalMode;
      setDetailVertMode(p.verticalMode);
    }

    const newRow: DetailSurveyRow = {
      id: `ai-dt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pointName: p.pointName || `P${detailRows.length + 1}`,
      stationName: p.stationName || 'M1',
      orientName: p.orientName || 'M0',
      instrumentHeight: Number(iVal.toFixed(3)),
      hzOrient: parseDmsString(p.hzOrientStr || '0'),
      hzPoint: parseDmsString(p.hzPointStr || '0'),
      vertAngle: parseDmsString(p.vertAngleStr || (detailVertModeRef.current === 'Z' ? '90' : '0')),
      miaA: Number(miaA.toFixed(3)),
      miaL: Number(miaL.toFixed(3)),
      miaB: Number(miaB.toFixed(3)),
      kind: p.kind === 'station' ? 'station' : 'detail',
      note: p.note || 'Nhập qua Trợ lý AI',
    };

    setDetailRows((prev) => [...prev, newRow]);
    setActiveTab('detail');
    showNotice(`Trợ lý AI đã thêm điểm ${newRow.pointName} vào Tab 3 (Sổ đo chi tiết).`);
    return `Đã thêm điểm ${newRow.pointName} (Trạm ${newRow.stationName} → ĐH ${newRow.orientName}) vào Sổ đo chi tiết`;
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 clean zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-8 px-4 py-3 lg:px-6">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('control')}
            className="text-left text-base font-bold tracking-tight text-[#1E3A5F] whitespace-nowrap shrink-0"
          >
            GEOSURVEY PRO
          </button>

          {/* Zone 2: 5 Single-line Navigation Tabs */}
          <nav
            aria-label="Chuyển đổi 5 phân hệ trắc địa"
            className="hidden md:flex items-center gap-1 overflow-x-auto"
          >
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  aria-current={active ? 'page' : undefined}
                  className={`border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-[#0F766E] text-[#1E3A5F]'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#1E3A5F] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#162C49] whitespace-nowrap shrink-0"
            >
              <BookOpen className="h-3.5 w-3.5 text-teal-300" />
              Hướng dẫn Máy &amp; Mia
            </button>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <nav
          aria-label="Phân hệ di động"
          className="flex md:hidden items-center gap-1 overflow-x-auto border-t border-slate-100 px-3 py-1.5"
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={`mob-${tab.key}`}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                  active ? 'bg-[#1E3A5F] text-white' : 'text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Contextual Workspace Utility Bar */}
      <div className="border-b border-slate-200 bg-slate-100/70 px-4 py-2 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-600 font-mono tabular-nums">
            <span className="font-sans font-semibold text-[#1E3A5F]">Sổ Đo Kinh Vĩ &amp; Bình Đồ Tự Động</span>
            <span aria-hidden="true">·</span>
            <span>{controlPoints.length} mốc gốc</span>
            <span aria-hidden="true">·</span>
            <span>{traverseSummary.adjustedStations.length} trạm bình sai</span>
            <span aria-hidden="true">·</span>
            <span>{detailRows.length} điểm chi tiết</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#162C49] whitespace-nowrap"
            >
              <Camera className="h-3.5 w-3.5 text-teal-300" />
              Chụp số liệu (Camera)
            </button>

            <button
              type="button"
              onClick={() => setSheetsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-[#1E3A5F] hover:bg-slate-50 whitespace-nowrap"
            >
              <Cloud className="h-3.5 w-3.5 text-[#0F766E]" />
              Google Sheets
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-[#0F766E]" />
              Xuất Excel / WPS (.xlsx)
            </button>

            <button
              type="button"
              onClick={() => quickFileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5 text-slate-600" />
              Nhập WPS / CSV
            </button>
            <input
              ref={quickFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleImportExcelFile(file);
                  e.target.value = '';
                }
              }}
            />

            <button
              type="button"
              onClick={() => setAiOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap ${
                aiOpen
                  ? 'bg-[#0F766E] text-white'
                  : 'border border-slate-300 bg-white text-[#1E3A5F] hover:bg-slate-50'
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              {aiOpen ? 'Ẩn Trợ lý AI' : 'Mở Trợ lý AI'}
            </button>
          </div>
        </div>
      </div>

      {/* Transient Feedback Banner */}
      {notice && (
        <div className="flex items-center justify-between gap-3 border-b border-teal-200 bg-teal-50 px-4 py-2 text-xs text-teal-900 lg:px-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0F766E]" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Đóng thông báo"
            className="rounded p-0.5 text-teal-700 hover:bg-teal-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Split Workspace: Left Active Tab Content + Right Collapsible AI Chatbot */}
      <div className="flex flex-1 flex-col lg:flex-row min-h-0">
        <main className="flex-1 min-w-0 overflow-y-auto p-4 lg:p-6">
          {activeTab === 'control' && (
            <ControlBenchmarksTab
              controlPoints={controlPoints}
              unifiedStations={unifiedStations}
              onChangeControlPoints={setControlPoints}
            />
          )}

          {activeTab === 'traverse' && (
            <TraverseTab
              config={traverseConfig}
              rows={traverseRows}
              summary={traverseSummary}
              controlPoints={controlPoints}
              onChangeConfig={setTraverseConfig}
              onChangeRows={setTraverseRows}
              onOpenGuide={() => setGuideOpen(true)}
            />
          )}

          {activeTab === 'detail' && (
            <DetailSurveyTab
              rows={detailRows}
              computedRows={detailComputed.computedRows}
              baseStations={baseStations}
              units={detailUnits}
              curvatureEnabled={detailCurvature}
              verticalMode={detailVertMode}
              onChangeUnits={setDetailUnits}
              onToggleCurvature={setDetailCurvature}
              onChangeVerticalMode={setDetailVertMode}
              onChangeRows={setDetailRows}
              onOpenGuide={() => setGuideOpen(true)}
              onOpenCamera={() => setCameraOpen(true)}
            />
          )}

          {activeTab === 'height' && <BuildingHeightTab allPoints={allMapPoints} />}

          {activeTab === 'map' && (
            <MapAndExportTab
              allPoints={allMapPoints}
              traversePathNames={traversePathNames}
              onExportExcel={handleExportExcel}
              onImportExcelFile={handleImportExcelFile}
              onOpenGoogleSheets={() => setSheetsOpen(true)}
            />
          )}
        </main>

        <AiAssistantSidebar
          isOpen={aiOpen}
          onToggle={() => setAiOpen((v) => !v)}
          surveyContext={surveyContext}
          onExecuteAiAction={handleExecuteAiAction}
        />
      </div>

      {/* Visual Illustrated Instrument & Stadia Simulator Modal */}
      <InstrumentGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />

      {/* Field Camera AI OCR Scanner Modal */}
      <CameraScannerModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        availableStations={unifiedStations}
        detailUnits={detailUnits}
        detailVertMode={detailVertMode}
        traverseMiaUnit={traverseConfig.miaUnit}
        existingDetailCount={detailRows.length}
        onImportDetailRows={(newRows, detectedMode) => {
          if (detectedMode && detectedMode !== detailVertMode) {
            setDetailVertMode(detectedMode);
          }
          setDetailRows((prev) => [...prev, ...newRows]);
          setActiveTab('detail');
          showNotice(
            `Camera AI đã quét và nhập ${newRows.length} điểm đo vào Tab 3 (Sổ đo chi tiết).`
          );
        }}
        onImportControlPoints={(newCps) => {
          setControlPoints((prev) => [...prev, ...newCps]);
          setActiveTab('control');
          showNotice(
            `Camera AI đã quét và nhập ${newCps.length} mốc khống chế gốc vào Tab 1 (Mốc gốc).`
          );
        }}
        onImportTraverseRows={(newTrs) => {
          setTraverseRows((prev) => [...prev, ...newTrs]);
          setActiveTab('traverse');
          showNotice(
            `Camera AI đã quét và nhập ${newTrs.length} trạm đo 2 mặt vào Tab 2 (Đường chuyền 2 mặt).`
          );
        }}
      />

      {/* Two-Way Google Sheets Sync Modal */}
      <GoogleSheetsModal
        open={sheetsOpen}
        onClose={() => setSheetsOpen(false)}
        controlPoints={controlPoints}
        traverseSummary={traverseSummary}
        detailRows={detailComputed.computedRows}
        allMapPoints={allMapPoints}
        onApplyPulledData={({ controlPoints: cps, detailRows: dts }) => {
          setControlPoints(cps);
          setDetailRows(dts);
          showNotice('Đã đồng bộ kéo dữ liệu mới nhất từ Google Sheets về ứng dụng.');
        }}
      />
    </div>
  );
}
