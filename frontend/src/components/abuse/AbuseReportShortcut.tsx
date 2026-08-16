import { Flag } from "lucide-react";
import { Link } from "react-router-dom";

import { buildAbuseReportPath, type AbuseReportPrefill } from "@/lib/abuseReportLink";

export function currentPageUrl(fallback: string) {
  if (typeof window !== "undefined" && window.location?.href) return window.location.href;
  return fallback;
}

export function AbuseReportShortcut({
  prefill,
  label = "Report",
  className = "",
}: {
  prefill: AbuseReportPrefill;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      to={buildAbuseReportPath(prefill)}
      className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground ${className}`}
    >
      <Flag className="h-3 w-3" />
      {label}
    </Link>
  );
}
