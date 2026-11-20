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

const importControlPointsTool: FunctionDeclaration = {
  name: 'importControlPoints',
  description:
    'Nhập hoặc thay thế danh sách Mốc khống chế gốc (Tab 1: X Bắc, Y Đông, Cao độ H) từ đề bài, tài liệu PDF/Excel, ảnh chụp hoặc yêu cầu người dùng.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      mode: {
        type: Type.STRING,
        description:
          '"replace" nếu người dùng muốn thay toàn bộ bảng mốc bằng đề bài mới; "append" nếu chỉ thêm mốc mới vào danh sách hiện tại.',
      },
      points: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: 'Tên mốc, ví dụ M0, M1, A, B, DC1...' },
            x: { type: Type.NUMBER, description: 'Tọa độ X - Bắc (m)' },
            y: { type: Type.NUMBER, description: 'Tọa độ Y - Đông (m)' },
            h: { type: Type.NUMBER, description: 'Cao độ H (m)' },
            note: { type: Type.STRING, description: 'Ghi chú mốc' },
          },
          required: ['name', 'x', 'y', 'h'],
        },
      },
    },
    required: ['points'],
  },
};

const importTraverseDataTool: FunctionDeclaration = {
  name: 'importTraverseData',
  description:
    'Nhập cấu hình và toàn bộ các dòng số liệu Đường chuyền kinh vĩ 2 mặt L/R (Tab 2) từ đề bài, ảnh sổ đo hoặc file tài liệu.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      mode: {
        type: Type.STRING,
        description: '"replace" để thay toàn bộ bảng đường chuyền bằng đề bài mới, hoặc "append" để nối thêm trạm.',
      },
      config: {
        type: Type.OBJECT,
        properties: {
          verticalMode: { type: Type.STRING, description: '"Z" (thiên đỉnh ~90°) hoặc "V" (góc đứng ~0°)' },
          traverseType: { type: Type.STRING, description: '"closed" (khép kín) hoặc "connecting" (phù hợp)' },
          toleranceGrade: { type: Type.STRING, description: '"grade1", "grade2", hoặc "grade3"' },
          startStationName: { type: Type.STRING, description: 'Tên mốc khởi đầu đường chuyền' },
          startOrientName: { type: Type.STRING, description: 'Tên mốc định hướng khởi đầu' },
          endStationName: { type: Type.STRING, description: 'Tên mốc kết thúc (nếu phù hợp)' },
          endOrientName: { type: Type.STRING, description: 'Tên mốc định hướng kết thúc (nếu phù hợp)' },
        },
      },
      rows: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            stationName: { type: Type.STRING, description: 'Trạm đặt máy (vd M1, T1)' },
            targetName: { type: Type.STRING, description: 'Điểm ngắm tới (vd T1, T2)' },
            instrumentHeightM: { type: Type.NUMBER, description: 'Chiều cao máy i (m)' },
            hzBackLStr: { type: Type.STRING, description: 'Góc bằng ngắm điểm sau thuận kính L' },
            hzForeLStr: { type: Type.STRING, description: 'Góc bằng ngắm điểm trước thuận kính L' },
            hzBackRStr: { type: Type.STRING, description: 'Góc bằng ngắm điểm sau đảo kính R' },
            hzForeRStr: { type: Type.STRING, description: 'Góc bằng ngắm điểm trước đảo kính R' },
            vertLStr: { type: Type.STRING, description: 'Góc đứng thuận kính L (Z_L hoặc V_L)' },
            vertRStr: { type: Type.STRING, description: 'Góc đứng đảo kính R (Z_R hoặc V_R)' },
            miaAMm: { type: Type.NUMBER, description: 'Chỉ trên mia a (mm)' },
            miaLMm: { type: Type.NUMBER, description: 'Chỉ giữa mia l (mm)' },
            miaBMm: { type: Type.NUMBER, description: 'Chỉ dưới mia b (mm)' },
          },
          required: ['stationName', 'targetName'],
        },
      },
    },
    required: ['rows'],
  },
};

