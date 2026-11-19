import React, { useRef, useState } from 'react';
import {
  Send,
  PanelRightClose,
  PanelRightOpen,
  ShieldAlert,
  TrendingUp,
  PlusCircle,
  Loader2,
  Bot,
} from 'lucide-react';
import type { AiActionAddDetail, ChatMessage } from '../types/survey';

interface AiAssistantSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  surveyContext: Record<string, unknown>;
  onExecuteAiAction: (action: AiActionAddDetail) => string;
}

const INITIAL_WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Xin chào kỹ sư! Tôi kết nối trực tiếp với toàn bộ bảng mốc gốc, đường chuyền 2 mặt và sổ đo chi tiết hiện tại.\n\nBạn có thể yêu cầu:\n• Rà soát điểm vượt sai số mia (> 2mm) hoặc cạnh đường chuyền vượt hạn sai.\n• Hỏi đáp độ dốc, cao độ, khối lượng san nền sơ bộ & TCVN 9401:2012.\n• Nhập điểm đo bằng câu lệnh tự nhiên (ví dụ: "Thêm điểm P8 đo từ trạm M1 định hướng M0, i=1.45m, Hz_ĐH=0, Hz=45°20\'10\'\', Z=89°15\'00\'\', chỉ mia 1850, 1550, 1250, ghi chú Góc cổng").',
  timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
};

export const AiAssistantSidebar: React.FC<AiAssistantSidebarProps> = ({
  isOpen,
  onToggle,
  surveyContext,
  onExecuteAiAction,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_WELCOME]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const historyPayload = messages
        .filter((m) => m.id !== 'welcome' && !m.isError)
        .slice(-6)
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload,
          surveyContext,
        }),
      });

      const data = (await res.json()) as {
        reply?: string;
        actions?: AiActionAddDetail[];
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || `Lỗi máy chủ AI (HTTP ${res.status})`);
      }

      const appliedLabels: string[] = [];
      if (Array.isArray(data.actions)) {
        for (const act of data.actions) {
          if (act.type === 'addDetailPoint') {
            const summary = onExecuteAiAction(act);
            appliedLabels.push(summary);
          }
        }
      }

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: data.reply || 'Đã hoàn tất phân tích.',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        appliedActions: appliedLabels.length > 0 ? appliedLabels : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Không thể kết nối Trợ lý AI.';
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: `Không thể phản hồi từ Trợ lý AI: ${errMsg}`,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    }
  };

  if (!isOpen) {
    return (
      <aside className="hidden lg:flex w-12 shrink-0 flex-col items-center border-l border-slate-200 bg-white py-3">
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
    <aside className="flex w-full lg:w-[340px] xl:w-[370px] shrink-0 flex-col border-t lg:border-t-0 lg:border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#0F766E] text-white">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#1E3A5F]">Trợ lý AI Trắc địa</h2>
            <p className="text-[11px] text-slate-500">Kiểm tra sai số · TCVN 9401 · Nhập liệu</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Thu gọn Trợ lý AI Trắc địa"
          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      {/* Quick Prompts */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-100 bg-slate-50/80 px-3 py-2.5">
        <button
          type="button"
          disabled={isLoading}
          onClick={() =>
            sendMessage(
              'Kiểm tra sai số toàn bộ sổ đo hiện tại: liệt kê điểm vượt sai số mia > 2mm, đánh giá sai số đường chuyền 2 mặt và đề xuất cách xử lý ngoài thực địa.'
            )
          }
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#0F766E] hover:text-[#0F766E]"
        >
          <ShieldAlert className="h-3 w-3 text-red-600" />
          Rà soát sai số
        </button>

        <button
          type="button"
          disabled={isLoading}
          onClick={() =>
            sendMessage(
              'Phân tích cao độ lớn nhất, nhỏ nhất, chênh cao địa hình và nhận xét sơ bộ khối lượng san nền của khu đo hiện tại theo TCVN 9401:2012.'
            )
          }
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#0F766E] hover:text-[#0F766E]"
        >
          <TrendingUp className="h-3 w-3 text-[#0F766E]" />
          Phân tích cao độ
        </button>

        <button
          type="button"
          disabled={isLoading}
          onClick={() =>
            setInput(
              'Thêm điểm P7 đo từ trạm M1 định hướng M0, i=1.45m, Hz_ĐH=0, Hz=45°20\'10\'\', Z=89°15\'00\'\', chỉ mia 1850, 1550, 1250, ghi chú Góc cổng'
            )
          }
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#1E3A5F] hover:text-[#1E3A5F]"
        >
          <PlusCircle className="h-3 w-3 text-[#1E3A5F]" />
          Mẫu thêm điểm AI
        </button>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3 text-xs max-h-[520px] lg:max-h-none">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[92%] rounded-lg px-3 py-2.5 leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-[#1E3A5F] text-white'
                  : msg.isError
                  ? 'border border-red-200 bg-red-50 text-red-800'
                  : 'border border-slate-200 bg-slate-50 text-slate-800'
              }`}
            >
              {msg.text}
              {msg.appliedActions && msg.appliedActions.length > 0 && (
                <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800">
                  {msg.appliedActions.map((act, i) => (
                    <div key={i}>✓ {act}</div>
                  ))}
                </div>
              )}
            </div>
            <span className="mt-1 px-1 text-[10px] text-slate-400">{msg.timestamp}</span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0F766E]" />
            Đang phân tích dữ liệu khu đo...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="border-t border-slate-200 p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            aria-label="Nhập câu hỏi hoặc lệnh thêm điểm cho Trợ lý AI Trắc địa"
            placeholder="Hỏi về sai số, TCVN 9401 hoặc gõ lệnh thêm điểm đo..."
            className="flex-1 resize-none rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0F766E] focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            aria-label="Gửi tin nhắn tới Trợ lý AI"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#0F766E] text-white hover:bg-[#0D625B] disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </aside>
  );
};
