
import type { ButtonHTMLAttributes } from "react";
import "./Button.css";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "small" | "medium" | "large";
}

export default function Button({
  children,
  variant = "primary",
  size = "medium",
  type = "button",
  className = "",
  ...props
}: ButtonProps) {
  const classes = [
    "app-button",
    `app-button--${variant}`,
    `app-button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...props}
      type={type}
      className={classes}
    >
      {children}
    </button>
  );
}
