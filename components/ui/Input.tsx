import type { ComponentProps } from "react";

const fieldCls =
  "h-10 w-full rounded-md border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500";

function borderCls(error?: string) {
  return error
    ? "border-red-400 focus:border-red-500 focus:ring-red-100"
    : "border-slate-300 focus:border-brand-sky focus:ring-brand-sky/20";
}

function FieldWrapper({
  label,
  id,
  required,
  error,
  children,
}: {
  label?: string;
  id?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface InputProps extends ComponentProps<"input"> {
  label?: string;
  error?: string;
  requiredMark?: boolean;
}

export default function Input({
  label,
  id,
  className = "",
  error,
  requiredMark,
  ...props
}: InputProps) {
  return (
    <FieldWrapper label={label} id={id} required={requiredMark} error={error}>
      <input id={id} className={`${fieldCls} ${borderCls(error)} ${className}`} {...props} />
    </FieldWrapper>
  );
}

interface SelectProps extends ComponentProps<"select"> {
  label?: string;
  error?: string;
  requiredMark?: boolean;
}

export function Select({
  label,
  id,
  className = "",
  error,
  requiredMark,
  children,
  ...props
}: SelectProps) {
  return (
    <FieldWrapper label={label} id={id} required={requiredMark} error={error}>
      <select id={id} className={`${fieldCls} ${borderCls(error)} ${className}`} {...props}>
        {children}
      </select>
    </FieldWrapper>
  );
}

interface TextareaProps extends ComponentProps<"textarea"> {
  label?: string;
  error?: string;
  requiredMark?: boolean;
}

export function Textarea({
  label,
  id,
  className = "",
  error,
  requiredMark,
  ...props
}: TextareaProps) {
  return (
    <FieldWrapper label={label} id={id} required={requiredMark} error={error}>
      <textarea
        id={id}
        className={`${fieldCls} ${borderCls(error)} h-auto min-h-24 py-2 ${className}`}
        {...props}
      />
    </FieldWrapper>
  );
}
