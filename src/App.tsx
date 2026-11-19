import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Cloud,
  FileSpreadsheet,
  Upload,
  Bot,
  CheckCircle2,
  X,
} from 'lucide-react';
import type {
  AiActionAddDetail,
  ControlPoint,
  DetailSurveyRow,
  DetailUnitSettings,
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
  metersToUnit,
  parseDmsString,
} from './utils/geodesy';
import { exportFullExcelWorkbook, importExcelOrCsvFile } from './utils/excelWps';
import { ControlBenchmarksTab } from './components/ControlBenchmarksTab';
import { TraverseTab } from './components/TraverseTab';
import { DetailSurveyTab } from './components/DetailSurveyTab';
import { BuildingHeightTab } from './components/BuildingHeightTab';
import { MapAndExportTab } from './components/MapAndExportTab';
import { AiAssistantSidebar } from './components/AiAssistantSidebar';
import { InstrumentGuideModal } from './components/InstrumentGuideModal';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';

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
  const [notice, setNotice] = useState<string | null>(null);

  const quickFileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleExecuteAiAction = (action: AiActionAddDetail): string => {
    const p = action.payload;
    const miaA = metersToUnit((p.miaAMm || 1600) / 1000, detailUnits.miaUnit);
    const miaL = metersToUnit((p.miaLMm || 1500) / 1000, detailUnits.miaUnit);
    const miaB = metersToUnit((p.miaBMm || 1400) / 1000, detailUnits.miaUnit);
    const iVal = metersToUnit(p.instrumentHeightM || 1.48, detailUnits.instrumentHeightUnit);

    if (p.verticalMode && p.verticalMode !== detailVertMode) {
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
      vertAngle: parseDmsString(p.vertAngleStr || (detailVertMode === 'Z' ? '90' : '0')),
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
