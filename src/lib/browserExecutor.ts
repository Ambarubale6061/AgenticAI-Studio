// Hybrid execution: real browser execution for JS/HTML/CSS/React, remote for backend

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: string;
  isReal: boolean;
  previewHtml?: string;
}

// ─── Language routing ─────────────────────────────────────────────────────────

export const WEB_LANGUAGES = [
  "javascript", "html", "css", "typescript", "react", "jsx", "tsx",
];

export const BACKEND_LANGUAGES = [
  "python", "java", "node", "nodejs", "ruby", "go", "rust", "cpp", "c", "bash", "shell",
];

export function canExecuteLocally(language: string): boolean {
  return WEB_LANGUAGES.includes(language.toLowerCase());
}

// ─── Server-side file detection ───────────────────────────────────────────────

const SERVER_PATTERNS: RegExp[] = [
  /\brequire\s*\(\s*['"](?:express|mongoose|stripe|pg|mysql2?|redis|sequelize|knex|prisma|typeorm|dotenv|path|fs|http|https|crypto|os|child_process|cluster|net|tls|stream|zlib|buffer|util|events|assert|querystring|url)['"]\s*\)/,
  /\bimport\s+.*?\bfrom\s+['"](?:express|mongoose|stripe|pg|mysql2?|redis|sequelize|knex|prisma|typeorm|dotenv)['"]/,
  /\bmodule\.exports\s*=/,
  /\bprocess\.env\b/,
  /\bapp\.listen\s*\(/,
  /\bapp\.use\s*\(/,
  /mongoose\.connect\s*\(/,
  /new\s+Schema\s*\(\s*\{/,
  /Router\s*\(\s*\)/,
  /\.findOne\s*\(|\.findById\s*\(|\.save\s*\(\s*\)/,
  /stripe\s*\(\s*process/i,
  /paymentIntents\.create/,
  /bcrypt\.hash|bcrypt\.compare/,
  /jwt\.sign|jwt\.verify/,
  /cors\s*\(\s*\)/,
  /bodyParser\.|express\.json\(\)/,
];

const SERVER_FILENAMES = new Set([
  "server.js", "server.ts", "app.js", "app.ts",
  "index.js",  // only if it has server patterns — checked separately
  "database.js", "database.ts", "db.js", "db.ts",
  "payment.js", "payment.ts",
  "auth.js", "auth.ts",
  "routes.js", "routes.ts",
  "middleware.js", "middleware.ts",
  "models.js", "models.ts",
  "config.js", "config.ts",
]);

export function isServerSideFile(file: {
  filename: string;
  code: string;
}): boolean {
  const base = file.filename.split("/").pop()?.toLowerCase() ?? "";

  // Hard filename matches (still verify code to avoid false positives)
  if (SERVER_FILENAMES.has(base)) {
    // "index.js" is often a frontend entry — only exclude if code has server patterns
    if (base === "index.js" || base === "index.ts") {
      return SERVER_PATTERNS.some((p) => p.test(file.code));
    }
    return true;
  }

  // Pattern-based detection for any filename
  return SERVER_PATTERNS.some((p) => p.test(file.code));
}

// ─── Fix #2: Strip broken relative paths from AI-generated HTML ───────────────

export function sanitizeHtml(html: string): string {
  return (
    html
      // Remove <script src="/src/..."> injected by AI (Vite entry points)
      .replace(/<script[^>]+src=["'][^"']*\/src\/[^"']*["'][^>]*>\s*<\/script>/gi, "")
      // Remove <link href="/src/..."> or any stylesheet pointing to local paths
      .replace(/<link[^>]+href=["'][^"']*\/src\/[^"']*["'][^>]*\/?>/gi, "")
      // Remove <link rel="stylesheet" href="./..."> relative paths
      .replace(/<link[^>]+href=["']\.\/[^"']*["'][^>]*\/?>/gi, "")
      // Remove ES module script tags pointing to local files
      .replace(/<script[^>]+type=["']module["'][^>]+src=["'][^"']*["'][^>]*>\s*<\/script>/gi, "")
      // Remove bare import statements for local paths that 404 in iframe
      .replace(/^\s*import\s+.*?from\s+["'][./]+(?:src|components|pages|lib|hooks)[^"']*["'];?\s*$/gm, "")
  );
}

// ─── HTML page builders (with fixed 'done' message) ──────────────────────────

function buildReactHtml(code: string): string {
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
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-presets="react,typescript">
    const _p = window.parent;
    const _log = (...a) => _p.postMessage({ type:'log', data: a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' ') }, '*');
    const _err = (msg) => _p.postMessage({ type:'error', data: msg }, '*');
    console.log = _log; console.warn = _log; console.info = _log;
    console.error = (...a) => _err(a.join(' '));
    window.onerror = (_m, _s, _l, _c, err) => {
      _err(err ? err.message : _m);
      document.getElementById('root').innerHTML =
        '<div id="preview-error">' + (err ? err.message : _m) + '</div>';
      return true;
    };
    try {
      ${code}
      const _root = document.getElementById('root');
      if (typeof App !== 'undefined') {
        ReactDOM.createRoot(_root).render(React.createElement(App));
      }
    } catch (e) {
      _err(e.name + ': ' + e.message);
      document.getElementById('root').innerHTML =
        '<div id="preview-error">' + e.name + ': ' + e.message + '</div>';
    } finally {
      setTimeout(() => _p.postMessage({ type: 'done' }, '*'), 500);
    }
  <\/script>
</body>
</html>`;
}

function buildJsHtml(code: string, language: string): string {
  const jsCode =
    language === "typescript"
      ? code
          .replace(/:\s*(string|number|boolean|any|void|object|unknown|never|null|undefined)(\[\])?(?=\s*[,);=|&\n{])/g, "")
          .replace(/\binterface\s+\w+[\s\S]*?\n\}/gm, "")
          .replace(/\btype\s+\w+\s*=[\s\S]*?;/g, "")
          .replace(/<[A-Z][A-Za-z]*(?:\s*,\s*[A-Z][A-Za-z]*)*>/g, "")
      : code;

  return `<!DOCTYPE html><html><body><script>
const _p = window.parent;
const _log = (...a) => _p.postMessage({ type:'log', data: a.map(x=>typeof x==='object'?JSON.stringify(x,null,2):String(x)).join(' ') }, '*');
const _err = (msg) => _p.postMessage({ type:'error', data: msg }, '*');
console.log=_log; console.warn=_log; console.info=_log;
console.error = (...a) => _err(a.join(' '));
window.onerror = (_m,_s,_l,_c,e) => { _err(e?e.message:_m); return true; };
try {
${jsCode}
} catch(e) { _err(e.name+': '+e.message); }
finally {
  _p.postMessage({ type:'done' }, '*');
}
<\/script></body></html>`;
}

function buildFullHtml(rawHtml: string): string {
  let html = sanitizeHtml(rawHtml);

  const bridge = `<script>
(function(){
  const _p = window.parent;
  const _ol = console.log, _ow = console.warn, _oi = console.info, _oe = console.error;
  const _fmt = (a) => a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' ');
  console.log   = (...a) => { _p.postMessage({type:'log',   data:_fmt(a)},'*'); _ol(...a); };
  console.warn  = (...a) => { _p.postMessage({type:'log',   data:_fmt(a)},'*'); _ow(...a); };
  console.info  = (...a) => { _p.postMessage({type:'log',   data:_fmt(a)},'*'); _oi(...a); };
  console.error = (...a) => { _p.postMessage({type:'error', data:_fmt(a)},'*'); _oe(...a); };
  window.onerror = (_m,_s,_l,_c,e) => { _p.postMessage({type:'error',data:e?e.message:_m},'*'); return true; };
  setTimeout(() => _p.postMessage({type:'done'},'*'), 800);
})();
<\/script>`;

  if (html.includes("</body>")) {
    html = html.replace(/<\/body>/i, bridge + "</body>");
  } else if (html.includes("</html>")) {
    html = html.replace(/<\/html>/i, bridge + "</html>");
  } else {
    html += bridge;
  }

  return html;
}

function buildCssHtml(css: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>${css}</style>
  <script>
    const _p = window.parent;
    setTimeout(() => _p.postMessage({type:'done'},'*'), 800);
  <\/script>
</head>
<body>
  <div class="container">
    <h1>CSS Preview</h1>
    <p>Your styles have been applied to this page.</p>
    <button class="btn">Sample Button</button>
    <div class="card"><span>Sample Card</span></div>
  </div>
</body>
</html>`;
}

// ─── Main executor ────────────────────────────────────────────────────────────

export function executeInBrowser(
  code: string,
  language: string,
  timeout = 10000,
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    const logs: string[] = [];
    const errors: string[] = [];
    const lang = language.toLowerCase();

    const isVisualLang =
      lang === "html" ||
      lang === "react" ||
      lang === "jsx" ||
      lang === "tsx" ||
      lang === "css";

    const iframe = document.createElement("iframe");
    iframe.sandbox.add("allow-scripts");
    iframe.style.cssText = "display:none;position:fixed;top:-9999px;left:-9999px;";
    document.body.appendChild(iframe);

    const cleanup = () => {
      try { document.body.removeChild(iframe); } catch { /* already removed */ }
    };

    let finished = false;
    const finish = (timedOut = false) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      window.removeEventListener("message", handler);
      const elapsed = `${((performance.now() - start) / 1000).toFixed(2)}s`;

      if (timedOut && isVisualLang && errors.length === 0) {
        cleanup();
        resolve({
          stdout: logs.join("\n") || "Page rendered (no console output)",
          stderr: "",
          exitCode: 0,
          executionTime: elapsed,
          isReal: true,
        });
        return;
      }

      cleanup();
      resolve({
        stdout: logs.join("\n") || (errors.length === 0 ? "Code executed successfully (no output)" : ""),
        stderr: errors.join("\n"),
        exitCode: errors.length > 0 ? 1 : 0,
        executionTime: elapsed,
        isReal: true,
      });
    };

    const timer = setTimeout(() => finish(true), timeout);

    const handler = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      const { type, data } = event.data ?? {};
      if (type === "log") logs.push(data);
      else if (type === "error") errors.push(data);
      else if (type === "done") finish(false);
    };
    window.addEventListener("message", handler);

    let html: string;
    switch (lang) {
      case "react":
      case "jsx":
      case "tsx":
        html = buildReactHtml(code);
        break;
      case "css":
        html = buildCssHtml(code);
        break;
      case "javascript":
      case "typescript":
        html = buildJsHtml(code, lang);
        break;
      case "html":
      default:
        html = buildFullHtml(code);
        break;
    }

    try {
      const doc = iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      } else {
        finish(false);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Iframe write failed");
      finish(false);
    }
  });
}

// ─── Multi-file bundler ───────────────────────────────────────────────────────

export function bundleWebFiles(
  files: Array<{ filename: string; language: string; code: string }>,
): string {
  const browserFiles = files.filter((f) => !isServerSideFile(f));
  const serverFiles = files.filter((f) => isServerSideFile(f));

  if (browserFiles.length === 0) {
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
    h2 { margin:0 0 8px; color:#a78bfa; }
    p  { margin:0 0 16px; color:#94a3b8; font-size:14px; }
    pre { background:#0f1117; border:1px solid #2d3348; border-radius:8px;
          padding:12px; font-size:12px; text-align:left; color:#64748b; white-space:pre-wrap; }
  </style>
</head>
<body>
  <div class="card">
    <h2>⚙️ Backend Project</h2>
    <p>This project runs server-side — no browser preview available.</p>
    <pre>${fileList}</pre>
  </div>
</body>
</html>`;
  }

  const htmlFile = browserFiles.find(
    (f) =>
      f.language === "html" ||
      f.filename.endsWith(".html") ||
      f.filename.endsWith(".htm"),
  );
  const cssFiles = browserFiles.filter(
    (f) => f.language === "css" || f.filename.endsWith(".css"),
  );
  const jsFiles = browserFiles.filter(
    (f) =>
      (f.language === "javascript" ||
        f.language === "typescript" ||
        f.filename.endsWith(".js") ||
        f.filename.endsWith(".ts")) &&
      !f.filename.endsWith(".test.ts") &&
      !f.filename.endsWith(".spec.ts"),
  );

  let baseHtml = htmlFile
    ? sanitizeHtml(htmlFile.code)
    : "<!DOCTYPE html><html><head></head><body></body></html>";

  if (cssFiles.length > 0) {
    const styleTag = `<style>\n${cssFiles.map((f) => f.code).join("\n\n")}\n</style>`;
    if (baseHtml.includes("</head>")) {
      baseHtml = baseHtml.replace(/<\/head>/i, styleTag + "</head>");
    } else {
      baseHtml = styleTag + baseHtml;
    }
  }

  if (jsFiles.length > 0) {
    const scriptTag = `<script>\n${jsFiles.map((f) => f.code).join("\n\n")}<\/script>`;
    if (baseHtml.includes("</body>")) {
      baseHtml = baseHtml.replace(/<\/body>/i, scriptTag + "</body>");
    } else {
      baseHtml += scriptTag;
    }
  }

  return baseHtml;
}