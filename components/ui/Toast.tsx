"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

/* ─── Types ─── */

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

type ToastAction =
  | { payload: Toast; type: "ADD" }
  | { payload: string; type: "REMOVE" }
  | { type: "CLEAR" };

/* ─── Reducer ─── */

const MAX_TOASTS = 5;

function toastReducer(state: Toast[], action: ToastAction): Toast[] {
  switch (action.type) {
    case "ADD":
      return [action.payload, ...state].slice(0, MAX_TOASTS);
    case "REMOVE":
      return state.filter((t) => t.id !== action.payload);
    case "CLEAR":
      return [];
    default:
      return state;
  }
}

/* ─── Context ─── */

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, tone?: ToastTone) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

/* ─── Provider ─── */

let toastCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);

  const removeToast = useCallback((id: string) => {
    dispatch({ payload: id, type: "REMOVE" });
  }, []);

  const addToast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = `toast-${++toastCounter}`;
      dispatch({ payload: { id, message, tone }, type: "ADD" });
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

/* ─── Container ─── */

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2.5"
      aria-live="polite"
      aria-label="通知"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/* ─── Single Toast with animations ─── */

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Enter animation
  useEffect(() => {
    // Small delay for mount + animate in
    const enterTimer = requestAnimationFrame(() =>
      setVisible(true),
    );
    return () => cancelAnimationFrame(enterTimer);
  }, []);

  // Auto-dismiss
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setExiting(true);
      // Wait for exit animation then remove
      timerRef.current = setTimeout(() => {
        onDismiss(toast.id);
      }, 280);
    }, 3500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, onDismiss]);

  // Manual dismiss with exit animation
  function handleDismiss() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!exiting && visible) {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 280);
    }
  }

  const toneStyles: Record<ToastTone, string> = {
    success:
      "border-l-[3px] border-l-[var(--color-accent)] bg-[var(--color-panel-strong)]",
    error:
      "border-l-[3px] border-l-[var(--color-accent-2)] bg-[var(--color-panel-strong)]",
    info:
      "border-l-[3px] border-l-[var(--color-border-strong)] bg-[var(--color-panel-strong)]",
  };

  const iconBg: Record<ToastTone, string> = {
    success: "bg-[rgba(15,111,98,0.1)]",
    error: "bg-[rgba(178,87,47,0.1)]",
    info: "bg-[var(--color-surface-muted)]",
  };

  const Icon =
    toast.tone === "success"
      ? CheckCircle
      : toast.tone === "error"
        ? AlertCircle
        : Info;
  const iconColor =
    toast.tone === "success"
      ? "text-[var(--color-accent)]"
      : toast.tone === "error"
        ? "text-[var(--color-accent-2)]"
        : "text-[var(--color-ink-soft)]";

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border border-[var(--color-border)] px-4 py-3 shadow-xl shadow-black/[0.06] backdrop-blur-xl transition-all duration-280 ease-out ${
        visible && !exiting
          ? "opacity-100 translate-x-0 scale-100"
          : exiting
            ? "opacity-0 translate-x-full -rotate-1 scale-95"
            : "opacity-0 translate-x-full scale-95"
      } ${toneStyles[toast.tone]}`}
      role="status"
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg[toast.tone]}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <p className="min-w-0 flex-1 text-sm font-medium text-[var(--color-ink)] leading-snug">
        {toast.message}
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded-full p-1 transition-colors hover:bg-[var(--color-surface-glass-hover)] active:scale-[0.9]"
        aria-label="关闭通知"
      >
        <X className="h-3.5 w-3.5 text-[var(--color-ink-soft)] opacity-60" />
      </button>
    </div>
  );
}
