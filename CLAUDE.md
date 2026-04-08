# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Cloudflare Workers gateway that proxies OpenAI-compatible API requests to Baidu's Qianfan coding API. It translates standard OpenAI endpoints to Baidu's upstream format.

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start local development server |
| `pnpm deploy` | Deploy to Cloudflare Workers |
| `pnpm test` | Run unit tests (vitest) |
| `pnpm smoke` | Run smoke tests against deployed worker (requires BAIDU_KEY in .env) |
| `pnpm cf-typegen` | Generate TypeScript types after changing wrangler.jsonc bindings |

## Architecture

**Single Worker Entry Point**: `src/index.ts` exports a fetch handler that:

1. **Models Endpoint** (`/v1/models` or `/baidu/v1/models`): Returns a static list of available Qianfan models in OpenAI format
2. **Chat Completions** (`/v1/chat/completions` or `/baidu/v1/chat/completions`): Proxies POST requests to `https://qianfan.baidubce.com/v2/coding/chat/completions`
3. **Error Handling**: Returns OpenAI-style error responses for 404/405/401 cases

**Key Implementation Details**:
- Smart placement configured to host near `qianfan.baidubce.com:443` for reduced latency
- Passes through Authorization headers, streaming responses, and upstream errors unchanged
- Both `/v1/*` and `/baidu/v1/*` paths are supported for flexibility
- Returns static model list; upstream `/models` endpoint is not available (see `docs/qianfan-endpoints.md`)

## Testing

- **Unit Tests**: `test/index.spec.ts` uses `@cloudflare/vitest-pool-workers` with mocked fetch
- **Smoke Tests**: `scripts/smoke-test.sh` runs integration tests against a deployed worker (set TARGET_URL and BAIDU_KEY)

## Cloudflare Workers Notes

This project uses:
- Node.js compatibility flag (`nodejs_compat`)
- Observability with 100% head sampling
- Source map uploads for debugging

After modifying bindings in `wrangler.jsonc`, run `pnpm cf-typegen` to update TypeScript types.
