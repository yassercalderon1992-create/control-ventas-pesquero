
import type { HTMLAttributes } from "react";
import "./Card.css";

export interface CardProps
  extends HTMLAttributes<HTMLElement> {
  title?: string;
}

export default function Card({
  title,
  children,
  className = "",
  ...props
}: CardProps) {
  const classes = ["app-card", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      {...props}
      className={classes}
    >
      {title && (
        <h2 className="app-card__title">
          {title}
        </h2>
      )}

      {children}
    </section>
  );
}
