import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 no-print">
      <div className="w-full max-w-md rounded-xl bg-white border border-neutral-200 shadow-lg p-6">
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-lg shrink-0 ${danger ? 'bg-red-50 text-[#DC1726]' : 'bg-amber-50 text-[#F59E0B]'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-[#171717]">{title}</h3>
            <p className="mt-1.5 text-sm text-[#737373] leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-[#171717] bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
              danger ? 'bg-[#DC1726] hover:bg-red-700' : 'bg-[#171717] hover:bg-neutral-800'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
