import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

export interface HelixButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClass: Record<Variant, string> = {
  primary: "hx-btn-primary",
  secondary: "hx-btn-secondary",
  ghost: "hx-btn-ghost",
  danger: "hx-btn-danger",
};

const sizeClass: Record<Size, string> = {
  sm: "hx-btn-sm",
  md: "",
  lg: "hx-btn-lg",
  icon: "hx-btn-icon",
};

export const HelixButton = forwardRef<HTMLButtonElement, HelixButtonProps>(function HelixButton(
  { variant = "secondary", size = "md", className = "", ...rest },
  ref,
) {
  const cls = ["hx-btn", variantClass[variant], sizeClass[size], className]
    .filter(Boolean)
    .join(" ");
  return <button ref={ref} className={cls} {...rest} />;
});
