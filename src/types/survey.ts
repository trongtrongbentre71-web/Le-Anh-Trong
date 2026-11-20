export interface DMSValue {
  /** Signed degree string so "-0" is preserved distinctly from "0" */
  deg: string;
  min: string;
  sec: string;
}

export type VerticalCircleMode = 'Z' | 'V';
export type TraverseType = 'closed' | 'connecting';
export type ToleranceGrade = 'grade1' | 'grade2' | 'grade3';
export type LengthUnit = 'm' | 'dm' | 'cm' | 'mm';
export type PointKind = 'detail' | 'station';

export interface ControlPoint {
  id: string;
  name: string;
  x: number; // Bắc (m)
  y: number; // Đông (m)
  h: number; // Cao độ H (m)
  note: string;
}

export interface UnifiedStation {
  name: string;
  x: number;
  y: number;
  h: number;
  source: 'control' | 'traverse' | 'transfer';
  sourceLabel: string;
  note: string;
}

export interface TraverseConfig {
  verticalMode: VerticalCircleMode;
  traverseType: TraverseType;
  toleranceGrade: ToleranceGrade;
  miaUnit: LengthUnit;
  startStationName: string;
  startOrientName: string;
  endStationName: string; // Used when connecting
  endOrientName: string; // Used when connecting
  useCurvatureCorrection: boolean;
}

export interface TraverseRow {
  id: string;
  stationName: string; // Trạm đo (ví dụ M1, T1, T2, T3)
  targetName: string; // Điểm ngắm tới (cạnh đi tới trạm kế tiếp)
  instrumentHeight: number; // i (m)
  hzBackL: DMSValue;
  hzForeL: DMSValue;
  hzBackR: DMSValue;
  hzForeR: DMSValue;
  vertL: DMSValue; // Z_L hoặc V_L ngắm điểm trước
  vertR: DMSValue; // Z_R hoặc V_R ngắm điểm trước
  miaA: number; // Chỉ trên (theo miaUnit)
  miaL: number; // Chỉ giữa (theo miaUnit)
  miaB: number; // Chỉ dưới (theo miaUnit)
}

export interface ComputedTraverseRow extends TraverseRow {
  betaLDeg: number;
  betaRDeg: number;
  diff2CArcSec: number; // |β_L - β_R| quy đổi giây
  is2COk: boolean;
  betaAvgDeg: number;
  moArcSec: number; // Chỉ tiêu bàn độ đứng MO (giây)
  alphaTbDeg: number; // Góc nghiêng trung bình α_TB
  miaCheckMm: number; // ((a+b)/2 - l) tính bằng mm
  isMiaOk: boolean;
  distanceM: number; // D_i (m)
  vBetaArcSec: number; // Số hiệu chỉnh góc v_β (")
  betaAdjustedDeg: number; // β_bs
  azimuthDeg: number; // Phương vị cạnh α_i (độ)
  rawDeltaX: number;
  rawDeltaY: number;
  vX: number;
  vY: number;
  adjDeltaX: number;
  adjDeltaY: number;
  rawDeltaH: number; // h_i = D*tan(α_TB) + i - l + f_ck
  vH: number;
  adjDeltaH: number;
  xAdjusted: number; // Tọa độ X_bs của điểm targetName
  yAdjusted: number; // Tọa độ Y_bs của điểm targetName
  hAdjusted: number; // Cao độ H_bs của điểm targetName
}

export interface ComputedTraverseSummary {
  rows: ComputedTraverseRow[];
  stationCount: number;
  totalDistance: number;
  sumBetaMeasuredDeg: number;
  sumBetaTheoreticalDeg: number;
  fBetaArcSec: number;
  fBetaLimitArcSec: number;
  isAnglePass: boolean;
  fX: number;
  fY: number;
  fS: number;
  relativeErrorDenominator: number; // e.g., 7240 -> 1/7240
  relativeLimitDenominator: number; // 5000, 3000, or 2000
  isCoordPass: boolean;
  fH: number; // m
  fHMm: number; // mm
  fHLimitMm: number; // 40 * (ΣD / 100) mm
  isElevationPass: boolean;
  isOverallPass: boolean;
  adjustedStations: UnifiedStation[];
  startAzimuthDeg: number;
  endAzimuthDeg: number | null;
}

export interface DetailUnitSettings {
  miaUnit: LengthUnit;
  instrumentHeightUnit: LengthUnit;
  outputUnit: LengthUnit;
}

export interface DetailSurveyRow {
  id: string;
  pointName: string;
  stationName: string;
  orientName: string;
  instrumentHeight: number; // theo instrumentHeightUnit
  hzOrient: DMSValue;
  hzPoint: DMSValue;
  vertAngle: DMSValue;
  miaA: number; // theo miaUnit
  miaL: number; // theo miaUnit
  miaB: number; // theo miaUnit
  kind: PointKind;
  note: string;
}

export interface ComputedDetailRow extends DetailSurveyRow {
  stationFound: boolean;
  orientFound: boolean;
  stationX: number;
  stationY: number;
  stationH: number;
  orientAzimuthDeg: number;
  miaErrorMm: number;
  isMiaOk: boolean;
  slopeAngleDeg: number; // α
  distanceM: number; // D (m)
  distanceDisplay: number; // D theo outputUnit
  curvatureM: number; // f_ck (m)
  deltaHM: number; // h (m)
  deltaHDisplay: number; // h theo outputUnit
  pointAzimuthDeg: number; // α_đo
  x: number;
  y: number;
  h: number;
}

