import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  PanelRightClose,
  PanelRightOpen,
  ShieldAlert,
  TrendingUp,
  PlusCircle,
  Loader2,
  Bot,
  RotateCcw,
  Trash2,
  HelpCircle,
} from 'lucide-react';
import type { AiActionAddDetail, ChatMessage } from '../types/survey';
import {
  formatFriendlyAiError,
  parseInlineTokens,
  parseMarkdownBlocks,
} from '../utils/chatFormat';

interface AiAssistantSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  surveyContext: Record<string, unknown>;
  onExecuteAiAction: (action: AiActionAddDetail) => string;
}

interface ExtendedChatMessage extends ChatMessage {
  retryPrompt?: string;
}

const createWelcomeMessage = (): ExtendedChatMessage => ({
  id: 'welcome',
  role: 'assistant',
  text:
    'Xin chào kỹ sư! Tôi kết nối trực tiếp với toàn bộ số liệu khu đo hiện tại.\n' +
    '- **Rà soát sai số:** Tự phát hiện điểm lệch mia `> 2mm` và kiểm tra hạn sai đường chuyền.\n' +
    '- **Hướng dẫn dùng web & TCVN 9401:** Giải thích cách thao tác từng tab, xuất WPS/AutoCAD/Google Sheets.\n' +
    '- **Nhập điểm tự nhiên:** Gõ ví dụ *"Thêm điểm P8 đo từ trạm M1 định hướng M0, i=1.45m, Hz=45°20\'10\'\', Z=89°15\'00\'\', mia 1850, 1550, 1250, ghi chú Góc cổng"*.',
  timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
});

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
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isLoading]);

  const sendMessage = async (textToSend: string, options?: { isRetry?: boolean; removeErrorId?: string }) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;

    const nowStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    if (options?.isRetry && options.removeErrorId) {
      setMessages((prev) => prev.filter((m) => m.id !== options.removeErrorId));
    } else {
      const userMsg: ExtendedChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: trimmed,
        timestamp: nowStr,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
    }

    setIsLoading(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 40000);

    try {
      const historyPayload = messages
        .filter((m) => m.id !== 'welcome' && !m.isError && m.id !== options?.removeErrorId)
        .slice(-6)
        .map((m) => ({ role: m.role, text: m.text }));

      // Avoid duplicating the current prompt if retrying
      if (
        options?.isRetry &&
        historyPayload.length > 0 &&
        historyPayload[historyPayload.length - 1].role === 'user' &&
        historyPayload[historyPayload.length - 1].text === trimmed
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
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        actions?: AiActionAddDetail[];
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
          },
        ]);
        return;
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
        },
      ]);
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([createWelcomeMessage()]);
  };

  if (!isOpen) {
    return (
      <aside className="hidden lg:flex lg:sticky lg:top-[53px] lg:h-[calc(100vh-100px)] w-12 shrink-0 flex-col items-center border-l border-slate-200 bg-white py-3">
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
    <aside className="flex w-full lg:w-[350px] xl:w-[380px] shrink-0 flex-col border-t lg:border-t-0 lg:border-l border-slate-200 bg-white lg:sticky lg:top-[53px] lg:h-[calc(100vh-100px)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#0F766E] text-white">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#1E3A5F]">Trợ lý AI Trắc địa</h2>
            <p className="text-[11px] text-slate-500">Kiểm tra sai số · Tự động dự phòng</p>
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
      <div className="flex flex-wrap gap-1.5 border-b border-slate-100 bg-slate-50/80 px-3 py-2.5 shrink-0">
        <button
          type="button"
          disabled={isLoading}
          onClick={() =>
            sendMessage(
              'Kiểm tra sai số toàn bộ sổ đo hiện tại: liệt kê điểm vượt sai số mia > 2mm, đánh giá sai số đường chuyền 2 mặt và đề xuất cách xử lý ngoài thực địa.'
            )
          }
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#0F766E] hover:text-[#0F766E] disabled:opacity-50"
        >
          <ShieldAlert className="h-3 w-3 text-red-600" />
          Rà soát sai số
        </button>

        <button
          type="button"
          disabled={isLoading}
          onClick={() =>
            sendMessage(
              'Hướng dẫn mình cách sử dụng từng chức năng của trang web GEOSURVEY PRO theo trình tự dễ hiểu nhất cho người mới.'
            )
          }
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#0F766E] hover:text-[#0F766E] disabled:opacity-50"
        >
          <HelpCircle className="h-3 w-3 text-[#1E3A5F]" />
          Hướng dẫn dùng web
        </button>

        <button
          type="button"
          disabled={isLoading}
          onClick={() =>
            sendMessage(
              'Phân tích cao độ lớn nhất, nhỏ nhất, chênh cao địa hình và nhận xét sơ bộ khối lượng san nền của khu đo hiện tại theo TCVN 9401:2012.'
            )
          }
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#0F766E] hover:text-[#0F766E] disabled:opacity-50"
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
          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-[#1E3A5F] hover:text-[#1E3A5F] disabled:opacity-50"
        >
          <PlusCircle className="h-3 w-3 text-[#1E3A5F]" />
          Mẫu thêm điểm AI
        </button>
      </div>

      {/* Chat Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3 text-xs min-h-[260px]"
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
              <FormattedMessageBody text={msg.text} isUser={msg.role === 'user'} />

              {msg.appliedActions && msg.appliedActions.length > 0 && (
                <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800">
                  {msg.appliedActions.map((act, i) => (
                    <div key={i}>✓ {act}</div>
                  ))}
                </div>
              )}

              {msg.isError && msg.retryPrompt && (
                <div className="mt-2.5">
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() =>
                      sendMessage(msg.retryPrompt!, { isRetry: true, removeErrorId: msg.id })
                    }
                    className="inline-flex items-center gap-1.5 rounded border border-red-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Thử lại câu hỏi này
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
            <span>Đang phân tích dữ liệu khu đo...</span>
          </div>
        )}
      </div>

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="border-t border-slate-200 bg-white p-3 shrink-0"
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
            placeholder="Hỏi cách dùng web, kiểm tra sai số hoặc gõ lệnh thêm điểm..."
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
