import { useEffect, useId, useRef, type ReactNode } from "react";
import { text, type Locale } from "../i18n/text";
import "./modal.scss";
export function Modal({
  title,
  children,
  onClose,
  locale,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  locale: Locale;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    label = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={label}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-header">
        <h2 id={label}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={text(locale).close}
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
