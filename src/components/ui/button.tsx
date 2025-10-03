import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/util";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const buttonVariants = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

export const buttonStyles = {
  default:
    "bg-slate-900 text-white hover:bg-slate-900/90 focus-visible:ring-slate-500",
  secondary:
    "bg-white text-slate-900 hover:bg-slate-100 focus-visible:ring-slate-400 border border-slate-200",
  outline:
    "border border-slate-200 bg-transparent hover:bg-slate-100 focus-visible:ring-slate-400",
  ghost: "hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-300",
  destructive:
    "bg-rose-500 text-white hover:bg-rose-500/90 focus-visible:ring-rose-400",
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
