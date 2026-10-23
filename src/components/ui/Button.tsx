import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({ children, variant = "neutral", className = "", onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "neutral" | "ghost"; children: ReactNode }) {
  return <button className={`button button-${variant} ${className}`} onClick={onClick} {...props}>{children}</button>;
}
