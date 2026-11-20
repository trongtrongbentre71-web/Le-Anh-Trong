import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type, type FunctionDeclaration } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY chưa được cấu hình trên máy chủ.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const addDetailPointTool: FunctionDeclaration = {
  name: 'addDetailPoint',
  description:
    'Thêm một dòng điểm đo mới vào bảng Sổ đo chi tiết (Tab 3) khi người dùng yêu cầu thêm/nhập điểm đo bằng ngôn ngữ tự nhiên.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      pointName: {
        type: Type.STRING,
        description: 'Tên điểm đo mới, ví dụ P6, P7, M3...',
      },
      stationName: {
        type: Type.STRING,
        description: 'Tên trạm đặt máy, ví dụ M1, T1, M2...',
      },
      orientName: {
        type: Type.STRING,
        description: 'Tên điểm định hướng (ĐH), ví dụ M0, M1...',
      },
      instrumentHeightM: {
        type: Type.NUMBER,
        description: 'Chiều cao máy i quy đổi ra mét (m), ví dụ 1.45',
      },
      hzOrientStr: {
        type: Type.STRING,
        description: 'Góc bằng định hướng Hz_ĐH dạng độ phút giây, ví dụ 0°00\'00"',
      },
      hzPointStr: {
        type: Type.STRING,
        description: 'Góc bằng điểm đo Hz dạng độ phút giây, ví dụ 45°20\'10"',
      },
      vertAngleStr: {
        type: Type.STRING,
        description: 'Góc đứng Z hoặc V dạng độ phút giây, ví dụ 89°15\'00" hoặc -0°15\'20"',
      },
      verticalMode: {
        type: Type.STRING,
        description: 'Hệ góc đứng người dùng nhập: "Z" (thiên đỉnh, ~90°) hoặc "V" (góc đứng, ~0°)',
      },
      miaAMm: {
        type: Type.NUMBER,
        description: 'Chỉ trên mia a quy đổi ra mm, ví dụ 1850',
      },
      miaLMm: {
        type: Type.NUMBER,
        description: 'Chỉ giữa mia l quy đổi ra mm, ví dụ 1550',
      },
      miaBMm: {
        type: Type.NUMBER,
        description: 'Chỉ dưới mia b quy đổi ra mm, ví dụ 1250',
      },
      kind: {
        type: Type.STRING,
        description: 'Loại điểm: "detail" (Điểm chi tiết) hoặc "station" (Trạm chuyền)',
      },
      note: {
        type: Type.STRING,
        description: 'Ghi chú mô tả điểm đo, ví dụ Góc cổng, Cột đèn...',
      },
    },
    required: [
      'pointName',
      'stationName',
      'orientName',
      'instrumentHeightM',
      'hzPointStr',
      'vertAngleStr',
      'miaAMm',
      'miaLMm',
      'miaBMm',
    ],
  },
};

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

function isTransientError(err: unknown): { transient: boolean; statusCode: number; rawMessage: string } {
  const rawMessage = err instanceof Error ? err.message : String(err ?? '');
  const lower = rawMessage.toLowerCase();
  const statusFromObj =
    typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : 0;

  if (
    statusFromObj === 503 ||
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return { transient: true, statusCode: 503, rawMessage };
  }

  if (statusFromObj === 429 || lower.includes('429') || lower.includes('resource_exhausted')) {
    return { transient: true, statusCode: 429, rawMessage };
  }

  if (
    statusFromObj === 500 ||
    statusFromObj === 502 ||
    statusFromObj === 504 ||
    lower.includes('deadline_exceeded') ||
    lower.includes('econnreset') ||
    lower.includes('fetch failed')
  ) {
    return { transient: true, statusCode: statusFromObj || 503, rawMessage };
  }

  return { transient: false, statusCode: statusFromObj || 500, rawMessage };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatServerErrorMessage(rawMessage: string, statusCode: number): {
  error: string;
  retryable: boolean;
} {
  const lower = rawMessage.toLowerCase();
  if (statusCode === 503 || lower.includes('unavailable') || lower.includes('high demand')) {
    return {
      error:
        'Máy chủ AI đang tạm thời quá tải lưu lượng. Hệ thống đã tự động thử lại và chuyển dự phòng nhưng vẫn bận — vui lòng bấm "Thử lại" sau vài giây.',
      retryable: true,
    };
  }
  if (statusCode === 429 || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return {
      error:
        'Đã tạm chạm giới hạn lượt gọi AI. Vui lòng đợi 15–30 giây rồi bấm "Thử lại" hoặc kiểm tra API Key trong Settings > Secrets.',
      retryable: true,
    };
  }
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    lower.includes('chưa được cấu hình')
  ) {
    return {
      error:
        'Khóa GEMINI_API_KEY chưa hợp lệ hoặc chưa được thiết lập. Vui lòng kiểm tra lại trong Settings > Secrets.',
      retryable: false,
    };
  }
  return {
    error: 'Trợ lý AI gặp sự cố kết nối tạm thời. Vui lòng bấm "Thử lại".',
    retryable: true,
  };
}

