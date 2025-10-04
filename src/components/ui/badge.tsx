import * as React from "react";

import { cn } from "@/lib/util";

const badgeVariants = {
  default:
    "inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground",
  secondary:
    "inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground",
  outline:
    "inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground",
};

type Variant = keyof typeof badgeVariants;

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
}

export const Badge = ({ className, variant = "default", ...props }: BadgeProps) => {
  return <div className={cn(badgeVariants[variant], className)} {...props} />;
};
