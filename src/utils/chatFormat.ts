export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string };

export type MarkdownBlock =
  | { type: 'heading'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'numbered'; index: string; text: string }
  | { type: 'paragraph'; text: string };

/**
 * Parse inline markdown (`code`, **bold**, *italic*) safely into tokens (no HTML injection).
 */
export function parseInlineTokens(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: line.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith('`') && raw.endsWith('`')) {
      tokens.push({ type: 'code', value: raw.slice(1, -1) });
    } else if (raw.startsWith('**') && raw.endsWith('**')) {
      tokens.push({ type: 'bold', value: raw.slice(2, -2) });
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      tokens.push({ type: 'italic', value: raw.slice(1, -1) });
    } else {
      tokens.push({ type: 'text', value: raw });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({ type: 'text', value: line.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', value: line }];
}

/**
 * Parse markdown text into structured blocks (headings, bullets, numbered lists, paragraphs).
 */
export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const headingMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: 'heading', text: headingMatch[1] });
      continue;
    }

    const bulletMatch = trimmed.match(/^(?:[-•*])\s+(.+)$/);
    if (bulletMatch) {
      blocks.push({ type: 'bullet', text: bulletMatch[1] });
      continue;
    }

    const numMatch = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (numMatch) {
      blocks.push({ type: 'numbered', index: numMatch[1], text: numMatch[2] });
      continue;
    }

    blocks.push({ type: 'paragraph', text: trimmed });
  }

  return blocks;
}

/**
 * Convert raw Gemini / HTTP / JSON error strings into clean, actionable Vietnamese messages.
 */
export function formatFriendlyAiError(rawError: string, httpStatus?: number): {
  message: string;
  retryable: boolean;
} {
  const lower = (rawError || '').toLowerCase();

  if (
    httpStatus === 503 ||
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return {
      message:
        'Máy chủ AI đang tạm thời quá tải lưu lượng truy cập. Hệ thống đã tự thử lại nhưng vẫn bận — bạn hãy bấm nút "Thử lại" sau vài giây nhé.',
      retryable: true,
    };
  }

  if (
    httpStatus === 429 ||
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota')
  ) {
    return {
      message:
        'Đã tạm chạm giới hạn lượt gọi AI trong phút hiện tại. Vui lòng đợi khoảng 15–30 giây rồi bấm "Thử lại" (hoặc kiểm tra hạn mức API Key trong mục Settings > Secrets).',
      retryable: true,
    };
  }

  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    lower.includes('gemini_api_key chưa được cấu hình')
  ) {
    return {
      message:
        'Khóa API Gemini chưa được cấu hình hoặc không hợp lệ. Vui lòng kiểm tra lại GEMINI_API_KEY trong phần Settings > Secrets.',
      retryable: false,
    };
  }

  if (lower.includes('abort') || lower.includes('timeout') || lower.includes('network') || lower.includes('failed to fetch')) {
    return {
      message:
        'Kết nối tới máy chủ AI bị gián đoạn hoặc quá thời gian phản hồi. Vui lòng kiểm tra mạng và bấm "Thử lại".',
      retryable: true,
    };
  }

  // Strip raw JSON wrapper if present
  if (rawError.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawError) as { error?: { message?: string } };
      if (parsed?.error?.message) {
        return {
          message: `Trợ lý AI gặp sự cố tạm thời: ${parsed.error.message}`,
          retryable: true,
        };
      }
    } catch {
      // fall through
    }
  }

  return {
    message: rawError || 'Trợ lý AI gặp sự cố tạm thời. Bạn hãy bấm "Thử lại" nhé.',
    retryable: true,
  };
}