const PER_ATTEMPT_TIMEOUT_MS = 14000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`DEADLINE_EXCEEDED: ${label} timed out after ${ms}ms`));
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function generateWithResilience(
  ai: GoogleGenAI,
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  systemInstruction: string
) {
  const attempts: Array<{ model: string; delayBeforeMs: number }> = [
    { model: PRIMARY_MODEL, delayBeforeMs: 0 },
    { model: PRIMARY_MODEL, delayBeforeMs: 600 },
    { model: FALLBACK_MODEL, delayBeforeMs: 300 },
    { model: FALLBACK_MODEL, delayBeforeMs: 900 },
  ];

  let lastErr: unknown;

  for (let i = 0; i < attempts.length; i++) {
    const { model, delayBeforeMs } = attempts[i];
    if (delayBeforeMs > 0) await sleep(delayBeforeMs);

    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: [addDetailPointTool] }],
            ...(model === PRIMARY_MODEL
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        }),
        PER_ATTEMPT_TIMEOUT_MS,
        model
      );
      return { response, usedModel: model };
    } catch (err) {
      lastErr = err;
      const check = isTransientError(err);
      console.warn(
        `Gemini attempt ${i + 1}/${attempts.length} (${model}) failed [${check.statusCode}]: ${check.rawMessage.slice(0, 180)}`
      );
      if (!check.transient) {
        throw err;
      }
    }
  }

  throw lastErr;
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.post('/api/gemini/chat', async (req, res) => {
    try {
      const { message, history = [], surveyContext = {} } = req.body as {
        message: string;
        history?: Array<{ role: 'user' | 'assistant'; text: string }>;
        surveyContext?: Record<string, unknown>;
      };

      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Tin nhắn không hợp lệ.', retryable: false });
        return;
      }

      const ai = getGeminiClient();

      const systemInstruction = `Bạn là Trợ lý AI Kỹ sư Trắc địa Công trình tích hợp trong ứng dụng web GEOSURVEY PRO (chuyên ngành Trắc địa công trình, Bản đồ địa hình, Tiêu chuẩn Việt Nam TCVN 9401:2012 & TCVN 9398:2012).

CẤU TRÚC ỨNG DỤNG GEOSURVEY PRO (để hướng dẫn người dùng mới dễ hiểu khi họ hỏi cách sử dụng web):
- Nút "Hướng dẫn Máy & Mia" (góc trên phải): Mở mô phỏng trực quan ống kính kinh vĩ & mia chữ E, kéo thanh trượt xem cách đọc Chỉ trên (a), Chỉ giữa (l), Chỉ dưới (b), Chỉ đứng, đo 2 mặt L/R và 6 bước đặt máy.
- Tab 1 (Mốc gốc): Nhập danh sách mốc khống chế gốc M0, M1 (X Bắc, Y Đông, Cao độ H) và xem bảng tổng hợp mọi trạm khả dụng.
- Tab 2 (Đường chuyền 2 mặt): Nhập số đo Thuận kính L / Đảo kính R, tự tính 2C, MO, α_TB, kiểm tra hạn sai ĐẠT/VƯỢT và tự bình sai Bowditch ra tọa độ trạm mới (T1, T2, T3...).
- Tab 3 (Sổ đo chi tiết): Chọn đơn vị m/dm/cm/mm, bật hiệu chỉnh độ cong Trái Đất f_ck (≥150m), nhập góc Hz, Z/V (hỗ trợ -0°), 3 chỉ mia a/l/b; tự kiểm tra sai số mia (xanh ≤2mm, đỏ >2mm) và hỗ trợ chuyền trạm liên tục khi chọn Loại điểm = "Trạm chuyền".
- Tab 4 (Đo cao & Tra cứu): Đo chiều cao tòa nhà tiếp cận được chân, giao hội đứng 2 trạm thẳng hàng A-B cho nhà cao tầng không tới được chân, và tra cứu khoảng cách/chênh cao/độ dốc giữa 2 điểm bất kỳ.
- Tab 5 (Bình đồ & Xuất file): Xem bản đồ 2D tương tác (Zoom/Pan, click 2 điểm đo nhanh), biểu đồ trắc dọc Cao độ H, xuất/nhập Excel chuẩn WPS Office (.xlsx, .csv Civil 3D), xuất AutoCAD (.scr) và đồng bộ 2 chiều Google Sheets.

PHONG CÁCH TRẢ LỜI:
- Tiếng Việt kỹ thuật rõ ràng, thân thiện, chia mục ngắn gọn dễ đọc.
- Luôn căn cứ vào SỐ LIỆU THỰC TẾ của khu đo hiện tại trong JSON bên dưới khi kiểm tra sai số, tính cao độ/độ dốc/san nền.
- Khi người dùng yêu cầu thêm/nhập điểm đo mới bằng ngôn ngữ tự nhiên, HÃY GỌI HÀM addDetailPoint với các thông số đã bóc tách chính xác (quy đổi chỉ mia về mm nếu nhập bằng m, ví dụ 1.85m -> 1850mm; mặc định Hz_ĐH = "0°00'00\"" nếu không nêu rõ; Z ~ 90° -> verticalMode="Z", góc quanh 0° -> verticalMode="V").

DỮ LIỆU KHU ĐO HIỆN TẠI (JSON):
${JSON.stringify(surveyContext)}`;

      // Build clean alternating conversation history (no empty turns or consecutive identical roles)
      const normalizedHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
      for (const h of history.slice(-8)) {
        const text = typeof h?.text === 'string' ? h.text.trim() : '';
        if (!text) continue;
        const role: 'user' | 'model' = h.role === 'assistant' ? 'model' : 'user';
        if (normalizedHistory.length === 0 && role === 'model') continue;
        if (normalizedHistory.length > 0 && normalizedHistory[normalizedHistory.length - 1].role === role) {
          normalizedHistory[normalizedHistory.length - 1].parts[0].text += `\n${text}`;
        } else {
          normalizedHistory.push({ role, parts: [{ text }] });
        }
      }
      // Ensure last history item is not 'user' right before appending current user message
      if (normalizedHistory.length > 0 && normalizedHistory[normalizedHistory.length - 1].role === 'user') {
        normalizedHistory.pop();
      }

      const contents = [
        ...normalizedHistory,
        { role: 'user' as const, parts: [{ text: message.trim() }] },
      ];

      const { response } = await generateWithResilience(ai, contents, systemInstruction);

      const actions: Array<{ type: string; payload: Record<string, unknown> }> = [];
      const functionCalls = response.functionCalls;

      if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
          if (call.name === 'addDetailPoint' && call.args) {
            actions.push({
              type: 'addDetailPoint',
              payload: call.args as Record<string, unknown>,
            });
          }
        }
      }

      let replyText = response.text?.trim() || '';
      if (!replyText && actions.length > 0) {
        const summaryLines = actions.map((a) => {
          const p = a.payload;
          return `- Đã thêm điểm **${p.pointName}** (Trạm ${p.stationName}, ĐH ${p.orientName}, i=${p.instrumentHeightM}m, Hz=${p.hzPointStr}, Góc đứng=${p.vertAngleStr}, mia a/l/b = ${p.miaAMm}/${p.miaLMm}/${p.miaBMm} mm${p.note ? `, ghi chú: ${p.note}` : ''}) vào Tab 3 (Sổ đo chi tiết).`;
        });
        replyText = `Đã thực hiện nhập liệu tự động vào Sổ đo chi tiết:\n${summaryLines.join('\n')}`;
      }

      res.json({
        reply: replyText || 'Tôi đã nhận yêu cầu nhưng chưa có phản hồi văn bản. Vui lòng thử diễn đạt cụ thể hơn.',
        actions,
      });
    } catch (error: unknown) {
      const check = isTransientError(error);
      console.error('Gemini chat final error:', check.rawMessage);
      const friendly = formatServerErrorMessage(check.rawMessage, check.statusCode);
      res.status(check.statusCode >= 400 ? check.statusCode : 500).json(friendly);
    }
  });

  if (isProduction) {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GEOSURVEY PRO server running at http://localhost:${PORT}`);
  });
}

createServer();
