import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Send,
  PanelRightClose,
  PanelRightOpen,
  ShieldAlert,
  TrendingUp,
  Loader2,
  Bot,
  RotateCcw,
  Trash2,
  HelpCircle,
  Camera,
  ImagePlus,
  Paperclip,
  FileText,
  FileSpreadsheet,
  X,
  RefreshCw,
  Upload,
  FileSearch,
} from 'lucide-react';
import type {
  AiSurveyAction,
  ChatAttachmentPreview,
  ChatMessage,
} from '../types/survey';
import {
  formatFriendlyAiError,
  parseInlineTokens,
  parseMarkdownBlocks,
} from '../utils/chatFormat';
import {
  classifyAttachmentFile,
  formatFileSize,
  MAX_ATTACHMENT_BYTES,
  truncateDocumentText,
  type AiChatAttachmentPayload,
} from '../utils/chatAttachments';
import { stripDataUrlPrefix } from '../utils/cameraOcr';

interface AiAssistantSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  surveyContext: Record<string, unknown>;
  onExecuteAiAction: (action: AiSurveyAction) => string;
}

interface ExtendedChatMessage extends ChatMessage {
  retryPrompt?: string;
  retryAttachments?: AiChatAttachmentPayload[];
}

const MAX_CHAT_IMAGE_DIM = 1600;
const MAX_PENDING_ATTACHMENTS = 5;

const createWelcomeMessage = (): ExtendedChatMessage => ({
  id: 'welcome',
  role: 'assistant',
  text:
    'Xin chào kỹ sư! Tôi có thể **điều khiển toàn bộ phần mềm** & đọc trực tiếp ảnh/tài liệu ngay tại đây:\n' +
    '- **Camera · Chèn ảnh · Tải tài liệu:** Chụp sổ đo/màn hình máy, chèn ảnh (hoặc dán `Ctrl+V`), tải PDF/Excel đề bài để phân tích và **nhập tự động vào cả Tab 1, 2, 3**.\n' +
    '- **Toàn quyền thao tác theo lệnh:** Đổi đơn vị (`m/dm/cm/mm`, góc `Z/V`), sửa tọa độ/chỉ mia, xóa điểm hoặc xóa lỗi mia `> 2mm`, khôi phục mẫu.\n' +
    '- **Xuất file & Mở công cụ:** Gõ *"xuất Excel WPS"*, *"tải CSV Civil 3D"*, *"xuất AutoCAD .scr"* hoặc *"mở bình đồ 2D"* để thực hiện ngay.',
  timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
});

async function compressImageBlobToJpegDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh.'));
    reader.onload = () => {
      const src = typeof reader.result === 'string' ? reader.result : '';
      const img = new Image();
      img.onerror = () => resolve(src);
      img.onload = () => {
        const scale = Math.min(1, MAX_CHAT_IMAGE_DIM / Math.max(img.width, img.height));
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

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Không thể đọc tệp ${file.name}.`));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  });
}

async function extractSpreadsheetToText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sections: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    if (csv.trim()) {
      sections.push(`[Sheet: ${sheetName}]\n${csv.trim()}`);
    }
  }
  return truncateDocumentText(sections.join('\n\n'));
}

async function processFileIntoAttachment(file: File): Promise<AiChatAttachmentPayload> {
  const category = classifyAttachmentFile(file.name, file.type);
  if (category === 'unsupported') {
    throw new Error(
      `Định dạng tệp "${file.name}" chưa hỗ trợ. Vui lòng dùng Ảnh (JPG/PNG), PDF, Excel/WPS (.xlsx, .csv) hoặc văn bản (.txt).`
    );
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Tệp "${file.name}" vượt quá giới hạn 10 MB.`);
  }

  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  if (category === 'image') {
    const dataUrl = await compressImageBlobToJpegDataUrl(file);
    const { mimeType, base64 } = stripDataUrlPrefix(dataUrl);
    return {
      id,
      name: file.name || `anh-chup-${Date.now()}.jpg`,
      kind: 'image',
      mimeType,
      sizeBytes: file.size,
      base64,
      previewUrl: dataUrl,
    };
  }

  if (category === 'pdf') {
    const dataUrl = await readFileAsDataUrl(file);
    const { mimeType, base64 } = stripDataUrlPrefix(dataUrl);
    return {
      id,
      name: file.name,
      kind: 'pdf',
      mimeType: mimeType || 'application/pdf',
      sizeBytes: file.size,
      base64,
    };
  }

  if (category === 'spreadsheet') {
    const extractedText = await extractSpreadsheetToText(file);
    return {
      id,
      name: file.name,
      kind: 'text',
      mimeType: file.type || 'text/csv',
      sizeBytes: file.size,
      extractedText,
    };
  }

  const rawText = await file.text();
  return {
    id,
    name: file.name,
    kind: 'text',
    mimeType: file.type || 'text/plain',
    sizeBytes: file.size,
    extractedText: truncateDocumentText(rawText),
  };
}

