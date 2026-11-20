import React from 'react';
import { Plus, Trash2, CheckCircle2, AlertCircle, BookOpen } from 'lucide-react';
import type {
  ComputedTraverseSummary,
  ControlPoint,
  LengthUnit,
  ToleranceGrade,
  TraverseConfig,
  TraverseRow,
  TraverseType,
  VerticalCircleMode,
} from '../types/survey';
import { formatDms } from '../utils/geodesy';
import { DmsInput } from './DmsInput';

interface TraverseTabProps {
  config: TraverseConfig;
  rows: TraverseRow[];
  summary: ComputedTraverseSummary;
  controlPoints: ControlPoint[];
  onChangeConfig: (next: TraverseConfig) => void;
  onChangeRows: (next: TraverseRow[]) => void;
  onOpenGuide: () => void;
}

export const TraverseTab: React.FC<TraverseTabProps> = ({
  config,
  rows,
  summary,
  controlPoints,
  onChangeConfig,
  onChangeRows,
  onOpenGuide,
}) => {
  const handleAddRow = () => {
    const lastTarget = rows[rows.length - 1]?.targetName || `T${rows.length}`;
    const nextIdx = rows.length + 1;
    onChangeRows([
      ...rows,
      {
        id: `tr-${Date.now()}`,
        stationName: lastTarget,
        targetName: `T${nextIdx}`,
        instrumentHeight: 1.48,
        hzBackL: { deg: '0', min: '00', sec: '00' },
        hzForeL: { deg: '90', min: '00', sec: '00' },
        hzBackR: { deg: '180', min: '00', sec: '00' },
        hzForeR: { deg: '270', min: '00', sec: '00' },
        vertL: config.verticalMode === 'Z' ? { deg: '90', min: '00', sec: '00' } : { deg: '0', min: '00', sec: '00' },
        vertR: config.verticalMode === 'Z' ? { deg: '270', min: '00', sec: '00' } : { deg: '0', min: '00', sec: '00' },
        miaA: 1700,
        miaL: 1500,
        miaB: 1300,
      },
    ]);
  };

  const handleUpdateRow = <K extends keyof TraverseRow>(id: string, key: K, value: TraverseRow[K]) => {
    onChangeRows(rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  };

  const handleDeleteRow = (id: string) => {
    onChangeRows(rows.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-5">
      {/* Configuration Bar */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-[#1E3A5F]">
              Đường Chuyền Kinh Vĩ 2 Mặt (Thuận kính L / Đảo kính R &amp; Bình sai Bowditch)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Tự động kiểm tra 2C, chỉ tiêu MO, góc nghiêng trung bình α_TB, sai số khép góc/tọa độ/cao độ và bình sai xuất tọa độ chuẩn.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenGuide}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-[#1E3A5F] hover:bg-slate-50 whitespace-nowrap"
            >
              <BookOpen className="h-3.5 w-3.5 text-[#0F766E]" />
              Cách đọc L/R &amp; 3 chỉ mia
            </button>
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#1E3A5F] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#162C49] whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm trạm đo
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label htmlFor="tr-vert-mode" className="block text-[11px] font-medium text-slate-600">
              Hệ bàn độ đứng
            </label>
            <select
              id="tr-vert-mode"
              value={config.verticalMode}
              onChange={(e) =>
                onChangeConfig({ ...config, verticalMode: e.target.value as VerticalCircleMode })
              }
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
            >
              <option value="Z">Góc thiên đỉnh Z (ngang = 90°)</option>
              <option value="V">Góc đứng V (ngang = 0°)</option>
            </select>
          </div>

          <div>
            <label htmlFor="tr-type" className="block text-[11px] font-medium text-slate-600">
              Dạng đường chuyền
            </label>
            <select
              id="tr-type"
              value={config.traverseType}
              onChange={(e) =>
                onChangeConfig({ ...config, traverseType: e.target.value as TraverseType })
              }
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
            >
              <option value="closed">Đường chuyền Khép kín</option>
              <option value="connecting">Đường chuyền Phù hợp</option>
            </select>
          </div>

          <div>
            <label htmlFor="tr-grade" className="block text-[11px] font-medium text-slate-600">
              Cấp hạn sai (TCVN)
            </label>
            <select
              id="tr-grade"
              value={config.toleranceGrade}
              onChange={(e) =>
                onChangeConfig({ ...config, toleranceGrade: e.target.value as ToleranceGrade })
              }
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
            >
              <option value="grade1">30''√n | 1/5000</option>
              <option value="grade2">40''√n | 1/3000</option>
              <option value="grade3">60''√n | 1/2000</option>
            </select>
          </div>

          <div>
            <label htmlFor="tr-start-st" className="block text-[11px] font-medium text-slate-600">
              Mốc khởi đầu
            </label>
            <select
              id="tr-start-st"
              value={config.startStationName}
              onChange={(e) => onChangeConfig({ ...config, startStationName: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-[#0F766E] focus:outline-none"
            >
              {controlPoints.map((cp) => (
                <option key={cp.id} value={cp.name}>
                  {cp.name} ({cp.x.toFixed(1)}, {cp.y.toFixed(1)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="tr-start-or" className="block text-[11px] font-medium text-slate-600">
              Mốc định hướng đầu
            </label>
            <select
              id="tr-start-or"
              value={config.startOrientName}
              onChange={(e) => onChangeConfig({ ...config, startOrientName: e.target.value })}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-[#0F766E] focus:outline-none"
            >
              {controlPoints.map((cp) => (
                <option key={cp.id} value={cp.name}>
                  {cp.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="tr-mia-unit" className="block text-[11px] font-medium text-slate-600">
              Đơn vị đọc mia a, l, b
            </label>
            <select
              id="tr-mia-unit"
              value={config.miaUnit}
              onChange={(e) =>
                onChangeConfig({ ...config, miaUnit: e.target.value as LengthUnit })
              }
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-[#0F766E] focus:outline-none"
            >
              <option value="mm">mm (ví dụ 1725)</option>
              <option value="cm">cm (ví dụ 172.5)</option>
              <option value="dm">dm (ví dụ 17.25)</option>
              <option value="m">m (ví dụ 1.725)</option>
            </select>
          </div>
        </div>

        {config.traverseType === 'connecting' && (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="tr-end-st" className="block text-[11px] font-medium text-slate-600">
                Mốc khép cuối (Phù hợp)
              </label>
              <select
                id="tr-end-st"
                value={config.endStationName}
                onChange={(e) => onChangeConfig({ ...config, endStationName: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-[#0F766E] focus:outline-none"
              >
                {controlPoints.map((cp) => (
                  <option key={cp.id} value={cp.name}>
                    {cp.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tr-end-or" className="block text-[11px] font-medium text-slate-600">
                Mốc định hướng cuối
              </label>
              <select
                id="tr-end-or"
                value={config.endOrientName}
                onChange={(e) => onChangeConfig({ ...config, endOrientName: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-[#0F766E] focus:outline-none"
              >
                {controlPoints.map((cp) => (
                  <option key={cp.id} value={cp.name}>
                    {cp.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </section>

      {/* Closure Quality Alert Cards */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Kiểm tra hạn sai đường chuyền">
        {/* Card 1: Overall Status */}
        <div
          className={`rounded-lg border p-4 ${
            summary.isOverallPass
              ? 'border-emerald-200 bg-emerald-50/70'
              : 'border-red-200 bg-red-50/70'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-600">Đánh giá chung</span>
            {summary.isOverallPass ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-700" />
            )}
          </div>
          <p
            className={`mt-1.5 text-base font-bold ${
              summary.isOverallPass ? 'text-emerald-800' : 'text-red-800'
            }`}
          >
            {summary.isOverallPass ? 'ĐẠT HẠN SAI' : 'VƯỢT HẠN SAI'}
          </p>
          <p className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            n = {summary.stationCount} trạm · ΣD = {summary.totalDistance.toFixed(3)} m
          </p>
        </div>

        {/* Card 2: Angular Closure */}
        <div
          className={`rounded-lg border p-4 ${
            summary.isAnglePass ? 'border-slate-200 bg-white' : 'border-red-300 bg-red-50/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600">Sai số khép góc f_β</span>
            <span className={summary.isAnglePass ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
              {summary.isAnglePass ? 'Đạt' : 'Vượt'}
            </span>
          </div>
          <p className="mt-1.5 text-lg font-bold font-mono tabular-nums text-[#1E3A5F]">
            {summary.fBetaArcSec >= 0 ? '+' : ''}
            {summary.fBetaArcSec.toFixed(1)}"
          </p>
          <p className="mt-1 text-[11px] text-slate-500 font-mono tabular-nums">
            Hạn sai: ±{summary.fBetaLimitArcSec.toFixed(1)}" · v_β = {(-summary.fBetaArcSec / Math.max(1, summary.stationCount)).toFixed(1)}"
          </p>
        </div>

        {/* Card 3: Coordinate Closure */}
        <div
          className={`rounded-lg border p-4 ${
            summary.isCoordPass ? 'border-slate-200 bg-white' : 'border-red-300 bg-red-50/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600">Sai số tọa độ f_s / ΣD</span>
            <span className={summary.isCoordPass ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
              {summary.isCoordPass ? 'Đạt' : 'Vượt'}
            </span>
          </div>
          <p className="mt-1.5 text-lg font-bold font-mono tabular-nums text-[#1E3A5F]">
            {Number.isFinite(summary.relativeErrorDenominator)
              ? `1 / ${Math.round(summary.relativeErrorDenominator).toLocaleString('vi-VN')}`
              : '0 (Chính xác)'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 font-mono tabular-nums">
            f_s = {summary.fS.toFixed(4)} m (f_X={summary.fX.toFixed(3)}, f_Y={summary.fY.toFixed(3)}) · GH 1/{summary.relativeLimitDenominator}
          </p>
        </div>

        {/* Card 4: Trigonometric Elevation Closure */}
        <div
          className={`rounded-lg border p-4 ${
            summary.isElevationPass ? 'border-slate-200 bg-white' : 'border-red-300 bg-red-50/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600">Sai số khép cao độ f_h</span>
            <span className={summary.isElevationPass ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
              {summary.isElevationPass ? 'Đạt' : 'Vượt'}
            </span>
          </div>
          <p className="mt-1.5 text-lg font-bold font-mono tabular-nums text-[#1E3A5F]">
            {summary.fHMm >= 0 ? '+' : ''}
            {summary.fHMm.toFixed(1)} mm
          </p>
          <p className="mt-1 text-[11px] text-slate-500 font-mono tabular-nums">
            Hạn sai ±40·(ΣD/100) = ±{summary.fHLimitMm.toFixed(1)} mm
          </p>
        </div>
      </section>

      {/* Table A: Two-Face Field Readings (L / R) */}
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">
            1. Nhập sổ đo 2 vị trí bàn độ (Thuận kính L &amp; Đảo kính R)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <th className="px-2.5 py-2.5">Trạm</th>
                <th className="px-2.5 py-2.5">Tới</th>
                <th className="px-2.5 py-2.5 text-right">i (m)</th>
                <th className="px-2.5 py-2.5">Hz sau L</th>
                <th className="px-2.5 py-2.5">Hz trước L</th>
                <th className="px-2.5 py-2.5">Hz sau R</th>
                <th className="px-2.5 py-2.5">Hz trước R</th>
                <th className="px-2.5 py-2.5">Đứng L ({config.verticalMode})</th>
                <th className="px-2.5 py-2.5">Đứng R ({config.verticalMode})</th>
                <th className="px-2.5 py-2.5 text-right">Chỉ a ({config.miaUnit})</th>
                <th className="px-2.5 py-2.5 text-right">Chỉ l ({config.miaUnit})</th>
                <th className="px-2.5 py-2.5 text-right">Chỉ b ({config.miaUnit})</th>
                <th className="px-2 py-2.5 text-center">Xóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, idx) => (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={row.stationName}
                      onChange={(e) => handleUpdateRow(row.id, 'stationName', e.target.value)}
                      aria-label={`Trạm đo dòng ${idx + 1}`}
                      className="w-14 rounded border border-slate-200 px-1.5 py-1 font-mono font-semibold text-[#1E3A5F]"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={row.targetName}
                      onChange={(e) => handleUpdateRow(row.id, 'targetName', e.target.value)}
                      aria-label={`Điểm ngắm tới dòng ${idx + 1}`}
                      className="w-14 rounded border border-slate-200 px-1.5 py-1 font-mono font-semibold text-[#0F766E]"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={row.instrumentHeight}
                      onChange={(e) =>
                        handleUpdateRow(row.id, 'instrumentHeight', parseFloat(e.target.value) || 0)
                      }
                      aria-label={`Chiều cao máy trạm ${row.stationName}`}
                      className="w-16 rounded border border-slate-200 px-1.5 py-1 text-right font-mono tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <DmsInput
                      value={row.hzBackL}
                      onChange={(v) => handleUpdateRow(row.id, 'hzBackL', v)}
                      ariaLabelPrefix={`Hz sau L trạm ${row.stationName}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <DmsInput
                      value={row.hzForeL}
                      onChange={(v) => handleUpdateRow(row.id, 'hzForeL', v)}
                      ariaLabelPrefix={`Hz trước L trạm ${row.stationName}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <DmsInput
                      value={row.hzBackR}
                      onChange={(v) => handleUpdateRow(row.id, 'hzBackR', v)}
                      ariaLabelPrefix={`Hz sau R trạm ${row.stationName}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <DmsInput
                      value={row.hzForeR}
                      onChange={(v) => handleUpdateRow(row.id, 'hzForeR', v)}
                      ariaLabelPrefix={`Hz trước R trạm ${row.stationName}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <DmsInput
                      value={row.vertL}
                      onChange={(v) => handleUpdateRow(row.id, 'vertL', v)}
                      allowNegative={config.verticalMode === 'V'}
                      ariaLabelPrefix={`Góc đứng L trạm ${row.stationName}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <DmsInput
                      value={row.vertR}
                      onChange={(v) => handleUpdateRow(row.id, 'vertR', v)}
                      allowNegative={config.verticalMode === 'V'}
                      ariaLabelPrefix={`Góc đứng R trạm ${row.stationName}`}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="1"
                      value={row.miaA}
                      onChange={(e) => handleUpdateRow(row.id, 'miaA', parseFloat(e.target.value) || 0)}
                      aria-label={`Chỉ trên a trạm ${row.stationName}`}
                      className="w-16 rounded border border-slate-200 px-1.5 py-1 text-right font-mono tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="1"
                      value={row.miaL}
                      onChange={(e) => handleUpdateRow(row.id, 'miaL', parseFloat(e.target.value) || 0)}
                      aria-label={`Chỉ giữa l trạm ${row.stationName}`}
                      className="w-16 rounded border border-slate-200 px-1.5 py-1 text-right font-mono tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="1"
                      value={row.miaB}
                      onChange={(e) => handleUpdateRow(row.id, 'miaB', parseFloat(e.target.value) || 0)}
                      aria-label={`Chỉ dưới b trạm ${row.stationName}`}
                      className="w-16 rounded border border-slate-200 px-1.5 py-1 text-right font-mono tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(row.id)}
                      aria-label={`Xóa cạnh ${row.stationName}-${row.targetName}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-xs text-slate-400">
                    Chưa có trạm đo đường chuyền nào. Bấm "Thêm trạm đo" hoặc yêu cầu Trợ lý AI nhập từ đề bài / khôi phục mẫu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Table B: Computed Two-Face Verification & Bowditch Adjusted Coordinates */}
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">
            2. Kết quả kiểm tra 2 mặt &amp; Bình sai tọa độ Bowditch (Tự động nạp trạm mới vào hệ thống)
          </h3>
          <span className="text-xs font-mono text-slate-500">
            α_ĐH đầu = {formatDms(summary.startAzimuthDeg)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <th className="px-3 py-2.5">Cạnh</th>
                <th className="px-3 py-2.5 text-right">β_L</th>
                <th className="px-3 py-2.5 text-right">β_R</th>
                <th className="px-3 py-2.5 text-right">2C (")</th>
                <th className="px-3 py-2.5 text-right">v_β (")</th>
                <th className="px-3 py-2.5 text-right">β_BS</th>
                <th className="px-3 py-2.5 text-right">MO (")</th>
                <th className="px-3 py-2.5 text-right">α_TB</th>
                <th className="px-3 py-2.5 text-right">D (m)</th>
                <th className="px-3 py-2.5 text-right">α cạnh</th>
                <th className="px-3 py-2.5 text-right">v_X / v_Y (m)</th>
                <th className="px-3 py-2.5 text-right">X_BS (m)</th>
                <th className="px-3 py-2.5 text-right">Y_BS (m)</th>
                <th className="px-3 py-2.5 text-right">H_BS (m)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
              {summary.rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80">
                  <td className="px-3 py-2.5 font-semibold text-[#1E3A5F] whitespace-nowrap">
                    {r.stationName} → {r.targetName}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-700">{formatDms(r.betaLDeg)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-700">{formatDms(r.betaRDeg)}</td>
                  <td
                    className={`px-3 py-2.5 text-right font-semibold ${
                      r.is2COk ? 'text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {r.diff2CArcSec.toFixed(1)}"
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-500">
                    {r.vBetaArcSec >= 0 ? '+' : ''}
                    {r.vBetaArcSec.toFixed(1)}"
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-900">
                    {formatDms(r.betaAdjustedDeg)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">
                    {r.moArcSec >= 0 ? '+' : ''}
                    {r.moArcSec.toFixed(1)}"
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-700">
                    {formatDms(r.alphaTbDeg, 1)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-900">
                    {r.distanceM.toFixed(3)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-700">{formatDms(r.azimuthDeg)}</td>
                  <td className="px-3 py-2.5 text-right text-[11px] text-slate-500 whitespace-nowrap">
                    {r.vX >= 0 ? '+' : ''}
                    {r.vX.toFixed(3)} / {r.vY >= 0 ? '+' : ''}
                    {r.vY.toFixed(3)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-[#1E3A5F]">
                    {r.xAdjusted.toFixed(3)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-[#1E3A5F]">
                    {r.yAdjusted.toFixed(3)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-[#0F766E]">
                    {r.hAdjusted.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