const importDetailPointsTool: FunctionDeclaration = {
  name: 'importDetailPoints',
  description:
    'Nhập hàng loạt nhiều điểm đo chi tiết hoặc trạm chuyền vào Sổ đo chi tiết (Tab 3) từ đề bài, ảnh sổ đo, PDF hoặc file Excel/CSV.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      mode: {
        type: Type.STRING,
        description: '"replace" để thay toàn bộ sổ đo chi tiết bằng bộ số liệu mới, hoặc "append" để thêm vào cuối bảng.',
      },
      verticalMode: {
        type: Type.STRING,
        description: '"Z" (thiên đỉnh ~90°) hoặc "V" (góc đứng ~0°)',
      },
      rows: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            pointName: { type: Type.STRING },
            stationName: { type: Type.STRING },
            orientName: { type: Type.STRING },
            instrumentHeightM: { type: Type.NUMBER },
            hzOrientStr: { type: Type.STRING },
            hzPointStr: { type: Type.STRING },
            vertAngleStr: { type: Type.STRING },
            verticalMode: { type: Type.STRING },
            miaAMm: { type: Type.NUMBER },
            miaLMm: { type: Type.NUMBER },
            miaBMm: { type: Type.NUMBER },
            kind: { type: Type.STRING, description: '"detail" hoặc "station"' },
            note: { type: Type.STRING },
          },
          required: ['pointName', 'hzPointStr', 'vertAngleStr'],
        },
      },
    },
    required: ['rows'],
  },
};

const updateSettingsTool: FunctionDeclaration = {
  name: 'updateSettings',
  description:
    'Thay đổi cài đặt đơn vị đo (m, dm, cm, mm), hệ góc đứng (Z/V), bật/tắt hiệu chỉnh độ cong Trái Đất f_ck, loại đường chuyền (khép kín/phù hợp), cấp hạng sai số TCVN hoặc trạm đầu/cuối của Tab 2 và Tab 3.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      detailMiaUnit: { type: Type.STRING, description: 'Đơn vị chỉ mia Tab 3: "m", "dm", "cm", hoặc "mm"' },
      detailInstrumentHeightUnit: { type: Type.STRING, description: 'Đơn vị chiều cao máy i Tab 3: "m", "dm", "cm", hoặc "mm"' },
      detailOutputUnit: { type: Type.STRING, description: 'Đơn vị xuất khoảng cách D và chênh cao h Tab 3: "m", "dm", "cm", hoặc "mm"' },
      detailVerticalMode: { type: Type.STRING, description: 'Hệ góc đứng Tab 3: "Z" (thiên đỉnh) hoặc "V" (góc đứng)' },
      detailCurvatureEnabled: { type: Type.BOOLEAN, description: 'Bật/tắt hiệu chỉnh độ cong Trái Đất f_ck (D >= 150m) ở Tab 3' },
      convertExistingDetailValues: { type: Type.BOOLEAN, description: 'Mặc định true: tự quy đổi số liệu mia/chiều cao máy hiện có sang đơn vị mới để không bị sai kích thước thực.' },
      traverseVerticalMode: { type: Type.STRING, description: 'Hệ góc đứng Tab 2: "Z" hoặc "V"' },
      traverseType: { type: Type.STRING, description: 'Loại đường chuyền Tab 2: "closed" (khép kín) hoặc "connecting" (phù hợp)' },
      toleranceGrade: { type: Type.STRING, description: 'Cấp hạng sai số TCVN Tab 2: "grade1" (30"√n | 1/5000), "grade2" (40"√n | 1/3000), "grade3" (60"√n | 1/2000)' },
      traverseMiaUnit: { type: Type.STRING, description: 'Đơn vị chỉ mia Tab 2: "m", "dm", "cm", hoặc "mm"' },
      traverseCurvatureEnabled: { type: Type.BOOLEAN, description: 'Bật/tắt hiệu chỉnh f_ck ở Tab 2' },
      startStationName: { type: Type.STRING, description: 'Tên mốc khởi đầu đường chuyền Tab 2' },
      startOrientName: { type: Type.STRING, description: 'Tên mốc định hướng khởi đầu Tab 2' },
      endStationName: { type: Type.STRING, description: 'Tên mốc kết thúc đường chuyền phù hợp Tab 2' },
      endOrientName: { type: Type.STRING, description: 'Tên mốc định hướng kết thúc Tab 2' },
    },
  },
};

