import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { X, CloudUpload, CloudDownload, FilePlus2, ExternalLink, LogOut, Loader2 } from 'lucide-react';
import type {
  ComputedDetailRow,
  ComputedTraverseSummary,
  ControlPoint,
  DetailSurveyRow,
  MapPoint,
} from '../types/survey';
import { getAccessToken, googleSignIn, initAuth, logoutGoogle } from '../utils/googleAuth';
import {
  createGeoSurveySpreadsheet,
  extractSpreadsheetId,
  pullSurveyDataFromSheets,
  pushSurveyDataToSheets,
} from '../utils/googleSheets';
import { ConfirmDialog } from './ConfirmDialog';

interface GoogleSheetsModalProps {
  open: boolean;
  onClose: () => void;
  controlPoints: ControlPoint[];
  traverseSummary: ComputedTraverseSummary;
  detailRows: ComputedDetailRow[];
  allMapPoints: MapPoint[];
  onApplyPulledData: (data: { controlPoints: ControlPoint[]; detailRows: DetailSurveyRow[] }) => void;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  open,
  onClose,
  controlPoints,
  traverseSummary,
  detailRows,
  allMapPoints,
  onApplyPulledData,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [spreadsheetInput, setSpreadsheetInput] = useState('');
  const [activeSheetUrl, setActiveSheetUrl] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [pendingConfirm, setPendingConfirm] = useState<{
    mode: 'push' | 'pull';
    spreadsheetId: string;
  } | null>(null);

  useEffect(() => {
    const unsub = initAuth(
      (u) => {
        setUser(u);
        setNeedsAuth(false);
      },
      () => {
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, []);

  if (!open) return null;

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    setStatusMsg(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setNeedsAuth(false);
        setStatusMsg({
          type: 'ok',
          text: `Đã kết nối tài khoản Google (${res.user.email || res.user.displayName}).`,
        });
      }
    } catch (err: unknown) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Đăng nhập Google không thành công.',
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    await logoutGoogle();
    setUser(null);
    setNeedsAuth(true);
    setStatusMsg(null);
  };

  const handleCreateAndPush = async () => {
    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setBusyAction('create');
    setStatusMsg(null);
    try {
      const created = await createGeoSurveySpreadsheet(token);
      setSpreadsheetInput(created.spreadsheetId);
      setActiveSheetUrl(created.spreadsheetUrl);

      const pushed = await pushSurveyDataToSheets({
        spreadsheetId: created.spreadsheetId,
        accessToken: token,
        controlPoints,
        traverseSummary,
        detailRows,
        allMapPoints,
      });
      setStatusMsg({
        type: 'ok',
        text: `Đã tạo bảng tính mới "${created.title}" và đồng bộ ${pushed.updatedCells} ô dữ liệu lên Google Sheets.`,
      });
    } catch (err: unknown) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Không thể tạo bảng tính Google Sheets.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const executeConfirmedAction = async () => {
    if (!pendingConfirm) return;
    const { mode, spreadsheetId } = pendingConfirm;
    setPendingConfirm(null);

    const token = getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setBusyAction(mode);
    setStatusMsg(null);

    try {
      if (mode === 'push') {
        const res = await pushSurveyDataToSheets({
          spreadsheetId,
          accessToken: token,
          controlPoints,
          traverseSummary,
          detailRows,
          allMapPoints,
        });
        setActiveSheetUrl(res.spreadsheetUrl);
        setStatusMsg({
          type: 'ok',
          text: `Đã cập nhật thành công ${res.updatedCells} ô dữ liệu vào Google Sheets (4 trang tính).`,
        });
      } else {
        const pulled = await pullSurveyDataFromSheets({
          spreadsheetId,
          accessToken: token,
        });
        if (pulled.controlPoints.length === 0 && pulled.detailRows.length === 0) {
          throw new Error(
            'Không tìm thấy dữ liệu hợp lệ trong trang tính Moc_Goc hoặc So_Do_Chi_Tiet.'
          );
        }
        onApplyPulledData({
          controlPoints: pulled.controlPoints.length > 0 ? pulled.controlPoints : controlPoints,
          detailRows: pulled.detailRows.length > 0 ? pulled.detailRows : detailRows,
        });
        setStatusMsg({
          type: 'ok',
          text: `Đã kéo dữ liệu từ "${pulled.sheetTitle}": ${pulled.controlPoints.length} mốc gốc và ${pulled.detailRows.length} điểm đo chi tiết.`,
        });
      }
    } catch (err: unknown) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Đồng bộ Google Sheets thất bại.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const parsedId = extractSpreadsheetId(spreadsheetInput);

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gs-modal-title"
      >
        <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <div>
              <h2 id="gs-modal-title" className="text-base font-semibold text-[#1E3A5F]">
                Đồng Bộ Hai Chiều Google Sheets
              </h2>
              <p className="text-xs text-slate-500">
                Tạo mới, đẩy toàn bộ 4 bảng dữ liệu lên hoặc kéo dữ liệu từ bảng tính Google Sheets.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng hộp thoại Google Sheets"
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 p-5 text-xs">
            {/* Auth Section */}
            {needsAuth ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-center space-y-3">
                <p className="text-slate-600">
                  Đăng nhập tài khoản Google của bạn để cho phép GEOSURVEY PRO đọc và cập nhật bảng tính Google Sheets.
                </p>
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={isLoggingIn}
                  className="gsi-material-button"
                >
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        style={{ display: 'block' }}
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                        <path fill="none" d="M0 0h48v48H0z" />
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      {isLoggingIn ? 'Đang đăng nhập...' : 'Sign in with Google'}
                    </span>
                  </div>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                  <div>
                    <span className="font-semibold text-slate-800">{user?.displayName || 'Tài khoản Google'}</span>
                    <span className="block text-[11px] text-slate-500">{user?.email}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <LogOut className="h-3 w-3" />
                    Đăng xuất
                  </button>
                </div>

                {/* Option 1: Create new Google Spreadsheet */}
                <div className="rounded-md border border-slate-200 p-3.5 space-y-2">
                  <p className="font-semibold text-[#1E3A5F]">Cách 1: Tạo bảng tính GEOSURVEY PRO mới</p>
                  <p className="text-slate-500">
                    Tự tạo file Google Sheets gồm 4 sheet chuẩn (<code className="font-mono">Moc_Goc</code>, <code className="font-mono">Duong_Chuyen_2Mat</code>, <code className="font-mono">So_Do_Chi_Tiet</code>, <code className="font-mono">Toa_Do_Civil3D</code>) và đẩy toàn bộ số liệu hiện tại.
                  </p>
                  <button
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={handleCreateAndPush}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#0F766E] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#0D625B] disabled:opacity-50"
                  >
                    {busyAction === 'create' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FilePlus2 className="h-3.5 w-3.5" />
                    )}
                    Tạo Google Sheet mới &amp; Đẩy dữ liệu
                  </button>
                </div>

                {/* Option 2: Sync with existing Google Spreadsheet ID/URL */}
                <div className="rounded-md border border-slate-200 p-3.5 space-y-3">
                  <label htmlFor="gs-sheet-id" className="block font-semibold text-[#1E3A5F]">
                    Cách 2: Đồng bộ 2 chiều với Google Sheet có sẵn (Dán link hoặc ID)
                  </label>
                  <input
                    id="gs-sheet-id"
                    type="text"
                    value={spreadsheetInput}
                    onChange={(e) => setSpreadsheetInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/... hoặc Spreadsheet ID"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#0F766E] focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!parsedId || Boolean(busyAction)}
                      onClick={() => setPendingConfirm({ mode: 'push', spreadsheetId: parsedId })}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#1E3A5F] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#162C49] disabled:opacity-40"
                    >
                      {busyAction === 'push' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CloudUpload className="h-3.5 w-3.5" />
                      )}
                      Đẩy lên Sheets (Ghi đè)
                    </button>

                    <button
                      type="button"
                      disabled={!parsedId || Boolean(busyAction)}
                      onClick={() => setPendingConfirm({ mode: 'pull', spreadsheetId: parsedId })}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
                    >
                      {busyAction === 'pull' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CloudDownload className="h-3.5 w-3.5" />
                      )}
                      Kéo dữ liệu về App
                    </button>
                  </div>
                </div>
              </div>
            )}

