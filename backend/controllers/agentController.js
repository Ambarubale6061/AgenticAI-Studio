// backend/controllers/agentController.js
import { streamGroqChat } from "../services/groqService.js";
import fetch from "node-fetch";

// ─── Enhanced Prompts for Multi‑File Projects ────────────────────────────────
const SYSTEM_PROMPTS = {
  planner: `You are the Planner Agent in a multi-agent coding system.
Analyze the user's request and decide:
1. The project type: "static" (HTML/CSS/JS), "react" (React with components), or "node" (Node.js backend).
2. A structured step-by-step plan to build it.

You MUST respond with valid JSON only. No markdown, no extra text. Format:
{
  "projectType": "static" | "react" | "node",
  "steps": [
    { "title": "Step title", "description": "Brief description" }
  ],
  "language": "javascript" | "typescript" | "html",
  "summary": "One sentence summary"
}

Rules:
- Create 3–7 steps.
- If the user wants a React app, set projectType to "react".
- If they want a backend (API, server), set projectType to "node".
- Otherwise default to "static".`,

  coder: `You are the Coder Agent. You receive a plan and generate a complete, runnable project.

CRITICAL: Respond with a single valid JSON object. No extra text. No markdown fences.

Format:
{
  "files": [
    {
      "filename": "src/components/Header.jsx",
      "language": "react",
      "code": "import React from 'react';\\n\\nfunction Header() {\\n  return <header>Hello</header>;\\n}\\n\\nexport default Header;"
    }
  ],
  "explanation": "Brief description of the generated code"
}

Project Type Guidelines:

**Static (HTML/CSS/JS)**:
- Generate index.html, style.css, script.js (or multiple files as needed).

**React**:
- Generate a minimal React app with:
  - public/index.html (the entry point that loads the root div)
  - src/index.jsx (or .tsx) – renders App component
  - src/App.jsx – main component
  - src/components/ (optional sub‑components)
  - package.json (with react, react-dom, and scripts)
- Use functional components and modern React (hooks).
- Ensure the HTML includes a div with id="root".

**Node.js**:
- Generate a simple Express server.
- Files: package.json, server.js (or app.js), routes/ (if needed).
- Include basic error handling and a few endpoints.

Important:
- All filenames should include their relative path (e.g., "src/App.js").
- Use proper file extensions (.jsx for React, .js for Node, .html for HTML).
- Code must be complete and runnable.
- For React, do NOT use external CDNs in the code; the preview system will bundle it.
- Escape double quotes inside strings with \\" and newlines with \\n.`,

  debugger: `You are the Debugger Agent. Analyze errors and provide fixes.
Respond with valid JSON:
{
  "diagnosis": "...",
  "fixes": [
    { "filename": "...", "language": "...", "code": "..." }
  ],
  "explanation": "...",
  "confidence": "high|medium|low"
}`,

  executor: `You are a Code Execution Simulator. Simulate running the given code.
Return JSON:
{
  "stdout": "...",
  "stderr": "...",
  "exitCode": 0,
  "executionTime": "0.12s"
}`,
};

// Helper to repair JSON
function repairJson(raw) {
  let cleaned = raw.trim();
  // Remove any leading/trailing text that isn't JSON
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  // Remove markdown fences
  cleaned = cleaned.replace(/^```json\s*\n?/i, "").replace(/^```\s*\n?/i, "");
  cleaned = cleaned.replace(/\n?```\s*$/i, "");
  // Fix trailing commas
  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");
  // Quote unquoted keys
  cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');
  // Escape unescaped newlines in string literals (basic)
  cleaned = cleaned.replace(/(?<!\\)\n/g, "\\n");
  return cleaned;
}

// POST /api/agent/planner
export const planner = async (req, res) => {
  try {
    const { prompt } = req.body;
    const messages = [
      { role: "system", content: SYSTEM_PROMPTS.planner },
      { role: "user", content: prompt },
    ];
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages,
          stream: false,
        }),
      },
    );
    if (!response.ok) {
      const err = await response.text();
      return res
        .status(response.status)
        .json({ error: `Groq error: ${response.status}` });
    }
    const data = await response.json();
    const content = data.choices[0].message.content;
    let plan;
    try {
      plan = JSON.parse(repairJson(content));
    } catch {
      plan = {
        projectType: "static",
        steps: [
          { title: "Build project", description: content.substring(0, 100) },
        ],
        language: "javascript",
        summary: content.substring(0, 200),
      };
    }
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/agent/coder (streaming)
export const coder = async (req, res) => {
  try {
    const { plan, prompt, language } = req.body;
    const projectType = plan?.projectType || "static";
    const userContent = `Original request: ${prompt}\nProject type: ${projectType}\nLanguage: ${language}\nPlan:\n${(
      plan?.steps || []
    )
      .map((s, i) => `${i + 1}. ${s.title}: ${s.description}`)
      .join("\n")}`;
    const messages = [
      { role: "system", content: SYSTEM_PROMPTS.coder },
      { role: "user", content: userContent },
    ];
    // Use streamGroqChat (Node.js stream)
    await streamGroqChat(messages, "llama-3.3-70b-versatile", res);
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
};

// POST /api/agent/debugger (streaming)
export const debuggerAgent = async (req, res) => {
  try {
    const { code, error: errorMsg, prompt, retryCount } = req.body;
    const filesStr = (code || [])
      .map((f) => `--- ${f.filename} ---\n${f.code}`)
      .join("\n\n");
    const userContent = `Original: ${prompt}\nRetry: ${retryCount}/3\nCode:\n${filesStr}\nError:\n${errorMsg}`;
    const messages = [
      { role: "system", content: SYSTEM_PROMPTS.debugger },
      { role: "user", content: userContent },
    ];
    await streamGroqChat(messages, "llama-3.3-70b-versatile", res);
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
};

// POST /api/agent/execute (non-streaming)
export const execute = async (req, res) => {
  try {
    const { files, language } = req.body;
    const filesStr = files
      .map((f) => `--- ${f.filename} ---\n${f.code}`)
      .join("\n\n");
    const messages = [
      { role: "system", content: SYSTEM_PROMPTS.executor },
      { role: "user", content: `Simulate executing:\n${filesStr}` },
    ];
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages,
          stream: false,
        }),
      },
    );
    if (!response.ok) throw new Error(`Groq error: ${response.status}`);
    const data = await response.json();
    const content = data.choices[0].message.content;
    let result;
    try {
      result = JSON.parse(repairJson(content));
    } catch {
      result = {
        stdout: content,
        stderr: "",
        exitCode: 0,
        executionTime: "0.1s",
      };
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
