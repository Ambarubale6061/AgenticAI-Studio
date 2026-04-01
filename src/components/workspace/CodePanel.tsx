import { useState, useCallback } from "react";
import { Code2, Copy, Download, Check, Plus, X, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PanelHeader from "./PanelHeader";
import Editor from "@monaco-editor/react";

export interface CodeFile {
  id: string;
  filename: string;
  language: string;
  code: string;
}

interface CodePanelProps {
  files: CodeFile[];
  activeFileId?: string;
  onSelectFile?: (id: string) => void;
  onFileChange?: (id: string, code: string) => void;
  onRunCode?: () => void;
  isRunning?: boolean;
}

const langMap: Record<string, string> = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  html: "html",
  css: "css",
  json: "json",
  bash: "shell",
  text: "plaintext",
};

const langBadge: Record<string, string> = {
  javascript: "JS",
  typescript: "TS",
  python: "PY",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  bash: "SH",
};

const CodePanel = ({ files, activeFileId, onSelectFile, onFileChange, onRunCode, isRunning }: CodePanelProps) => {
  const [copied, setCopied] = useState(false);
  const active = files.find(f => f.id === activeFileId) || files[0];

  const handleCopy = async () => {
    if (!active) return;
    await navigator.clipboard.writeText(active.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!active) return;
    const blob = new Blob([active.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = active.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined && active && onFileChange) {
      onFileChange(active.id, value);
    }
  }, [active, onFileChange]);

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="Code" icon={Code2} iconColor="text-agent-coder">
        {active && (
          <div className="flex items-center gap-1">
            {onRunCode && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 gap-1 text-[10px] font-semibold text-agent-coder hover:bg-agent-coder/10"
                onClick={onRunCode}
                disabled={isRunning}
              >
                <Play className="h-3 w-3" />
                Run
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3 text-agent-coder" /> : <Copy className="h-3 w-3" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDownload}>
              <Download className="h-3 w-3" />
            </Button>
          </div>
        )}
      </PanelHeader>

      {files.length > 1 && (
        <div className="flex items-center gap-0.5 px-1 py-0.5 border-b border-panel-border bg-panel-header/50 overflow-x-auto">
          {files.map(f => (
            <button
              key={f.id}
              onClick={() => onSelectFile?.(f.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-t text-xs font-mono transition-all ${
                f.id === active?.id
                  ? "bg-background text-foreground border-b-2 border-agent-coder"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              {f.filename}
              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-panel-border">
                {langBadge[f.language] || f.language}
              </Badge>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0">
        {active ? (
          <Editor
            height="100%"
            language={langMap[active.language] || "plaintext"}
            value={active.code}
            onChange={handleEditorChange}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineHeight: 20,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontLigatures: true,
              padding: { top: 8, bottom: 8 },
              scrollBeyondLastLine: false,
              renderLineHighlight: "gutter",
              bracketPairColorization: { enabled: true },
              autoClosingBrackets: "always",
              autoClosingQuotes: "always",
              suggestOnTriggerCharacters: true,
              tabSize: 2,
              wordWrap: "on",
              smoothScrolling: true,
              cursorBlinking: "smooth",
              cursorSmoothCaretAnimation: "on",
              roundedSelection: true,
              overviewRulerBorder: false,
              scrollbar: {
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
              },
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-muted-foreground/60">Code will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodePanel;
