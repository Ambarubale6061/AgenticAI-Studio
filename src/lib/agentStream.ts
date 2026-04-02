import { supabase } from "@/integrations/supabase/client";

export async function streamAgentResponse({
  functionName,
  body,
  onDelta,
  onDone,
  onError,
  signal,
}: {
  functionName: string;
  body: Record<string, unknown>;
  onDelta: (chunk: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
  signal?: AbortSignal;
}) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({ error: "Request failed" }));
      console.error(`[${functionName}] ${resp.status}:`, errorData);
      onError(errorData.error || `Error ${resp.status}`);
      return;
    }

    const contentType = resp.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await resp.json();
      const text = JSON.stringify(data);
      onDelta(text);
      onDone(text);
      return;
    }

    if (!resp.body) {
      onError("No response body");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") break;

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onDelta(content);
          }
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      for (let raw of buffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onDelta(content);
          }
        } catch { /* ignore */ }
      }
    }

    onDone(fullText);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      onError("Request cancelled");
      return;
    }
    console.error(`[${functionName}] fetch error:`, e);
    onError(e instanceof Error ? e.message : "Unknown error");
  }
}

export async function callPlannerAgent(prompt: string, signal?: AbortSignal): Promise<{
  steps: Array<{ title: string; description?: string }>;
  language: string;
  summary: string;
}> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-planner`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ prompt }),
    signal,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Planner failed" }));
    console.error("Planner error:", err);
    throw new Error(err.error || "Planner failed");
  }

  return resp.json();
}

// ─── Robust JSON extractor ────────────────────────────────────────────────────
//
// The LLM sometimes wraps its JSON response in markdown fences, adds intro text,
// or uses slightly different fence styles. This tries several strategies in order
// before falling back so we never silently dump everything to output.txt.

function extractJson(raw: string): unknown {
  // Strategy 1 — direct parse (already valid JSON)
  try { return JSON.parse(raw.trim()); } catch { /* continue */ }

  // Strategy 2 — strip ALL markdown fences then parse
  try {
    const stripped = raw
      .replace(/^```[a-z]*\s*\n?/gm, "")   // opening fence (```json, ```, etc.)
      .replace(/^```\s*$/gm, "")            // closing fence
      .trim();
    return JSON.parse(stripped);
  } catch { /* continue */ }

  // Strategy 3 — extract from first ```json … ``` block
  try {
    const fenceMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)```/);
    if (fenceMatch) return JSON.parse(fenceMatch[1].trim());
  } catch { /* continue */ }

  // Strategy 4 — find the outermost { … } in the text
  // (handles "Here is the output:\n{ ... }")
  try {
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
  } catch { /* continue */ }

  // All strategies failed
  throw new Error("Could not extract JSON from LLM response");
}

// ─── Coder response parser ────────────────────────────────────────────────────

export function parseCoderResponse(fullText: string): {
  files: Array<{ filename: string; language: string; code: string }>;
  explanation: string;
} {
  try {
    const parsed = extractJson(fullText) as any;

    // Validate shape — must have a non-empty files array
    if (
      parsed &&
      Array.isArray(parsed.files) &&
      parsed.files.length > 0 &&
      parsed.files.every(
        (f: any) =>
          typeof f.filename === "string" &&
          typeof f.language === "string" &&
          typeof f.code    === "string",
      )
    ) {
      return {
        files:       parsed.files,
        explanation: parsed.explanation || "Code generated successfully.",
      };
    }

    // Shape is wrong — log and fall through
    console.warn("[parseCoderResponse] Unexpected shape:", parsed);
  } catch (e) {
    console.warn("[parseCoderResponse] parse failed:", e, "\nRaw text (first 500):", fullText.slice(0, 500));
  }

  // Last-resort fallback — at least show the raw output rather than a silent failure
  return {
    files: [
      {
        filename: "output.txt",
        language: "text",
        code: fullText,
      },
    ],
    explanation: "Raw output from coder agent — JSON parse failed. Check console for details.",
  };
}

// ─── Debugger response parser ─────────────────────────────────────────────────

export function parseDebuggerResponse(fullText: string): {
  diagnosis: string;
  fixes: Array<{ filename: string; language: string; code: string }>;
  explanation: string;
  confidence: string;
} {
  try {
    const parsed = extractJson(fullText) as any;

    if (parsed && Array.isArray(parsed.fixes)) {
      return {
        diagnosis:   parsed.diagnosis   || "See explanation below.",
        fixes:       parsed.fixes,
        explanation: parsed.explanation || "Fix applied.",
        confidence:  parsed.confidence  || "medium",
      };
    }

    console.warn("[parseDebuggerResponse] Unexpected shape:", parsed);
  } catch (e) {
    console.warn("[parseDebuggerResponse] parse failed:", e);
  }

  return {
    diagnosis:   fullText.slice(0, 200),
    fixes:       [],
    explanation: "Could not parse debugger response.",
    confidence:  "low",
  };
}