const updatePointsTool: FunctionDeclaration = {
  name: 'updatePoints',
  description:
    'Chỉnh sửa giá trị cụ thể của các mốc gốc (Tab 1), trạm đường chuyền (Tab 2) hoặc điểm đo chi tiết (Tab 3) đã có trong bảng theo tên điểm.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      controlUpdates: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: 'Tên mốc cần sửa, ví dụ M0, M1' },
            newName: { type: Type.STRING },
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER },
            h: { type: Type.NUMBER },
            note: { type: Type.STRING },
          },
          required: ['name'],
        },
      },
      detailUpdates: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            pointName: { type: Type.STRING, description: 'Tên điểm chi tiết cần sửa, ví dụ P1, P4, M2' },
            newPointName: { type: Type.STRING },
            stationName: { type: Type.STRING },
            orientName: { type: Type.STRING },
            instrumentHeightM: { type: Type.NUMBER },
            hzOrientStr: { type: Type.STRING },
            hzPointStr: { type: Type.STRING },
            vertAngleStr: { type: Type.STRING },
            miaAMm: { type: Type.NUMBER },
            miaLMm: { type: Type.NUMBER },
            miaBMm: { type: Type.NUMBER },
            kind: { type: Type.STRING },
            note: { type: Type.STRING },
          },
          required: ['pointName'],
        },
      },
      traverseUpdates: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            stationName: { type: Type.STRING, description: 'Tên trạm đo đường chuyền cần sửa, ví dụ M1, T1' },
            targetName: { type: Type.STRING },
            instrumentHeightM: { type: Type.NUMBER },
            hzBackLStr: { type: Type.STRING },
            hzForeLStr: { type: Type.STRING },
            hzBackRStr: { type: Type.STRING },
            hzForeRStr: { type: Type.STRING },
            vertLStr: { type: Type.STRING },
            vertRStr: { type: Type.STRING },
            miaAMm: { type: Type.NUMBER },
            miaLMm: { type: Type.NUMBER },
            miaBMm: { type: Type.NUMBER },
          },
          required: ['stationName'],
        },
      },
    },
  },
};

const deleteDataTool: FunctionDeclaration = {
  name: 'deleteData',
  description:
    'Xóa các điểm/trạm/mốc cụ thể theo tên, xóa các điểm vượt sai số mia (>2mm), xóa trắng toàn bộ 1 bảng hoặc tất cả bảng, hoặc khôi phục lại bộ dữ liệu mẫu ban đầu.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      target: {
        type: Type.STRING,
        description:
          'Đối tượng xóa: "controlPoints" (Tab 1), "traverseRows" (Tab 2), "detailRows" (Tab 3), "all" (xóa sạch toàn bộ dữ liệu để làm bài mới), hoặc "resetSample" (khôi phục dữ liệu mẫu gốc).',
      },
      names: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Danh sách tên điểm/mốc/trạm cần xóa (ví dụ ["P4", "P5"] hoặc ["M2"]).',
      },
      deleteErrorMiaRows: {
        type: Type.BOOLEAN,
        description: 'Nếu true (với target="detailRows"): tự động lọc và xóa toàn bộ các điểm bị lỗi sai số mia > 2mm.',
      },
      clearAll: {
        type: Type.BOOLEAN,
        description: 'Nếu true: xóa sạch toàn bộ các dòng trong bảng được chọn.',
      },
    },
    required: ['target'],
  },
};

const exportDataTool: FunctionDeclaration = {
  name: 'exportData',
  description:
    'Xuất và tải file trực tiếp xuống máy người dùng: Excel chuẩn WPS Office (.xlsx), CSV Civil 3D (P,E,N,Z,D có UTF-8 BOM), hoặc Script AutoCAD (.scr).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      format: {
        type: Type.STRING,
        description: '"excel_wps" (.xlsx), "civil3d_csv" (.csv Civil 3D), hoặc "autocad_scr" (.scr AutoCAD)',
      },
      cadTextHeight: {
        type: Type.NUMBER,
        description: 'Chiều cao chữ trong AutoCAD (mặc định 1.2) khi format="autocad_scr".',
      },
    },
    required: ['format'],
  },
};

const navigateOrOpenTool: FunctionDeclaration = {
  name: 'navigateOrOpenTool',
  description:
    'Chuyển sang tab bất kỳ trong 5 tab (control, traverse, detail, height, map) hoặc mở hộp thoại công cụ (hướng dẫn máy & mia, đồng bộ Google Sheets, camera quét số liệu, hộp thoại chọn file nhập WPS/Excel).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      tab: {
        type: Type.STRING,
        description: '"control" (Tab 1), "traverse" (Tab 2), "detail" (Tab 3), "height" (Tab 4), hoặc "map" (Tab 5 Bình đồ & Xuất file)',
      },
      openModal: {
        type: Type.STRING,
        description: '"guide" (Hướng dẫn Máy & Mia), "sheets" (Google Sheets), "camera" (Camera quét số liệu), hoặc "import_file" (Mở hộp thoại chọn file WPS/Excel/CSV để nhập)',
      },
    },
  },
};

const ALL_SURVEY_TOOLS: FunctionDeclaration[] = [
  importControlPointsTool,
  importTraverseDataTool,
  importDetailPointsTool,
  addDetailPointTool,
  updateSettingsTool,
  updatePointsTool,
  deleteDataTool,
  exportDataTool,
  navigateOrOpenTool,
];

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

const PER_ATTEMPT_TIMEOUT_MS = 12000;

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

type GeminiContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

