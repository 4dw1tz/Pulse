"use client";

import { useEffect, useMemo, useState } from "react";
import mermaid from "mermaid";

interface MermaidDiagramProps {
  chart: string;
}

function normalizeMermaid(input: string): string {
  let text = (input || "").trim();

  text = text
    .replace(/^```(?:mermaid)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (text.includes("\\n") && !text.includes("\n")) {
    text = text.replace(/\\n/g, "\n");
  }

  // Standardize diagram head and common malformed edge markers from model output.
  text = text.replace(/^graph\s+LR;?/im, "flowchart LR");
  text = text.replace(/\|>/g, "|");

  return text;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string>("");
  const [hasError, setHasError] = useState(false);

  const renderId = useMemo(
    () => `pulse-mermaid-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  useEffect(() => {
    let active = true;

    async function renderChart() {
      const normalized = normalizeMermaid(chart);
      const fallback = normalized
        .replace(/^graph\s+TB;?/im, "flowchart TB")
        .replace(/^graph\s+TD;?/im, "flowchart TD");

      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto",
        });

        let rendered = "";
        try {
          const out = await mermaid.render(`${renderId}-a`, normalized);
          rendered = out.svg;
        } catch {
          const out = await mermaid.render(`${renderId}-b`, fallback);
          rendered = out.svg;
        }
        if (!active) return;

        setSvg(rendered);
        setHasError(false);
      } catch {
        if (!active) return;
        setSvg("");
        setHasError(true);
      }
    }

    renderChart();

    return () => {
      active = false;
    };
  }, [chart, renderId]);

  if (hasError) {
    return (
      <div className="my-5 rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-xs text-red-300">
        Unable to render Mermaid diagram.
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-5 rounded-xl border border-white/10 bg-[#0d0d0d] px-4 py-3 text-xs text-white/50">
        Rendering diagram...
      </div>
    );
  }

  return (
    <div className="my-5 overflow-x-auto rounded-xl border border-white/10 bg-[#0d0d0d] p-4">
      <div
        className="min-w-115 [&_svg]:h-auto [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
