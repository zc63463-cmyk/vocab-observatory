"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
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
      // auto-dismiss after 3.5s
      window.setTimeout(() => {
        removeToast(id);
      }, 3500);
    },
    [removeToast],
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
      className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3"
      aria-live="polite"
      aria-label="通知"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/* ─── Single Toast ─── */

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  // auto-dismiss timer
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismiss(toast.id);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const toneStyles: Record<ToastTone, string> = {
    success: "border-[rgba(15,111,98,0.24)] bg-[var(--color-surface-muted)]",
    error: "border-[rgba(178,87,47,0.24)] bg-[var(--color-surface-muted-warm)]",
    info: "border-[var(--color-border)] bg-[var(--color-surface-soft)]",
  };

  const Icon = toast.tone === "success" ? CheckCircle : toast.tone === "error" ? AlertCircle : Info;
  const iconColor =
    toast.tone === "success"
      ? "text-[var(--color-accent)]"
      : toast.tone === "error"
        ? "text-[var(--color-accent-2)]"
        : "text-[var(--color-ink-soft)]";

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-xl transition-all duration-300 ${toneStyles[toast.tone]}`}
      role="status"
    >
      <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
      <p className="min-w-0 flex-1 text-sm font-medium text-[var(--color-ink)]">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded-full p-1 transition hover:bg-[var(--color-surface-glass-hover)]"
        aria-label="关闭通知"
      >
        <X className="h-3 w-3 text-[var(--color-ink-soft)]" />
      </button>
    </div>
  );
}
