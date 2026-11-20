import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  X,
  RefreshCw,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  ControlPoint,
  DetailSurveyRow,
  DetailUnitSettings,
  LengthUnit,
  TraverseRow,
  UnifiedStation,
  VerticalCircleMode,
} from '../types/survey';
import {
  buildControlPointsFromCandidates,
  buildDetailRowsFromCandidates,
  buildTraverseRowsFromCandidates,
  computeCandidateMiaErrorMm,
  sanitizeOcrResponse,
  stripDataUrlPrefix,
  type OcrControlCandidate,
  type OcrDetailCandidate,
  type OcrScanResponse,
  type OcrScanTarget,
  type OcrTraverseCandidate,
} from '../utils/cameraOcr';
import { formatFriendlyAiError } from '../utils/chatFormat';

interface CameraScannerModalProps {
  open: boolean;
  onClose: () => void;
  availableStations: UnifiedStation[];
  detailUnits: DetailUnitSettings;
  detailVertMode: VerticalCircleMode;
  traverseMiaUnit: LengthUnit;
  existingDetailCount: number;
  onImportDetailRows: (rows: DetailSurveyRow[], detectedVertMode?: VerticalCircleMode) => void;
  onImportControlPoints: (points: ControlPoint[]) => void;
  onImportTraverseRows: (rows: TraverseRow[]) => void;
}

const MAX_UPLOAD_DIM = 1600;

