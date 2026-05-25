<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# CompStat Municipal RJ — Agent Context

## Stack
- Next.js 16 (App Router), TypeScript strict, Tailwind CSS v4, MapLibre GL JS
- Vercel AI SDK (`ai`, `@ai-sdk/anthropic`) for agent streaming
- Claude Sonnet 4.6 (agent + synthesis) + Haiku 4.5 (RELINT)
- Offline JSON artifacts (`areas_data.json`, `rio_context.json`) — no live DB

## Key Conventions
- 13 map layers in `MapView.tsx` (`LayerVisibility` interface). Rio Inteiro layers are lazy-loaded.
- 5 tabs in `AreaPanel.tsx` (`TabId` type). Tab "Mancha Criminal" includes demographics card.
- ~42 agent tools in `api/agent/route.ts`. Hook handlers in `hooks/useMapAgent.ts`.
- Server-only modules (`censoData.ts`, `areasData.ts`, `ontologyScore.ts`) exposed via API routes, never imported in client components.
- All data assertions cite source inline via FONTES rules in agent system prompt.
- Test with `npm run test:run` (93 Vitest tests, 7 suites). Build with `npm run build`.

## Common Mistakes to Avoid
- Never import `server-only` modules in client components — use API routes
- Never confuse DD (Disque Denúncia) data with Chamados 1746 — different sources
- `rio_context.json` is ~10MB — always lazy-load, never import statically
- `LayerVisibility` state tracked in both `useState` and `useRef` — update both