            {statusMsg && (
              <div
                className={`rounded-md border p-3 ${
                  statusMsg.type === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                <p>{statusMsg.text}</p>
                {activeSheetUrl && statusMsg.type === 'ok' && (
                  <a
                    href={activeSheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 font-semibold underline"
                  >
                    Mở bảng tính trên Google Sheets
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mandatory explicit user confirmation dialog before mutating Google Sheets or overwriting local survey data */}
      <ConfirmDialog
        open={Boolean(pendingConfirm)}
        title={
          pendingConfirm?.mode === 'push'
            ? 'Xác nhận ghi đè dữ liệu lên Google Sheets?'
            : 'Xác nhận nhập dữ liệu từ Google Sheets?'
        }
        description={
          pendingConfirm?.mode === 'push'
            ? 'Thao tác này sẽ xóa nội dung cũ và ghi đè dữ liệu sổ đo hiện tại lên 4 trang tính của bảng tính Google Sheets đã chọn.'
            : 'Thao tác này sẽ thay thế danh sách Mốc gốc và Sổ đo chi tiết hiện tại trên ứng dụng bằng dữ liệu đọc từ Google Sheets.'
        }
        details={
          pendingConfirm?.mode === 'push'
            ? [
                `Spreadsheet ID: ${pendingConfirm.spreadsheetId}`,
                `Moc_Goc: ${controlPoints.length} mốc khống chế`,
                `Duong_Chuyen_2Mat: ${traverseSummary.rows.length} cạnh đường chuyền`,
                `So_Do_Chi_Tiet: ${detailRows.length} điểm đo chi tiết`,
                `Toa_Do_Civil3D: ${allMapPoints.length} tọa độ tổng hợp`,
              ]
            : [
                `Spreadsheet ID: ${pendingConfirm?.spreadsheetId ?? ''}`,
                'Tự động đọc tên trang tính thực tế (Moc_Goc & So_Do_Chi_Tiet)',
              ]
        }
        confirmLabel={pendingConfirm?.mode === 'push' ? 'Xác nhận ghi đè' : 'Xác nhận kéo về'}
        destructive={pendingConfirm?.mode === 'push'}
        onConfirm={executeConfirmedAction}
        onCancel={() => setPendingConfirm(null)}
      />
    </>
  );
};
