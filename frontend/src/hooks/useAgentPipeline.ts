// src/hooks/useAgentPipeline.ts
// Supabase is used ONLY to get the auth token for backend API calls.
// All project/message persistence goes through the backend (MongoDB).

import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage } from "@/components/workspace/ChatPanel";
import type { PlanStep } from "@/components/workspace/PlanPanel";
import type { CodeFile } from "@/components/workspace/CodePanel";
import type { ConsoleLine } from "@/components/workspace/ConsolePanel";
import type { AgentState } from "@/components/workspace/AgentStatus";
import {
  callPlannerAgent,
  streamAgentResponse,
  parseCoderResponse,
  parseDebuggerResponse,
} from "@/lib/agentStream";
import {
  canExecuteLocally,
  executeInBrowser,
  bundleWebFiles,
  WEB_LANGUAGES,
  BACKEND_LANGUAGES,
} from "@/lib/browserExecutor";
import { addMemoryEntry, getMemoryContext } from "@/lib/agentMemory";
import {
  useUpdateProject,
  useSaveMessage,
  useProjectMessages,
} from "@/hooks/useProjects";
import { useAuth } from "@/hooks/useAuth";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────
type ExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime?: string;
  isReal?: boolean;
  language?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function consoleLine(
  type: ConsoleLine["type"],
  content: string,
  agent?: ConsoleLine["agent"]
): ConsoleLine {
  return {
    id: Date.now().toString() + Math.random(),
    type,
    content,
    agent,
    timestamp: new Date(),
  };
}

