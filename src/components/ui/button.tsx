import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/util";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const buttonVariants =
  "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:cursor-not-allowed disabled:opacity-60";

export const buttonStyles = {
  default: "bg-indigo-600 text-white hover:bg-indigo-700",
  primary: "bg-indigo-600 text-white hover:bg-indigo-700",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  outline:
    "border border-slate-300 bg-transparent text-slate-700 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100",
  destructive:
    "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500",
};

type VariantKey = keyof typeof buttonStyles;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps & { variant?: VariantKey }>(
  ({ className, variant = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants, buttonStyles[variant], className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
