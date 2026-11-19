import React, { useMemo, useRef, useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Copy,
  Check,
  Download,
  FileSpreadsheet,
  Upload,
  Cloud,
  Ruler,
} from 'lucide-react';
import type { MapPoint } from '../types/survey';
import {
  computeTwoPointInverse,
  formatDms,
  generateAutoCadScript,
  generateCivil3dCsv,
} from '../utils/geodesy';
import { triggerTextDownload } from '../utils/excelWps';

interface MapAndExportTabProps {
  allPoints: MapPoint[];
  traversePathNames: string[];
  onExportExcel: () => void;
  onImportExcelFile: (file: File) => void;
  onOpenGoogleSheets: () => void;
}

export const MapAndExportTab: React.FC<MapAndExportTabProps> = ({
  allPoints,
  traversePathNames,
  onExportExcel,
  onImportExcelFile,
  onOpenGoogleSheets,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  const [showNames, setShowNames] = useState(true);
  const [showElevations, setShowElevations] = useState(true);
  const [showTraverseLines, setShowTraverseLines] = useState(true);
  const [selectedPair, setSelectedPair] = useState<string[]>([]);

  const [cadTextHeight, setCadTextHeight] = useState<number>(1.2);
  const [copiedCad, setCopiedCad] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const SVG_W = 820;
  const SVG_H = 440;
  const PAD = 54;

  // Compute world bounds (Y = East horizontal, X = North vertical)
  const bounds = useMemo(() => {
    if (allPoints.length === 0) {
      return { minY: 1980, maxY: 2060, minX: 980, maxX: 1060 };
    }
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of allPoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const spanX = Math.max(10, maxX - minX);
    const spanY = Math.max(10, maxY - minY);
    const marginX = spanX * 0.14;
    const marginY = spanY * 0.14;
    return {
      minX: minX - marginX,
      maxX: maxX + marginX,
      minY: minY - marginY,
      maxY: maxY + marginY,
    };
  }, [allPoints]);

  // Preserve equal aspect ratio (1m in X == 1m in Y)
  const project = useMemo(() => {
    const worldW = Math.max(1, bounds.maxY - bounds.minY);
    const worldH = Math.max(1, bounds.maxX - bounds.minX);
    const drawW = SVG_W - PAD * 2;
    const drawH = SVG_H - PAD * 2;
    const scale = Math.min(drawW / worldW, drawH / worldH);
    const offsetX = PAD + (drawW - worldW * scale) / 2;
    const offsetY = PAD + (drawH - worldH * scale) / 2;

    return (xNorth: number, yEast: number) => ({
      sx: offsetX + (yEast - bounds.minY) * scale,
      sy: SVG_H - (offsetY + (xNorth - bounds.minX) * scale),
    });
  }, [bounds]);

  const pointLookup = useMemo(() => {
    const m = new Map<string, MapPoint>();
    for (const p of allPoints) m.set(p.name, p);
    return m;
  }, [allPoints]);

  const handlePointClick = (name: string) => {
    setSelectedPair((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= 2) return [prev[1], name];
      return [...prev, name];
    });
  };

  const pairMeasure = useMemo(() => {
    if (selectedPair.length !== 2) return null;
    const a = pointLookup.get(selectedPair[0]);
    const b = pointLookup.get(selectedPair[1]);
    if (!a || !b) return null;
    return { a, b, ...computeTwoPointInverse(a, b) };
  }, [selectedPair, pointLookup]);

  const cadScript = useMemo(
    () => generateAutoCadScript(allPoints, cadTextHeight),
    [allPoints, cadTextHeight]
  );

  const handleCopyCad = async () => {
    try {
      await navigator.clipboard.writeText(cadScript);
      setCopiedCad(true);
      setTimeout(() => setCopiedCad(false), 2000);
    } catch {
      // Fallback for restricted clipboard environments
      const ta = document.createElement('textarea');
      ta.value = cadScript;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedCad(true);
      setTimeout(() => setCopiedCad(false), 2000);
    }
  };

  const handleDownloadCad = () => {
    triggerTextDownload(
      cadScript,
      `GEOSURVEY_AutoCAD_${new Date().toISOString().slice(0, 10)}.scr`,
      'text/plain;charset=utf-8'
    );
  };

  const handleDownloadCivilCsv = () => {
    const csv = generateCivil3dCsv(allPoints, true);
    triggerTextDownload(
      csv,
      `GEOSURVEY_Civil3D_PENZD_${new Date().toISOString().slice(0, 10)}.csv`,
      'text/csv;charset=utf-8'
    );
  };

  // Elevation profile bounds
  const profileStats = useMemo(() => {
    if (allPoints.length === 0) return { minH: 0, maxH: 10 };
    const hs = allPoints.map((p) => p.h);
    const minH = Math.min(...hs);
    const maxH = Math.max(...hs);
    const pad = Math.max(0.5, (maxH - minH) * 0.2);
    return { minH: minH - pad, maxH: maxH + pad };
  }, [allPoints]);

  return (
    <div className="space-y-6">
      {/* 2D Interactive Coordinate Map */}
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-[#1E3A5F]">
              Bình Đồ Tọa Độ 2D Tương Tác (Y - Đông ngang · X - Bắc đứng)
            </h2>
            <p className="text-xs text-slate-500">
              Tam giác đỏ: Mốc gốc / Trạm máy · Chấm xanh: Điểm chi tiết · Click chọn 2 điểm bất kỳ trên bản đồ để đo nhanh khoảng cách &amp; chênh cao.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={showNames}
                onChange={(e) => setShowNames(e.target.checked)}
                className="accent-[#1E3A5F]"
              />
              Tên điểm
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={showElevations}
                onChange={(e) => setShowElevations(e.target.checked)}
                className="accent-[#1E3A5F]"
              />
              Cao độ H
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={showTraverseLines}
                onChange={(e) => setShowTraverseLines(e.target.checked)}
                className="accent-[#1E3A5F]"
              />
              Đường chuyền
            </label>

            <div className="ml-2 inline-flex items-center rounded-md border border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(5, +(z * 1.25).toFixed(2)))}
                aria-label="Phóng to bình đồ"
                className="p-1.5 text-slate-700 hover:bg-slate-200/70"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, +(z / 1.25).toFixed(2)))}
                aria-label="Thu nhỏ bình đồ"
                className="border-x border-slate-200 p-1.5 text-slate-700 hover:bg-slate-200/70"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                aria-label="Khớp toàn bộ khu đo"
                className="p-1.5 text-slate-700 hover:bg-slate-200/70"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Map Measurement Bar when 2 points clicked */}
        {pairMeasure && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-200 bg-teal-50/70 px-4 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-[#1E3A5F]">
              <span className="inline-flex items-center gap-1.5 font-sans font-semibold text-[#0F766E]">
                <Ruler className="h-3.5 w-3.5" />
                Đo nhanh {pairMeasure.a.name} → {pairMeasure.b.name}:
              </span>
              <span>D = <strong>{pairMeasure.horizontalDistanceM.toFixed(3)} m</strong></span>
              <span>
                ΔH = <strong>{pairMeasure.deltaHM >= 0 ? '+' : ''}{pairMeasure.deltaHM.toFixed(3)} m</strong>
              </span>
              <span>α = <strong>{formatDms(pairMeasure.azimuthDeg, 1)}</strong></span>
              <span>i = <strong>{pairMeasure.slopePercent.toFixed(2)}%</strong></span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPair([])}
              className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
            >
              Bỏ chọn
            </button>
          </div>
        )}

        <div
          className="relative overflow-hidden bg-[#fbfdff]"
          data-testid="interactive-2d-map"
          onWheel={(e) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.12 : 0.89;
            setZoom((z) => Math.max(0.5, Math.min(6, +(z * factor).toFixed(3))));
          }}
          onMouseDown={(e) => {
            setIsDragging(true);
            dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
          }}
          onMouseMove={(e) => {
            if (!isDragging) return;
            setPan({
              x: dragStart.current.panX + (e.clientX - dragStart.current.x),
              y: dragStart.current.panY + (e.clientY - dragStart.current.y),
            });
          }}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
        >
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className={`h-[420px] w-full select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          >
            {/* Background subtle grid */}
            <defs>
              <pattern id="surveyGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="0.7" />
              </pattern>
            </defs>
            <rect width={SVG_W} height={SVG_H} fill="url(#surveyGrid)" />

            {/* North Compass Indicator */}
            <g transform="translate(768, 42)">
              <circle cx="0" cy="0" r="18" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
              <polygon points="0,-13 -4,3 0,0 4,3" fill="#1E3A5F" />
              <polygon points="0,13 -4,3 0,0 4,3" fill="#94a3b8" />
              <text x="0" y="-21" textAnchor="middle" fontSize="9" fontWeight="700" fill="#1E3A5F">
                X (Bắc)
              </text>
            </g>

            {/* Axis Legend */}
            <text x="16" y="426" fontSize="10" fill="#64748b" fontFamily="monospace">
              Hệ trục: Y (Đông →) | X (Bắc ↑) · Tỉ lệ Zoom {Math.round(zoom * 100)}%
            </text>

            <g transform={`translate(${SVG_W / 2 + pan.x}, ${SVG_H / 2 + pan.y}) scale(${zoom}) translate(${-SVG_W / 2}, ${-SVG_H / 2})`}>
              {/* Traverse polygon lines */}
              {showTraverseLines && traversePathNames.length >= 2 && (
                <polyline
                  fill="none"
                  stroke="#1E3A5F"
                  strokeWidth={1.6 / zoom}
                  strokeDasharray={`${5 / zoom} ${3 / zoom}`}
                  points={traversePathNames
                    .map((nm) => pointLookup.get(nm))
                    .filter((p): p is MapPoint => Boolean(p))
                    .map((p) => {
                      const pt = project(p.x, p.y);
                      return `${pt.sx},${pt.sy}`;
                    })
                    .join(' ')}
                />
              )}

              {/* Measurement highlight line */}
              {pairMeasure && (() => {
                const pa = project(pairMeasure.a.x, pairMeasure.a.y);
                const pb = project(pairMeasure.b.x, pairMeasure.b.y);
                const mx = (pa.sx + pb.sx) / 2;
                const my = (pa.sy + pb.sy) / 2;
                return (
                  <g>
                    <line
                      x1={pa.sx}
                      y1={pa.sy}
                      x2={pb.sx}
                      y2={pb.sy}
                      stroke="#0F766E"
                      strokeWidth={2.2 / zoom}
                      strokeDasharray={`${6 / zoom} ${3 / zoom}`}
                    />
                    <rect
                      x={mx - 28 / zoom}
                      y={my - 17 / zoom}
                      width={56 / zoom}
                      height={15 / zoom}
                      rx={3 / zoom}
                      fill="#ffffff"
                      stroke="#0F766E"
                      strokeWidth={0.9 / zoom}
                    />
                    <text
                      x={mx}
                      y={my - 6.5 / zoom}
                      textAnchor="middle"
                      fontSize={10 / zoom}
                      fontWeight="700"
                      fontFamily="monospace"
                      fill="#0F766E"
                    >
                      {pairMeasure.horizontalDistanceM.toFixed(2)}m
                    </text>
                  </g>
                );
              })()}

              {/* Points */}
              {allPoints.map((pt) => {
                const { sx, sy } = project(pt.x, pt.y);
                const isStation = pt.category !== 'detail';
                const isSelected = selectedPair.includes(pt.name);
                const r = (isStation ? 6.5 : 4.5) / zoom;
                const labelOffsetY = pt.name === 'M0' ? -10 / zoom : -2 / zoom;

                return (
                  <g
                    key={`map-${pt.name}`}
                    transform={`translate(${sx}, ${sy})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePointClick(pt.name);
                    }}
                    className="cursor-pointer focus:outline-none"
                    role="button"
                    tabIndex={0}
                    aria-label={`Chọn điểm ${pt.name} trên bình đồ`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handlePointClick(pt.name);
                    }}
                  >
                    {isSelected && (
                      <circle
                        cx="0"
                        cy="0"
                        r={r * 1.9}
                        fill="rgba(15, 118, 110, 0.18)"
                        stroke="#0F766E"
                        strokeWidth={1.6 / zoom}
                      />
                    )}
                    {isStation ? (
                      <polygon
                        points={`0,${-r * 1.15} ${-r},${r * 0.9} ${r},${r * 0.9}`}
                        fill="#dc2626"
                        stroke="#ffffff"
                        strokeWidth={1.2 / zoom}
                      />
                    ) : (
                      <circle
                        cx="0"
                        cy="0"
                        r={r}
                        fill="#0F766E"
                        stroke="#ffffff"
                        strokeWidth={1.2 / zoom}
                      />
                    )}

                    {showNames && (
                      <text
                        x={r + 4 / zoom}
                        y={labelOffsetY}
                        fontSize={11 / zoom}
                        fontWeight="700"
                        fontFamily="monospace"
                        fill={isStation ? '#b91c1c' : '#1E3A5F'}
                        stroke="#ffffff"
                        strokeWidth={2.8 / zoom}
                        paintOrder="stroke"
                      >
                        {pt.name}
                      </text>
                    )}
                    {showElevations && (
                      <text
                        x={r + 4 / zoom}
                        y={labelOffsetY + 11 / zoom}
                        fontSize={9.5 / zoom}
                        fontFamily="monospace"
                        fill="#475569"
                        stroke="#ffffff"
                        strokeWidth={2.4 / zoom}
                        paintOrder="stroke"
                      >
                        H={pt.h.toFixed(2)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </section>

      {/* Longitudinal Elevation Profile Chart */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#1E3A5F]">
              Biểu đồ Trắc dọc Cao độ H (m) theo thứ tự điểm đo
            </h3>
            <p className="text-xs text-slate-500">
              Trực quan hóa chênh cao địa hình giữa các mốc khống chế, trạm máy và điểm chi tiết.
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            H_min = {(allPoints.length ? Math.min(...allPoints.map((p) => p.h)) : 0).toFixed(3)}m · H_max ={' '}
            {(allPoints.length ? Math.max(...allPoints.map((p) => p.h)) : 0).toFixed(3)}m
          </span>
        </div>

        <div className="overflow-x-auto">
          <svg viewBox="0 0 820 190" className="h-44 w-full min-w-[600px]">
            {/* Horizontal elevation grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = 20 + t * 125;
              const hVal = profileStats.maxH - t * (profileStats.maxH - profileStats.minH);
              return (
                <g key={t}>
                  <line x1="56" y1={y} x2="800" y2={y} stroke="#e2e8f0" strokeWidth="1" />
                  <text x="50" y={y + 3} textAnchor="end" fontSize="9.5" fill="#64748b" fontFamily="monospace">
                    {hVal.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {/* Area + Line */}
            {allPoints.length > 1 && (() => {
              const pts = allPoints.map((p, idx) => {
                const x = 68 + (idx / Math.max(1, allPoints.length - 1)) * 718;
                const y =
                  20 +
                  ((profileStats.maxH - p.h) / Math.max(0.001, profileStats.maxH - profileStats.minH)) *
                    125;
                return { x, y, p };
              });
              const lineStr = pts.map((pt) => `${pt.x},${pt.y}`).join(' ');
              const areaStr = `${pts[0].x},145 ${lineStr} ${pts[pts.length - 1].x},145`;

              return (
                <>
                  <polygon points={areaStr} fill="rgba(15, 118, 110, 0.1)" />
                  <polyline points={lineStr} fill="none" stroke="#0F766E" strokeWidth="2" />
                  {pts.map(({ x, y, p }) => (
                    <g key={`prof-${p.name}`}>
                      <circle
                        cx={x}
                        cy={y}
                        r="3.8"
                        fill={p.category !== 'detail' ? '#dc2626' : '#1E3A5F'}
                        stroke="#ffffff"
                        strokeWidth="1.2"
                      />
                      <text
                        x={x}
                        y={y - 7}
                        textAnchor="middle"
                        fontSize="8.5"
                        fontFamily="monospace"
                        fill="#0f172a"
                      >
                        {p.h.toFixed(2)}
                      </text>
                      <text
                        x={x}
                        y="164"
                        textAnchor="middle"
                        fontSize="9.5"
                        fontWeight="600"
                        fontFamily="monospace"
                        fill="#1E3A5F"
                      >
                        {p.name}
                      </text>
                    </g>
                  ))}
                </>
              );
            })()}
          </svg>
        </div>
      </section>

      {/* Export Suite: WPS/Excel, Google Sheets, Civil 3D & AutoCAD .scr */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Left: WPS Office / Excel / Civil 3D / Google Sheets */}
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-[#1E3A5F]">
            Xuất / Nhập Dữ Liệu (WPS Office · Excel · Civil 3D · Google Sheets)
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Tương thích hoàn toàn với WPS Spreadsheets (UTF-8 BOM cho CSV &amp; định dạng số chuẩn OOXML cho .xlsx) và đồng bộ 2 chiều Google Sheets.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={onExportExcel}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1E3A5F] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#162C49]"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Tải Excel (.xlsx - WPS chuẩn)
            </button>

            <button
              type="button"
              onClick={handleDownloadCivilCsv}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#0F766E] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0D625B]"
            >
              <Download className="h-4 w-4" />
              Tải CSV Civil 3D (P,E,N,Z,D)
            </button>

            <button
              type="button"
              onClick={onOpenGoogleSheets}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-50"
            >
              <Cloud className="h-4 w-4 text-[#0F766E]" />
              Đồng bộ 2 chiều Google Sheets
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4 text-slate-600" />
              Nhập file WPS / Excel / CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImportExcelFile(file);
                  e.target.value = '';
                }
              }}
            />
          </div>

          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed">
            <strong className="text-slate-800">Lưu ý tối ưu cho WPS Office:</strong> File <code className="font-mono">.xlsx</code> xuất ra gồm đủ 4 sheet (<code className="font-mono">Moc_Goc</code>, <code className="font-mono">Duong_Chuyen_2Mat</code>, <code className="font-mono">So_Do_Chi_Tiet</code>, <code className="font-mono">Toa_Do_Civil3D</code>) với dữ liệu số nguyên bản; file <code className="font-mono">.csv</code> được gắn UTF-8 BOM giúp WPS mở tiếng Việt không bị lỗi font.
          </div>
        </section>

        {/* Right: AutoCAD Script (.scr) Generator */}
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[#1E3A5F]">
                Xuất Script AutoCAD (.scr) &amp; Copy dán trực tiếp Command
              </h3>
              <p className="text-xs text-slate-500">
                Tự tạo lệnh <code className="font-mono">POINT E,N,Z</code> và <code className="font-mono">-TEXT</code> ghi tên điểm + cao độ.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="cad-text-h" className="text-xs text-slate-600 whitespace-nowrap">
                Cao chữ:
              </label>
              <input
                id="cad-text-h"
                type="number"
                step="0.1"
                min="0.1"
                value={cadTextHeight}
                onChange={(e) => setCadTextHeight(parseFloat(e.target.value) || 1.2)}
                className="w-16 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs tabular-nums"
              />
            </div>
          </div>

          <pre className="mt-3 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-emerald-300">
            {cadScript}
          </pre>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyCad}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#1E3A5F] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#162C49]"
            >
              {copiedCad ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedCad ? 'Đã sao chép lệnh!' : 'Copy chuỗi lệnh dán AutoCAD'}
            </button>
            <button
              type="button"
              onClick={handleDownloadCad}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              Tải file .scr
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
