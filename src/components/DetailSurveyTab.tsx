import React from 'react';
import { Plus, Trash2, AlertTriangle, CheckCircle2, BookOpen } from 'lucide-react';
import type {
  ComputedDetailRow,
  DetailSurveyRow,
  DetailUnitSettings,
  LengthUnit,
  PointKind,
  UnifiedStation,
  VerticalCircleMode,
} from '../types/survey';
import { formatDms } from '../utils/geodesy';
import { DmsInput } from './DmsInput';

interface DetailSurveyTabProps {
  rows: DetailSurveyRow[];
  computedRows: ComputedDetailRow[];
  baseStations: UnifiedStation[];
  units: DetailUnitSettings;
  curvatureEnabled: boolean;
  verticalMode: VerticalCircleMode;
  onChangeUnits: (next: DetailUnitSettings) => void;
  onToggleCurvature: (enabled: boolean) => void;
  onChangeVerticalMode: (mode: VerticalCircleMode) => void;
  onChangeRows: (next: DetailSurveyRow[]) => void;
  onOpenGuide: () => void;
}

const UNIT_OPTIONS: LengthUnit[] = ['m', 'dm', 'cm', 'mm'];

export const DetailSurveyTab: React.FC<DetailSurveyTabProps> = ({
  rows,
  computedRows,
  baseStations,
  units,
  curvatureEnabled,
  verticalMode,
  onChangeUnits,
  onToggleCurvature,
  onChangeVerticalMode,
  onChangeRows,
  onOpenGuide,
}) => {
  const handleAddRow = () => {
    const last = rows[rows.length - 1];
    const nextPointNum = rows.filter((r) => r.pointName.startsWith('P')).length + 1;
    onChangeRows([
      ...rows,
      {
        id: `dt-${Date.now()}`,
        pointName: `P${nextPointNum}`,
        stationName: last?.stationName || baseStations[1]?.name || baseStations[0]?.name || 'M1',
        orientName: last?.orientName || baseStations[0]?.name || 'M0',
        instrumentHeight: last?.instrumentHeight ?? (units.instrumentHeightUnit === 'm' ? 1.48 : 1480),
        hzOrient: { deg: '0', min: '00', sec: '00' },
        hzPoint: { deg: '45', min: '00', sec: '00' },
        vertAngle:
          verticalMode === 'Z'
            ? { deg: '90', min: '00', sec: '00' }
            : { deg: '0', min: '00', sec: '00' },
        miaA: units.miaUnit === 'mm' ? 1650 : units.miaUnit === 'cm' ? 165 : units.miaUnit === 'dm' ? 16.5 : 1.65,
        miaL: units.miaUnit === 'mm' ? 1500 : units.miaUnit === 'cm' ? 150 : units.miaUnit === 'dm' ? 15.0 : 1.5,
        miaB: units.miaUnit === 'mm' ? 1350 : units.miaUnit === 'cm' ? 135 : units.miaUnit === 'dm' ? 13.5 : 1.35,
        kind: 'detail',
        note: '',
      },
    ]);
  };

  const handleUpdate = <K extends keyof DetailSurveyRow>(id: string, key: K, val: DetailSurveyRow[K]) => {
    onChangeRows(rows.map((r) => (r.id === id ? { ...r, [key]: val } : r)));
  };

  const handleDelete = (id: string) => {
    onChangeRows(rows.filter((r) => r.id !== id));
  };

  // For each row index, stations available are baseStations + any PRIOR row marked 'station' (Trạm chuyền)
  const getAvailableStationsForRow = (rowIdx: number): UnifiedStation[] => {
    const map = new Map<string, UnifiedStation>();
    for (const s of baseStations) map.set(s.name, s);
    for (let i = 0; i < rowIdx; i++) {
      const prior = computedRows[i];
      if (prior && prior.kind === 'station' && prior.pointName.trim() && prior.stationFound) {
        map.set(prior.pointName.trim(), {
          name: prior.pointName.trim(),
          x: prior.x,
          y: prior.y,
          h: prior.h,
          source: 'transfer',
          sourceLabel: 'Trạm chuyền chi tiết',
          note: prior.note,
        });
      }
    }
    return Array.from(map.values());
  };

  const miaErrorCount = computedRows.filter((r) => !r.isMiaOk).length;
  const transferCount = computedRows.filter((r) => r.kind === 'station').length;

  return (
    <div className="space-y-4">
      {/* Flexible Unit Selector & Earth Curvature Toolbar */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-[#1E3A5F]">
              Sổ Đo Chi Tiết &amp; Chuyền Trạm Liên Tục Từ A - Z
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {computedRows.length} điểm đo · {transferCount} trạm chuyền ·{' '}
              <span className={miaErrorCount > 0 ? 'font-semibold text-red-700' : 'text-emerald-700 font-medium'}>
                {miaErrorCount > 0 ? `${miaErrorCount} điểm vượt sai số mia (> 2mm)` : 'Tất cả điểm đạt sai số mia ≤ 2mm'}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenGuide}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-[#1E3A5F] hover:bg-slate-50 whitespace-nowrap"
            >
              <BookOpen className="h-3.5 w-3.5 text-[#0F766E]" />
              Mô phỏng đọc chỉ a, l, b
            </button>
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#0F766E] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#0D625B] whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm điểm đo
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="unit-mia" className="block text-[11px] font-medium text-slate-600">
              1. Đơn vị nhập chỉ mia (a, l, b)
            </label>
            <select
              id="unit-mia"
              value={units.miaUnit}
              onChange={(e) => onChangeUnits({ ...units, miaUnit: e.target.value as LengthUnit })}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-[#0F766E] focus:outline-none"
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="unit-i" className="block text-[11px] font-medium text-slate-600">
              2. Đơn vị nhập chiều cao máy (i)
            </label>
            <select
              id="unit-i"
              value={units.instrumentHeightUnit}
              onChange={(e) =>
                onChangeUnits({ ...units, instrumentHeightUnit: e.target.value as LengthUnit })
              }
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-[#0F766E] focus:outline-none"
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="unit-out" className="block text-[11px] font-medium text-slate-600">
              3. Đơn vị xuất D ngang &amp; chênh cao h
            </label>
            <select
              id="unit-out"
              value={units.outputUnit}
              onChange={(e) => onChangeUnits({ ...units, outputUnit: e.target.value as LengthUnit })}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-[#0F766E] focus:outline-none"
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="detail-vert-mode" className="block text-[11px] font-medium text-slate-600">
              Hệ góc đứng (Z / V)
            </label>
            <select
              id="detail-vert-mode"
              value={verticalMode}
              onChange={(e) => onChangeVerticalMode(e.target.value as VerticalCircleMode)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
            >
              <option value="Z">Thiên đỉnh Z (90° ngang)</option>
              <option value="V">Góc đứng V (0° ngang, hỗ trợ -0°)</option>
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <label className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5">
              <div>
                <span className="block text-[11px] font-semibold text-slate-800">
                  Hiệu chỉnh f_ck (D ≥ 150m)
                </span>
                <span className="block text-[10px] text-slate-500">
                  Độ cong Trái Đất &amp; chiết quang
                </span>
              </div>
              <input
                type="checkbox"
                checked={curvatureEnabled}
                onChange={(e) => onToggleCurvature(e.target.checked)}
                className="h-4 w-4 accent-[#0F766E]"
              />
            </label>
          </div>
        </div>
      </section>

      {/* Main Detail Survey Table */}
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-[11px] text-slate-500">
          <span>Cột <strong>Điểm</strong> được cố định bên trái — kéo ngang bảng để xem Sai số mia (mm), D, h, tọa độ X, Y, H và Loại điểm.</span>
          <span className="font-mono">Xanh: |sai mia| ≤ 2mm · Đỏ: &gt; 2mm</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <th className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-2.5 py-2.5">Điểm</th>
                <th className="px-2.5 py-2.5">Trạm máy</th>
                <th className="px-2.5 py-2.5">Điểm ĐH</th>
                <th className="px-2.5 py-2.5 text-right">α_ĐH</th>
                <th className="px-2.5 py-2.5 text-right">i ({units.instrumentHeightUnit})</th>
                <th className="px-2.5 py-2.5">Hz_ĐH</th>
                <th className="px-2.5 py-2.5">Hz đo</th>
                <th className="px-2.5 py-2.5">Góc {verticalMode}</th>
                <th className="px-2.5 py-2.5 text-right">Trên a ({units.miaUnit})</th>
                <th className="px-2.5 py-2.5 text-right">Giữa l ({units.miaUnit})</th>
                <th className="px-2.5 py-2.5 text-right">Dưới b ({units.miaUnit})</th>
                <th className="px-2.5 py-2.5 text-right">Sai mia (mm)</th>
                <th className="px-2.5 py-2.5 text-right">D ({units.outputUnit})</th>
                <th className="px-2.5 py-2.5 text-right">h ({units.outputUnit})</th>
                <th className="px-2.5 py-2.5 text-right">X - Bắc (m)</th>
                <th className="px-2.5 py-2.5 text-right">Y - Đông (m)</th>
                <th className="px-2.5 py-2.5 text-right">Cao độ H (m)</th>
                <th className="px-2.5 py-2.5">Loại điểm</th>
                <th className="px-2.5 py-2.5">Ghi chú</th>
                <th className="px-2 py-2.5 text-center">Xóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {computedRows.map((row, idx) => {
                const availableStations = getAvailableStationsForRow(idx);
                const decimalsOut = units.outputUnit === 'mm' ? 1 : units.outputUnit === 'cm' ? 2 : 3;

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors ${
                      row.kind === 'station'
                        ? 'bg-amber-50/40 hover:bg-amber-50/70'
                        : !row.isMiaOk
                        ? 'bg-red-50/35 hover:bg-red-50/60'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-2 py-2">
                      <input
                        type="text"
                        value={row.pointName}
                        onChange={(e) => handleUpdate(row.id, 'pointName', e.target.value)}
                        aria-label={`Tên điểm dòng ${idx + 1}`}
                        className="w-14 rounded border border-slate-200 bg-white px-1.5 py-1 font-mono font-semibold text-[#1E3A5F]"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={row.stationName}
                        onChange={(e) => handleUpdate(row.id, 'stationName', e.target.value)}
                        aria-label={`Trạm máy điểm ${row.pointName}`}
                        className={`w-20 rounded border px-1.5 py-1 font-mono text-xs ${
                          row.stationFound
                            ? 'border-slate-200 bg-white text-slate-900'
                            : 'border-red-400 bg-red-50 text-red-700'
                        }`}
                      >
                        {!availableStations.some((s) => s.name === row.stationName) && (
                          <option value={row.stationName}>{row.stationName} (?)</option>
                        )}
                        {availableStations.map((st) => (
                          <option key={st.name} value={st.name}>
                            {st.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={row.orientName}
                        onChange={(e) => handleUpdate(row.id, 'orientName', e.target.value)}
                        aria-label={`Điểm định hướng điểm ${row.pointName}`}
                        className={`w-20 rounded border px-1.5 py-1 font-mono text-xs ${
                          row.orientFound
                            ? 'border-slate-200 bg-white text-slate-900'
                            : 'border-red-400 bg-red-50 text-red-700'
                        }`}
                      >
                        {!availableStations.some((s) => s.name === row.orientName) && (
                          <option value={row.orientName}>{row.orientName} (?)</option>
                        )}
                        {availableStations.map((st) => (
                          <option key={st.name} value={st.name}>
                            {st.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {formatDms(row.orientAzimuthDeg)}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={row.instrumentHeight}
                        onChange={(e) =>
                          handleUpdate(row.id, 'instrumentHeight', parseFloat(e.target.value) || 0)
                        }
                        aria-label={`Chiều cao máy i điểm ${row.pointName}`}
                        className="w-16 rounded border border-slate-200 bg-white px-1.5 py-1 text-right font-mono tabular-nums"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <DmsInput
                        value={row.hzOrient}
                        onChange={(v) => handleUpdate(row.id, 'hzOrient', v)}
                        ariaLabelPrefix={`Hz định hướng điểm ${row.pointName}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <DmsInput
                        value={row.hzPoint}
                        onChange={(v) => handleUpdate(row.id, 'hzPoint', v)}
                        ariaLabelPrefix={`Hz đo điểm ${row.pointName}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <DmsInput
                        value={row.vertAngle}
                        onChange={(v) => handleUpdate(row.id, 'vertAngle', v)}
                        allowNegative={true}
                        ariaLabelPrefix={`Góc đứng điểm ${row.pointName}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="1"
                        value={row.miaA}
                        onChange={(e) => handleUpdate(row.id, 'miaA', parseFloat(e.target.value) || 0)}
                        aria-label={`Chỉ trên a điểm ${row.pointName}`}
                        className="w-16 rounded border border-slate-200 bg-white px-1.5 py-1 text-right font-mono tabular-nums"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="1"
                        value={row.miaL}
                        onChange={(e) => handleUpdate(row.id, 'miaL', parseFloat(e.target.value) || 0)}
                        aria-label={`Chỉ giữa l điểm ${row.pointName}`}
                        className="w-16 rounded border border-slate-200 bg-white px-1.5 py-1 text-right font-mono tabular-nums"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="1"
                        value={row.miaB}
                        onChange={(e) => handleUpdate(row.id, 'miaB', parseFloat(e.target.value) || 0)}
                        aria-label={`Chỉ dưới b điểm ${row.pointName}`}
                        className="w-16 rounded border border-slate-200 bg-white px-1.5 py-1 text-right font-mono tabular-nums"
                      />
                    </td>
                    <td
                      className={`px-2.5 py-2 text-right font-mono tabular-nums whitespace-nowrap font-semibold ${
                        row.isMiaOk
                          ? 'bg-emerald-50/70 text-emerald-700'
                          : 'bg-red-100 text-red-800'
                      }`}
                      title={`((a+b)/2 - l) = ${row.miaErrorMm.toFixed(1)} mm (Cho phép ≤ 2.0 mm)`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {row.isMiaOk ? (
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                        )}
                        {row.miaErrorMm >= 0 ? '+' : ''}
                        {row.miaErrorMm.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-900">
                      {row.distanceDisplay.toFixed(decimalsOut)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-800">
                      {row.deltaHDisplay >= 0 ? '+' : ''}
                      {row.deltaHDisplay.toFixed(decimalsOut)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono tabular-nums font-semibold text-[#1E3A5F]">
                      {row.x.toFixed(3)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono tabular-nums font-semibold text-[#1E3A5F]">
                      {row.y.toFixed(3)}
                    </td>
                    <td className="px-2.5 py-2 text-right font-mono tabular-nums font-semibold text-[#0F766E]">
                      {row.h.toFixed(3)}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={row.kind}
                        onChange={(e) => handleUpdate(row.id, 'kind', e.target.value as PointKind)}
                        aria-label={`Loại điểm ${row.pointName}`}
                        className={`rounded border px-1.5 py-1 text-xs font-medium ${
                          row.kind === 'station'
                            ? 'border-amber-300 bg-amber-50 text-amber-900'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        <option value="detail">Điểm chi tiết</option>
                        <option value="station">Trạm chuyền</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        value={row.note}
                        onChange={(e) => handleUpdate(row.id, 'note', e.target.value)}
                        aria-label={`Ghi chú điểm ${row.pointName}`}
                        placeholder="Mô tả..."
                        className="w-36 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleDelete(row.id)}
                        aria-label={`Xóa điểm ${row.pointName}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