async function compressImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh đã chọn.'));
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      const img = new Image();
      img.onerror = () => resolve(src);
      img.onload = () => {
        const scale = Math.min(1, MAX_UPLOAD_DIM / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  open,
  onClose,
  availableStations,
  detailUnits,
  detailVertMode,
  traverseMiaUnit,
  existingDetailCount,
  onImportDetailRows,
  onImportControlPoints,
  onImportTraverseRows,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'active' | 'unavailable'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [targetMode, setTargetMode] = useState<OcrScanTarget>('auto');
  const [autoImportAfterScan, setAutoImportAfterScan] = useState<boolean>(false);
  const [defaultStation, setDefaultStation] = useState<string>(
    availableStations[1]?.name || availableStations[0]?.name || 'M1'
  );
  const [defaultOrient, setDefaultOrient] = useState<string>(availableStations[0]?.name || 'M0');
  const [defaultInstrumentHeightM, setDefaultInstrumentHeightM] = useState<number>(1.48);

  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<OcrScanResponse | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(
    async (desiredFacing: 'environment' | 'user') => {
      stopCamera();
      setCameraError(null);

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('unavailable');
        setCameraError(
          'Trình duyệt hoặc thiết bị hiện tại chưa hỗ trợ mở camera trực tiếp. Bạn có thể chọn ảnh từ máy hoặc chụp bằng nút "Tải ảnh / Mở máy ảnh".'
        );
        return;
      }

      setCameraStatus('starting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: desiredFacing },
            width: { ideal: 1600 },
            height: { ideal: 1200 },
          },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraStatus('active');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        setCameraStatus('unavailable');
        if (msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('permission')) {
          setCameraError(
            'Chưa được cấp quyền Camera. Hãy cho phép quyền camera trên trình duyệt hoặc bấm "Tải ảnh / Chụp từ thiết bị" bên dưới.'
          );
        } else {
          setCameraError(
            'Không tìm thấy camera khả dụng trên thiết bị này. Bạn vẫn có thể tải ảnh sổ đo / màn hình máy kinh vĩ từ thư viện để AI tự đọc.'
          );
        }
      }
    },
    [stopCamera]
  );

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    if (!capturedDataUrl) {
      startCamera(facingMode);
    }
    return () => {
      stopCamera();
    };
  }, [open, capturedDataUrl, facingMode, startCamera, stopCamera]);

  const applyScannedResult = useCallback(
    (res: OcrScanResponse) => {
      let importedCount = 0;

      if (res.controlPoints.some((c) => c.selected)) {
        const cps = buildControlPointsFromCandidates(res.controlPoints);
        if (cps.length > 0) {
          onImportControlPoints(cps);
          importedCount += cps.length;
        }
      }
      if (res.traverseRows.some((t) => t.selected)) {
        const trs = buildTraverseRowsFromCandidates(res.traverseRows, traverseMiaUnit);
        if (trs.length > 0) {
          onImportTraverseRows(trs);
          importedCount += trs.length;
        }
      }
      if (res.detailRows.some((d) => d.selected)) {
        const dts = buildDetailRowsFromCandidates(res.detailRows, detailUnits);
        if (dts.length > 0) {
          const firstSelected = res.detailRows.find((d) => d.selected);
          onImportDetailRows(dts, firstSelected?.verticalMode);
          importedCount += dts.length;
        }
      }

      if (importedCount > 0) {
        onClose();
      }
    },
    [
      detailUnits,
      traverseMiaUnit,
      onImportControlPoints,
      onImportDetailRows,
      onImportTraverseRows,
      onClose,
    ]
  );

  const runOcrScan = useCallback(
    async (dataUrl: string) => {
      setIsScanning(true);
      setScanError(null);
      setScanResult(null);

      try {
        const { mimeType, base64 } = stripDataUrlPrefix(dataUrl);
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 45000);

        try {
          const res = await fetch('/api/gemini/ocr-survey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              imageBase64: base64,
              mimeType,
              targetMode,
              defaults: {
                defaultStation,
                defaultOrient,
                defaultInstrumentHeightM,
                defaultVerticalMode: detailVertMode,
                availableStations: availableStations.map((s) => s.name),
              },
            }),
          });

          const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          if (!res.ok) {
            const friendly = formatFriendlyAiError(
              String(payload.error || `HTTP ${res.status}`),
              res.status
            );
            setScanError(friendly.message);
            return;
          }

          const sanitized = sanitizeOcrResponse(payload, {
            defaultStation,
            defaultOrient,
            defaultInstrumentHeightM,
            defaultVerticalMode: detailVertMode,
            existingDetailCount,
          });

          setScanResult(sanitized);

          const totalFound =
            sanitized.detailRows.length +
            sanitized.controlPoints.length +
            sanitized.traverseRows.length;

          if (autoImportAfterScan && totalFound > 0) {
            applyScannedResult(sanitized);
          }
        } finally {
          window.clearTimeout(timeoutId);
        }
      } catch (err: unknown) {
        const raw = err instanceof Error ? err.message : 'Lỗi kết nối máy chủ OCR AI.';
        setScanError(formatFriendlyAiError(raw).message);
      } finally {
        setIsScanning(false);
      }
    },
    [
      targetMode,
      defaultStation,
      defaultOrient,
      defaultInstrumentHeightM,
      detailVertMode,
      availableStations,
      existingDetailCount,
      autoImportAfterScan,
      applyScannedResult,
    ]
  );

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const scale = Math.min(1, MAX_UPLOAD_DIM / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(1, Math.round(video.videoWidth * scale));
    const h = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    stopCamera();
    setCapturedDataUrl(dataUrl);
    runOcrScan(dataUrl);
  };

  const handleFileUpload = async (file: File) => {
    try {
      stopCamera();
      const dataUrl = await compressImageFileToDataUrl(file);
      setCapturedDataUrl(dataUrl);
      runOcrScan(dataUrl);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : 'Không thể đọc tệp ảnh.');
    }
  };

  const handleRetake = () => {
    setCapturedDataUrl(null);
    setScanResult(null);
    setScanError(null);
  };

  const updateDetailCandidate = <K extends keyof OcrDetailCandidate>(
    idx: number,
    key: K,
    value: OcrDetailCandidate[K]
  ) => {
    setScanResult((prev) =>
      prev
        ? {
            ...prev,
            detailRows: prev.detailRows.map((row, i) => (i === idx ? { ...row, [key]: value } : row)),
          }
        : prev
    );
  };

  const updateControlCandidate = <K extends keyof OcrControlCandidate>(
    idx: number,
    key: K,
    value: OcrControlCandidate[K]
  ) => {
    setScanResult((prev) =>
      prev
        ? {
            ...prev,
            controlPoints: prev.controlPoints.map((row, i) =>
              i === idx ? { ...row, [key]: value } : row
            ),
          }
        : prev
    );
  };

  const updateTraverseCandidate = <K extends keyof OcrTraverseCandidate>(
    idx: number,
    key: K,
    value: OcrTraverseCandidate[K]
  ) => {
    setScanResult((prev) =>
      prev
        ? {
            ...prev,
            traverseRows: prev.traverseRows.map((row, i) =>
              i === idx ? { ...row, [key]: value } : row
            ),
          }
        : prev
    );
  };

  if (!open) return null;

  const selectedCount = scanResult
    ? scanResult.detailRows.filter((d) => d.selected).length +
      scanResult.controlPoints.filter((c) => c.selected).length +
      scanResult.traverseRows.filter((t) => t.selected).length
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Camera AI quét số liệu trắc địa ngoài công trình"
    >
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-[#1E3A5F] px-5 py-3.5 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F766E]">
              <Camera className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">
                Camera Quét Số Liệu Thực Địa (AI OCR)
              </h2>
              <p className="text-[11px] text-slate-200">
                Chụp sổ đo viết tay, màn hình máy kinh vĩ/toàn đạc hoặc bảng mốc gốc — tự bóc tách &amp; nhập vào bảng
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            aria-label="Đóng khung Camera quét số liệu"
            className="rounded-md p-1.5 text-slate-200 hover:bg-white/15 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Configuration Strip */}
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 shrink-0">
          <div className="flex flex-wrap items-end gap-3 text-xs">
            <div className="min-w-[180px] flex-1">
              <label htmlFor="ocr-mode" className="block text-[11px] font-semibold text-slate-600 mb-1">
                Loại bảng số liệu cần quét
              </label>
              <select
                id="ocr-mode"
                value={targetMode}
                onChange={(e) => setTargetMode(e.target.value as OcrScanTarget)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-[#0F766E] focus:outline-none"
              >
                <option value="auto">Tự động nhận diện (Khuyên dùng)</option>
                <option value="detail">Sổ đo chi tiết / Màn hình máy (Tab 3)</option>
                <option value="control">Bảng tọa độ Mốc gốc X, Y, H (Tab 1)</option>
                <option value="traverse">Đường chuyền 2 mặt L/R (Tab 2)</option>
              </select>
            </div>

            <div className="w-28">
              <label htmlFor="ocr-station" className="block text-[11px] font-semibold text-slate-600 mb-1">
                Trạm đặt máy
              </label>
              <select
                id="ocr-station"
                value={defaultStation}
                onChange={(e) => setDefaultStation(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-800"
              >
                {availableStations.map((st) => (
                  <option key={`cam-st-${st.name}`} value={st.name}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-28">
              <label htmlFor="ocr-orient" className="block text-[11px] font-semibold text-slate-600 mb-1">
                Định hướng
              </label>
              <select
                id="ocr-orient"
                value={defaultOrient}
                onChange={(e) => setDefaultOrient(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-800"
              >
                {availableStations.map((st) => (
                  <option key={`cam-or-${st.name}`} value={st.name}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-24">
              <label htmlFor="ocr-i" className="block text-[11px] font-semibold text-slate-600 mb-1">
                Cao máy i (m)
              </label>
              <input
                id="ocr-i"
                type="number"
                step="0.01"
                value={defaultInstrumentHeightM}
                onChange={(e) => setDefaultInstrumentHeightM(parseFloat(e.target.value) || 1.48)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-right font-mono text-xs tabular-nums"
              />
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={autoImportAfterScan}
                onChange={(e) => setAutoImportAfterScan(e.target.checked)}
                className="accent-[#0F766E]"
              />
              Tự nhập ngay sau khi quét
            </label>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!capturedDataUrl ? (
            /* Live Camera Capture View */
            <div className="space-y-4">
              <div className="relative mx-auto aspect-[16/10] max-h-[420px] w-full overflow-hidden rounded-lg border border-slate-300 bg-slate-900">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className={`h-full w-full object-cover ${cameraStatus === 'active' ? 'opacity-100' : 'opacity-0'}`}
                />

                {/* Optical Alignment Reticle Overlay */}
                {cameraStatus === 'active' && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                    <div className="relative h-full w-full max-w-2xl rounded border border-teal-300/60">
                      <span className="absolute -top-0.5 -left-0.5 h-5 w-5 border-t-2 border-l-2 border-teal-300" />
                      <span className="absolute -top-0.5 -right-0.5 h-5 w-5 border-t-2 border-r-2 border-teal-300" />
                      <span className="absolute -bottom-0.5 -left-0.5 h-5 w-5 border-b-2 border-l-2 border-teal-300" />
                      <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 border-b-2 border-r-2 border-teal-300" />
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-slate-900/75 px-3 py-1 text-[11px] font-medium text-teal-100">
                        Đưa trang sổ đo hoặc màn hình máy kinh vĩ vào giữa khung
                      </div>
                    </div>
                  </div>
                )}

                {cameraStatus === 'starting' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-200">
                    <Loader2 className="h-7 w-7 animate-spin text-teal-400" />
                    <span className="text-xs">Đang khởi động camera...</span>
                  </div>
                )}

                {cameraStatus === 'unavailable' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-teal-300">
                      <Camera className="h-6 w-6" />
                    </div>
                    <p className="max-w-md text-xs leading-relaxed text-slate-200">
                      {cameraError}
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-md bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0D625B]"
                    >
                      <Upload className="h-4 w-4" />
                      Tải ảnh sổ đo / Chụp từ thiết bị
                    </button>
                  </div>
                )}
              </div>

              {/* Capture Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Upload className="h-4 w-4 text-[#0F766E]" />
                    Chọn ảnh có sẵn / Máy ảnh gốc
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        handleFileUpload(f);
                        e.target.value = '';
                      }
                    }}
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Đổi camera ({facingMode === 'environment' ? 'Sau' : 'Trước'})
                  </button>
                </div>

                <button
                  type="button"
                  disabled={cameraStatus !== 'active'}
                  onClick={handleCapturePhoto}
                  className="inline-flex items-center gap-2 rounded-md bg-[#0F766E] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0D625B] disabled:opacity-40"
                >
                  <Camera className="h-4 w-4" />
                  Chụp &amp; Quét Số Liệu Ngay
                </button>
              </div>
            </div>
          ) : (
            /* Captured Photo + OCR Result Review View */
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Left: Photo Thumbnail */}
                <div className="lg:col-span-4 space-y-2.5">
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
                    <img
                      src={capturedDataUrl}
                      alt="Ảnh số liệu trắc địa vừa chụp"
                      className="max-h-56 w-full object-contain"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isScanning}
                      onClick={handleRetake}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Chụp lại / Ảnh khác
                    </button>
                    <button
                      type="button"
                      disabled={isScanning}
                      onClick={() => runOcrScan(capturedDataUrl)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[#0F766E] bg-teal-50 px-3 py-1.5 text-xs font-semibold text-[#0F766E] hover:bg-teal-100 disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Quét lại
                    </button>
                  </div>
                </div>

                {/* Right: Status / Warnings / Summary */}
                <div className="lg:col-span-8 space-y-3">
                  {isScanning && (
                    <div className="flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50/70 p-4 text-xs text-[#1E3A5F]">
                      <Loader2 className="h-5 w-5 animate-spin text-[#0F766E] shrink-0" />
                      <div>
                        <p className="font-semibold">AI đang đọc ảnh &amp; bóc tách số liệu trắc địa...</p>
                        <p className="mt-0.5 text-slate-600">
                          Hệ thống đang nhận diện góc bằng Hz, góc đứng Z/V, 3 chỉ mia a/l/b và kiểm tra đơn vị.
                        </p>
                      </div>
                    </div>
                  )}

                  {scanError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800 space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                        <span>{scanError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => runOcrScan(capturedDataUrl)}
                        className="inline-flex items-center gap-1.5 rounded border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Thử quét lại ảnh này
                      </button>
                    </div>
                  )}

                  {scanResult && !isScanning && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-semibold text-[#1E3A5F]">
                            <CheckCircle2 className="h-4 w-4 text-[#0F766E]" />
                            <span>{scanResult.sourceDescription}</span>
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-[#0F766E]">
                            {scanResult.detailRows.length > 0 && `${scanResult.detailRows.length} điểm chi tiết `}
                            {scanResult.controlPoints.length > 0 && `${scanResult.controlPoints.length} mốc gốc `}
                            {scanResult.traverseRows.length > 0 && `${scanResult.traverseRows.length} trạm đường chuyền`}
                            {scanResult.detailRows.length === 0 &&
                              scanResult.controlPoints.length === 0 &&
                              scanResult.traverseRows.length === 0 &&
                              'Chưa nhận diện được dòng số liệu'}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-600">
                          Bạn có thể chỉnh trực tiếp bất kỳ ô nào bên dưới trước khi bấm <strong>Nhập vào bảng số liệu</strong>.
                        </p>
                      </div>

                      {scanResult.warnings.length > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                          <div className="flex items-center gap-1.5 font-semibold mb-1">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                            Lưu ý kiểm tra hiện trường:
                          </div>
                          <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                            {scanResult.warnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Editable Preview Table: Detail Rows (Tab 3) */}
              {scanResult && scanResult.detailRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1E3A5F]">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-[#0F766E]" />
                    Số liệu Sổ đo chi tiết phát hiện được (sẽ nạp vào Tab 3 theo đơn vị {detailUnits.miaUnit} / {detailUnits.instrumentHeightUnit})
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-xs">
                      <thead className="bg-slate-50 text-[11px] text-slate-600">
                        <tr>
                          <th className="px-2 py-2 text-center">Chọn</th>
                          <th className="px-2 py-2 text-left">Điểm</th>
                          <th className="px-2 py-2 text-left">Trạm / ĐH</th>
                          <th className="px-2 py-2 text-right">i (m)</th>
                          <th className="px-2 py-2 text-left">Hz điểm</th>
                          <th className="px-2 py-2 text-left">Góc đứng (Z/V)</th>
                          <th className="px-2 py-2 text-right">a (mm)</th>
                          <th className="px-2 py-2 text-right">l (mm)</th>
                          <th className="px-2 py-2 text-right">b (mm)</th>
                          <th className="px-2 py-2 text-right">KT Mia</th>
                          <th className="px-2 py-2 text-left">Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {scanResult.detailRows.map((row, idx) => {
                          const miaErr = computeCandidateMiaErrorMm(row.miaAMm, row.miaLMm, row.miaBMm);
                          const isMiaOk = Math.abs(miaErr) <= 2;
                          return (
                            <tr key={`ocr-d-${idx}`} className={row.selected ? '' : 'opacity-45'}>
                              <td className="px-2 py-1.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={row.selected}
                                  onChange={(e) => updateDetailCandidate(idx, 'selected', e.target.checked)}
                                  className="accent-[#0F766E]"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={row.pointName}
                                  onChange={(e) => updateDetailCandidate(idx, 'pointName', e.target.value)}
                                  className="w-16 rounded border border-slate-300 px-1.5 py-1 font-mono text-xs font-semibold"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={row.stationName}
                                    onChange={(e) => updateDetailCandidate(idx, 'stationName', e.target.value)}
                                    className="w-12 rounded border border-slate-300 px-1 py-1 font-mono text-xs"
                                  />
                                  <span className="text-slate-400">→</span>
                                  <input
                                    type="text"
                                    value={row.orientName}
                                    onChange={(e) => updateDetailCandidate(idx, 'orientName', e.target.value)}
                                    className="w-12 rounded border border-slate-300 px-1 py-1 font-mono text-xs"
                                  />
                                </div>
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={row.instrumentHeightM}
                                  onChange={(e) =>
                                    updateDetailCandidate(idx, 'instrumentHeightM', parseFloat(e.target.value) || 0)
                                  }
                                  className="w-16 rounded border border-slate-300 px-1.5 py-1 text-right font-mono text-xs tabular-nums"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={row.hzPointStr}
                                  onChange={(e) => updateDetailCandidate(idx, 'hzPointStr', e.target.value)}
                                  className="w-24 rounded border border-slate-300 px-1.5 py-1 font-mono text-xs"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={row.vertAngleStr}
                                    onChange={(e) => updateDetailCandidate(idx, 'vertAngleStr', e.target.value)}
                                    className="w-24 rounded border border-slate-300 px-1.5 py-1 font-mono text-xs"
                                  />
                                  <select
                                    value={row.verticalMode}
                                    onChange={(e) =>
                                      updateDetailCandidate(
                                        idx,
                                        'verticalMode',
                                        e.target.value as VerticalCircleMode
                                      )
                                    }
                                    className="rounded border border-slate-300 bg-white px-1 py-1 font-mono text-[11px]"
                                  >
                                    <option value="Z">Z</option>
                                    <option value="V">V</option>
                                  </select>
                                </div>
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  value={row.miaAMm}
                                  onChange={(e) =>
                                    updateDetailCandidate(idx, 'miaAMm', parseFloat(e.target.value) || 0)
                                  }
                                  className="w-16 rounded border border-slate-300 px-1.5 py-1 text-right font-mono text-xs tabular-nums"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  value={row.miaLMm}
                                  onChange={(e) =>
                                    updateDetailCandidate(idx, 'miaLMm', parseFloat(e.target.value) || 0)
                                  }
                                  className="w-16 rounded border border-slate-300 px-1.5 py-1 text-right font-mono text-xs tabular-nums"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  value={row.miaBMm}
                                  onChange={(e) =>
                                    updateDetailCandidate(idx, 'miaBMm', parseFloat(e.target.value) || 0)
                                  }
                                  className="w-16 rounded border border-slate-300 px-1.5 py-1 text-right font-mono text-xs tabular-nums"
                                />
                              </td>
                              <td
                                className={`px-2 py-1.5 text-right font-mono text-xs font-semibold tabular-nums ${
                                  isMiaOk ? 'text-emerald-700' : 'text-red-600'
                                }`}
                              >
                                {miaErr >= 0 ? '+' : ''}
                                {miaErr.toFixed(1)}mm
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="text"
                                  value={row.note}
                                  onChange={(e) => updateDetailCandidate(idx, 'note', e.target.value)}
                                  className="w-28 rounded border border-slate-300 px-1.5 py-1 text-xs"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Editable Preview Table: Control Benchmarks (Tab 1) */}
              {scanResult && scanResult.controlPoints.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[#1E3A5F]">
                    Danh sách Mốc gốc phát hiện được (sẽ nạp vào Tab 1)
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-xs">
                      <thead className="bg-slate-50 text-[11px] text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-center">Chọn</th>
                          <th className="px-3 py-2 text-left">Tên mốc</th>
                          <th className="px-3 py-2 text-right">X - Bắc (m)</th>
                          <th className="px-3 py-2 text-right">Y - Đông (m)</th>
                          <th className="px-3 py-2 text-right">Cao độ H (m)</th>
                          <th className="px-3 py-2 text-left">Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {scanResult.controlPoints.map((cp, idx) => (
                          <tr key={`ocr-c-${idx}`} className={cp.selected ? '' : 'opacity-45'}>
                            <td className="px-3 py-1.5 text-center">
                              <input
                                type="checkbox"
                                checked={cp.selected}
                                onChange={(e) => updateControlCandidate(idx, 'selected', e.target.checked)}
                                className="accent-[#0F766E]"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={cp.name}
                                onChange={(e) => updateControlCandidate(idx, 'name', e.target.value)}
                                className="w-20 rounded border border-slate-300 px-2 py-1 font-mono text-xs font-semibold"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                step="0.001"
                                value={cp.x}
                                onChange={(e) => updateControlCandidate(idx, 'x', parseFloat(e.target.value) || 0)}
                                className="w-28 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs tabular-nums"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                step="0.001"
                                value={cp.y}
                                onChange={(e) => updateControlCandidate(idx, 'y', parseFloat(e.target.value) || 0)}
                                className="w-28 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs tabular-nums"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                step="0.001"
                                value={cp.h}
                                onChange={(e) => updateControlCandidate(idx, 'h', parseFloat(e.target.value) || 0)}
                                className="w-24 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs tabular-nums"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={cp.note}
                                onChange={(e) => updateControlCandidate(idx, 'note', e.target.value)}
                                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Editable Preview Table: Traverse 2-Face Rows (Tab 2) */}
              {scanResult && scanResult.traverseRows.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[#1E3A5F]">
                    Số liệu Đường chuyền 2 mặt L/R phát hiện được (sẽ nạp vào Tab 2)
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-xs">
                      <thead className="bg-slate-50 text-[11px] text-slate-600">
                        <tr>
                          <th className="px-2 py-2 text-center">Chọn</th>
                          <th className="px-2 py-2 text-left">Trạm → Ngắm</th>
                          <th className="px-2 py-2 text-left">Hz Sau L / Trước L</th>
                          <th className="px-2 py-2 text-left">Hz Sau R / Trước R</th>
                          <th className="px-2 py-2 text-left">Đứng L / R</th>
                          <th className="px-2 py-2 text-right">Mia a / l / b (mm)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {scanResult.traverseRows.map((tr, idx) => (
                          <tr key={`ocr-t-${idx}`} className={tr.selected ? '' : 'opacity-45'}>
                            <td className="px-2 py-1.5 text-center">
                              <input
                                type="checkbox"
                                checked={tr.selected}
                                onChange={(e) => updateTraverseCandidate(idx, 'selected', e.target.checked)}
                                className="accent-[#0F766E]"
                              />
                            </td>
                            <td className="px-2 py-1.5 font-mono">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={tr.stationName}
                                  onChange={(e) => updateTraverseCandidate(idx, 'stationName', e.target.value)}
                                  className="w-14 rounded border border-slate-300 px-1 py-1 text-xs"
                                />
                                <span>→</span>
                                <input
                                  type="text"
                                  value={tr.targetName}
                                  onChange={(e) => updateTraverseCandidate(idx, 'targetName', e.target.value)}
                                  className="w-14 rounded border border-slate-300 px-1 py-1 text-xs"
                                />
                              </div>
                            </td>
                            <td className="px-2 py-1.5 font-mono text-[11px]">
                              {tr.hzBackLStr} / {tr.hzForeLStr}
                            </td>
                            <td className="px-2 py-1.5 font-mono text-[11px]">
                              {tr.hzBackRStr} / {tr.hzForeRStr}
                            </td>
                            <td className="px-2 py-1.5 font-mono text-[11px]">
                              {tr.vertLStr} / {tr.vertRStr}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-[11px] tabular-nums">
                              {tr.miaAMm} / {tr.miaLMm} / {tr.miaBMm}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 shrink-0">
          <p className="text-[11px] text-slate-500">
            Mẹo chụp nét: giữ thẳng trang sổ / màn hình máy, tránh chói đèn trực tiếp lên màn hình LCD.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Đóng
            </button>
            {scanResult && selectedCount > 0 && (
              <button
                type="button"
                onClick={() => applyScannedResult(scanResult)}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#1E3A5F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#162C49]"
              >
                <CheckCircle2 className="h-4 w-4 text-teal-300" />
                Nhập {selectedCount} dòng vào sổ đo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
