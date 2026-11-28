import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X, XCircle } from 'lucide-react';

export function ConfirmDialog({
  open,
  title,
  description,
  details = [],
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary', // 'primary' | 'success' | 'danger'
  loading = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open || loading) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const confirmBtnClass =
    variant === 'danger'
      ? 'bg-rose-600 text-white hover:bg-rose-700'
      : variant === 'success'
        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
        : 'bg-[#F58C56] text-white hover:bg-[#e57c45]';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
    >
      <div className="animate-sheet-up w-full max-w-md rounded-[28px] border border-[#EFE9E0] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0E6] text-[#F58C56]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 id="confirm-dialog-title" className="text-base font-extrabold text-[#1D1C1A]">
                {title}
              </h3>
              {description && (
                <p className="mt-0.5 text-xs leading-relaxed text-[#6E655D]">{description}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            aria-label="Close confirmation"
            className="rounded-full p-1 text-[#8C837A] hover:bg-[#FAF7F2] disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {Array.isArray(details) && details.length > 0 && (
          <div className="mt-4 space-y-2 rounded-2xl border border-[#EFE9E0] bg-[#FAF7F2] p-3.5">
            {details.map((item, idx) => (
              <div
                key={item.label || idx}
                className="flex items-start justify-between gap-3 text-xs"
              >
                <span className="shrink-0 font-semibold text-[#8C837A]">{item.label}</span>
                <span className="text-right font-bold text-[#1D1C1A]">{item.value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="flex-1 rounded-2xl bg-[#FAF7F2] py-2.5 text-xs font-bold text-[#6E655D] transition hover:bg-[#EFE9E0] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-2.5 text-xs font-bold shadow-sm transition disabled:opacity-60 ${confirmBtnClass}`}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResultDialog({
  open,
  status = 'success', // 'success' | 'error'
  title,
  message,
  details = [],
  closeLabel,
  onClose,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isSuccess = status === 'success';
  const btnText = closeLabel || (isSuccess ? 'Done' : 'Close');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-dialog-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
    >
      <div className="animate-sheet-up w-full max-w-md rounded-[28px] border border-[#EFE9E0] bg-white p-6 text-center shadow-2xl">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${
            isSuccess ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
          }`}
        >
          {isSuccess ? <CheckCircle2 className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}
        </div>

        <h3 id="result-dialog-title" className="mt-4 text-lg font-extrabold text-[#1D1C1A]">
          {title}
        </h3>
        {message && (
          <p className="mt-1.5 text-xs leading-relaxed text-[#6E655D]">{message}</p>
        )}

        {Array.isArray(details) && details.length > 0 && (
          <div className="mt-4 max-h-48 space-y-2 overflow-y-auto rounded-2xl border border-[#EFE9E0] bg-[#FAF7F2] p-3.5 text-left">
            {details.map((item, idx) => (
              <div
                key={item.label || idx}
                className="flex items-start justify-between gap-3 text-xs"
              >
                <span className="font-bold text-[#1D1C1A]">{item.label}</span>
                <span
                  className={`text-right font-semibold ${
                    item.ok === true
                      ? 'text-emerald-700'
                      : item.ok === false
                        ? 'text-rose-700'
                        : 'text-[#6E655D]'
                  }`}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className={`mt-5 w-full rounded-2xl py-3 text-xs font-bold text-white shadow-sm transition ${
            isSuccess ? 'bg-[#1E1D1B] hover:bg-black' : 'bg-rose-600 hover:bg-rose-700'
          }`}
        >
          {btnText}
        </button>
      </div>
    </div>
  );
}
