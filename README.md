# AgenticAI Code

> A full-stack, browser-based AI coding workspace where a coordinated pipeline of agents — planner, coder, and debugger — collaborate to take a user prompt from idea to running code.

![AgenticAI Code Workspace](src/assets/hero-visual.jpg)

---

## Table of Contents

- [Overview](#overview)
- [Live Demo](#live-demo)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Features](#features)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Supabase Setup](#supabase-setup)
- [Edge Functions](#edge-functions)
- [Agent Pipeline](#agent-pipeline)
- [Execution Engine](#execution-engine)
- [Agent Memory System](#agent-memory-system)
- [Version Control](#version-control)
- [Workspace UI](#workspace-ui)
- [Authentication & Routing](#authentication--routing)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Overview

**AgenticAI Code** is a full-stack AI-powered IDE where three specialized AI agents collaborate autonomously to turn a plain-English prompt into runnable, debugged code — all in real time.

You describe what you want to build. The **Planner Agent** breaks it into structured steps. The **Coder Agent** writes production-quality code for each step. The **Debugger Agent** catches execution errors and applies fixes automatically, retrying up to three times. The entire pipeline streams live into a multi-panel workspace UI.

The application supports a **demo mode** (no signup required, 1 free run) and a full authenticated experience backed by Supabase with persistent projects and conversation history.

---

## Live Demo

Navigate to `/workspace/demo` to try the full agent pipeline without creating an account. Demo mode is limited to one run per browser session, after which a signup prompt is shown.

---

## Tech Stack

### Frontend

| Layer           | Technology                             |
| --------------- | -------------------------------------- |
| Framework       | React 18 + TypeScript                  |
| Build Tool      | Vite 5 (SWC)                           |
| Routing         | React Router v6                        |
| State / Data    | TanStack Query v5                      |
| UI Components   | Radix UI + shadcn/ui                   |
| Styling         | Tailwind CSS v3                        |
| Animations      | Framer Motion                          |
| Code Editor     | Monaco Editor (`@monaco-editor/react`) |
| Markdown        | `react-markdown`                       |
| Toasts          | Sonner                                 |
| Date Formatting | date-fns                               |

### Backend / Infrastructure

| Layer          | Technology                                                   |
| -------------- | ------------------------------------------------------------ |
| BaaS           | Supabase (Postgres, Auth, Storage)                           |
| Edge Functions | Deno (Supabase Functions)                                    |
| AI / LLM       | Groq API (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`) |
| Streaming      | Server-Sent Events (SSE)                                     |

### Testing

| Tool            | Purpose                  |
| --------------- | ------------------------ |
| Vitest          | Unit / integration tests |
| Testing Library | React component tests    |
| Playwright      | End-to-end tests         |

---

## Architecture

```
Browser (React SPA)
│
├── Pages: Index / Login / Signup / Dashboard / Workspace
├── Hooks: useAgentPipeline · useProjects · useAuth
├── Lib:   agentStream · agentMemory · versionControl · browserExecutor
│
│  HTTP / SSE streaming
│
Supabase Edge Functions (Deno)
├── agent-planner   — Structured JSON plan, non-streaming
├── agent-coder     — File generation, SSE streaming
├── agent-debugger  — Error diagnosis & fixes, SSE streaming
└── code-executor   — AI-simulated execution for non-web languages
│
│  REST / Realtime
│
Supabase Platform
├── Postgres DB:  projects · messages tables
├── Auth:         Email/password (Supabase Auth)
└── RLS:          Row-level security per user
│
│  GROQ_API_KEY
│
Groq Cloud (LLM inference)
└── llama-3.3-70b-versatile (planner · coder · debugger)
└── llama-3.1-8b-instant    (code executor simulation)
```

---

## Features

### Multi-Agent Pipeline

- **Planner Agent** — Analyzes the user prompt, selects the appropriate language (JavaScript, TypeScript, Python, HTML, CSS, Bash), and returns a structured 3–7 step JSON plan.
- **Coder Agent** — Receives the plan and generates complete, runnable file(s) via SSE streaming. Outputs a JSON array of `{ filename, language, code }` objects plus an explanation.
- **Debugger Agent** — On execution failure, receives the error output and the full code, diagnoses the root cause, and returns corrected file(s) with a confidence rating (`high / medium / low`). Auto-retries up to 3 times.

### Hybrid Code Execution

- **Browser sandbox** — JavaScript, TypeScript, HTML, and CSS are executed in a sandboxed `<iframe>` with `console.log` intercepted via `postMessage`. Real execution with a configurable timeout (default 5 s).
- **AI simulation** — Python, Bash, and other server-side languages are sent to the `code-executor` edge function, which uses an LLM to produce realistic stdout/stderr/exitCode output.

### Workspace UI

- Resizable panel layout (Chat · Plan · Code · Console · Preview) using `react-resizable-panels`
- Panel sizes persist across sessions via `localStorage`
- Monaco Editor with syntax highlighting for all supported languages
- Live preview panel for HTML/CSS/JS output
- Sidebar with File Manager (create, rename, delete files) and Version History
- Full mobile layout with tab-based navigation (Chat · Code · Preview · Console)
- Keyboard shortcut: `Ctrl/Cmd + Enter` to run code

### Project Management (Dashboard)

- Create, rename, duplicate, and delete projects
- Export all generated files as a `.txt` bundle
- Search/filter projects by title or description
- Project cards show language, status, step count, and last-updated time

### Agent Memory

- Error/fix pairs are stored in `localStorage` (up to 50 entries, keyed by language)
- On each debug attempt, similar past fixes are retrieved via keyword matching and injected into the debugger prompt as context
- Improves fix accuracy over repeated sessions

### Version Control (Snapshots)

- Every successful code generation creates a labeled snapshot (`v1`, `v2`, …)
- Up to 20 snapshots per project, stored in `localStorage`
- One-click restore from the Versions sidebar panel

### Auth & Demo Mode

- Supabase email/password authentication with `AuthProvider` context
- Protected routes redirect unauthenticated users to `/login`
- Demo workspace (`/workspace/demo`) is publicly accessible with a 1-run limit enforced via `localStorage`

---

## Project Structure

```
├── src/
│   ├── assets/                  # Static assets (hero image)
│   ├── components/
│   │   ├── ui/                  # shadcn/ui primitives
│   │   ├── workspace/
│   │   │   ├── AgentStatus.tsx  # Live agent state indicator
│   │   │   ├── ChatPanel.tsx    # Conversation UI with markdown rendering
│   │   │   ├── CodePanel.tsx    # Monaco editor + file tabs
│   │   │   ├── ConsolePanel.tsx # Execution output log
│   │   │   ├── FileManager.tsx  # Sidebar file tree
│   │   │   ├── PanelHeader.tsx  # Shared panel header component
│   │   │   ├── PlanPanel.tsx    # Step-by-step plan with status icons
│   │   │   ├── PreviewPanel.tsx # HTML/CSS/JS live preview iframe
│   │   │   └── VersionPanel.tsx # Snapshot list + restore
│   │   ├── NavLink.tsx
│   │   └── ProtectedRoute.tsx
│   ├── hooks/
│   │   ├── useAgentPipeline.ts  # Core pipeline orchestration hook
│   │   ├── useAuth.tsx          # Supabase auth context
│   │   ├── useProjects.ts       # CRUD queries via TanStack Query
│   │   ├── use-mobile.tsx       # Responsive breakpoint hook
│   │   └── use-toast.ts
│   ├── integrations/supabase/
│   │   ├── client.ts            # Supabase JS client singleton
│   │   └── types.ts             # Generated DB types
│   ├── lib/
│   │   ├── agentMemory.ts       # localStorage-backed error/fix memory
│   │   ├── agentStream.ts       # SSE streaming + agent API callers
│   │   ├── browserExecutor.ts   # Sandboxed iframe JS execution
│   │   ├── utils.ts             # Tailwind cn() helper
│   │   └── versionControl.ts   # Snapshot save/restore
│   ├── pages/
│   │   ├── Dashboard.tsx        # Project list page
│   │   ├── Index.tsx            # Landing / marketing page
│   │   ├── Login.tsx
│   │   ├── Signup.tsx
│   │   ├── Workspace.tsx        # Main IDE page
│   │   └── NotFound.tsx
│   ├── App.tsx                  # Router + providers
│   └── main.tsx                 # React root
│
├── supabase/
│   ├── functions/
│   │   ├── agent-planner/       # Deno edge function
│   │   ├── agent-coder/         # Deno edge function (streaming)
│   │   ├── agent-debugger/      # Deno edge function (streaming)
│   │   └── code-executor/       # Deno edge function
│   ├── migrations/              # SQL migration files
│   └── config.toml
│
├── .env                         # Local environment variables
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── playwright.config.ts
└── vitest.config.ts
```

---

## Getting Started

### Prerequisites

- Node.js 18+ (or Bun)
- A [Supabase](https://supabase.com) project
- A [Groq](https://console.groq.com) API key

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/agenticai-code.git
cd agenticai-code

# Install dependencies (npm or bun)
npm install
# or
bun install
```

### Local Development

```bash
npm run dev
# Vite dev server starts at http://localhost:8080
```

### Build

```bash
npm run build         # Production build
npm run build:dev     # Development build
npm run preview       # Preview production build locally
```

---

## Environment Variables

Create a `.env` file in the project root (copy from `.env.example` if present):

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-key>
VITE_SUPABASE_PROJECT_ID=<your-project-ref>
```

All variables are prefixed with `VITE_` and are inlined at build time by Vite. **Do not store secrets in these variables** — they are exposed to the browser. The Groq API key lives exclusively in Supabase Edge Function secrets (see below).

---

## Supabase Setup

### 1. Create Tables

Run the migration file in `supabase/migrations/` via the Supabase dashboard SQL editor or the Supabase CLI:

```bash
supabase db push
```

The schema includes:

**`projects`** — stores project metadata and generated artefacts:

- `id`, `user_id`, `title`, `description`, `language`, `status`
- `plan` (JSONB) — array of plan steps
- `generated_code` (JSONB) — array of `{ filename, language, code }`
- `console_output` (JSONB)
- `created_at`, `updated_at`

**`messages`** — stores per-project conversation history:

- `id`, `project_id`, `user_id`, `role` (`user|assistant`), `agent` (`planner|coder|debugger`), `content`
- `created_at`

### 2. Row-Level Security

Enable RLS on both tables and add policies so users can only access their own rows. Example:

```sql
alter table projects enable row level security;

create policy "Users can manage their own projects"
  on projects for all
  using (auth.uid() = user_id);
```

### 3. Edge Function Secrets

Set the Groq API key as a Supabase secret (never committed to source control):

```bash
supabase secrets set GROQ_API_KEY=gsk_...
```

---

## Edge Functions

All four edge functions live in `supabase/functions/` and are deployed as Deno serverless functions. Each handles CORS preflight automatically.

### `agent-planner`

- **Method:** POST
- **Input:** `{ prompt: string, conversationHistory?: Message[] }`
- **Output:** `{ steps: [{ title, description }], language, summary }` (JSON, non-streaming)
- **Model:** `llama-3.3-70b-versatile`
- **Notes:** Returns a 3–7 step structured plan. Strips markdown fences from the LLM response before parsing JSON.

### `agent-coder`

- **Method:** POST
- **Input:** `{ prompt, plan, language, conversationHistory? }`
- **Output:** SSE stream → final JSON `{ files: [{ filename, language, code }], explanation }`
- **Model:** `llama-3.3-70b-versatile` (streaming)
- **Notes:** Generates complete, runnable files. The frontend accumulates the SSE stream and parses it on `[DONE]`.

### `agent-debugger`

- **Method:** POST
- **Input:** `{ code: [{ filename, language, code }], error: string, prompt, retryCount }`
- **Output:** SSE stream → final JSON `{ diagnosis, fixes: [...], explanation, confidence }`
- **Model:** `llama-3.3-70b-versatile` (streaming)
- **Notes:** Receives agent memory context appended to the error string. Returns complete corrected files, not diffs.

### `code-executor`

- **Method:** POST
- **Input:** `{ files: [{ filename, language, code }], language }`
- **Output:** `{ stdout, stderr, exitCode, executionTime }` (JSON, non-streaming)
- **Model:** `llama-3.1-8b-instant` (fast, smaller model sufficient for simulation)
- **Notes:** Used only for non-web languages (Python, Bash, etc.). Web languages (JS/TS/HTML/CSS) are executed natively in the browser sandbox.

### Deploy Edge Functions

```bash
supabase functions deploy agent-planner
supabase functions deploy agent-coder
supabase functions deploy agent-debugger
supabase functions deploy code-executor
```

---

## Agent Pipeline

The full pipeline is orchestrated by `useAgentPipeline` (`src/hooks/useAgentPipeline.ts`):

```
User sends prompt
        │
        ▼
  [1] Planner Agent
      ─ callPlannerAgent() → JSON plan + language
      ─ Sets steps in PlanPanel (all "pending")
        │
        ▼
  [2] Coder Agent
      ─ streamAgentResponse("agent-coder") → SSE
      ─ parseCoderResponse() → files[]
      ─ Updates CodePanel with generated files
        │
        ▼
  [3] Execute Code
      ─ canExecuteLocally(lang)?
        YES → executeInBrowser() (sandboxed iframe)
        NO  → executeCodeRemote() (code-executor function)
        │
        ▼
  [4] Auto-Debug Loop (max 3 retries)
      ─ exitCode !== 0?
        YES → runDebuggerAgent()
              ─ getMemoryContext() → inject past fixes
              ─ streamAgentResponse("agent-debugger")
              ─ Apply fixes → re-execute → repeat
        NO  → Pipeline complete ✓
        │
        ▼
  [5] Persist to Supabase
      ─ updateProject() → saves title, plan, generated_code
      ─ saveMessage() → saves each agent's chat message
```

Agent state transitions: `idle → planning → coding → debugging → complete | error`

An `AbortController` is attached to every pipeline run so that sending a new message cancels the in-flight requests cleanly.

---

## Execution Engine

`src/lib/browserExecutor.ts` provides hybrid execution:

**Browser sandbox (real execution)**

- Creates a hidden `<iframe sandbox="allow-scripts">`
- Injects a wrapper that overrides `console.log/warn/info/error` to relay output via `postMessage`
- Strips TypeScript type annotations before executing TS code
- 5-second timeout with automatic cleanup
- Supported: `javascript`, `typescript`, `html`, `css`

**AI simulation (remote)**

- Sends files to the `code-executor` edge function
- LLM produces realistic stdout/stderr/exitCode for Python, Bash, etc.
- Falls back gracefully if the function is unavailable

---

## Agent Memory System

`src/lib/agentMemory.ts` implements a lightweight learning layer persisted in `localStorage`:

- **Storage:** Up to 50 entries (`agenticai_agent_memory`), oldest evicted first
- **Entry shape:** `{ errorPattern, fix, language, confidence, timestamp }`
- **Retrieval:** Keyword-based matching (≥30% keyword overlap) filtered by language, returning the 5 most recent matches
- **Injection:** Matched entries are formatted and appended to the debugger's error input so the LLM can reference prior successful fixes

This means the debugger gets smarter with repeated use — common mistakes in a given language get resolved faster over time.

---

## Version Control

`src/lib/versionControl.ts` provides in-browser snapshot management:

- Snapshots are stored in `localStorage` under a per-project key (`agenticai_snapshots_<projectId>`)
- Maximum of 20 snapshots per project (FIFO eviction)
- Each snapshot stores the complete `CodeFile[]` array with a label (`v1`, `v2`, …) and timestamp
- Snapshots are listed in the Versions sidebar tab and can be restored with a single click
- Restoring a snapshot replaces the current file set and logs a message to the console

---

## Workspace UI

The `Workspace` page (`src/pages/Workspace.tsx`) is the core IDE interface.

### Desktop Layout

```
┌─────────────────────────────────────────────────────────┐
│  Header: Logo · ProjectID · AgentStatus · Preview · Nav │
├──────────┬──────────────────────────────────┬───────────┤
│ Sidebar  │  Chat Panel                      │           │
│ ─────── │  ──────────                      │  Preview  │
│  Files   │  Plan Panel (resizable)          │  Panel    │
│    or    │  ──────────                      │ (toggle)  │
│ Versions │  Code Editor (Monaco, resizable) │           │
│          │  ──────────                      │           │
│          │  Console Panel (resizable)       │           │
└──────────┴──────────────────────────────────┴───────────┘
```

- All panels are resizable; layout sizes persist to `localStorage`
- Sidebar (file tree / version history) can be collapsed
- Preview panel is shown automatically when HTML/CSS/JS files are generated
- `Ctrl/Cmd + Enter` triggers manual code execution

### Mobile Layout

- Single-column layout with tab bar: Chat · Code · Preview · Console
- Responsive breakpoint detected at 768 px
- Header collapses to logo + agent status only

### Demo Mode Behavior

- Banner labels the workspace as `DEMO`
- After 1 pipeline run (tracked in `localStorage`), a signup modal is shown
- Demo sessions are not persisted to Supabase

---

## Authentication & Routing

`App.tsx` sets up the full provider tree and route definitions:

| Route                   | Access    | Component               |
| ----------------------- | --------- | ----------------------- |
| `/`                     | Public    | `Index` (landing page)  |
| `/login`                | Public    | `Login`                 |
| `/signup`               | Public    | `Signup`                |
| `/dashboard`            | Protected | `Dashboard`             |
| `/workspace/demo`       | Public    | `Workspace` (demo mode) |
| `/workspace/:projectId` | Protected | `Workspace`             |
| `*`                     | Public    | `NotFound`              |

`ProtectedRoute` wraps authenticated routes — unauthenticated users are redirected to `/login`. Auth state is managed by `AuthProvider` which wraps Supabase's `onAuthStateChange` listener.

---

## Testing

### Unit / Integration Tests (Vitest)

```bash
npm run test          # Run once
npm run test:watch    # Watch mode
```

Test files live alongside source files or in `src/test/`. The Vitest config uses `jsdom` as the test environment and `@testing-library/react` for component tests.

### End-to-End Tests (Playwright)

```bash
npx playwright test
```

Config is in `playwright.config.ts`. A shared fixture is defined in `playwright-fixture.ts`.

---

## Deployment

### Frontend (Vite SPA)

Build and deploy the `dist/` folder to any static host (Vercel, Netlify, Cloudflare Pages, etc.):

```bash
npm run build
```

Ensure the host is configured to serve `index.html` for all routes (SPA fallback).

### Supabase Edge Functions

```bash
supabase functions deploy agent-planner
supabase functions deploy agent-coder
supabase functions deploy agent-debugger
supabase functions deploy code-executor
```

Set the `GROQ_API_KEY` secret before deploying:

```bash
supabase secrets set GROQ_API_KEY=gsk_...
```

### Environment Variables for Production

Set the following in your hosting platform's environment configuration:

```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
```

---

## License

Private — all rights reserved.
