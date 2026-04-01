// src/components/workspace/PreviewPanel.tsx

import { useEffect, useRef, useState, useMemo } from "react";
import { Eye, RefreshCw, AlertTriangle, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import PanelHeader from "./PanelHeader";
import type { CodeFile } from "./CodePanel";
import { sanitizeHtml, bundleWebFiles, isServerSideFile } from "@/lib/browserExecutor";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PreviewPanelProps {
  files: CodeFile[];
  visible?: boolean;
}

type PreviewMode = "html" | "react" | "js" | "backend" | "none";

// ─── Language detection ───────────────────────────────────────────────────────

function detectMode(files: CodeFile[]): PreviewMode {
  if (files.length === 0) return "none";

  const browserFiles = files.filter((f) => !isServerSideFile(f));

  if (browserFiles.length === 0) return "backend";

  const hasHtml = browserFiles.some(
    (f) => f.language === "html" || f.filename.endsWith(".html"),
  );
  const hasReact = browserFiles.some(
    (f) =>
      f.language === "react" ||
      f.filename.endsWith(".tsx") ||
      f.filename.endsWith(".jsx") ||
      (["javascript", "typescript"].includes(f.language) &&
        /\breact\b/i.test(f.code) &&
        /<[A-Z][A-Za-z]*[\s/>]/.test(f.code)),
  );
  const hasJs = browserFiles.some(
    (f) => f.language === "javascript" || f.language === "typescript",
  );
  const hasCss = browserFiles.some((f) => f.language === "css");

  if (hasReact) return "react";
  if (hasHtml || (hasCss && hasJs)) return "html";
  if (hasJs || hasCss) return "js";
  return "none";
}

// ─── HTML builders ────────────────────────────────────────────────────────────

/** React/JSX preview via Babel Standalone + React 18 UMD */
function buildReactPreview(files: CodeFile[]): string {
  const browserFiles = files.filter((f) => !isServerSideFile(f));
  const mainFile =
    browserFiles.find(
      (f) =>
        f.filename.endsWith(".tsx") ||
        f.filename.endsWith(".jsx") ||
        f.language === "react",
    ) ??
    browserFiles.find((f) => ["javascript", "typescript"].includes(f.language)) ??
    browserFiles[0];

  const cssFiles = browserFiles.filter((f) => f.language === "css");
  const inlineCss = cssFiles.map((f) => f.code).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin><\/script>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2/dist/tailwind.min.css" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: system-ui, sans-serif; }
    #preview-error {
      color: #f87171; background: #1a0a0a; border: 1px solid #7f1d1d;
      border-radius: 6px; padding: 12px 16px; margin: 16px;
      font-family: monospace; font-size: 13px; white-space: pre-wrap;
    }
    ${inlineCss}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-presets="react,typescript">
    window.onerror = (_m, _s, _l, _c, err) => {
      document.getElementById('root').innerHTML =
        '<div id="preview-error">' + (err ? err.message : _m) + '</div>';
      return true;
    };
    try {
      ${mainFile.code}
      const _root = document.getElementById('root');
      if (typeof App !== 'undefined') {
        ReactDOM.createRoot(_root).render(React.createElement(App));
      }
    } catch (e) {
      document.getElementById('root').innerHTML =
        '<div id="preview-error">' + e.name + ': ' + e.message + '</div>';
    }
  <\/script>
</body>
</html>`;
}

/** Multi-file HTML preview — strips broken paths, inlines browser-safe CSS + JS only. */
function buildHtmlPreview(files: CodeFile[]): string {
  if (files.length > 1) return bundleWebFiles(files);

  const htmlFile = files.find(
    (f) => f.language === "html" || f.filename.endsWith(".html"),
  );
  if (htmlFile) return sanitizeHtml(htmlFile.code);

  const cssFiles = files.filter((f) => f.language === "css");
  if (cssFiles.length > 0) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { margin: 0; padding: 0; font-family: system-ui, sans-serif; }
    ${cssFiles.map((f) => f.code).join("\n")}
  </style>
</head>
<body>
  <div class="container">
    <h1>CSS Preview</h1>
    <p>Your styles have been applied here.</p>
    <button class="btn">Sample Button</button>
    <div class="card"><span>Sample Card</span></div>
  </div>
</body>
</html>`;
  }

  return bundleWebFiles(files);
}

/** Plain JS/TS preview with coloured console output. */
function buildJsPreview(files: CodeFile[]): string {
  const browserFiles = files.filter((f) => !isServerSideFile(f));
  const cssFiles = browserFiles.filter((f) => f.language === "css");
  const jsFiles = browserFiles.filter(
    (f) => f.language === "javascript" || f.language === "typescript",
  );

  const inlineCss = cssFiles.map((f) => f.code).join("\n");
  const rawJs = jsFiles.map((f) => f.code).join("\n\n");

  const js = rawJs
    .replace(/:\s*(string|number|boolean|any|void|object|unknown|never|null|undefined)(\[\])?(?=\s*[,);=|&\n{])/g, "")
    .replace(/\binterface\s+\w+[\s\S]*?\n\}/gm, "")
    .replace(/\btype\s+\w+\s*=[\s\S]*?;/g, "")
    .replace(/<[A-Z][A-Za-z]*(?:\s*,\s*[A-Z][A-Za-z]*)*>/g, "");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: system-ui, sans-serif; background: #0f1117; color: #e2e8f0; margin: 0; padding: 16px; }
    #app { margin-bottom: 16px; }
    #console-output {
      background: #1a1e2e; border: 1px solid #2d3348; border-radius: 8px;
      padding: 12px; font-family: monospace; font-size: 13px;
      white-space: pre-wrap; min-height: 40px; color: #a0aec0;
    }
    .console-label {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
      color: #4a5568; margin-bottom: 4px;
    }
    ${inlineCss}
  </style>
