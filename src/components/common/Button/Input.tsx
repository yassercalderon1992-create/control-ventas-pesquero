
import { useId } from "react";
import type { InputHTMLAttributes } from "react";

export interface InputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helpText?: string;
}

export default function Input({
  id,
  label,
  error,
  helpText,
  className = "",
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {label && (
        <label htmlFor={inputId}>{label}</label>
      )}

      <input
        {...props}
        id={inputId}
        className={className}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error || helpText ? `${inputId}-description` : undefined
        }
        style={{
          boxSizing: "border-box",
          width: "100%",
          padding: "10px 12px",
          border: `1px solid ${error ? "#dc2626" : "#d1d5db"}`,
          borderRadius: 6,
          ...props.style,
        }}
      />

      {(error || helpText) && (
        <small
          id={`${inputId}-description`}
          style={{ color: error ? "#b91c1c" : "#6b7280" }}
        >
          {error ?? helpText}
        </small>
      )}
    </div>
  );
}
