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

    // Flush remaining
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

export function parseCoderResponse(fullText: string): {
  files: Array<{ filename: string; language: string; code: string }>;
  explanation: string;
} {
  try {
    const cleaned = fullText.replace(/```json\s*\n?/g, "").replace(/```\s*$/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      files: [{ filename: "output.txt", language: "text", code: fullText }],
      explanation: "Raw output from coder agent",
    };
  }
}

export function parseDebuggerResponse(fullText: string): {
  diagnosis: string;
  fixes: Array<{ filename: string; language: string; code: string }>;
  explanation: string;
  confidence: string;
} {
  try {
    const cleaned = fullText.replace(/```json\s*\n?/g, "").replace(/```\s*$/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      diagnosis: fullText,
      fixes: [],
      explanation: "Could not parse debugger response",
      confidence: "low",
    };
  }
}