</head>
<body>
  <div id="app"></div>
  <div class="console-label">Console</div>
  <pre id="console-output"></pre>
  <script>
    const _out = document.getElementById('console-output');
    const _origLog = console.log, _origWarn = console.warn, _origErr = console.error;
    const _write = (prefix, color, args) => {
      const line = document.createElement('span');
      line.style.color = color;
      line.textContent = prefix + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '\\n';
      _out.appendChild(line);
    };
    console.log   = (...a) => { _write('',    '#a0aec0', a); _origLog(...a); };
    console.warn  = (...a) => { _write('⚠ ',  '#f6e05e', a); _origWarn(...a); };
    console.error = (...a) => { _write('✖ ',  '#fc8181', a); _origErr(...a); };
    window.onerror = (_m, _s, _l, _c, e) => { console.error(e ? e.message : _m); return true; };
    try {
${js}
    } catch(e) { console.error(e.message); }
  <\/script>
</body>
</html>`;
}

/** Shown when all generated files are server-side (e.g. pure Express app). */
function buildBackendPlaceholder(files: CodeFile[]): string {
  const serverFiles = files.filter((f) => isServerSideFile(f));
  const fileList = serverFiles.map((f) => `• ${f.filename}`).join("\n");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: system-ui, sans-serif; background: #0f1117; color: #e2e8f0;
           display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
    .card { background:#1a1e2e; border:1px solid #2d3348; border-radius:12px;
            padding:32px 40px; text-align:center; max-width:420px; }
    h2 { margin:0 0 8px; color:#a78bfa; font-size:18px; }
    p  { margin:0 0 16px; color:#94a3b8; font-size:14px; line-height:1.5; }
    pre { background:#0f1117; border:1px solid #2d3348; border-radius:8px;
          padding:12px; font-size:12px; text-align:left; color:#64748b; white-space:pre-wrap; }
    .hint { margin-top:12px; font-size:12px; color:#475569; }
  </style>
</head>
<body>
  <div class="card">
    <h2>⚙️ Backend Project</h2>
    <p>This project runs server-side and cannot be previewed in the browser.</p>
    <pre>${fileList}</pre>
    <p class="hint">Use the Console panel to see execution output.</p>
  </div>
</body>
</html>`;
}

// ─── Component ────────────────────────────────────────────────────────────────

const PreviewPanel = ({ files, visible = true }: PreviewPanelProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const mode = useMemo(() => detectMode(files), [files]);

  const previewHTML = useMemo<string | null>(() => {
    if (files.length === 0) return null;
    try {
      switch (mode) {
        case "react":   return buildReactPreview(files);
        case "html":    return buildHtmlPreview(files);
        case "js":      return buildJsPreview(files);
        case "backend": return buildBackendPlaceholder(files);
        default:        return null;
      }
    } catch (err) {
      console.error("Preview generation error:", err);
      setIframeError(err instanceof Error ? err.message : "Failed to build preview");
      return null;
    }
  }, [files, mode, refreshKey]);

  // Update iframe srcdoc when previewHTML changes
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !previewHTML) return;

    setIsUpdating(true);
    setIframeError(null);

    try {
      // Use srcdoc instead of writing to document
      iframe.srcdoc = previewHTML;
    } catch (e) {
      setIframeError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsUpdating(false);
    }
  }, [previewHTML]);

  if (!visible) return null;

  if (mode === "none" || !previewHTML) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader title="Preview" icon={Eye} iconColor="text-accent" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Eye className="h-8 w-8 opacity-20" />
          <p className="text-sm">No previewable files yet</p>
          <p className="text-xs opacity-60">
            HTML, CSS, JS, or React files will render here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="Preview" icon={Eye} iconColor="text-accent">
        <span
          className={`text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded select-none ${
            mode === "backend"
              ? "bg-violet-500/10 text-violet-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {mode === "backend" ? (
            <span className="flex items-center gap-1">
              <Server className="h-2.5 w-2.5" />
              backend
            </span>
          ) : (
            mode
          )}
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Refresh preview"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </PanelHeader>

      {iframeError && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 border-b border-destructive/30 text-destructive text-xs font-mono">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate">{iframeError}</span>
        </div>
      )}

      <div className="flex-1 min-h-0 bg-white">
        <iframe
          ref={iframeRef}
          key={refreshKey}
          sandbox="allow-scripts allow-modals"
          className="w-full h-full border-0"
          title="Preview"
          srcdoc={previewHTML}
        />
      </div>
    </div>
  );
};

export default PreviewPanel;