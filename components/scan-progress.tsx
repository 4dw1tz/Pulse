import { ScanState } from "@/types/scan";

// All possible agent nodes with display metadata.
const AGENT_META: Record<string, { label: string; icon: string; tools: string }> = {
  planner:          { label: "Planner",           icon: "🧠", tools: "language detection" },
  recon:            { label: "Recon",              icon: "🌐", tools: "httpx · nmap · whatweb" },
  adaptive_planner: { label: "Attack Planner",     icon: "🎯", tools: "LLM reasoning" },
  sql_injection:    { label: "SQL Injection",      icon: "💉", tools: "sqlmap" },
  sqli:             { label: "SQL Injection",      icon: "💉", tools: "sqlmap" },
  xss:              { label: "XSS",                icon: "🕸️", tools: "dalfox" },
  static_c:         { label: "C/C++ Analysis",     icon: "🔬", tools: "cppcheck · semgrep p/c" },
  static_analysis:  { label: "Static Analysis",    icon: "🔬", tools: "semgrep · bandit" },
  static:           { label: "Static Analysis",    icon: "🔬", tools: "semgrep · bandit" },
  deps_py:          { label: "Python Deps",        icon: "📦", tools: "pip-audit" },
  deps_js:          { label: "JS Deps",            icon: "📦", tools: "npm audit" },
  deps:             { label: "Dependencies",       icon: "📦", tools: "pip-audit · npm audit" },
  dependencies:     { label: "Dependencies",       icon: "📦", tools: "pip-audit · npm audit" },
  secrets:          { label: "Secrets",            icon: "🔐", tools: "trufflehog · detect-secrets" },
  report:           { label: "Report",             icon: "📄", tools: "LLM synthesis" },
};

interface Props {
  scan: ScanState;
}

function agentStatus(
  agentKey: string,
  scan: ScanState,
): "done" | "running" | "queued" | "skipped" {
  // Normalise "complete" marker used by backend when fully done.
  const current =
    scan.current_agent === "complete" ? "report" : scan.current_agent;

  if (scan.status === "complete") return "done";
  if (current === agentKey) return "running";

  // Determine ordering from the live plan, falling back to render order.
  const planOrder = scan.agents_plan.length > 0 ? scan.agents_plan : [];
  const currentIdx = planOrder.indexOf(current);
  const agentIdx   = planOrder.indexOf(agentKey);

  if (agentIdx !== -1 && currentIdx !== -1 && agentIdx < currentIdx) return "done";
  return "queued";
}

// Plan is "pending" (not yet expanded by adaptive_planner) when it only
// contains the two bootstrap nodes.
function isPlanPending(plan: string[]): boolean {
  return plan.length === 0 || (
    plan.length <= 2 &&
    plan.every((k) => k === "recon" || k === "adaptive_planner")
  );
}

export function ScanProgress({ scan }: Props) {
  const planKeys = ["planner", ...scan.agents_plan].filter((k) => AGENT_META[k]);
  const pending = isPlanPending(scan.agents_plan);

  return (
    <div className="flex flex-col gap-1 w-full">
      {planKeys.map((key) => {
        const agent = { key, ...AGENT_META[key] };
        const status = agentStatus(key, scan);
        return (
          <div
            key={key}
            className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-muted/40 border border-border/50"
          >
            <div className="flex items-center gap-3">
              <span className="text-base w-6 text-center">{agent.icon}</span>
              <div>
                <p className="text-sm font-medium leading-tight">{agent.label}</p>
                <p className="text-xs text-muted-foreground">{agent.tools}</p>
              </div>
            </div>
            <StatusBadge status={status} />
          </div>
        );
      })}

      {/* Placeholder shown while attack planner hasn't decided yet */}
      {pending && scan.status === "running" && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-dashed border-white/10 mt-1">
          <span className="text-base w-6 text-center opacity-30">⋯</span>
          <p className="text-xs text-white/30 italic">
            Awaiting attack plan from recon...
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "done" | "running" | "queued" | "skipped";
}) {
  switch (status) {
    case "done":
      return <span className="text-sm text-green-600 font-medium">✓ Done</span>;
    case "running":
      return (
        <span className="text-sm text-blue-500 font-medium flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
          Running
        </span>
      );
    case "skipped":
      return <span className="text-xs text-muted-foreground">— skipped</span>;
    default:
      return <span className="text-sm text-muted-foreground">○ Queued</span>;
  }
}
