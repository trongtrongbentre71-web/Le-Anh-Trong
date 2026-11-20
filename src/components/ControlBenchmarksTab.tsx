import React from 'react';
import { Plus, Trash2, Compass } from 'lucide-react';
import type { ControlPoint, UnifiedStation } from '../types/survey';

interface ControlBenchmarksTabProps {
  controlPoints: ControlPoint[];
  unifiedStations: UnifiedStation[];
  onChangeControlPoints: (next: ControlPoint[]) => void;
}

export const ControlBenchmarksTab: React.FC<ControlBenchmarksTabProps> = ({
  controlPoints,
  unifiedStations,
  onChangeControlPoints,
}) => {
  const handleAdd = () => {
    const nextIdx = controlPoints.length;
    onChangeControlPoints([
      ...controlPoints,
      {
        id: `cp-${Date.now()}`,
        name: `M${nextIdx}`,
        x: 1000.0,
        y: 2000.0,
        h: 10.0,
        note: 'Mốc khống chế bổ sung',
      },
    ]);
  };

  const handleUpdate = (id: string, field: keyof ControlPoint, rawVal: string) => {
    onChangeControlPoints(
      controlPoints.map((cp) => {
        if (cp.id !== id) return cp;
        if (field === 'x' || field === 'y' || field === 'h') {
          const parsed = parseFloat(rawVal);
          return { ...cp, [field]: Number.isFinite(parsed) ? parsed : 0 };
        }
        return { ...cp, [field]: rawVal };
      })
    );
  };

  const handleDelete = (id: string) => {
    onChangeControlPoints(controlPoints.filter((cp) => cp.id !== id));
  };

  const controlCount = unifiedStations.filter((s) => s.source === 'control').length;
  const traverseCount = unifiedStations.filter((s) => s.source === 'traverse').length;
  const transferCount = unifiedStations.filter((s) => s.source === 'transfer').length;

  return (
    <div className="space-y-6">
      {/* Section 1: Control Benchmarks Table */}
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#1E3A5F]">
              Danh sách Mốc Khống Chế Gốc (Control Benchmarks)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Hệ tọa độ phẳng trắc địa: trục X hướng Bắc (m), trục Y hướng Đông (m), Cao độ H (m) · Dùng làm điểm khởi đầu &amp; định hướng cho toàn bộ khu đo.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#1E3A5F] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#162C49] whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm mốc gốc
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="w-12 px-4 py-2.5 text-center">STT</th>
                <th className="w-32 px-4 py-2.5">Tên mốc</th>
                <th className="w-44 px-4 py-2.5 text-right">Tọa độ X - Bắc (m)</th>
                <th className="w-44 px-4 py-2.5 text-right">Tọa độ Y - Đông (m)</th>
                <th className="w-36 px-4 py-2.5 text-right">Cao độ H (m)</th>
                <th className="px-4 py-2.5">Ghi chú hiện trường</th>
                <th className="w-16 px-4 py-2.5 text-center">Xóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {controlPoints.map((cp, index) => (
                <tr key={cp.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-2 text-center text-xs font-mono text-slate-400 tabular-nums">
                    {index + 1}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={cp.name}
                      onChange={(e) => handleUpdate(cp.id, 'name', e.target.value)}
                      aria-label={`Tên mốc dòng ${index + 1}`}
                      className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono font-semibold text-[#1E3A5F] focus:border-[#0F766E] focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="0.001"
                      value={cp.x}
                      onChange={(e) => handleUpdate(cp.id, 'x', e.target.value)}
                      aria-label={`Tọa độ X mốc ${cp.name}`}
                      className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-right text-xs font-mono tabular-nums text-slate-900 focus:border-[#0F766E] focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="0.001"
                      value={cp.y}
                      onChange={(e) => handleUpdate(cp.id, 'y', e.target.value)}
                      aria-label={`Tọa độ Y mốc ${cp.name}`}
                      className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-right text-xs font-mono tabular-nums text-slate-900 focus:border-[#0F766E] focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="0.001"
                      value={cp.h}
                      onChange={(e) => handleUpdate(cp.id, 'h', e.target.value)}
                      aria-label={`Cao độ H mốc ${cp.name}`}
                      className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-right text-xs font-mono tabular-nums text-slate-900 focus:border-[#0F766E] focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={cp.note}
                      onChange={(e) => handleUpdate(cp.id, 'note', e.target.value)}
                      aria-label={`Ghi chú mốc ${cp.name}`}
                      placeholder="Nhập mô tả mốc..."
                      className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-[#0F766E] focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleDelete(cp.id)}
                      aria-label={`Xóa mốc ${cp.name}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {controlPoints.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-400">
                    Chưa có mốc khống chế gốc nào. Bấm "Thêm mốc gốc" hoặc yêu cầu Trợ lý AI nhập từ đề bài / khôi phục dữ liệu mẫu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 2: Auto-aggregated Unified Stations Dropdown Catalog */}
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Compass className="h-4 w-4 text-[#0F766E]" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Danh sách Trạm Khả Dụng Tổng Hợp (Tự động nạp vào Dropdown các Tab sau)
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Tổng cộng <span className="font-mono font-semibold text-slate-800">{unifiedStations.length}</span> trạm: {controlCount} Mốc gốc · {traverseCount} Trạm đường chuyền 2 mặt đã bình sai · {transferCount} Trạm chuyền chi tiết
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                <th className="px-4 py-2.5">Tên trạm</th>
                <th className="px-4 py-2.5">Nguồn tọa độ</th>
                <th className="px-4 py-2.5 text-right">X - Bắc (m)</th>
                <th className="px-4 py-2.5 text-right">Y - Đông (m)</th>
                <th className="px-4 py-2.5 text-right">Cao độ H (m)</th>
                <th className="px-4 py-2.5">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {unifiedStations.map((st) => (
                <tr key={`${st.source}-${st.name}`} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2.5 font-mono font-semibold text-[#1E3A5F]">{st.name}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`font-medium ${
                        st.source === 'control'
                          ? 'text-[#1E3A5F]'
                          : st.source === 'traverse'
                          ? 'text-[#0F766E]'
                          : 'text-amber-700'
                      }`}
                    >
                      {st.sourceLabel}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-800">
                    {st.x.toFixed(3)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-800">
                    {st.y.toFixed(3)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-800">
                    {st.h.toFixed(3)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{st.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
