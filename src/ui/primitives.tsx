"use client";

/*
 * The shared building blocks of the River design system: buttons, fields, choices, sheets,
 * empty states and notices. Every one is a native element underneath (button, input, dialog),
 * so keyboard, screen readers and text scaling come for free. Styles are in globals.css.
 */
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { IconClose } from "./icons";

/* ----- Buttons ----- */

type ButtonVariant = "primary" | "quiet" | "line" | "soft";

export function Button({
  variant = "primary",
  small = false,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; small?: boolean }) {
  const variantClass = variant === "primary" ? "" : ` fz-button--${variant}`;
  const sizeClass = small ? " fz-button--small" : "";
  return (
    <button
      type={type}
      className={`fz-button${variantClass}${sizeClass}${className ? ` ${className}` : ""}`}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      className={`fz-icon-button${className ? ` ${className}` : ""}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

/* ----- Fields ----- */

interface FieldFrame {
  label: string;
  hint?: string;
  id: string;
}

function useFieldFrame(label: string, hint: string | undefined, id?: string): FieldFrame {
  const generated = useId();
  return { label, hint, id: id ?? generated };
}

function FieldShell({ frame, children }: { frame: FieldFrame; children: ReactNode }) {
  return (
    <div className="fz-field">
      <label htmlFor={frame.id}>{frame.label}</label>
      {children}
      {frame.hint ? (
        <span className="fz-hint" id={`${frame.id}-hint`}>
          {frame.hint}
        </span>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const frame = useFieldFrame(label, hint, id);
  return (
    <FieldShell frame={frame}>
      <input
        id={frame.id}
        className={`fz-input${className ? ` ${className}` : ""}`}
        aria-describedby={hint ? `${frame.id}-hint` : undefined}
        {...props}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  hint,
  id,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const frame = useFieldFrame(label, hint, id);
  return (
    <FieldShell frame={frame}>
      <textarea
        id={frame.id}
        className={`fz-input${className ? ` ${className}` : ""}`}
        aria-describedby={hint ? `${frame.id}-hint` : undefined}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string }) {
  const frame = useFieldFrame(label, hint, id);
  return (
    <FieldShell frame={frame}>
      <select
        id={frame.id}
        className="fz-input"
        aria-describedby={hint ? `${frame.id}-hint` : undefined}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

/* ----- Choices: native radio buttons styled as pills ----- */

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

export function ChoiceGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  testId,
}: {
  legend: string;
  name: string;
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testId?: string;
}) {
  return (
    <fieldset className="fz-choices" data-testid={testId}>
      <legend>{legend}</legend>
      {options.map((option) => (
        <label className="fz-choice" key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
  hint,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  testId?: string;
}) {
  return (
    <label className="fz-toggle" data-testid={testId}>
      <span>
        {label}
        {hint ? (
          <span className="fz-hint" style={{ display: "block", fontWeight: 400 }}>
            {hint}
          </span>
        ) : null}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/* ----- Sheet: a native dialog, bottom-anchored on phones and centred on larger screens ----- */

export function Sheet({
  open,
  onClose,
  title,
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Put the cursor in the first field of the sheet, so typing starts at once. Fields that
      // mount before the dialog opens cannot take focus on their own.
      const field = dialog.querySelector<HTMLElement>(
        ".fz-sheet-body input:not([type='hidden']):not([disabled]), .fz-sheet-body textarea:not([disabled]), .fz-sheet-body select:not([disabled])",
      );
      field?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape, and any close the browser performs, reports back to the owner of the sheet.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className="fz-sheet"
      aria-labelledby={titleId}
      data-testid={testId}
      onClick={(event) => {
        // A tap on the dimmed area (outside the content box) closes the sheet.
        if (event.target === ref.current) ref.current?.close();
      }}
    >
      <div className="fz-sheet-head">
        <h2 id={titleId}>{title}</h2>
        <IconButton label="Close" onClick={() => ref.current?.close()}>
          <IconClose />
        </IconButton>
      </div>
      {open ? <div className="fz-sheet-body">{children}</div> : null}
    </dialog>
  );
}

/* ----- Screen furniture ----- */

export function ScreenTitle({
  title,
  detail,
  actions,
}: {
  title: string;
  detail?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="fz-screen-title">
      <div>
        <h1>{title}</h1>
        {detail ? <p>{detail}</p> : null}
      </div>
      {actions ? <div className="fz-row">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="fz-empty">
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function Notice({
  children,
  tone = "neutral",
  role,
}: {
  children: ReactNode;
  tone?: "neutral" | "problem";
  role?: "status" | "alert";
}) {
  return (
    <p
      className="fz-notice"
      role={role}
      style={tone === "problem" ? { background: "var(--river-wash)" } : undefined}
    >
      {children}
    </p>
  );
}

export function LoadingLine({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="fz-muted" role="status" aria-live="polite">
      {label}
    </p>
  );
}