export interface MapPoint {
  name: string;
  x: number;
  y: number;
  h: number;
  category: 'control' | 'traverse' | 'transfer' | 'detail';
  note: string;
  stationFrom?: string;
}

export interface AiActionAddDetail {
  type: 'addDetailPoint';
  payload: {
    pointName: string;
    stationName: string;
    orientName: string;
    instrumentHeightM: number;
    hzOrientStr: string;
    hzPointStr: string;
    vertAngleStr: string;
    verticalMode?: VerticalCircleMode;
    miaAMm: number;
    miaLMm: number;
    miaBMm: number;
    kind?: PointKind;
    note?: string;
  };
}

export interface AiActionImportControlPoints {
  type: 'importControlPoints';
  payload: {
    mode?: 'append' | 'replace';
    points: Array<{
      name: string;
      x: number;
      y: number;
      h: number;
      note?: string;
    }>;
  };
}

export interface AiActionImportTraverseData {
  type: 'importTraverseData';
  payload: {
    mode?: 'append' | 'replace';
    config?: {
      verticalMode?: VerticalCircleMode;
      traverseType?: TraverseType;
      toleranceGrade?: ToleranceGrade;
      startStationName?: string;
      startOrientName?: string;
      endStationName?: string;
      endOrientName?: string;
    };
    rows: Array<{
      stationName: string;
      targetName: string;
      instrumentHeightM?: number;
      hzBackLStr?: string;
      hzForeLStr?: string;
      hzBackRStr?: string;
      hzForeRStr?: string;
      vertLStr?: string;
      vertRStr?: string;
      miaAMm?: number;
      miaLMm?: number;
      miaBMm?: number;
    }>;
  };
}

export interface AiActionImportDetailPoints {
  type: 'importDetailPoints';
  payload: {
    mode?: 'append' | 'replace';
    verticalMode?: VerticalCircleMode;
    rows: Array<{
      pointName: string;
      stationName?: string;
      orientName?: string;
      instrumentHeightM?: number;
      hzOrientStr?: string;
      hzPointStr?: string;
      vertAngleStr?: string;
      verticalMode?: VerticalCircleMode;
      miaAMm?: number;
      miaLMm?: number;
      miaBMm?: number;
      kind?: PointKind;
      note?: string;
    }>;
  };
}

export interface AiActionUpdateSettings {
  type: 'updateSettings';
  payload: {
    detailMiaUnit?: LengthUnit;
    detailInstrumentHeightUnit?: LengthUnit;
    detailOutputUnit?: LengthUnit;
    detailVerticalMode?: VerticalCircleMode;
    detailCurvatureEnabled?: boolean;
    convertExistingDetailValues?: boolean;
    traverseVerticalMode?: VerticalCircleMode;
    traverseType?: TraverseType;
    toleranceGrade?: ToleranceGrade;
    traverseMiaUnit?: LengthUnit;
    traverseCurvatureEnabled?: boolean;
    startStationName?: string;
    startOrientName?: string;
    endStationName?: string;
    endOrientName?: string;
  };
}

export interface AiActionUpdatePoints {
  type: 'updatePoints';
  payload: {
    controlUpdates?: Array<{
      name: string;
      newName?: string;
      x?: number;
      y?: number;
      h?: number;
      note?: string;
    }>;
    detailUpdates?: Array<{
      pointName: string;
      newPointName?: string;
      stationName?: string;
      orientName?: string;
      instrumentHeightM?: number;
      hzOrientStr?: string;
      hzPointStr?: string;
      vertAngleStr?: string;
      miaAMm?: number;
      miaLMm?: number;
      miaBMm?: number;
      kind?: PointKind;
      note?: string;
    }>;
    traverseUpdates?: Array<{
      stationName: string;
      targetName?: string;
      instrumentHeightM?: number;
      hzBackLStr?: string;
      hzForeLStr?: string;
      hzBackRStr?: string;
      hzForeRStr?: string;
      vertLStr?: string;
      vertRStr?: string;
      miaAMm?: number;
      miaLMm?: number;
      miaBMm?: number;
    }>;
  };
}

export interface AiActionDeleteData {
  type: 'deleteData';
  payload: {
    target: 'controlPoints' | 'traverseRows' | 'detailRows' | 'all' | 'resetSample';
    names?: string[];
    deleteErrorMiaRows?: boolean;
    clearAll?: boolean;
  };
}

export interface AiActionExportData {
  type: 'exportData';
  payload: {
    format: 'excel_wps' | 'civil3d_csv' | 'autocad_scr';
    cadTextHeight?: number;
  };
}

export interface AiActionNavigateOrOpenTool {
  type: 'navigateOrOpenTool';
  payload: {
    tab?: 'control' | 'traverse' | 'detail' | 'height' | 'map';
    openModal?: 'guide' | 'sheets' | 'camera' | 'import_file';
  };
}

export type AiSurveyAction =
  | AiActionAddDetail
  | AiActionImportControlPoints
  | AiActionImportTraverseData
  | AiActionImportDetailPoints
  | AiActionUpdateSettings
  | AiActionUpdatePoints
  | AiActionDeleteData
  | AiActionExportData
  | AiActionNavigateOrOpenTool;

export interface ChatAttachmentPreview {
  id: string;
  name: string;
  kind: 'image' | 'pdf' | 'text';
  mimeType: string;
  sizeBytes: number;
  previewUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  appliedActions?: string[];
  attachments?: ChatAttachmentPreview[];
  isError?: boolean;
}