// ─── Panel size persistence ───────────────────────────────────────────────────
const PANEL_SIZES_KEY = "codeagent_panel_sizes";
export function loadPanelSizes(): number[] | null {
  try {
    const raw = localStorage.getItem(PANEL_SIZES_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function savePanelSizes(sizes: number[]) {
  localStorage.setItem(PANEL_SIZES_KEY, JSON.stringify(sizes));
}

// ─── Language helpers ─────────────────────────────────────────────────────────
function isWebLanguage(lang: string): boolean {
  return WEB_LANGUAGES.includes(lang.toLowerCase());
}
function isBackendLanguage(lang: string): boolean {
  return BACKEND_LANGUAGES.includes(lang.toLowerCase());
}

// ─── Remote execution via backend ─────────────────────────────────────────────
async function executeCodeRemote(
  files: Array<{ filename: string; language: string; code: string }>,
  language: string
): Promise<ExecutionResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const resp = await fetch(`${API_BASE}/api/agent/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ files, language }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Execution failed" }));
    throw new Error(err.error || "Execution failed");
  }

  const result = await resp.json();
  return { ...result, language };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAgentPipeline(projectId?: string) {
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [activeStepId, setActiveStepId] = useState<string | undefined>();
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string>("1");
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastExecutionResult, setLastExecutionResult] =
    useState<ExecutionResult | null>(null);

  const retryCountRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const updateProject = useUpdateProject();
  const saveMessage = useSaveMessage();
  const { user } = useAuth();
  const { data: savedMessages } = useProjectMessages(projectId);

  // Hydrate messages from backend on mount
  useEffect(() => {
    if (savedMessages && savedMessages.length > 0 && messages.length === 0) {
      setMessages(
        savedMessages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          agent: m.agent as ChatMessage["agent"],
          content: m.content,
          timestamp: new Date(m.createdAt),
        }))
      );
    }
  }, [savedMessages]);

  const addConsole = useCallback(
    (
      type: ConsoleLine["type"],
      content: string,
      agent?: ConsoleLine["agent"]
    ) => {
      setConsoleLines((prev) => [...prev, consoleLine(type, content, agent)]);
    },
    []
  );

  // Persist a message to backend → MongoDB via useSaveMessage hook
  const persistMessage = useCallback(
    (role: string, content: string, agent?: string) => {
      if (
        projectId &&
        projectId !== "new" &&
        projectId !== "demo" &&
        user
      ) {
        saveMessage.mutate({ project_id: projectId, role, agent, content });
      }
    },
    [projectId, user, saveMessage]
  );

  // ─── File management ──────────────────────────────────────────────────────
  const detectLanguage = (filename: string): string => {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    const map: Record<string, string> = {
      js: "javascript",
      jsx: "react",
      ts: "typescript",
      tsx: "react",
      py: "python",
      html: "html",
      css: "css",
      json: "json",
      sh: "bash",
      java: "java",
      rb: "ruby",
      go: "go",
      rs: "rust",
      kt: "kotlin",
      swift: "swift",
      scala: "scala",
      php: "php",
      r: "r",
      cpp: "cpp",
      c: "c",
    };
    return map[ext] || "text";
  };

  const handleCreateFile = useCallback((fullPath: string) => {
    const parts = fullPath.split("/");
    const filename = parts[parts.length - 1];
    if (!filename) return;
    const language = detectLanguage(filename);
    const id = Date.now().toString();
    setFiles((prev) => [...prev, { id, filename: fullPath, language, code: "" }]);
    setActiveFileId(id);
  }, []);

  const handleCreateFolder = useCallback((folderPath: string) => {
    const id = `folder-${Date.now()}`;
    setFiles((prev) => [
      ...prev,
      { id, filename: `${folderPath}/.folder`, language: "folder", code: "" },
    ]);
  }, []);

  const handleFileChange = useCallback((fileId: string, code: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, code } : f))
    );
  }, []);

  const handleRenameFile = useCallback((fileId: string, newName: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? { ...f, filename: newName, language: detectLanguage(newName) }
          : f
      )
    );
  }, []);

  const handleDeleteFile = useCallback(
    (fileId: string) => {
      setFiles((prev) => {
        const next = prev.filter((f) => f.id !== fileId);
        if (activeFileId === fileId && next.length > 0)
          setActiveFileId(next[0].id);
        return next;
      });
    },
    [activeFileId]
  );

  const handleRestoreSnapshot = useCallback(
    (snapshotFiles: CodeFile[]) => {
      setFiles(snapshotFiles);
      if (snapshotFiles.length > 0) setActiveFileId(snapshotFiles[0].id);
      addConsole("info", `▸ Restored snapshot (${snapshotFiles.length} files)`);
      toast.success("Snapshot restored");
    },
    [addConsole]
  );

  // ─── Execution router ──────────────────────────────────────────────────────
  function detectEffectiveLanguage(
    rawLang: string,
    codeFiles: Array<{ filename: string; language: string; code: string }>
  ): string {
    const lang = rawLang.toLowerCase();
    if (BACKEND_LANGUAGES.includes(lang)) return lang;
    if (lang === "react" || lang === "jsx" || lang === "tsx") return "react";
    if (lang === "javascript" || lang === "typescript") {
      const hasJsx = codeFiles.some(
        (f) =>
          /\breact\b/i.test(f.code) &&
          /<[A-Z][A-Za-z]*[\s/>]/.test(f.code)
      );
      if (hasJsx) return "react";
    }
    const mainFile = codeFiles[0];
    if (mainFile) {
      if (
        mainFile.filename.endsWith(".tsx") ||
        mainFile.filename.endsWith(".jsx")
      )
        return "react";
      if (mainFile.filename.endsWith(".ts")) return "typescript";
      if (mainFile.filename.endsWith(".py")) return "python";
    }
    return lang || "javascript";
  }

  const executeCode = useCallback(
    async (
      codeFiles: CodeFile[],
      rawLang: string
    ): Promise<ExecutionResult> => {
      const effectiveLang = detectEffectiveLanguage(rawLang, codeFiles);

      if (isBackendLanguage(effectiveLang)) {
        addConsole("info", `▸ Simulating ${effectiveLang} execution…`);
        return executeCodeRemote(codeFiles, effectiveLang);
      }

      // Web languages — execute in browser iframe
      addConsole("info", `▸ Running ${effectiveLang} in browser…`);

      if (codeFiles.length === 1 && canExecuteLocally(codeFiles[0].language)) {
        return executeInBrowser(codeFiles[0].language, codeFiles[0].code, 8000);
      }

      // Multi-file: bundle then execute
      const bundled = bundleWebFiles(codeFiles);
      return executeInBrowser("html", bundled, 8000);
    },
    [addConsole]
  );

  // ─── Coder agent ──────────────────────────────────────────────────────────
  const runCoderAgent = useCallback(
    async (
      prompt: string,
      plan: Awaited<ReturnType<typeof callPlannerAgent>>,
      signal: AbortSignal
    ): Promise<ReturnType<typeof parseCoderResponse> | null> => {
      setAgentState("coding");
      addConsole("agent", "Generating code…", "coder");

      let fullText = "";

      await streamAgentResponse({
        functionName: "coder",
        body: { plan, prompt, language: plan.language },
        onDelta: (chunk) => {
          fullText += chunk;
        },
        onDone: (text) => {
          fullText = text;
        },
        onError: (err) => {
          addConsole("stderr", `Coder error: ${err}`, "coder");
          toast.error(`Coder: ${err}`);
        },
        signal,
      });

      if (!fullText) return null;

      const parsed = parseCoderResponse(fullText);
      if (!parsed.files.length) {
        addConsole("stderr", "Coder returned no files.", "coder");
        return null;
      }

      const newFiles: CodeFile[] = parsed.files.map((f, i) => ({
        id: (Date.now() + i).toString(),
        filename: f.filename,
        language: f.language,
        code: f.code,
      }));

      setFiles(newFiles);
      if (newFiles.length > 0) setActiveFileId(newFiles[0].id);

      const coderMsg = `${parsed.explanation}\n\nGenerated **${parsed.files.length}** file${parsed.files.length !== 1 ? "s" : ""}:\n${parsed.files.map((f) => `- \`${f.filename}\``).join("\n")}`;

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          agent: "coder",
          content: coderMsg,
          timestamp: new Date(),
        },
      ]);
      persistMessage("assistant", coderMsg, "coder");
      addConsole(
        "agent",
        `Generated ${parsed.files.length} file(s)`,
        "coder"
      );

      return parsed;
    },
    [addConsole, persistMessage]
  );

  // ─── Debugger agent ───────────────────────────────────────────────────────
  const runDebuggerAgent = useCallback(
    async (
      prompt: string,
      codeFiles: CodeFile[],
      errorMsg: string,
      retryCount: number,
      language: string,
      signal: AbortSignal
    ): Promise<ReturnType<typeof parseDebuggerResponse> | null> => {
      setAgentState("debugging");
      addConsole("agent", `Debugging (attempt ${retryCount}/3)…`, "debugger");

      const memCtx = getMemoryContext(errorMsg, language);
      let fullText = "";

      await streamAgentResponse({
        functionName: "debugger",
        body: {
          code: codeFiles,
          error: errorMsg + memCtx,
          prompt,
          retryCount,
        },
        onDelta: (chunk) => {
          fullText += chunk;
        },
        onDone: (text) => {
          fullText = text;
        },
        onError: (err) => {
          addConsole("stderr", `Debugger error: ${err}`, "debugger");
        },
        signal,
      });

      if (!fullText) return null;

      const parsed = parseDebuggerResponse(fullText);

      if (parsed.fixes.length > 0) {
        addMemoryEntry({
          errorPattern: errorMsg.substring(0, 200),
          fix: parsed.explanation.substring(0, 300),
          language,
          confidence: parsed.confidence,
        });

        const fixedFiles: CodeFile[] = parsed.fixes.map((f, i) => ({
          id: (Date.now() + i).toString(),
          filename: f.filename,
          language: f.language,
          code: f.code,
        }));
        setFiles(fixedFiles);
        if (fixedFiles.length > 0) setActiveFileId(fixedFiles[0].id);
      }

      const debugMsg = `**Diagnosis:** ${parsed.diagnosis}\n\n**Fix:** ${parsed.explanation}\n\n*Confidence: ${parsed.confidence}*`;
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          agent: "debugger",
          content: debugMsg,
          timestamp: new Date(),
        },
      ]);
      persistMessage("assistant", debugMsg, "debugger");

      return parsed;
    },
    [addConsole, persistMessage]
  );

  // ─── Manual run ───────────────────────────────────────────────────────────
  const handleRunCode = useCallback(async () => {
    if (files.length === 0) {
      toast.error("No code to run");
      return;
    }
    setConsoleLines([]);
    addConsole("info", "▸ Running code manually…");

    const lang =
      files[0].language === "folder"
        ? detectEffectiveLanguage("javascript", files)
        : files[0].language;

    try {
      const result = await executeCode(files, lang);
      setLastExecutionResult({ ...result, language: lang });
      addConsole(
        result.exitCode === 0 ? "stdout" : "stderr",
        result.exitCode === 0
          ? result.stdout || "No output"
          : result.stderr || "Unknown error"
      );
    } catch (err) {
      addConsole(
        "stderr",
        `Execution error: ${err instanceof Error ? err.message : "Unknown"}`
      );
    }
  }, [files, addConsole, executeCode]);

  // ─── Main pipeline ────────────────────────────────────────────────────────
  const handleSendMessage = useCallback(
    async (content: string) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      persistMessage("user", content);
      setIsLoading(true);
      retryCountRef.current = 0;
      setLastExecutionResult(null);

      try {
        setAgentState("planning");
        addConsole("info", "▸ Starting agent pipeline…");
        addConsole("agent", `Analyzing: "${content.substring(0, 80)}"`, "planner");

        const plan = await callPlannerAgent(content, signal);

        const planSteps: PlanStep[] = plan.steps.map((s, i) => ({
          id: (i + 1).toString(),
          title: s.title,
          description: s.description,
          status: "pending" as const,
        }));
        setSteps(planSteps);
        setActiveStepId("1");

        addConsole(
          "agent",
          `Generated ${plan.steps.length}-step plan (${plan.language})`,
          "planner"
        );

        const planMsg = plan.summary
          ? `**Plan:** ${plan.summary}\n\n${plan.steps
              .map(
                (s, i) =>
                  `${i + 1}. **${s.title}**${s.description ? `: ${s.description}` : ""}`
              )
              .join("\n")}`
          : `Here is the ${plan.steps.length}-step plan:\n\n${plan.steps
              .map(
                (s, i) =>
                  `${i + 1}. **${s.title}**${s.description ? `: ${s.description}` : ""}`
              )
              .join("\n")}`;

        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            agent: "planner",
            content: planMsg,
            timestamp: new Date(),
          },
        ]);
        persistMessage("assistant", planMsg, "planner");

        setSteps((prev) =>
          prev.map((s, i) =>
            i === 0 ? { ...s, status: "in-progress" as const } : s
          )
        );

        const coderResult = await runCoderAgent(content, plan, signal);
        if (!coderResult) {
          setAgentState("error");
          setIsLoading(false);
          return;
        }
        setSteps((prev) =>
          prev.map((s) => ({ ...s, status: "done" as const }))
        );

        addConsole("info", "▸ Executing generated code…");
        setAgentState("coding");

        let currentFiles = coderResult.files;
        let execResult: ExecutionResult;

        try {
          execResult = await executeCode(
            currentFiles.map((f, i) => ({
              id: (Date.now() + i).toString(),
              ...f,
            })),
            plan.language
          );
        } catch (err) {
          addConsole(
            "stderr",
            `Execution error: ${err instanceof Error ? err.message : "Unknown error"}`
          );
          setAgentState("error");
          setIsLoading(false);
          return;
        }

        addConsole(
          execResult.exitCode === 0 ? "stdout" : "stderr",
          execResult.exitCode === 0
            ? execResult.stdout || "No output"
            : execResult.stderr || "Unknown error"
        );

        setLastExecutionResult({ ...execResult, language: plan.language });

        const effectiveLang = plan.language.toLowerCase();
        const isWeb = isWebLanguage(effectiveLang);

        while (execResult.exitCode !== 0 && retryCountRef.current < 3) {
          if (
            isWeb &&
            (execResult.stderr ?? "").toLowerCase().includes("timeout")
          ) {
            addConsole(
              "info",
              "▸ Timeout on visual page — treating as rendered successfully."
            );
            execResult = { ...execResult, exitCode: 0 };
            setLastExecutionResult({
              ...execResult,
              exitCode: 0,
              language: plan.language,
            });
            break;
          }

          retryCountRef.current++;
          addConsole(
            "info",
            `▸ Error detected — auto-debug attempt ${retryCountRef.current}/3…`
          );

          const filesForDebug = files.length > 0 ? files : currentFiles.map((f, i) => ({ id: (Date.now() + i).toString(), ...f }));

          const debugResult = await runDebuggerAgent(
            content,
            filesForDebug,
            execResult.stderr ?? "Unknown error",
            retryCountRef.current,
            plan.language,
            signal
          );

          if (!debugResult) {
            addConsole("stderr", "Debugger failed to respond.");
            break;
          }
          if (debugResult.fixes.length === 0) {
            addConsole("stderr", "Debugger could not produce a fix.");
            break;
          }

          currentFiles = debugResult.fixes;
          addConsole("info", "▸ Re-executing fixed code…");

          try {
            execResult = await executeCode(
              currentFiles.map((f, i) => ({
                id: (Date.now() + i).toString(),
                ...f,
              })),
              plan.language
            );
          } catch (err) {
            addConsole(
              "stderr",
              `Re-execution error: ${err instanceof Error ? err.message : "Unknown"}`
            );
            break;
          }

          setLastExecutionResult({ ...execResult, language: plan.language });
          addConsole(
            execResult.exitCode === 0 ? "stdout" : "stderr",
            execResult.exitCode === 0
              ? execResult.stdout || "No output"
              : execResult.stderr || "Unknown error"
          );
        }

        if (execResult.exitCode === 0) {
          setAgentState("complete");
          addConsole("info", "▸ Pipeline complete ✓");
        } else {
          setAgentState("error");
          addConsole("stderr", "▸ Max retries reached — manual intervention needed.");
        }

        // Persist project state to backend → MongoDB
        if (
          projectId &&
          projectId !== "new" &&
          projectId !== "demo" &&
          user
        ) {
          updateProject.mutate({
            id: projectId,
            title: content.substring(0, 60),
            description: content.substring(0, 200),
            language: plan.language,
            plan: plan.steps as unknown[],
            generated_code: currentFiles as unknown[],
          });
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          addConsole("info", "▸ Pipeline cancelled.");
          setAgentState("idle");
          return;
        }

        const errMsg = e instanceof Error ? e.message : "Unknown error";
        setAgentState("error");
        addConsole("stderr", `Pipeline error: ${errMsg}`);
        toast.error(errMsg);

        if (
          errMsg.includes("Authentication required") ||
          errMsg.includes("Not authenticated") ||
          errMsg.includes("no token")
        ) {
          toast.error("Your session has expired. Please log in again.");
          window.location.href = "/login";
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: `❌ An error occurred: ${errMsg}`,
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [
      addConsole,
      runCoderAgent,
      runDebuggerAgent,
      persistMessage,
      projectId,
      user,
      updateProject,
      executeCode,
      files,
    ]
  );

  const clearConsole = useCallback(() => setConsoleLines([]), []);

  return {
    agentState,
    messages,
    steps,
    activeStepId,
    files,
    setFiles,
    activeFileId,
    setActiveFileId,
    consoleLines,
    isLoading,
    lastExecutionResult,
    handleSendMessage,
    handleFileChange,
    handleCreateFile,
    handleCreateFolder,
    handleRenameFile,
    handleDeleteFile,
    handleRestoreSnapshot,
    handleRunCode,
    clearConsole,
  };
}
