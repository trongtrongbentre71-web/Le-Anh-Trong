import React, { useState } from 'react';
import { X, Crosshair, RotateCw, CheckCircle2, Eye, Compass } from 'lucide-react';

interface InstrumentGuideModalProps {
  open: boolean;
  onClose: () => void;
}

const THEODOLITE_IMG = '/src/assets/images/theodolite_anatomy_1795075133160.jpg';
const STADIA_ROD_IMG = '/src/assets/images/stadia_rod_field_1795075144199.jpg';

export const InstrumentGuideModal: React.FC<InstrumentGuideModalProps> = ({ open, onClose }) => {
  const [middleMm, setMiddleMm] = useState<number>(1524); // Chỉ giữa l (mm)
  const [distanceM, setDistanceM] = useState<number>(28); // Khoảng cách D (m)
  const [slopeDeg, setSlopeDeg] = useState<number>(0); // Góc nghiêng α (°)
  const [faceMode, setFaceMode] = useState<'L' | 'R'>('L');
  const [img1Err, setImg1Err] = useState(false);
  const [img2Err, setImg2Err] = useState(false);

  if (!open) return null;

  // Stadia math: D = 100 * (a - b) * cos^2(α) => (a - b) in mm = (D * 10) / cos^2(α)
  const rad = (slopeDeg * Math.PI) / 180;
  const cos2 = Math.cos(rad) * Math.cos(rad);
  const spreadMm = Math.round((distanceM * 10) / Math.max(0.25, cos2));
  const halfSpread = Math.round(spreadMm / 2);
  const upperA = middleMm + halfSpread; // Chỉ trên a (mm)
  const lowerB = middleMm - halfSpread; // Chỉ dưới b (mm)
  const checkAvg = (upperA + lowerB) / 2;
  const checkDiff = checkAvg - middleMm;

  // Zenith reading Z for Face L / Face R
  const zenithDeg = faceMode === 'L' ? 90 - slopeDeg : 270 + slopeDeg;

  // Render E-pattern staff visible window around middleMm (±300mm window inside circular telescope)
  const viewHalfSpanMm = 320;
  const pxPerMm = 140 / viewHalfSpanMm; // 140px radius = 320mm visible staff height

  const minDm = Math.floor((middleMm - viewHalfSpanMm - 100) / 100);
  const maxDm = Math.ceil((middleMm + viewHalfSpanMm + 100) / 100);
  const dmList: number[] = [];
  for (let dm = minDm; dm <= maxDm; dm++) {
    if (dm >= 0 && dm <= 40) dmList.push(dm);
  }

  // Decode digits of middle hair l (e.g. 1524mm -> 1m, 5dm, 2cm, 4mm)
  const mDigit = Math.floor(middleMm / 1000);
  const dmDigit = Math.floor((middleMm % 1000) / 100);
  const cmDigit = Math.floor((middleMm % 100) / 10);
  const mmDigit = middleMm % 10;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#1E3A5F] px-5 py-3.5 text-white">
          <div className="flex items-center gap-2.5">
            <Crosshair className="h-5 w-5 text-teal-300" />
            <div>
              <h2 id="guide-modal-title" className="text-base font-semibold">
                Hướng Dẫn Trực Quan &amp; Mô Phỏng Máy Kinh Vĩ — Đọc 3 Chỉ Mia (Trên a · Giữa l · Dưới b)
              </h2>
              <p className="text-xs text-slate-300">
                Cẩm nang nhắc nhớ nhanh cho kỹ sư lâu ngày không đứng máy: tương tác trực tiếp trên ống kính mô phỏng.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hướng dẫn máy trắc địa"
            className="rounded-md p-1.5 text-slate-200 hover:bg-white/15 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Interactive Telescope Reticle & E-Staff Simulator */}
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-[#0F766E]" />
                <h3 className="text-sm font-semibold text-[#1E3A5F]">
                  1. Mô Phỏng Ống Kính Kinh Vĩ &amp; Lưới Chỉ Chữ Thập Trên Mia Chữ E
                </h3>
              </div>
              <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setFaceMode('L')}
                  className={`rounded px-2.5 py-1 font-medium ${
                    faceMode === 'L' ? 'bg-[#1E3A5F] text-white' : 'text-slate-600'
                  }`}
                >
                  Thuận kính (L · Z ≈ 90°)
                </button>
                <button
                  type="button"
                  onClick={() => setFaceMode('R')}
                  className={`rounded px-2.5 py-1 font-medium ${
                    faceMode === 'R' ? 'bg-[#1E3A5F] text-white' : 'text-slate-600'
                  }`}
                >
                  Đảo kính (R · Z ≈ 270°)
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12 items-center">
              {/* Optical Eyepiece SVG Viewport */}
              <div className="lg:col-span-6 flex flex-col items-center">
                <svg
                  viewBox="0 0 420 310"
                  className="w-full max-w-[420px] rounded-lg border border-slate-300 bg-slate-900"
                  aria-label="Mô phỏng góc nhìn qua ống kính máy kinh vĩ thấy chỉ trên, chỉ giữa, chỉ dưới và mia chữ E"
                >
                  <defs>
                    <clipPath id="eyepieceClip">
                      <circle cx="170" cy="155" r="134" />
                    </clipPath>
                  </defs>

                  {/* Telescope field of view background */}
                  <circle cx="170" cy="155" r="136" fill="#f1f5f9" stroke="#334155" strokeWidth="4" />

                  {/* Clipped Staff + Reticle */}
                  <g clipPath="url(#eyepieceClip)">
                    {/* Soft sky/field backdrop inside lens */}
                    <rect x="30" y="15" width="280" height="280" fill="#e2e8f0" />

                    {/* Aluminum E-pattern leveling staff centered at x=170 */}
                    <rect x="136" y="15" width="68" height="280" fill="#ffffff" stroke="#475569" strokeWidth="1.5" />

                    {/* Draw each decimeter (100mm) block: bottom 50mm = solid E (red for >=1m or alternating black/red), top 50mm = alternating */}
                    {dmList.map((dm) => {
                      // In real surveying staff, numbers increase UPWARD (larger mm = higher on screen = smaller SVG y)
                      const yBottom = 155 + (middleMm - dm * 100) * pxPerMm;
                      const dmHeightPx = 100 * pxPerMm;
                      const cmPx = 10 * pxPerMm;
                      const color = dm % 2 === 0 ? '#111827' : '#dc2626';
                      const dmLabel = String(dm).padStart(2, '0');

                      return (
                        <g key={dm}>
                          {/* Separator line at exact dm boundary */}
                          <line
                            x1="136"
                            y1={yBottom}
                            x2="204"
                            y2={yBottom}
                            stroke={color}
                            strokeWidth="0.9"
                          />
                          {/* Decimeter number on left side of staff */}
                          <text
                            x="141"
                            y={yBottom - dmHeightPx * 0.42}
                            fontSize="13"
                            fontWeight="800"
                            fontFamily="monospace"
                            fill={color}
                          >
                            {dmLabel}
                          </text>

                          {/* E-pattern 5cm lower half (0..50mm): 3 horizontal bars + vertical spine forming "E" */}
                          <rect x="172" y={yBottom - 1 * cmPx} width="26" height={cmPx} fill={color} />
                          <rect x="172" y={yBottom - 3 * cmPx} width="26" height={cmPx} fill={color} />
                          <rect x="172" y={yBottom - 5 * cmPx} width="26" height={cmPx} fill={color} />
                          <rect x="191" y={yBottom - 5 * cmPx} width="7" height={5 * cmPx} fill={color} />

                          {/* Upper 5cm half (50..100mm): opposite alternating cm blocks */}
                          <rect x="172" y={yBottom - 7 * cmPx} width="26" height={cmPx} fill={color} />
                          <rect x="172" y={yBottom - 9 * cmPx} width="26" height={cmPx} fill={color} />
                        </g>
                      );
                    })}

                    {/* Optical Reticle (Lưới chỉ chữ thập) */}
                    {/* Vertical Hair (Chỉ đứng) */}
                    <line x1="170" y1="21" x2="170" y2="289" stroke="#0f172a" strokeWidth="1.2" />

                    {/* Middle Crosshair (Chỉ giữa l) — Long horizontal line */}
                    <line x1="36" y1="155" x2="304" y2="155" stroke="#0f172a" strokeWidth="1.8" />

                    {/* Upper Stadia Hair (Chỉ trên a) — Short horizontal line */}
                    <line
                      x1="118"
                      y1={155 - halfSpread * pxPerMm}
                      x2="222"
                      y2={155 - halfSpread * pxPerMm}
                      stroke="#dc2626"
                      strokeWidth="1.8"
                    />

                    {/* Lower Stadia Hair (Chỉ dưới b) — Short horizontal line */}
                    <line
                      x1="118"
                      y1={155 + halfSpread * pxPerMm}
                      x2="222"
                      y2={155 + halfSpread * pxPerMm}
                      stroke="#0F766E"
                      strokeWidth="1.8"
                    />
                  </g>

                  {/* Callout Labels on the right side outside eyepiece */}
                  {/* Upper Hair (a) callout */}
                  <line
                    x1="222"
                    y1={Math.max(38, 155 - halfSpread * pxPerMm)}
                    x2="318"
                    y2="58"
                    stroke="#f87171"
                    strokeWidth="1.4"
                    strokeDasharray="3 2"
                  />
                  <text x="322" y="54" fontSize="11" fontWeight="700" fill="#fca5a5">
                    Chỉ trên (a)
                  </text>
                  <text x="322" y="70" fontSize="13" fontWeight="700" fontFamily="monospace" fill="#ffffff">
                    {upperA} mm
                  </text>

                  {/* Middle Hair (l) callout */}
                  <line x1="286" y1="155" x2="318" y2="155" stroke="#fbbf24" strokeWidth="1.6" />
                  <text x="322" y="150" fontSize="11" fontWeight="700" fill="#fde68a">
                    Chỉ giữa (l)
                  </text>
                  <text x="322" y="166" fontSize="13" fontWeight="700" fontFamily="monospace" fill="#ffffff">
                    {middleMm} mm
                  </text>

                  {/* Lower Hair (b) callout */}
                  <line
                    x1="222"
                    y1={Math.min(272, 155 + halfSpread * pxPerMm)}
                    x2="318"
                    y2="246"
                    stroke="#2dd4bf"
                    strokeWidth="1.4"
                    strokeDasharray="3 2"
                  />
                  <text x="322" y="242" fontSize="11" fontWeight="700" fill="#5eead4">
                    Chỉ dưới (b)
                  </text>
                  <text x="322" y="258" fontSize="13" fontWeight="700" fontFamily="monospace" fill="#ffffff">
                    {lowerB} mm
                  </text>

                  {/* Vertical Hair note */}
                  <text x="170" y="14" textAnchor="middle" fontSize="9.5" fill="#cbd5e1">
                    ↑ Chỉ đứng (bắt tim mia đo Hz)
                  </text>
                </svg>
                <p className="mt-2 text-[11px] text-slate-500 text-center">
                  Mỗi răng đen/đỏ hoặc khe trắng của chữ E = <strong>10 mm (1 cm)</strong> · Cả khối chữ E = <strong>50 mm (5 cm)</strong>.
                </p>
              </div>

              {/* Interactive Sliders + Live Reading Decoder */}
              <div className="lg:col-span-6 space-y-4">
                <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
                  <div>
                    <div className="flex justify-between text-xs font-medium text-slate-700">
                      <label htmlFor="sim-middle">Độ cao tia ngắm — Chỉ giữa (l)</label>
                      <span className="font-mono font-bold text-[#1E3A5F]">{middleMm} mm ({(middleMm / 1000).toFixed(3)} m)</span>
                    </div>
                    <input
                      id="sim-middle"
                      type="range"
                      min="1150"
                      max="1950"
                      step="1"
                      value={middleMm}
                      onChange={(e) => setMiddleMm(Number(e.target.value))}
                      className="mt-1 w-full accent-[#1E3A5F]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-medium text-slate-700">
                      <label htmlFor="sim-dist">Khoảng cách từ máy tới mia (D)</label>
                      <span className="font-mono font-bold text-[#0F766E]">{distanceM} m</span>
                    </div>
                    <input
                      id="sim-dist"
                      type="range"
                      min="8"
                      max="48"
                      step="1"
                      value={distanceM}
                      onChange={(e) => setDistanceM(Number(e.target.value))}
                      className="mt-1 w-full accent-[#0F766E]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-medium text-slate-700">
                      <label htmlFor="sim-slope">Góc nghiêng ống kính (α)</label>
                      <span className="font-mono font-bold text-slate-800">
                        α = {slopeDeg >= 0 ? '+' : ''}{slopeDeg}° · Z({faceMode}) = {zenithDeg}°
                      </span>
                    </div>
                    <input
                      id="sim-slope"
                      type="range"
                      min="-15"
                      max="15"
                      step="1"
                      value={slopeDeg}
                      onChange={(e) => setSlopeDeg(Number(e.target.value))}
                      className="mt-1 w-full accent-slate-700"
                    />
                  </div>
                </div>

                {/* Live Reading Formula & Digit Breakdown */}
                <div className="rounded-md border border-slate-200 bg-white p-4 space-y-2.5 text-xs">
                  <p className="font-semibold text-[#1E3A5F]">
                    Cách đọc nhanh chỉ giữa l = <span className="font-mono text-sm">{middleMm} mm</span> trên mia chữ E:
                  </p>
                  <div className="grid grid-cols-4 gap-2 text-center font-mono">
                    <div className="rounded border border-slate-200 bg-slate-50 p-2">
                      <span className="block text-base font-bold text-[#1E3A5F]">{mDigit}</span>
                      <span className="font-sans text-[10px] text-slate-500">Hàng mét (m)</span>
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50 p-2">
                      <span className="block text-base font-bold text-[#1E3A5F]">{dmDigit}</span>
                      <span className="font-sans text-[10px] text-slate-500">Số dm ({mDigit}{dmDigit})</span>
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50 p-2">
                      <span className="block text-base font-bold text-[#0F766E]">{cmDigit}</span>
                      <span className="font-sans text-[10px] text-slate-500">Đếm răng cm</span>
                    </div>
                    <div className="rounded border border-slate-200 bg-slate-50 p-2">
                      <span className="block text-base font-bold text-amber-700">{mmDigit}</span>
                      <span className="font-sans text-[10px] text-slate-500">Ước lượng mm</span>
                    </div>
                  </div>

                  <div className="rounded bg-emerald-50/80 border border-emerald-200 p-2.5 font-mono text-[11px] text-emerald-900 space-y-1">
                    <div className="flex items-center gap-1.5 font-sans font-semibold text-emerald-800">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Kiểm tra tức thì (Phải ≤ 2mm):
                    </div>
                    <p>
                      (a + b) / 2 = ({upperA} + {lowerB}) / 2 = {checkAvg.toFixed(1)} mm → Sai lệch ={' '}
                      <strong>{checkDiff.toFixed(1)} mm</strong>
                    </p>
                    <p>
                      D = 100 × ({(upperA / 1000).toFixed(3)} − {(lowerB / 1000).toFixed(3)}) × cos²({slopeDeg}°) ={' '}
                      <strong>{distanceM.toFixed(2)} m</strong>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Visual Reference Photos + Field Steps */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="aspect-[4/3] w-full bg-slate-100 overflow-hidden">
                {!img1Err ? (
                  <img
                    src={THEODOLITE_IMG}
                    alt="Minh họa cấu tạo máy kinh vĩ điện tử gắn trên chân ba nhôm"
                    referrerPolicy="no-referrer"
                    onError={() => setImg1Err(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-400">
                    <Compass className="h-10 w-10" />
                  </div>
                )}
              </div>
              <div className="p-4 text-xs space-y-1.5">
                <h4 className="font-semibold text-[#1E3A5F]">Cấu tạo máy kinh vĩ &amp; thao tác nhớ nhanh</h4>
                <ul className="space-y-1 text-slate-600 leading-relaxed">
                  <li><strong>1. Định tâm:</strong> Nhìn ống dọi tâm quang học / tia laser chiếu đúng tâm đinh mốc.</li>
                  <li><strong>2. Cân bằng bọt thủy tròn:</strong> Nâng/hạ 3 chân máy sao cho bọt tròn vào vòng tròn giữa.</li>
                  <li><strong>3. Cân bọt thủy dài (3 ốc cân):</strong> Quay 2 ốc song song ngược chiều nhau, rồi quay máy 90° chỉnh ốc thứ 3.</li>
                  <li><strong>4. Điều quang 2 vòng:</strong> Chỉnh vòng thị kính cho lưới chỉ chữ thập sắc nét, sau đó chỉnh vòng vật kính cho mia rõ hết thị sai.</li>
                </ul>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="aspect-[4/3] w-full bg-slate-100 overflow-hidden">
                {!img2Err ? (
                  <img
                    src={STADIA_ROD_IMG}
                    alt="Hình ảnh thực tế mia nhôm chữ E đặt thẳng đứng trên mốc trắc địa"
                    referrerPolicy="no-referrer"
                    onError={() => setImg2Err(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-400">
                    <RotateCw className="h-10 w-10" />
                  </div>
                )}
              </div>
              <div className="p-4 text-xs space-y-1.5">
                <h4 className="font-semibold text-[#1E3A5F]">Mẹo đọc Mia chữ E &amp; Đo 2 mặt L / R không bao giờ quên</h4>
                <ul className="space-y-1 text-slate-600 leading-relaxed">
                  <li><strong>Chỉ trên (a) &gt; Chỉ giữa (l) &gt; Chỉ dưới (b):</strong> Luôn đọc 4 chữ số theo mm (ví dụ <code className="font-mono">1650</code>). Nhẩm ngay <code className="font-mono">(a+b)/2 = l</code> (lệch &gt; 2mm là đọc nhầm vạch cm!).</li>
                  <li><strong>Thuận kính (L):</strong> Bàn độ đứng nằm bên TRÁI người đo, ngắm ngang thì <code className="font-mono">Z ≈ 90°</code>.</li>
                  <li><strong>Đảo kính (R):</strong> Quay ống kính qua thiên đỉnh 180° và quay máy 180°, bàn độ đứng sang PHẢI, ngắm ngang thì <code className="font-mono">Z ≈ 270°</code>.</li>
                  <li><strong>Vì sao đo L &amp; R?</strong> Khử sai số chuẩn trực <code className="font-mono">2C</code> (góc bằng) và sai số chỉ tiêu <code className="font-mono">MO</code> (góc đứng).</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