async function generateWithResilience(
  ai: GoogleGenAI,
  contents: Array<{ role: 'user' | 'model'; parts: GeminiContentPart[] }>,
  systemInstruction: string,
  hasAttachments = false
) {
  const attempts: Array<{ model: string; delayBeforeMs: number }> = [
    { model: PRIMARY_MODEL, delayBeforeMs: 0 },
    { model: FALLBACK_MODEL, delayBeforeMs: 300 },
    { model: FALLBACK_MODEL, delayBeforeMs: 900 },
  ];

  const attemptTimeoutMs = hasAttachments ? 18000 : PER_ATTEMPT_TIMEOUT_MS;
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
            tools: [{ functionDeclarations: ALL_SURVEY_TOOLS }],
            ...(model === PRIMARY_MODEL
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        }),
        attemptTimeoutMs,
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
  app.use(express.json({ limit: '12mb' }));

  const surveyOcrSchema = {
    type: Type.OBJECT,
    properties: {
      detectedType: {
        type: Type.STRING,
        description:
          'Loại số liệu nhận diện được trong ảnh: "detail" (sổ đo chi tiết hoặc màn hình máy kinh vĩ/toàn đạc), "control" (bảng tọa độ mốc gốc X, Y, H), "traverse" (sổ đo đường chuyền 2 mặt L/R), hoặc "unknown" nếu ảnh không chứa số liệu trắc địa.',
      },
      sourceDescription: {
        type: Type.STRING,
        description:
          'Mô tả ngắn gọn nguồn ảnh (ví dụ: "Sổ đo chi tiết viết tay (3 điểm)", "Màn hình LCD máy kinh vĩ điện tử", "Bảng tọa độ mốc khống chế").',
      },
      warnings: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description:
          'Danh sách cảnh báo tiếng Việt nếu có chữ số mờ, thiếu chỉ mia, hoặc giá trị cần kỹ sư kiểm tra lại.',
      },
      detailRows: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            pointName: { type: Type.STRING },
            stationName: { type: Type.STRING },
            orientName: { type: Type.STRING },
            instrumentHeightM: { type: Type.NUMBER },
            hzOrientStr: { type: Type.STRING },
            hzPointStr: { type: Type.STRING },
            vertAngleStr: { type: Type.STRING },
            verticalMode: { type: Type.STRING },
            miaAMm: { type: Type.NUMBER },
            miaLMm: { type: Type.NUMBER },
            miaBMm: { type: Type.NUMBER },
            kind: { type: Type.STRING },
            note: { type: Type.STRING },
          },
          required: ['pointName', 'hzPointStr', 'vertAngleStr'],
        },
      },
      controlPoints: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER },
            h: { type: Type.NUMBER },
            note: { type: Type.STRING },
          },
          required: ['name', 'x', 'y', 'h'],
        },
      },
      traverseRows: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            stationName: { type: Type.STRING },
            targetName: { type: Type.STRING },
            instrumentHeightM: { type: Type.NUMBER },
            hzBackLStr: { type: Type.STRING },
            hzForeLStr: { type: Type.STRING },
            hzBackRStr: { type: Type.STRING },
            hzForeRStr: { type: Type.STRING },
            vertLStr: { type: Type.STRING },
            vertRStr: { type: Type.STRING },
            miaAMm: { type: Type.NUMBER },
            miaLMm: { type: Type.NUMBER },
            miaBMm: { type: Type.NUMBER },
          },
          required: ['stationName', 'targetName'],
        },
      },
    },
    required: ['detectedType', 'sourceDescription', 'warnings', 'detailRows', 'controlPoints', 'traverseRows'],
  };

  app.post('/api/gemini/ocr-survey', async (req, res) => {
    try {
      const {
        imageBase64,
        mimeType = 'image/jpeg',
        targetMode = 'auto',
        defaults = {},
      } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        targetMode?: string;
        defaults?: {
          defaultStation?: string;
          defaultOrient?: string;
          defaultInstrumentHeightM?: number;
          defaultVerticalMode?: string;
          availableStations?: string[];
        };
      };

      if (!imageBase64 || typeof imageBase64 !== 'string' || imageBase64.length < 64) {
        res.status(400).json({ error: 'Chưa có dữ liệu ảnh hợp lệ để quét.', retryable: false });
        return;
      }

      const ai = getGeminiClient();
      const targetHint =
        targetMode === 'detail'
          ? 'Người dùng chỉ định quét thành SỔ ĐO CHI TIẾT (detailRows).'
          : targetMode === 'control'
            ? 'Người dùng chỉ định quét thành BẢNG MỐC KHỐNG CHẾ GỐC (controlPoints).'
            : targetMode === 'traverse'
              ? 'Người dùng chỉ định quét thành SỔ ĐO ĐƯỜNG CHUYỀN 2 MẶT L/R (traverseRows).'
              : 'Tự động nhận diện xem ảnh là sổ đo chi tiết / màn hình máy kinh vĩ (detail), bảng tọa độ mốc gốc (control), hay sổ đo đường chuyền 2 mặt L/R (traverse).';

      const promptText = `Bạn là chuyên gia Trắc địa công trình & OCR số liệu đo đạc thực địa Việt Nam.
Hãy đọc CHÍNH XÁC mọi số liệu trắc địa trong ảnh chụp (có thể là sổ đo viết tay, bảng in, bảng phấn/giấy công trường, hoặc màn hình LCD máy kinh vĩ điện tử / toàn đạc điện tử).

YÊU CẦU CHẾ ĐỘ QUÉT:
${targetHint}

THÔNG SỐ MẶC ĐỊNH CỦA TRẠM ĐANG ĐẶT MÁY (chỉ dùng điền vào chỗ bị thiếu trên ảnh, ví dụ khi chụp màn hình LCD máy chỉ hiện góc Hz và V/Z):
- Trạm máy mặc định: ${defaults.defaultStation || 'M1'}
- Điểm định hướng mặc định: ${defaults.defaultOrient || 'M0'}
- Chiều cao máy i mặc định: ${defaults.defaultInstrumentHeightM ?? 1.48} m
- Hệ góc đứng mặc định: ${defaults.defaultVerticalMode || 'Z'}
- Các trạm hiện có trong sổ: ${(defaults.availableStations || ['M0', 'M1']).join(', ')}

QUY TẮC CHUẨN HÓA SỐ LIỆU:
1. Góc DMS định dạng chuẩn kiểu 45°20'10" hoặc -0°15'20" (nếu góc đứng âm quanh 0° thì giữ dấu trừ -0° và đặt verticalMode="V"; nếu góc quanh 80°..100° đặt verticalMode="Z").
2. Chỉ mia a (chỉ trên), l (chỉ giữa), b (chỉ dưới) PHẢI quy đổi ra MILIMÉT (mm) — ví dụ ghi 1.850 m -> 1850; ghi 1850 -> 1850. Đảm bảo a >= l >= b.
3. Nếu ảnh là màn hình máy toàn đạc/kinh vĩ chỉ hiện góc Hz, V/Z và khoảng cách HD/SD (không ghi 3 chỉ mia), hãy giữ nguyên Hz, V/Z, đặt miaLMm = 1500 và suy ra miaAMm = 1500 + round(HD*5), miaBMm = 1500 - round(HD*5) để công thức D = 100*(a-b) khớp khoảng cách HD, ĐỒNG THỜI ghi rõ vào mảng warnings để kỹ sư biết.
4. Nếu ảnh mờ, mất chữ hoặc không phải số liệu trắc địa, KHÔNG tự bịa số liệu — hãy trả detectedType="unknown" (nếu không có số đo nào) và nêu rõ lý do trong warnings.`;

      const attempts: Array<{ model: string; delayBeforeMs: number }> = [
        { model: PRIMARY_MODEL, delayBeforeMs: 0 },
        { model: FALLBACK_MODEL, delayBeforeMs: 400 },
        { model: FALLBACK_MODEL, delayBeforeMs: 1000 },
      ];

      let lastErr: unknown;
      let responseText = '';

      for (let i = 0; i < attempts.length; i++) {
        const { model, delayBeforeMs } = attempts[i];
        if (delayBeforeMs > 0) await sleep(delayBeforeMs);

        try {
          const response = await withTimeout(
            ai.models.generateContent({
              model,
              contents: {
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: imageBase64,
                    },
                  },
                  { text: promptText },
                ],
              },
              config: {
                responseMimeType: 'application/json',
                responseSchema: surveyOcrSchema,
                ...(model === PRIMARY_MODEL
                  ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                  : {}),
              },
            }),
            18000,
            `ocr-${model}`
          );
          responseText = (response.text || '').trim();
          if (responseText) break;
        } catch (err) {
          lastErr = err;
          const check = isTransientError(err);
          console.warn(
            `Gemini OCR attempt ${i + 1}/${attempts.length} (${model}) failed [${check.statusCode}]: ${check.rawMessage.slice(0, 180)}`
          );
          if (!check.transient) throw err;
        }
      }

      if (!responseText) {
        throw lastErr || new Error('Không nhận được kết quả đọc ảnh từ AI.');
      }

      const parsed = JSON.parse(responseText) as Record<string, unknown>;
      res.json(parsed);
    } catch (error: unknown) {
      const check = isTransientError(error);
      console.error('Gemini OCR final error:', check.rawMessage);
      const friendly = formatServerErrorMessage(check.rawMessage, check.statusCode);
      res.status(check.statusCode >= 400 ? check.statusCode : 500).json(friendly);
    }
  });

  app.post('/api/gemini/chat', async (req, res) => {
    try {
      const {
        message = '',
        history = [],
        surveyContext = {},
        attachments = [],
      } = req.body as {
        message?: string;
        history?: Array<{ role: 'user' | 'assistant'; text: string }>;
        surveyContext?: Record<string, unknown>;
        attachments?: Array<{
          name: string;
          kind: 'image' | 'pdf' | 'text';
          mimeType: string;
          base64?: string;
          extractedText?: string;
        }>;
      };

      const safeAttachments = Array.isArray(attachments) ? attachments.slice(0, 5) : [];
      const trimmedMessage = typeof message === 'string' ? message.trim() : '';

      if (!trimmedMessage && safeAttachments.length === 0) {
        res.status(400).json({ error: 'Vui lòng nhập câu hỏi hoặc đính kèm ảnh/tài liệu.', retryable: false });
        return;
      }

      const ai = getGeminiClient();

      const systemInstruction = `Bạn là Trợ lý AI Kỹ sư Trắc địa Công trình tích hợp trực tiếp trong ứng dụng web GEOSURVEY PRO (chuyên ngành Trắc địa công trình, Bản đồ địa hình, Tiêu chuẩn Việt Nam TCVN 9401:2012 & TCVN 9398:2012).

CẤU TRÚC ỨNG DỤNG GEOSURVEY PRO (để hướng dẫn người dùng mới dễ hiểu):
- Nút "Hướng dẫn Máy & Mia" (góc trên phải): Mở mô phỏng trực quan ống kính kinh vĩ & mia chữ E (chỉ a, l, b, chỉ đứng, L/R và 6 bước đặt máy).
- Camera & Khung tải tài liệu tích hợp ngay trong ô AI (và nút "Chụp số liệu (Camera)" trên thanh công cụ): Cho phép chụp trực tiếp ảnh sổ đo/màn hình máy kinh vĩ/đề bài hoặc tải file PDF, ảnh, Excel/WPS (.xlsx, .csv), văn bản để AI đọc, phân tích đề bài và nhập tự động toàn bộ số liệu vào Tab 1, Tab 2, Tab 3.
- Tab 1 (Mốc gốc): Danh sách mốc khống chế gốc (X Bắc, Y Đông, Cao độ H) và bảng tổng hợp mọi trạm khả dụng.
- Tab 2 (Đường chuyền 2 mặt): Nhập số đo Thuận kính L / Đảo kính R, tự tính 2C, MO, α_TB, kiểm tra hạn sai ĐẠT/VƯỢT và bình sai Bowditch.
- Tab 3 (Sổ đo chi tiết): Đơn vị m/dm/cm/mm, hiệu chỉnh f_ck (≥150m), hỗ trợ góc âm -0°, tự kiểm tra sai số mia (xanh ≤2mm, đỏ >2mm) và chuyền trạm liên tục.
- Tab 4 (Đo cao & Tra cứu): Đo chiều cao tòa nhà (tiếp cận & giao hội đứng 2 trạm thẳng hàng) và tra cứu 2 điểm bất kỳ.
- Tab 5 (Bình đồ & Xuất file): Bản đồ 2D tương tác, biểu đồ trắc dọc H, xuất/nhập WPS Office (.xlsx, .csv Civil 3D), xuất AutoCAD (.scr) và đồng bộ 2 chiều Google Sheets.

KHẢ NĂNG ĐIỀU KHIỂN TOÀN BỘ ỨNG DỤNG (FULL CONTROL) THEO YÊU CẦU NGƯỜI DÙNG:
Bạn có đầy đủ quyền thực thi trực tiếp mọi thao tác trên phần mềm bằng Function Calling — hãy LUÔN chủ động gọi hàm khi người dùng yêu cầu:
1. **Chỉnh đơn vị & Cài đặt (\`updateSettings\`)**: Đổi đơn vị chỉ mia / chiều cao máy i / kết quả D, h sang \`m\`, \`dm\`, \`cm\`, \`mm\`; đổi hệ góc đứng \`Z\` / \`V\`; bật/tắt hiệu chỉnh độ cong Trái Đất \`f_ck\`; đổi loại đường chuyền (khép kín / phù hợp) và cấp hạng sai số TCVN (\`grade1/2/3\`).
2. **Đọc tài liệu / ảnh chụp / đề bài & Nhập liệu toàn bộ (\`importControlPoints\`, \`importTraverseData\`, \`importDetailPoints\`, \`addDetailPoint\`)**:
   - Khi người dùng gửi ảnh chụp, chèn ảnh, PDF, Excel/CSV hoặc gõ đề bài: phân tích đầy đủ dữ kiện, yêu cầu, công thức TCVN và gọi ĐỒNG THỜI các hàm nhập cho Tab 1, Tab 2, Tab 3 nếu có số liệu.
   - Dùng \`mode: "replace"\` khi người dùng gửi đề bài mới trọn vẹn hoặc yêu cầu thay mới; dùng \`mode: "append"\` khi thêm bổ sung.
3. **Chỉnh sửa từng mốc / trạm / điểm (\`updatePoints\`)**: Sửa nhanh tọa độ X/Y/H mốc gốc, sửa góc/chỉ mia/ghi chú/loại điểm của bất kỳ dòng nào theo tên điểm (ví dụ "sửa cao độ M1 thành 12.5m", "sửa chỉ giữa P4 thành 1550mm cho hết lệch mia").
4. **Xóa dữ liệu & Khôi phục mẫu (\`deleteData\`)**: Xóa điểm theo tên (ví dụ "xóa P4 và P5"), xóa toàn bộ điểm bị lỗi mia \`> 2mm\` (\`deleteErrorMiaRows: true\`), xóa trắng 1 bảng hoặc xóa sạch toàn bộ dữ liệu để nhập bài mới (\`target: "all", clearAll: true\`), hoặc khôi phục lại dữ liệu mẫu gốc (\`target: "resetSample"\`).
5. **Xuất file trực tiếp (\`exportData\`)**: Khi người dùng yêu cầu xuất/tải Excel WPS (\`excel_wps\`), CSV Civil 3D (\`civil3d_csv\`) hoặc AutoCAD Script (\`autocad_scr\`), HÃY GỌI \`exportData\` để tải file ngay xuống máy.
6. **Mở tab & Công cụ (\`navigateOrOpenTool\`)**: Chuyển nhanh sang Tab 1–5 (ví dụ "mở bình đồ 2D" -> \`tab: "map"\`) hoặc mở hộp thoại Google Sheets (\`sheets\`), Hướng dẫn Máy & Mia (\`guide\`), Camera quét (\`camera\`), hoặc chọn file Excel/CSV để nhập (\`import_file\`).
7. **Có thể kết hợp nhiều thao tác trong 1 lệnh duy nhất!** Ví dụ: "Đổi đơn vị mia sang m, xóa điểm P4 lỗi mia, rồi xuất file Excel WPS giúp mình" -> gọi cùng lúc \`updateSettings\` + \`deleteData\` + \`exportData\`.

QUY TẮC CHUẨN HÓA SỐ LIỆU:
- Khi gọi hàm nhập/sửa, luôn quy đổi chỉ mia về MILIMÉT (mm) (ví dụ 1.85m -> 1850; 1850 -> 1850) và chiều cao máy i về MÉT (m).
- Góc DMS chuẩn dạng \`45°20'10"\` hoặc \`-0°15'20"\`. Góc quanh 90° -> \`Z\`, góc quanh 0° hoặc có dấu âm \`-0°\` -> \`V\`.
- KHÔNG tự bịa số liệu nếu ảnh mờ hoặc không có số đo. Trả lời bằng tiếng Việt kỹ thuật rõ ràng, ngắn gọn, dễ đọc.

DỮ LIỆU KHU ĐO HIỆN TẠI (JSON):
${JSON.stringify(surveyContext)}`;

      // Build clean alternating conversation history
      const normalizedHistory: Array<{ role: 'user' | 'model'; parts: GeminiContentPart[] }> = [];
      for (const h of history.slice(-8)) {
        const text = typeof h?.text === 'string' ? h.text.trim() : '';
        if (!text) continue;
        const role: 'user' | 'model' = h.role === 'assistant' ? 'model' : 'user';
        if (normalizedHistory.length === 0 && role === 'model') continue;
        if (normalizedHistory.length > 0 && normalizedHistory[normalizedHistory.length - 1].role === role) {
          const prevPart = normalizedHistory[normalizedHistory.length - 1].parts[0];
          if ('text' in prevPart) prevPart.text += `\n${text}`;
        } else {
          normalizedHistory.push({ role, parts: [{ text }] });
        }
      }
      if (normalizedHistory.length > 0 && normalizedHistory[normalizedHistory.length - 1].role === 'user') {
        normalizedHistory.pop();
      }

      // Assemble multimodal parts for the current user turn
      const currentParts: GeminiContentPart[] = [];
      const embeddedTextBlocks: string[] = [];

      for (const att of safeAttachments) {
        if ((att.kind === 'image' || att.kind === 'pdf') && att.base64) {
          currentParts.push({
            inlineData: {
              mimeType: att.mimeType || (att.kind === 'pdf' ? 'application/pdf' : 'image/jpeg'),
              data: att.base64,
            },
          });
        } else if (att.extractedText) {
          embeddedTextBlocks.push(
            `--- TÀI LIỆU ĐÍNH KÈM: ${att.name} ---\n${att.extractedText}\n--- HẾT TÀI LIỆU ---`
          );
        }
      }

      const defaultAttachmentPrompt =
        'Hãy đọc toàn bộ ảnh/tài liệu đính kèm này, phân tích đề bài hoặc số liệu trắc địa có trong đó, kiểm tra sai số (nếu có) và tự động nhập đầy đủ các giá trị đo đạc vào các bảng tương ứng (Tab 1 Mốc gốc, Tab 2 Đường chuyền 2 mặt, Tab 3 Sổ đo chi tiết).';

      const combinedUserText = [
        trimmedMessage || defaultAttachmentPrompt,
        ...embeddedTextBlocks,
      ]
        .filter(Boolean)
        .join('\n\n');

      currentParts.push({ text: combinedUserText });

      const contents = [
        ...normalizedHistory,
        { role: 'user' as const, parts: currentParts },
      ];

      const { response } = await generateWithResilience(
        ai,
        contents,
        systemInstruction,
        safeAttachments.length > 0
      );

      const actions: Array<{ type: string; payload: Record<string, unknown> }> = [];
      const functionCalls = response.functionCalls;

      const ALLOWED_ACTION_NAMES = new Set([
        'addDetailPoint',
        'importControlPoints',
        'importTraverseData',
        'importDetailPoints',
        'updateSettings',
        'updatePoints',
        'deleteData',
        'exportData',
        'navigateOrOpenTool',
      ]);

      if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
          if (call.name && call.args && ALLOWED_ACTION_NAMES.has(call.name)) {
            actions.push({
              type: call.name,
              payload: call.args as Record<string, unknown>,
            });
          }
        }
      }

      let replyText = response.text?.trim() || '';
      if (!replyText && actions.length > 0) {
        const summaryLines = actions.map((a) => {
          const p = a.payload;
          if (a.type === 'importControlPoints') {
            const pts = Array.isArray(p.points) ? p.points : [];
            return `- **Tab 1 (Mốc gốc):** Đã ${p.mode === 'replace' ? 'thay mới' : 'bổ sung'} **${pts.length} mốc khống chế**.`;
          }
          if (a.type === 'importTraverseData') {
            const rows = Array.isArray(p.rows) ? p.rows : [];
            return `- **Tab 2 (Đường chuyền 2 mặt):** Đã ${p.mode === 'replace' ? 'thay mới' : 'bổ sung'} **${rows.length} trạm đo 2 mặt** & tự bình sai Bowditch.`;
          }
          if (a.type === 'importDetailPoints') {
            const rows = Array.isArray(p.rows) ? p.rows : [];
            return `- **Tab 3 (Sổ đo chi tiết):** Đã ${p.mode === 'replace' ? 'thay mới' : 'bổ sung'} **${rows.length} điểm đo**.`;
          }
          if (a.type === 'updateSettings') {
            return '- **Cài đặt & Đơn vị:** Đã cập nhật đơn vị đo và cấu hình hệ thống theo yêu cầu.';
          }
          if (a.type === 'updatePoints') {
            return '- **Chỉnh sửa số liệu:** Đã cập nhật trực tiếp các giá trị mốc / trạm / điểm đo theo yêu cầu.';
          }
          if (a.type === 'deleteData') {
            return p.target === 'resetSample'
              ? '- **Khôi phục dữ liệu:** Đã khôi phục lại bộ số liệu mẫu ban đầu.'
              : '- **Xóa số liệu:** Đã xóa các dòng dữ liệu được yêu cầu và tự động tính lại toàn khu đo.';
          }
          if (a.type === 'exportData') {
            const fmtLabel =
              p.format === 'excel_wps'
                ? 'Excel chuẩn WPS (.xlsx)'
                : p.format === 'civil3d_csv'
                  ? 'CSV Civil 3D (P,E,N,Z,D)'
                  : 'Script AutoCAD (.scr)';
            return `- **Xuất file:** Đã tạo và tải xuống tệp **${fmtLabel}**.`;
          }
          if (a.type === 'navigateOrOpenTool') {
            return '- **Điều hướng:** Đã mở đúng phân hệ / công cụ bạn yêu cầu.';
          }
          return `- **Tab 3 (Sổ đo chi tiết):** Đã thêm điểm **${p.pointName}** (Hz=${p.hzPointStr}, Góc đứng=${p.vertAngleStr}).`;
        });
        replyText = `Đã thực hiện hoàn tất các thao tác bạn yêu cầu:\n${summaryLines.join('\n')}`;
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
