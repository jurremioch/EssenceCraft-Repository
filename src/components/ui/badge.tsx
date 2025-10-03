import * as React from "react";

import { cn } from "@/lib/util";

const badgeVariants = {
  default: "inline-flex items-center rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-white",
  secondary: "inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700",
  outline: "inline-flex items-center rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-medium",
};

type Variant = keyof typeof badgeVariants;

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
}

export const Badge = ({ className, variant = "default", ...props }: BadgeProps) => {
  return <div className={cn(badgeVariants[variant], className)} {...props} />;
};
