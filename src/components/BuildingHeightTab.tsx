import React, { useMemo, useState } from 'react';
import { Building2, Compass, Ruler, ArrowRight } from 'lucide-react';
import type { DMSValue, MapPoint, VerticalCircleMode } from '../types/survey';
import {
  computeAccessibleHeight,
  computeInaccessibleHeight,
  computeTwoPointInverse,
  formatDms,
} from '../utils/geodesy';
import { DmsInput } from './DmsInput';

interface BuildingHeightTabProps {
  allPoints: MapPoint[];
}

export const BuildingHeightTab: React.FC<BuildingHeightTabProps> = ({ allPoints }) => {
  // Tool 1: Accessible Base
  const [accMode, setAccMode] = useState<'angles' | 'mia'>('angles');
  const [accVertMode, setAccVertMode] = useState<VerticalCircleMode>('Z');
  const [accDist, setAccDist] = useState<number>(35.5);
  const [accBaseH, setAccBaseH] = useState<number>(10.0);
  const [accTopAngle, setAccTopAngle] = useState<DMSValue>({ deg: '62', min: '15', sec: '00' });
  const [accBotAngle, setAccBotAngle] = useState<DMSValue>({ deg: '92', min: '30', sec: '00' });
  const [accMiaBot, setAccMiaBot] = useState<number>(1.52);

  const accResult = useMemo(
    () =>
      computeAccessibleHeight({
        mode: accMode,
        distanceM: accDist,
        verticalMode: accVertMode,
        topAngle: accTopAngle,
        bottomAngle: accBotAngle,
        miaBottomM: accMiaBot,
        baseElevationH: accBaseH,
      }),
    [accMode, accDist, accVertMode, accTopAngle, accBotAngle, accMiaBot, accBaseH]
  );

  // Tool 2: Inaccessible High-Rise (2-Station Collinear Vertical Intersection)
  const [inaccVertMode, setInaccVertMode] = useState<VerticalCircleMode>('Z');
  const [baselineB, setBaselineB] = useState<number>(25.0);
  const [axisElevA, setAxisElevA] = useState<number>(11.45);
  const [axisElevB, setAxisElevB] = useState<number>(11.5);
  const [topAngleA, setTopAngleA] = useState<DMSValue>({ deg: '58', min: '20', sec: '00' });
  const [topAngleB, setTopAngleB] = useState<DMSValue>({ deg: '44', min: '10', sec: '00' });
  const [botAngleB, setBotAngleB] = useState<DMSValue>({ deg: '91', min: '45', sec: '00' });

  const inaccResult = useMemo(
    () =>
      computeInaccessibleHeight({
        baselineB,
        axisElevA,
        axisElevB,
        verticalMode: inaccVertMode,
        topAngleA,
        topAngleB,
        bottomAngleB: botAngleB,
      }),
    [baselineB, axisElevA, axisElevB, inaccVertMode, topAngleA, topAngleB, botAngleB]
  );

  // Tool 3: Inverse Query A -> B from measured data
  const [pointAName, setPointAName] = useState<string>(allPoints[1]?.name || allPoints[0]?.name || 'M1');
  const [pointBName, setPointBName] = useState<string>(allPoints[2]?.name || allPoints[0]?.name || 'P1');

  const pointA = allPoints.find((p) => p.name === pointAName) ?? allPoints[0];
  const pointB = allPoints.find((p) => p.name === pointBName) ?? allPoints[1] ?? allPoints[0];

  const inverseResult = useMemo(() => {
    if (!pointA || !pointB) return null;
    return computeTwoPointInverse(pointA, pointB);
  }, [pointA, pointB]);

  return (
    <div className="space-y-6">
      {/* Tool 1 & Tool 2 Grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Tool 1: Accessible Base */}
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <Building2 className="h-5 w-5 text-[#1E3A5F]" />
              <div>
                <h2 className="text-sm font-semibold text-[#1E3A5F]">
                  Công cụ 1: Đo chiều cao công trình TIẾP CẬN ĐƯỢC CHÂN
                </h2>
                <p className="text-xs text-slate-500">
                  Áp dụng cho tòa nhà, cột điện, tháp đo trực tiếp khoảng cách ngang D tới chân công trình.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setAccMode('angles')}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  accMode === 'angles'
                    ? 'bg-[#1E3A5F] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                (a) Ngắm góc đỉnh &amp; góc chân
              </button>
              <button
                type="button"
                onClick={() => setAccMode('mia')}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  accMode === 'mia'
                    ? 'bg-[#1E3A5F] text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                (b) Ngắm góc đỉnh &amp; đọc mia tại chân
              </button>
            </div>

            <select
              value={accVertMode}
              onChange={(e) => setAccVertMode(e.target.value as VerticalCircleMode)}
              aria-label="Hệ góc đứng Công cụ 1"
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
            >
              <option value="Z">Thiên đỉnh Z (90°)</option>
              <option value="V">Góc đứng V (0°)</option>
            </select>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="acc-dist" className="block text-xs font-medium text-slate-600">
                Khoảng cách ngang D (m)
              </label>
              <input
                id="acc-dist"
                type="number"
                step="0.01"
                value={accDist}
                onChange={(e) => setAccDist(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-right font-mono text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="acc-base-h" className="block text-xs font-medium text-slate-600">
                Cao độ chân công trình (m, tùy chọn)
              </label>
              <input
                id="acc-base-h"
                type="number"
                step="0.01"
                value={accBaseH}
                onChange={(e) => setAccBaseH(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-right font-mono text-sm tabular-nums"
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-600">
                Góc đứng ngắm ĐỈNH ({accVertMode}_đỉnh)
              </span>
              <div className="mt-1">
                <DmsInput
                  value={accTopAngle}
                  onChange={setAccTopAngle}
                  allowNegative={accVertMode === 'V'}
                  compact={false}
                  ariaLabelPrefix="Góc đỉnh công cụ 1"
                />
              </div>
            </div>

            {accMode === 'angles' ? (
              <div>
                <span className="block text-xs font-medium text-slate-600">
                  Góc đứng ngắm CHÂN ({accVertMode}_chân)
                </span>
                <div className="mt-1">
                  <DmsInput
                    value={accBotAngle}
                    onChange={setAccBotAngle}
                    allowNegative={accVertMode === 'V'}
                    compact={false}
                    ariaLabelPrefix="Góc chân công cụ 1"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label htmlFor="acc-mia-bot" className="block text-xs font-medium text-slate-600">
                  Chỉ giữa mia tại chân l_chân (m)
                </label>
                <input
                  id="acc-mia-bot"
                  type="number"
                  step="0.001"
                  value={accMiaBot}
                  onChange={(e) => setAccMiaBot(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-right font-mono text-sm tabular-nums"
                />
              </div>
            )}
          </div>

          {/* Schematic + Result */}
          <div className="mt-4 grid grid-cols-1 gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-slate-500">
                {accMode === 'angles'
                  ? 'Công thức: H = D · (tan α_đỉnh − tan α_chân)'
                  : 'Công thức: H = D · tan α_đỉnh + l_chân'}
              </p>
              <div>
                <span className="text-xs text-slate-600">Chiều cao công trình H</span>
                <p className="font-mono text-2xl font-bold text-[#1E3A5F] tabular-nums">
                  {accResult.heightM.toFixed(3)} m
                </p>
              </div>
              <div className="text-xs font-mono text-slate-600 space-y-0.5 tabular-nums">
                <p>α_đỉnh = {formatDms(accResult.alphaTopDeg, 1)}</p>
                {accMode === 'angles' && <p>α_chân = {formatDms(accResult.alphaBottomDeg, 1)}</p>}
                <p>Cao độ đỉnh = {accResult.topElevationH.toFixed(3)} m</p>
              </div>
            </div>

            <svg viewBox="0 0 220 120" className="h-28 w-full" aria-label="Sơ đồ đo chiều cao tiếp cận chân">
              {/* Ground */}
              <line x1="12" y1="102" x2="208" y2="102" stroke="#94a3b8" strokeWidth="1.5" />
              {/* Building */}
              <rect x="158" y="20" width="34" height="82" fill="#e2e8f0" stroke="#1E3A5F" strokeWidth="1.5" />
              {/* Instrument */}
              <line x1="36" y1="102" x2="44" y2="78" stroke="#1E3A5F" strokeWidth="1.5" />
              <line x1="52" y1="102" x2="44" y2="78" stroke="#1E3A5F" strokeWidth="1.5" />
              <circle cx="44" cy="75" r="4" fill="#0F766E" />
              {/* Horizon & rays */}
              <line x1="44" y1="75" x2="158" y2="75" stroke="#64748b" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="44" y1="75" x2="158" y2="20" stroke="#0F766E" strokeWidth="1.5" />
              <line x1="44" y1="75" x2="158" y2="102" stroke="#b91c1c" strokeWidth="1.2" strokeDasharray="4 2" />
              <text x="92" y="71" fontSize="9" fill="#475569" fontFamily="monospace">D = {accDist}m</text>
              <text x="163" y="64" fontSize="9" fill="#1E3A5F" fontWeight="700" fontFamily="monospace">H</text>
            </svg>
          </div>
        </section>

        {/* Tool 2: Inaccessible High-Rise (2-Station Vertical Intersection) */}
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <Ruler className="h-5 w-5 text-[#0F766E]" />
              <div>
                <h2 className="text-sm font-semibold text-[#1E3A5F]">
                  Công cụ 2: Tòa nhà cao tầng KHÔNG TỚI ĐƯỢC CHÂN (Giao hội đứng A, B)
                </h2>
                <p className="text-xs text-slate-500">
                  Đặt 2 trạm thẳng hàng A (xa) và B (gần) cách nhau đoạn đáy b để giao hội chiều cao &amp; khoảng cách.
                </p>
              </div>
            </div>
            <select
              value={inaccVertMode}
              onChange={(e) => setInaccVertMode(e.target.value as VerticalCircleMode)}
              aria-label="Hệ góc đứng Công cụ 2"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 shrink-0"
            >
              <option value="Z">Thiên đỉnh Z</option>
              <option value="V">Góc đứng V</option>
            </select>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="inacc-b" className="block text-xs font-medium text-slate-600">
                Đoạn đáy b = AB (m)
              </label>
              <input
                id="inacc-b"
                type="number"
                step="0.01"
                value={baselineB}
                onChange={(e) => setBaselineB(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-right font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="inacc-ha" className="block text-xs font-medium text-slate-600">
                Cao độ trục ngắm A (m)
              </label>
              <input
                id="inacc-ha"
                type="number"
                step="0.001"
                value={axisElevA}
                onChange={(e) => setAxisElevA(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-right font-mono text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="inacc-hb" className="block text-xs font-medium text-slate-600">
                Cao độ trục ngắm B (m)
              </label>
              <input
                id="inacc-hb"
                type="number"
                step="0.001"
                value={axisElevB}
                onChange={(e) => setAxisElevB(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-right font-mono text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <span className="block text-xs font-medium text-slate-600">Góc đỉnh từ A ({inaccVertMode}_A)</span>
              <div className="mt-1">
                <DmsInput
                  value={topAngleA}
                  onChange={setTopAngleA}
                  allowNegative={inaccVertMode === 'V'}
                  ariaLabelPrefix="Góc đỉnh từ A"
                />
              </div>
            </div>
            <div>
              <span className="block text-xs font-medium text-slate-600">Góc đỉnh từ B ({inaccVertMode}_B)</span>
              <div className="mt-1">
                <DmsInput
                  value={topAngleB}
                  onChange={setTopAngleB}
                  allowNegative={inaccVertMode === 'V'}
                  ariaLabelPrefix="Góc đỉnh từ B"
                />
              </div>
            </div>
            <div>
              <span className="block text-xs font-medium text-slate-600">Góc chân từ B ({inaccVertMode}_chân)</span>
              <div className="mt-1">
                <DmsInput
                  value={botAngleB}
                  onChange={setBotAngleB}
                  allowNegative={inaccVertMode === 'V'}
                  ariaLabelPrefix="Góc chân từ B"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
            {!inaccResult.isValid ? (
              <p className="text-xs font-medium text-red-700">{inaccResult.errorMessage}</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 font-mono tabular-nums">
                <div>
                  <span className="block font-sans text-[11px] text-slate-500">Khoảng cách D_B</span>
                  <span className="text-base font-bold text-[#1E3A5F]">
                    {inaccResult.distanceBM.toFixed(3)} m
                  </span>
                </div>
                <div>
                  <span className="block font-sans text-[11px] text-slate-500">Cao độ đỉnh H_đỉnh</span>
                  <span className="text-base font-bold text-[#0F766E]">
                    {inaccResult.topElevationH.toFixed(3)} m
                  </span>
                </div>
                <div>
                  <span className="block font-sans text-[11px] text-slate-500">Cao độ chân</span>
                  <span className="text-base font-semibold text-slate-800">
                    {inaccResult.bottomElevationH.toFixed(3)} m
                  </span>
                </div>
                <div>
                  <span className="block font-sans text-[11px] text-slate-500">Chiều cao công trình</span>
                  <span className="text-lg font-bold text-[#1E3A5F]">
                    {inaccResult.buildingHeightM.toFixed(3)} m
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Tool 3: Two-Point Inverse Query A -> B */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <Compass className="h-5 w-5 text-[#1E3A5F]" />
            <div>
              <h2 className="text-sm font-semibold text-[#1E3A5F]">
                Công cụ 3: Tra cứu 2 điểm bất kỳ A → B từ dữ liệu đã đo
              </h2>
              <p className="text-xs text-slate-500">
                Tính tức thì khoảng cách ngang D_AB, khoảng cách nghiêng, chênh cao ΔH_AB, phương vị α_AB và độ dốc dọc tuyến i_AB (%).
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="inv-pt-a" className="block text-xs font-medium text-slate-600">
              Điểm xuất phát (A)
            </label>
            <select
              id="inv-pt-a"
              value={pointA?.name || ''}
              onChange={(e) => setPointAName(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900"
            >
              {allPoints.map((pt) => (
                <option key={`a-${pt.name}`} value={pt.name}>
                  {pt.name} — X:{pt.x.toFixed(3)} | Y:{pt.y.toFixed(3)} | H:{pt.h.toFixed(3)}
                </option>
              ))}
            </select>
          </div>

          <div className="pb-2 text-slate-400">
            <ArrowRight className="h-5 w-5" />
          </div>

          <div className="min-w-[200px] flex-1">
            <label htmlFor="inv-pt-b" className="block text-xs font-medium text-slate-600">
              Điểm đích (B)
            </label>
            <select
              id="inv-pt-b"
              value={pointB?.name || ''}
              onChange={(e) => setPointBName(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900"
            >
              {allPoints.map((pt) => (
                <option key={`b-${pt.name}`} value={pt.name}>
                  {pt.name} — X:{pt.x.toFixed(3)} | Y:{pt.y.toFixed(3)} | H:{pt.h.toFixed(3)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {inverseResult && pointA && pointB && (
          <div className="mt-4 grid grid-cols-2 gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 md:grid-cols-5 font-mono tabular-nums">
            <div>
              <span className="block font-sans text-[11px] text-slate-500">Khoảng cách ngang D_AB</span>
              <span className="text-lg font-bold text-[#1E3A5F]">
                {inverseResult.horizontalDistanceM.toFixed(3)} m
              </span>
            </div>
            <div>
              <span className="block font-sans text-[11px] text-slate-500">Khoảng cách nghiêng S_AB</span>
              <span className="text-lg font-semibold text-slate-800">
                {inverseResult.slopeDistanceM.toFixed(3)} m
              </span>
            </div>
            <div>
              <span className="block font-sans text-[11px] text-slate-500">Chênh cao ΔH_AB</span>
              <span className="text-lg font-bold text-[#0F766E]">
                {inverseResult.deltaHM >= 0 ? '+' : ''}
                {inverseResult.deltaHM.toFixed(3)} m
              </span>
            </div>
            <div>
              <span className="block font-sans text-[11px] text-slate-500">Góc phương vị α_AB</span>
              <span className="text-lg font-bold text-[#1E3A5F]">
                {formatDms(inverseResult.azimuthDeg, 1)}
              </span>
            </div>
            <div>
              <span className="block font-sans text-[11px] text-slate-500">Độ dốc dọc tuyến i_AB</span>
              <span className="text-lg font-bold text-slate-900">
                {inverseResult.slopePercent >= 0 ? '+' : ''}
                {inverseResult.slopePercent.toFixed(2)} %
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
