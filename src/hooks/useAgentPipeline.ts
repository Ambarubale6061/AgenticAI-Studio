import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function consoleLine(
  type: ConsoleLine["type"],
  content: string,
  agent?: ConsoleLine["agent"],
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

// ─── Language routing ─────────────────────────────────────────────────────────

type ExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime?: string;
  isReal?: boolean;
};

function isWebLanguage(lang: string): boolean {
  return WEB_LANGUAGES.includes(lang.toLowerCase());
}

function isBackendLanguage(lang: string): boolean {
  return BACKEND_LANGUAGES.includes(lang.toLowerCase());
}

async function executeCodeRemote(
  files: Array<{ filename: string; language: string; code: string }>,
  language: string,
): Promise<ExecutionResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (supabaseUrl) {
    const url = `${supabaseUrl}/functions/v1/code-executor`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ files, language }),
      });
      if (resp.ok) return resp.json();
    } catch {
      // fall through to Piston
    }
  }

  const pistonLangMap: Record<string, { language: string; version: string }> = {
    python:  { language: "python",     version: "3.10.0" },
    java:    { language: "java",        version: "15.0.2" },
    node:    { language: "javascript",  version: "18.15.0" },
    nodejs:  { language: "javascript",  version: "18.15.0" },
    ruby:    { language: "ruby",        version: "3.0.1" },
    go:      { language: "go",          version: "1.16.2" },
    rust:    { language: "rust",        version: "1.50.0" },
    cpp:     { language: "c++",         version: "10.2.0" },
    c:       { language: "c",           version: "10.2.0" },
    bash:    { language: "bash",        version: "5.1.0" },
    shell:   { language: "bash",        version: "5.1.0" },
  };

  const pistonTarget = pistonLangMap[language.toLowerCase()];
  if (pistonTarget) {
    try {
      const pistonResp = await fetch("https://emkc.org/api/v2/piston/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: pistonTarget.language,
          version: pistonTarget.version,
          files: files.map((f) => ({ name: f.filename, content: f.code })),
        }),
      });
      if (pistonResp.ok) {
        const data = await pistonResp.json();
        const run = data.run ?? {};
        return {
          stdout: run.stdout ?? "",
          stderr: run.stderr ?? "",
          exitCode: run.code ?? (run.stderr ? 1 : 0),
        };
      }
    } catch {
      // fall through
    }
  }

  return {
    stdout: "",
    stderr: "Remote execution unavailable. Please configure VITE_SUPABASE_URL or check your network.",
    exitCode: 1,
  };
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
  const retryCountRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const updateProject = useUpdateProject();
  const saveMessage = useSaveMessage();
  const { user } = useAuth();
  const { data: savedMessages } = useProjectMessages(projectId);

  useEffect(() => {
    if (savedMessages && savedMessages.length > 0 && messages.length === 0) {
      setMessages(
        savedMessages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          agent: m.agent as ChatMessage["agent"],
          content: m.content,
          timestamp: new Date(m.created_at),
        })),
      );
    }
  }, [savedMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  const addConsole = useCallback(
    (type: ConsoleLine["type"], content: string, agent?: ConsoleLine["agent"]) => {
      setConsoleLines((prev) => [...prev, consoleLine(type, content, agent)]);
    },
    [],
  );

  const persistMessage = useCallback(
    (role: string, content: string, agent?: string) => {
      if (
        projectId &&
        projectId !== "new" &&
        projectId !== "demo" &&
        user
      ) {
        saveMessage.mutate({
          project_id: projectId,
          user_id: user.id,
          role,
          agent,
          content,
        });
      }
    },
    [projectId, user, saveMessage],
  );

  // ─── File management ───────────────────────────────────────────────────────

  const handleFileChange = useCallback((fileId: string, code: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, code } : f)),
    );
  }, []);

  const handleCreateFile = useCallback(
    (filename: string, language: string) => {
      const id = Date.now().toString();
      setFiles((prev) => [...prev, { id, filename, language, code: "" }]);
      setActiveFileId(id);
    },
    [],
  );

  const handleRenameFile = useCallback(
    (fileId: string, newName: string) => {
      const ext = newName.split(".").pop()?.toLowerCase() ?? "";
      const langMap: Record<string, string> = {
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
      };
      const language = langMap[ext] ?? "text";
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, filename: newName, language } : f,
        ),
      );
    },
    [],
  );

  const handleDeleteFile = useCallback(
    (fileId: string) => {
      setFiles((prev) => {
        const next = prev.filter((f) => f.id !== fileId);
        if (activeFileId === fileId && next.length > 0) {
          setActiveFileId(next[0].id);
        }
        return next;
      });
    },
    [activeFileId],
  );

  const handleRestoreSnapshot = useCallback(
    (snapshotFiles: CodeFile[]) => {
      setFiles(snapshotFiles);
      if (snapshotFiles.length > 0) setActiveFileId(snapshotFiles[0].id);
      addConsole("info", `▸ Restored snapshot (${snapshotFiles.length} files)`);
      toast.success("Snapshot restored");
    },
    [addConsole],
  );

  // ─── Execution router ──────────────────────────────────────────────────────

  function detectEffectiveLanguage(
    rawLang: string,
    files: Array<{ filename: string; language: string; code: string }>,
  ): string {
    const lang = rawLang.toLowerCase();
    if (lang === "react" || lang === "jsx" || lang === "tsx") return "react";

    if (lang === "javascript" || lang === "typescript") {
      const hasJsx = files.some(
        (f) =>
          /\breact\b/i.test(f.code) &&
          /<[A-Z][A-Za-z]*[\s/>]/.test(f.code),
      );
      if (hasJsx) return "react";
    }

    const mainFile = files[0];
    if (
      mainFile?.filename.endsWith(".tsx") ||
      mainFile?.filename.endsWith(".jsx")
    )
      return "react";

    return lang;
  }

  const executeCode = useCallback(
    async (
      codeFiles: Array<{ filename: string; language: string; code: string }>,
      language: string,
    ): Promise<ExecutionResult> => {
      const effectiveLang = detectEffectiveLanguage(language, codeFiles);

      if (isWebLanguage(effectiveLang)) {
        addConsole("info", `▸ Executing in browser sandbox (${effectiveLang})…`);

        let codeToRun: string;
        let execLang = effectiveLang;

        if (effectiveLang === "react") {
          const mainFile =
            codeFiles.find(
              (f) =>
                f.filename.endsWith(".tsx") ||
                f.filename.endsWith(".jsx") ||
                f.language === "react",
            ) ?? codeFiles[0];
          codeToRun = mainFile.code;
        } else if (effectiveLang === "html" && codeFiles.length > 1) {
          codeToRun = bundleWebFiles(codeFiles);
          execLang = "html";
        } else {
          const mainFile =
            codeFiles.find((f) => f.language === effectiveLang) ??
            codeFiles[0];
          codeToRun = mainFile.code;
        }

        try {
          const result = await executeInBrowser(codeToRun, execLang);
          addConsole(
            "info",
            `⚡ Browser execution complete (${result.executionTime})`,
          );
          return result;
        } catch (e) {
          return {
            stdout: "",
            stderr: e instanceof Error ? e.message : "Execution failed",
            exitCode: 1,
          };
        }
      }

      if (isBackendLanguage(effectiveLang)) {
        addConsole("info", `▸ Sending to remote executor (${effectiveLang})…`);
        try {
          return await executeCodeRemote(codeFiles, effectiveLang);
        } catch (e) {
          return {
            stdout: "",
            stderr: e instanceof Error ? e.message : "Remote execution failed",
            exitCode: 1,
          };
        }
      }

      addConsole("info", "▸ Simulating execution via AI…");
      try {
        return await executeCodeRemote(codeFiles, effectiveLang);
      } catch (e) {
        return {
          stdout: "",
          stderr: e instanceof Error ? e.message : "Execution failed",
          exitCode: 1,
        };
      }
    },
    [addConsole],
  );

  const handleRunCode = useCallback(async () => {
    if (files.length === 0) return;
    const lang = files[0]?.language ?? "javascript";
    const codeFiles = files.map((f) => ({
      filename: f.filename,
      language: f.language,
      code: f.code,
    }));

    addConsole("info", "▸ Running code…");
    try {
      const result = await executeCode(codeFiles, lang);
      addConsole(
        result.exitCode === 0 ? "stdout" : "stderr",
        result.exitCode === 0
          ? result.stdout || "No output"
          : result.stderr || "Unknown error",
      );
    } catch (e) {
      addConsole(
        "stderr",
        `Execution error: ${e instanceof Error ? e.message : "Unknown"}`,
      );
    }
  }, [files, executeCode, addConsole]);

  // ─── Coder agent ──────────────────────────────────────────────────────────

  const runCoderAgent = useCallback(
    async (
      prompt: string,
      plan: {
        steps: Array<{ title: string; description?: string }>;
        language: string;
      },
      signal?: AbortSignal,
    ): Promise<{
      files: Array<{ filename: string; language: string; code: string }>;
      explanation: string;
    } | null> => {
      setAgentState("coding");
      addConsole("agent", "Starting code generation…", "coder");

      return new Promise((resolve) => {
        streamAgentResponse({
          functionName: "agent-coder",
          body: { prompt, plan, language: plan.language },
          onDelta: () => {},
          onDone: (text) => {
            const parsed = parseCoderResponse(text);
            addConsole(
              "stdout",
              `✓ Generated ${parsed.files.length} file(s)`,
              "coder",
            );

            const codeFiles: CodeFile[] = parsed.files.map((f, i) => ({
              id: (i + 1).toString(),
              filename: f.filename,
              language: f.language,
              code: f.code,
            }));
            setFiles(codeFiles);
            if (codeFiles.length > 0) setActiveFileId("1");

            const msg = parsed.explanation || "Code generated successfully.";
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now().toString(),
                role: "assistant",
                agent: "coder",
                content: msg,
                timestamp: new Date(),
              },
            ]);
            persistMessage("assistant", msg, "coder");
            resolve(parsed);
          },
          onError: (err) => {
            addConsole("stderr", `Coder error: ${err}`, "coder");
            toast.error(`Coder agent failed: ${err}`);
            resolve(null);
          },
          signal,
        });
      });
    },
    [addConsole, persistMessage],
  );

  // ─── Debugger agent ───────────────────────────────────────────────────────

  const runDebuggerAgent = useCallback(
    async (
      prompt: string,
      code: Array<{ filename: string; language: string; code: string }>,
      errorMsg: string,
      retry: number,
      language: string,
      signal?: AbortSignal,
    ) => {
      setAgentState("debugging");
      addConsole("agent", `Debugging attempt ${retry}/3…`, "debugger");

      const memoryContext = getMemoryContext(errorMsg, language);
      if (memoryContext) {
        addConsole(
          "info",
          "▸ Found similar past fixes in agent memory",
          "debugger",
        );
      }

      return new Promise<{
        fixes: Array<{ filename: string; language: string; code: string }>;
        explanation: string;
        confidence: string;
        diagnosis: string;
      } | null>((resolve) => {
        streamAgentResponse({
          functionName: "agent-debugger",
          body: {
            prompt,
            code,
            error: errorMsg + memoryContext,
            retryCount: retry,
          },
          onDelta: () => {},
          onDone: (text) => {
            const parsed = parseDebuggerResponse(text);
            addConsole(
              "agent",
              `Diagnosis: ${parsed.diagnosis}`,
              "debugger",
            );

            if (parsed.fixes.length > 0) {
              addMemoryEntry({
                errorPattern: errorMsg.substring(0, 300),
                fix: parsed.explanation.substring(0, 500),
                language,
                confidence: parsed.confidence,
              });

              const codeFiles: CodeFile[] = parsed.fixes.map((f, i) => ({
                id: (i + 1).toString(),
                filename: f.filename,
                language: f.language,
                code: f.code,
              }));
              setFiles(codeFiles);

              const msg = `**Fix applied** (confidence: ${parsed.confidence})\n\n${parsed.explanation}`;
              setMessages((prev) => [
                ...prev,
                {
                  id: Date.now().toString(),
                  role: "assistant",
                  agent: "debugger",
                  content: msg,
                  timestamp: new Date(),
                },
              ]);
              persistMessage("assistant", msg, "debugger");
            }

            resolve(parsed);
          },
          onError: (err) => {
            addConsole("stderr", `Debugger error: ${err}`, "debugger");
            resolve(null);
          },
          signal,
        });
      });
    },
    [addConsole, persistMessage],
  );

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

      try {
        // 1. PLANNER
        setAgentState("planning");
        addConsole("info", "▸ Starting agent pipeline…");
        addConsole(
          "agent",
          `Analyzing: "${content.substring(0, 80)}"`,
          "planner",
        );

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
          "planner",
        );

        const planMsg = `**Plan created** — ${plan.steps.length} steps using **${plan.language}**\n\n${plan.summary}\n\n${plan.steps.map((s, i) => `${i + 1}. ${s.title}`).join("\n")}`;
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
            i === 0 ? { ...s, status: "in-progress" as const } : s,
          ),
        );

        // 2. CODER
        const coderResult = await runCoderAgent(content, plan, signal);

        if (!coderResult) {
          setAgentState("error");
          setIsLoading(false);
          return;
        }

        setSteps((prev) =>
          prev.map((s) => ({ ...s, status: "done" as const })),
        );

        // 3. EXECUTE
        addConsole("info", "▸ Executing generated code…");
        setAgentState("coding");

        let currentFiles = coderResult.files;
        let execResult: ExecutionResult;

        try {
          execResult = await executeCode(currentFiles, plan.language);
        } catch (err) {
          addConsole(
            "stderr",
            `Execution error: ${err instanceof Error ? err.message : "Unknown error"}`,
          );
          setAgentState("error");
          setIsLoading(false);
          return;
        }

        addConsole(
          execResult.exitCode === 0 ? "stdout" : "stderr",
          execResult.exitCode === 0
            ? execResult.stdout || "No output"
            : execResult.stderr || "Unknown error",
        );

        // 4. AUTO-DEBUG LOOP
        const effectiveLang = plan.language.toLowerCase();
        const isWeb = isWebLanguage(effectiveLang);

        while (execResult.exitCode !== 0 && retryCountRef.current < 3) {
          if (
            isWeb &&
            (execResult.stderr ?? "").toLowerCase().includes("timeout")
          ) {
            addConsole(
              "info",
              "▸ Timeout on visual page — treating as rendered successfully.",
            );
            execResult = { ...execResult, exitCode: 0 };
            break;
          }

          retryCountRef.current++;
          addConsole(
            "info",
            `▸ Error detected — auto-debug attempt ${retryCountRef.current}/3…`,
          );

          const debugResult = await runDebuggerAgent(
            content,
            currentFiles,
            execResult.stderr ?? "Unknown error",
            retryCountRef.current,
            plan.language,
            signal,
          );

          if (!debugResult || debugResult.fixes.length === 0) {
            addConsole("stderr", "Debugger could not produce a fix.");
            break;
          }

          currentFiles = debugResult.fixes;

          addConsole("info", "▸ Re-executing fixed code…");
          try {
            execResult = await executeCode(currentFiles, plan.language);
          } catch (err) {
            addConsole("stderr", `Re-execution error: ${err instanceof Error ? err.message : "Unknown"}`);
            break;
          }
          addConsole(
            execResult.exitCode === 0 ? "stdout" : "stderr",
            execResult.exitCode === 0
              ? execResult.stdout || "No output"
              : execResult.stderr || "Unknown error",
          );
        }

        if (execResult.exitCode === 0) {
          setAgentState("complete");
          addConsole("info", "▸ Pipeline complete ✓");
        } else {
          setAgentState("error");
          addConsole(
            "stderr",
            "▸ Max retries reached — manual intervention needed.",
          );
        }

        // 5. PERSIST
        if (
          projectId &&
          projectId !== "new" &&
          projectId !== "demo"
        ) {
          updateProject.mutate({
            id: projectId,
            title: content.substring(0, 60),
            description: content.substring(0, 200),
            language: plan.language,
            plan: plan.steps as any,
            generated_code: currentFiles as any,
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
      updateProject,
      executeCode,
    ],
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
    handleSendMessage,
    handleFileChange,
    handleCreateFile,
    handleRenameFile,
    handleDeleteFile,
    handleRestoreSnapshot,
    handleRunCode,
    clearConsole,
  };
}