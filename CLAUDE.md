# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lore is a local-first AI-powered thought capture and recall desktop app built with Electron + React + TypeScript. It uses Ollama for LLM inference and LanceDB for vector storage. All data and processing stays on the user's machine.

## Commands

```bash
npm run dev          # Start Vite dev server with Electron
npm run build        # Typecheck + build + package for current platform
npm run build:win    # Build Windows installer
npm run build:mac    # Build macOS installer
npm run build:linux  # Build Linux AppImage
npm run typecheck    # Run TypeScript type checking (both configs)
npm run lint         # Run ESLint
npm test             # Run unit tests (Vitest)
npm run test:watch   # Run tests in watch mode
npm run reset-db     # Reset local LanceDB database
```

## Architecture

### Process Model (Electron)

- **Main process** (`electron/main.ts`): App lifecycle, tray, windows, Ollama bootstrap, LanceDB initialization, Obsidian watchers
- **Preload** (`electron/preload.ts`): IPC bridge exposing APIs to renderer via `contextBridge`
- **Renderer** (`src/`): React UI for chat, settings, and setup windows

### Core Services (electron/services/)

| Service | Responsibility |
|---------|----------------|
| `agentService.ts` | Main conversation orchestrator; routes user input through classification → handler pipeline |
| `classifierService.ts` | Uses LLM to classify input intent (thought/question/command/instruction/conversational) |
| `lanceService.ts` | Vector database operations (LanceDB); stores documents with embeddings |
| `documentPipeline.ts` | RAG pipeline: embedding, retrieval, scoring, relevance cutoff |
| `ollamaService.ts` | Ollama API client; model listing, pulling, chat streaming |
| `ollamaBootstrap.ts` | Manages embedded Ollama installation and startup |
| `obsidianService.ts` | Obsidian vault syncing, file watching, change tracking |

### Intent Handler Flow

User input flows through:
1. `agentService.processUserInput()` - entry point
2. `classifierService.classifyInput()` - LLM classifies intent
3. `applyDeterministicRoutingHints()` - heuristic overrides for edge cases
4. Dispatches to specific handler in `electron/services/handlers/`:
   - `thoughtHandler.ts` - stores new thoughts/todos
   - `questionHandler.ts` - RAG retrieval + answer generation
   - `commandHandler.ts` - modifies/deletes existing data
   - `instructionHandler.ts` - saves persistent instructions
   - `conversationalHandler.ts` - casual chat, help queries

### Skills System

LLM prompts live in `skills/*.md` files and are loaded at runtime by `skillLoader.ts`. Each skill is a markdown template with placeholders (e.g., `{currentDate}`).

### Shared Types

`shared/types.ts` contains all shared TypeScript interfaces between main and renderer processes. Key types:
- `LoreDocument` - stored document with vector embedding
- `AgentEvent` - streaming event union (status/chunk/stored/error/done)
- `ClassificationResult` - LLM classification output
- `AppSettings` - user preferences including Obsidian config

### IPC Structure

All IPC handlers registered in `electron/ipc/handlers.ts`. Renderer calls via `window.api.*` (typed in `src/types/electron.d.ts`).

## Coding Conventions

- No abbreviations; use full descriptive names
- Strongly type everything; no `any`
- Use `interface` for object shapes, `type` for unions
- Prefer named imports; group: external → internal → relative
- Keep functions small; use early returns and guard clauses
- Only comment non-obvious intent/trade-offs
- Functional React components only
