import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/util";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const buttonVariants =
  "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60";

export const buttonStyles = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary:
    "border border-border bg-muted text-foreground hover:bg-muted/80",
  outline:
    "border border-border bg-transparent text-foreground hover:bg-muted/80",
  ghost: "text-foreground hover:bg-muted",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive-border",
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
