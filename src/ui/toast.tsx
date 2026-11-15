"use client";

/**
 * Short messages for things that just happened ("Saved", "Moved to tomorrow"), with an
 * optional action (Undo). They appear in a polite live region, so screen readers announce
 * them without stealing focus. Errors use the same region with `tone: "problem"`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  tone?: "neutral" | "problem";
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

interface ToastApi {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-2), { id, message, ...options }]);
      // Undo stays a little longer, so there is time to read it.
      const lifetime = options.actionLabel ? 8000 : 4500;
      window.setTimeout(() => dismiss(id), lifetime);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fz-toasts" data-testid="toasts">
        {items.map((item) => (
          <div
            key={item.id}
            className="fz-toast"
            role={item.tone === "problem" ? "alert" : "status"}
            aria-live={item.tone === "problem" ? "assertive" : "polite"}
          >
            <span>{item.message}</span>
            {item.actionLabel && item.onAction ? (
              <button
                type="button"
                onClick={() => {
                  item.onAction?.();
                  dismiss(item.id);
                }}
              >
                {item.actionLabel}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside ToastProvider");
  return api;
}
