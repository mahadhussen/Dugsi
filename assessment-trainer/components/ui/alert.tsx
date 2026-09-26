import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  info: { cls: "border-primary/30 bg-accent", Icon: Info, icon: "text-primary" },
  good: { cls: "border-good/30 bg-good/10", Icon: CheckCircle2, icon: "text-good" },
  warn: { cls: "border-warn/40 bg-warn/10", Icon: AlertTriangle, icon: "text-warn" },
  bad: { cls: "border-bad/40 bg-bad/10", Icon: XCircle, icon: "text-bad" },
};

export function Alert({ tone = "info", title, children, className }: { tone?: keyof typeof tones; title: string; children?: React.ReactNode; className?: string }) {
  const t = tones[tone];
  return (
    <div role="status" className={cn("flex gap-3 rounded-lg border p-4 text-sm", t.cls, className)}>
      <t.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.icon)} aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
