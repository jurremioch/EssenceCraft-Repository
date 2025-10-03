import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  if (Number.isNaN(rounded)) {
    return min;
  }

  return Math.max(min, Math.min(max, rounded));
}

export function parseCSVInts(input: string): number[] {
  return input
    .split(/[\s,]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => Number.parseInt(segment, 10))
    .filter((value) => Number.isInteger(value));
}

export function d20(rand: () => number = Math.random): number {
  return Math.floor(rand() * 20) + 1;
}

export function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return `${remainder}m`;
  }

  if (remainder === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainder}m`;
}
