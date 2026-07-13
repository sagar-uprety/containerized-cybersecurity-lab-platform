import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DataChipProps {
  children: ReactNode;
  className?: string;
}

/** Mono-font chip for technical identifiers: lab slugs, session/student IDs, ports, container names. */
export default function DataChip({ children, className }: DataChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm bg-sidebar px-1.5 py-0.5 font-mono text-[0.8125rem] font-medium text-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}