const InlineFormatted: React.FC<{ text: string; isUser: boolean }> = ({ text, isUser }) => {
  const tokens = parseInlineTokens(text);
  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.type === 'bold') {
          return (
            <strong key={i} className={isUser ? 'font-semibold text-white' : 'font-semibold text-slate-900'}>
              {tok.value}
            </strong>
          );
        }
        if (tok.type === 'italic') {
          return (
            <em key={i} className="italic">
              {tok.value}
            </em>
          );
        }
        if (tok.type === 'code') {
          return (
            <code
              key={i}
              className={`rounded px-1 py-0.5 font-mono text-[11px] ${
                isUser
                  ? 'bg-white/15 text-teal-100'
                  : 'bg-slate-200/80 text-[#1E3A5F]'
              }`}
            >
              {tok.value}
            </code>
          );
        }
        return <React.Fragment key={i}>{tok.value}</React.Fragment>;
      })}
    </>
  );
};

const FormattedMessageBody: React.FC<{ text: string; isUser: boolean }> = ({ text, isUser }) => {
  const blocks = parseMarkdownBlocks(text);
  return (
    <div className="space-y-1.5">
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          return (
            <p
              key={idx}
              className={`pt-1 font-semibold ${isUser ? 'text-white' : 'text-[#1E3A5F]'}`}
            >
              <InlineFormatted text={block.text} isUser={isUser} />
            </p>
          );
        }
        if (block.type === 'bullet') {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-0.5">
              <span className={isUser ? 'text-teal-200' : 'text-[#0F766E]'} aria-hidden="true">
                •
              </span>
              <span className="flex-1">
                <InlineFormatted text={block.text} isUser={isUser} />
              </span>
            </div>
          );
        }
        if (block.type === 'numbered') {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-0.5">
              <span className={`font-mono font-semibold ${isUser ? 'text-teal-200' : 'text-[#1E3A5F]'}`}>
                {block.index}.
              </span>
              <span className="flex-1">
                <InlineFormatted text={block.text} isUser={isUser} />
              </span>
            </div>
          );
        }
        return (
          <p key={idx}>
            <InlineFormatted text={block.text} isUser={isUser} />
          </p>
        );
      })}
    </div>
  );
};

