import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type, type FunctionDeclaration } from '@google/genai';

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

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Tin nhắn không hợp lệ.' });
        return;
      }

      const ai = getGeminiClient();

      const systemInstruction = `Bạn là Trợ lý AI Kỹ sư Trắc địa Công trình cao cấp tích hợp trong phần mềm GEOSURVEY PRO (chuyên ngành Trắc địa công trình, Bản đồ địa hình, Tiêu chuẩn Việt Nam TCVN 9401:2012 & TCVN 9398:2012).
Phong cách trả lời:
- Tiếng Việt kỹ thuật chuẩn xác, súc tích, dễ tra cứu (dùng danh sách rõ ràng, đơn vị m / mm / giây góc).
- Luôn căn cứ trực tiếp vào SỐ LIỆU THỰC TẾ hiện có của khu đo được cung cấp trong ngữ cảnh bên dưới.
- Khi kiểm tra sai số: rà soát tất cả các điểm chi tiết có |sai số mia| > 2mm (tính từ ((a+b)/2 - l)), các trạm đường chuyền có 2C lớn hoặc sai số khép góc f_β / tọa độ f_s / cao độ f_h vượt hạn sai, giải thích nguyên nhân (đọc nhầm vạch cm/dm trên mia chữ E, bọt thủy lệch, ngắm sai điểm định hướng) và đề xuất phương án xử lý ngoài thực địa.
- Khi người dùng yêu cầu thêm/nhập điểm đo mới bằng ngôn ngữ tự nhiên, HÃY GỌI HÀM addDetailPoint với các thông số đã bóc tách chính xác (quy đổi chỉ mia về mm nếu nhập bằng m, ví dụ 1.85m -> 1850mm; mặc định Hz_ĐH = "0°00'00\"" nếu không nêu rõ; nếu Z khoảng 70-110° thì verticalMode="Z", nếu góc nhỏ quanh 0° thì verticalMode="V").

DỮ LIỆU KHU ĐO HIỆN TẠI (JSON):
${JSON.stringify(surveyContext)}`;

      const contents = [
        ...history.slice(-8).map((h) => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.text }],
        })),
        { role: 'user', parts: [{ text: message }] },
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: [addDetailPointTool] }],
        },
      });

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
      const errMsg = error instanceof Error ? error.message : 'Lỗi không xác định khi gọi Trợ lý AI.';
      console.error('Gemini chat error:', errMsg);
      res.status(500).json({ error: errMsg });
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