export const AiAssistantSidebar: React.FC<AiAssistantSidebarProps> = ({
  isOpen,
  onToggle,
  surveyContext,
  onExecuteAiAction,
}) => {
  const [messages, setMessages] = useState<ExtendedChatMessage[]>(() => [createWelcomeMessage()]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Multimodal attachments & inline camera state
  const [pendingAttachments, setPendingAttachments] = useState<AiChatAttachmentPayload[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'active' | 'unavailable'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; name: string } | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const cameraFallbackInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isLoading]);

  const stopInlineCamera = useCallback(() => {
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

  const startInlineCamera = useCallback(
    async (desiredFacing: 'environment' | 'user') => {
      stopInlineCamera();
      setCameraError(null);

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('unavailable');
        setCameraError('Thiết bị chưa hỗ trợ mở camera trực tiếp. Hãy chọn ảnh từ máy hoặc máy ảnh gốc.');
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
          setCameraError('Chưa được cấp quyền Camera. Bạn có thể bấm nút bên dưới để chọn ảnh từ máy.');
        } else {
          setCameraError('Không tìm thấy webcam/camera trực tiếp. Bạn vẫn có thể chọn ảnh sổ đo hoặc đề bài từ máy.');
        }
      }
    },
    [stopInlineCamera]
  );

  useEffect(() => {
    if (!cameraOpen || !isOpen) {
      stopInlineCamera();
      return;
    }
    startInlineCamera(facingMode);
    return () => {
      stopInlineCamera();
    };
  }, [cameraOpen, isOpen, facingMode, startInlineCamera, stopInlineCamera]);

  const addFilesToPending = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setAttachmentError(null);

    const processed: AiChatAttachmentPayload[] = [];
    const errors: string[] = [];

    for (const f of files) {
      try {
        const att = await processFileIntoAttachment(f);
        processed.push(att);
      } catch (err: unknown) {
        errors.push(err instanceof Error ? err.message : `Không đọc được tệp ${f.name}.`);
      }
    }

    if (processed.length > 0) {
      setPendingAttachments((prev) => [...prev, ...processed].slice(0, MAX_PENDING_ATTACHMENTS));
    }
    if (errors.length > 0) {
      setAttachmentError(errors[0]);
    }
  }, []);

  const handleCaptureInlinePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const scale = Math.min(1, MAX_CHAT_IMAGE_DIM / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(1, Math.round(video.videoWidth * scale));
    const h = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    const { mimeType, base64 } = stripDataUrlPrefix(dataUrl);
    const approxBytes = Math.round((base64.length * 3) / 4);

    const photoAtt: AiChatAttachmentPayload = {
      id: `cam-${Date.now()}`,
      name: `anh-cong-trinh-${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/:/g, '')}.jpg`,
      kind: 'image',
      mimeType,
      sizeBytes: approxBytes,
      base64,
      previewUrl: dataUrl,
    };

    setPendingAttachments((prev) => [...prev, photoAtt].slice(0, MAX_PENDING_ATTACHMENTS));
    setCameraOpen(false);
    stopInlineCamera();
  };

  const sendMessage = async (
    textToSend: string,
    options?: {
      isRetry?: boolean;
      removeErrorId?: string;
      overrideAttachments?: AiChatAttachmentPayload[];
    }
  ) => {
    const attachmentsToSend = options?.overrideAttachments ?? pendingAttachments;
    const trimmed = textToSend.trim();
    if ((!trimmed && attachmentsToSend.length === 0) || isLoading) return;

    const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const displayPrompt =
      trimmed ||
      `Đọc & phân tích ${attachmentsToSend.length} tệp đính kèm, sau đó nhập toàn bộ số liệu vào sổ đo.`;

    const attachmentPreviews: ChatAttachmentPreview[] = attachmentsToSend.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      previewUrl: a.previewUrl,
    }));

    if (options?.isRetry && options.removeErrorId) {
      setMessages((prev) => prev.filter((m) => m.id !== options.removeErrorId));
    } else {
      const userMsg: ExtendedChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: displayPrompt,
        timestamp: nowStr,
        attachments: attachmentPreviews.length > 0 ? attachmentPreviews : undefined,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setPendingAttachments([]);
      setAttachmentError(null);
      if (cameraOpen) {
        setCameraOpen(false);
        stopInlineCamera();
      }
    }

    setIsLoading(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      attachmentsToSend.length > 0 ? 55000 : 40000
    );

    try {
      const historyPayload = messages
        .filter((m) => m.id !== 'welcome' && !m.isError && m.id !== options?.removeErrorId)
        .slice(-6)
        .map((m) => ({ role: m.role, text: m.text }));

      if (
        options?.isRetry &&
        historyPayload.length > 0 &&
        historyPayload[historyPayload.length - 1].role === 'user' &&
        historyPayload[historyPayload.length - 1].text === displayPrompt
      ) {
        historyPayload.pop();
      }

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload,
          surveyContext,
          attachments: attachmentsToSend.map((a) => ({
            name: a.name,
            kind: a.kind,
            mimeType: a.mimeType,
            base64: a.base64,
            extractedText: a.extractedText,
          })),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        actions?: AiSurveyAction[];
        error?: string;
        retryable?: boolean;
      };

      if (!res.ok) {
        const friendly = formatFriendlyAiError(data.error || `HTTP ${res.status}`, res.status);
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            text: friendly.message,
            timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            isError: true,
            retryPrompt: data.retryable !== false && friendly.retryable ? trimmed : undefined,
            retryAttachments:
              data.retryable !== false && friendly.retryable ? attachmentsToSend : undefined,
          },
        ]);
        return;
      }

      const appliedLabels: string[] = [];
      if (Array.isArray(data.actions)) {
        for (const act of data.actions) {
          const summary = onExecuteAiAction(act);
          if (summary) appliedLabels.push(summary);
        }
      }

      const assistantMsg: ExtendedChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: data.reply || 'Đã hoàn tất phân tích.',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        appliedActions: appliedLabels.length > 0 ? appliedLabels : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'Không thể kết nối Trợ lý AI.';
      const friendly = formatFriendlyAiError(rawMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: friendly.message,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          isError: true,
          retryPrompt: friendly.retryable ? trimmed : undefined,
          retryAttachments: friendly.retryable ? attachmentsToSend : undefined,
        },
      ]);
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([createWelcomeMessage()]);
    setPendingAttachments([]);
    setAttachmentError(null);
  };

  if (!isOpen) {
    return (
      <aside className="hidden lg:flex lg:sticky lg:top-[53px] lg:h-[calc(100vh-142px)] w-12 shrink-0 flex-col items-center border-l border-slate-200 bg-white py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Mở khung Trợ lý ảo AI Trắc địa"
          title="Mở Trợ lý AI Trắc địa"
          className="flex h-9 w-9 items-center justify-center rounded-md bg-[#1E3A5F] text-white hover:bg-[#162C49]"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
        <span
          className="mt-4 text-[11px] font-semibold tracking-wider text-slate-500"
          style={{ writingMode: 'vertical-rl' }}
        >
          Trợ lý AI Trắc địa
        </span>
      </aside>
    );
  }

  return (
    <aside
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDraggingFile) setIsDraggingFile(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDraggingFile(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFile(false);
        if (e.dataTransfer.files?.length) {
          addFilesToPending(e.dataTransfer.files);
        }
      }}
      className={`relative flex w-full lg:w-[370px] xl:w-[400px] shrink-0 flex-col border-t lg:border-t-0 lg:border-l bg-white lg:sticky lg:top-[53px] lg:h-[calc(100vh-142px)] ${
        isDraggingFile ? 'border-[#0F766E] ring-2 ring-inset ring-[#0F766E]/40' : 'border-slate-200'
      }`}
    >
      {/* Drag-and-drop overlay */}
      {isDraggingFile && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-teal-50/90 p-6 text-center">
          <Upload className="h-8 w-8 text-[#0F766E]" />
          <p className="text-xs font-semibold text-[#1E3A5F]">
            Thả ảnh sổ đo, PDF đề bài hoặc file Excel/WPS vào đây
          </p>
          <p className="text-[11px] text-slate-600">
            AI sẽ tự đọc, phân tích đề bài và nhập số liệu vào các tab
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#0F766E] text-white">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#1E3A5F]">Trợ lý AI Trắc địa</h2>
            <p className="text-[11px] text-slate-500">Camera · Đọc đề PDF/Excel · Nhập tất cả Tab</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleClearChat}
            disabled={isLoading}
            aria-label="Làm mới hội thoại AI"
            title="Làm mới hội thoại"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Thu gọn Trợ lý AI Trắc địa"
            title="Thu gọn"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Quick Prompts */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-100 bg-slate-50/80 px-3 py-2 shrink-0">
        <button
          type="button"
          disabled={isLoading}
          onClick={() =>
            sendMessage(
              'Kiểm tra sai số toàn bộ sổ đo hiện tại: liệt kê điểm vượt sai số mia > 2mm, đánh giá sai số đường chuyền 2 mặt và đề xuất cách xử lý ngoài thực địa.'
            )
          }
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-[#0F766E] hover:text-[#0F766E] disabled:opacity-50"
        >
          <ShieldAlert className="h-3 w-3 text-red-600" />
          Rà soát sai số
        </button>

        <button
          type="button"
          disabled={isLoading}
          onClick={() => {
            if (pendingAttachments.length > 0) {
              sendMessage(
                'Hãy đọc kỹ đề bài/tài liệu đính kèm này, phân tích chi tiết các dữ kiện & yêu cầu, sau đó thay thế/nhập toàn bộ mốc gốc, đường chuyền 2 mặt và điểm chi tiết vào các tab tương ứng giúp mình.'
              );
            } else {
              docInputRef.current?.click();
            }
          }}
          className="inline-flex items-center gap-1 rounded border border-[#0F766E]/40 bg-teal-50/60 px-2 py-1 text-[11px] font-semibold text-[#0F766E] hover:bg-teal-50 disabled:opacity-50"
        >
          <FileSearch className="h-3 w-3" />
          {pendingAttachments.length > 0 ? 'Phân tích & nhập hết' : 'Đọc đề PDF/Ảnh'}
        </button>

        <button
          type="button"
          disabled={isLoading}
          onClick={() =>
            sendMessage(
              'Hướng dẫn mình cách sử dụng từng chức năng của trang web GEOSURVEY PRO theo trình tự dễ hiểu nhất cho người mới.'
            )
          }
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-[#0F766E] hover:text-[#0F766E] disabled:opacity-50"
        >
          <HelpCircle className="h-3 w-3 text-[#1E3A5F]" />
          Hướng dẫn web
        </button>

        <button
          type="button"
          disabled={isLoading}
          onClick={() =>
            sendMessage(
              'Phân tích cao độ lớn nhất, nhỏ nhất, chênh cao địa hình và nhận xét sơ bộ khối lượng san nền của khu đo hiện tại theo TCVN 9401:2012.'
            )
          }
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-[#0F766E] hover:text-[#0F766E] disabled:opacity-50"
        >
          <TrendingUp className="h-3 w-3 text-[#0F766E]" />
          Phân tích cao độ
        </button>
      </div>

      {/* Chat Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3 text-xs min-h-[180px]"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[94%] rounded-lg px-3 py-2.5 leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#1E3A5F] text-white'
                  : msg.isError
                  ? 'border border-red-200 bg-red-50 text-red-800'
                  : 'border border-slate-200 bg-slate-50 text-slate-800'
              }`}
            >
              {/* Attached images / files inside user bubble */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {msg.attachments.map((att) =>
                    att.kind === 'image' && att.previewUrl ? (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() => setLightboxImage({ src: att.previewUrl!, name: att.name })}
                        title={`Xem ảnh ${att.name}`}
                        className="overflow-hidden rounded border border-white/30 hover:opacity-90"
                      >
                        <img
                          src={att.previewUrl}
                          alt={att.name}
                          className="h-16 w-20 object-cover"
                        />
                      </button>
                    ) : (
                      <div
                        key={att.id}
                        className="inline-flex items-center gap-1 rounded bg-white/15 px-2 py-1 text-[10px] text-teal-100"
                      >
                        {att.kind === 'pdf' ? (
                          <FileText className="h-3 w-3 shrink-0" />
                        ) : (
                          <FileSpreadsheet className="h-3 w-3 shrink-0" />
                        )}
                        <span className="max-w-[140px] truncate">{att.name}</span>
                      </div>
                    )
                  )}
                </div>
              )}

              <FormattedMessageBody text={msg.text} isUser={msg.role === 'user'} />

              {msg.appliedActions && msg.appliedActions.length > 0 && (
                <div className="mt-2 space-y-1 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800">
                  {msg.appliedActions.map((act, i) => (
                    <div key={i}>✓ {act}</div>
                  ))}
                </div>
              )}

              {msg.isError && (msg.retryPrompt !== undefined || (msg.retryAttachments?.length ?? 0) > 0) && (
                <div className="mt-2.5">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() =>
                      sendMessage(msg.retryPrompt || '', {
                        isRetry: true,
                        removeErrorId: msg.id,
                        overrideAttachments: msg.retryAttachments,
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded border border-red-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Thử lại yêu cầu này
                  </button>
                </div>
              )}
            </div>
            <span className="mt-1 px-1 text-[10px] text-slate-400">{msg.timestamp}</span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0F766E] shrink-0" />
            <span>Đang đọc dữ liệu, phân tích &amp; xử lý yêu cầu...</span>
          </div>
        )}
      </div>

      {/* Inline Camera Capture Panel inside AI Box */}
      {cameraOpen && (
        <div className="border-t border-slate-200 bg-slate-900 p-2.5 text-white shrink-0">
          <div className="mb-2 flex items-center justify-between text-[11px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-teal-300">
              <Camera className="h-3.5 w-3.5" />
              Camera chụp sổ đo / đề bài trực tiếp
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                }
                title="Đổi camera trước/sau"
                className="rounded bg-white/10 px-2 py-0.5 text-[10px] hover:bg-white/20 inline-flex items-center gap-1"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                {facingMode === 'environment' ? 'Sau' : 'Trước'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCameraOpen(false);
                  stopInlineCamera();
                }}
                aria-label="Đóng camera trong khung AI"
                className="rounded p-1 text-slate-300 hover:bg-white/15 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="relative h-40 w-full overflow-hidden rounded border border-slate-700 bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`h-full w-full object-cover ${cameraStatus === 'active' ? 'opacity-100' : 'opacity-0'}`}
            />

            {cameraStatus === 'starting' && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin text-teal-400" />
                Đang mở camera...
              </div>
            )}

            {cameraStatus === 'unavailable' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
                <p className="text-[11px] text-slate-300">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => cameraFallbackInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded bg-[#0F766E] px-3 py-1 text-[11px] font-semibold text-white hover:bg-[#0D625B]"
                >
                  <Upload className="h-3 w-3" />
                  Chọn ảnh / Máy ảnh gốc
                </button>
              </div>
            )}
          </div>

          {cameraStatus === 'active' && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => cameraFallbackInputRef.current?.click()}
                className="rounded border border-white/20 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/10"
              >
                Ảnh có sẵn
              </button>
              <button
                type="button"
                onClick={handleCaptureInlinePhoto}
                className="inline-flex items-center gap-1.5 rounded bg-[#0F766E] px-3.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0D625B]"
              >
                <Camera className="h-3.5 w-3.5" />
                Chụp đưa vào chat
              </button>
            </div>
          )}
        </div>
      )}

      {/* Integrated Document & Camera Upload Box + Input Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="border-t border-slate-200 bg-white px-3 pt-2.5 pb-3 shrink-0 space-y-2"
      >
        {/* Compact 3-button Upload Bar inside AI box: Camera · Chèn ảnh · Tải tài liệu */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-slate-50/80 px-2 py-1.5 text-[11px]">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => setCameraOpen((v) => !v)}
            aria-label="Mở camera trực tiếp trong ô AI"
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              cameraOpen
                ? 'bg-[#0F766E] text-white'
                : 'bg-[#1E3A5F] text-white hover:bg-[#162C49]'
            }`}
          >
            <Camera className="h-3 w-3 text-teal-200" />
            Camera
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => imageInputRef.current?.click()}
            aria-label="Chèn hình ảnh từ máy vào ô AI"
            className="inline-flex items-center gap-1 rounded border border-[#0F766E]/40 bg-teal-50/70 px-2 py-1 text-[11px] font-semibold text-[#0F766E] hover:bg-teal-100/70 whitespace-nowrap"
          >
            <ImagePlus className="h-3 w-3" />
            Chèn ảnh
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => docInputRef.current?.click()}
            aria-label="Tải tài liệu đề bài PDF hoặc Excel cho AI"
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-[#1E3A5F] hover:border-[#0F766E] hover:text-[#0F766E] whitespace-nowrap"
          >
            <Paperclip className="h-3 w-3 text-[#0F766E]" />
            Tải tài liệu
          </button>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={imageInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              addFilesToPending(e.target.files);
              e.target.value = '';
            }
          }}
        />
        <input
          ref={docInputRef}
          type="file"
          multiple
          accept=".pdf,.xlsx,.xls,.csv,.txt,.md,.scr,image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              addFilesToPending(e.target.files);
              e.target.value = '';
            }
          }}
        />
        <input
          ref={cameraFallbackInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              addFilesToPending(e.target.files);
              setCameraOpen(false);
              stopInlineCamera();
              e.target.value = '';
            }
          }}
        />

        {/* Attachment Error */}
        {attachmentError && (
          <div className="flex items-center justify-between gap-2 rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] text-red-700">
            <span className="truncate">{attachmentError}</span>
            <button
              type="button"
              onClick={() => setAttachmentError(null)}
              className="shrink-0 text-red-500 hover:text-red-800"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Pending Attachments Preview Tray */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {pendingAttachments.map((att) => (
              <div
                key={att.id}
                className="relative flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50/70 px-2 py-1 text-[11px] text-[#1E3A5F]"
              >
                {att.kind === 'image' && att.previewUrl ? (
                  <button
                    type="button"
                    onClick={() => setLightboxImage({ src: att.previewUrl!, name: att.name })}
                    title="Phóng to ảnh"
                    className="shrink-0 overflow-hidden rounded border border-slate-200 hover:opacity-90"
                  >
                    <img
                      src={att.previewUrl}
                      alt={att.name}
                      className="h-8 w-8 object-cover"
                    />
                  </button>
                ) : att.kind === 'pdf' ? (
                  <FileText className="h-4 w-4 text-red-600 shrink-0" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 text-[#0F766E] shrink-0" />
                )}
                <div className="min-w-0 leading-tight">
                  <div className="max-w-[130px] truncate font-medium">{att.name}</div>
                  <div className="text-[9px] text-slate-500">{formatFileSize(att.sizeBytes)}</div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPendingAttachments((prev) => prev.filter((item) => item.id !== att.id))
                  }
                  aria-label={`Gỡ tệp ${att.name}`}
                  className="ml-0.5 rounded p-0.5 text-slate-400 hover:bg-white hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Message Textarea + Send */}
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              const pastedFiles: File[] = [];
              for (const item of Array.from(items)) {
                if (item.kind === 'file') {
                  const f = item.getAsFile();
                  if (f) pastedFiles.push(f);
                }
              }
              if (pastedFiles.length > 0) {
                e.preventDefault();
                addFilesToPending(pastedFiles);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            aria-label="Nhập câu hỏi, dán ảnh hoặc lệnh nhập số liệu cho Trợ lý AI"
            placeholder={
              pendingAttachments.length > 0
                ? 'Nhập yêu cầu (vd: "Phân tích đề & thay toàn bộ số liệu") hoặc bấm Gửi ngay...'
                : 'Hỏi đề bài, dán ảnh (Ctrl+V) hoặc yêu cầu AI nhập tất cả số liệu...'
            }
            className="flex-1 resize-none rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading || (!input.trim() && pendingAttachments.length === 0)}
            aria-label="Gửi tin nhắn và tài liệu tới Trợ lý AI"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#0F766E] text-white hover:bg-[#0D625B] disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>

      {/* Full-size Image Preview Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Xem ảnh phóng to"
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-lg bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs">
              <span className="truncate font-semibold text-[#1E3A5F]">{lightboxImage.name}</span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                aria-label="Đóng xem ảnh"
                className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img
              src={lightboxImage.src}
              alt={lightboxImage.name}
              className="max-h-[80vh] w-auto object-contain bg-slate-950"
            />
          </div>
        </div>
      )}
    </aside>
  );
};
