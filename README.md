[Doc in Chinese 中文文档](README_cn.md)

# edge-llm-relay

A Cloudflare Workers LLM relay for cross-region API access.

Project goals:
- Low latency: combine Cloudflare Smart Placement and global edge nodes, so the Worker runs closer to upstream API endpoints.
- Stable access: provide a unified and more reliable OpenAI/Anthropic-compatible endpoint for end users.
- Easy extension: switch/add upstream providers through environment variables, without changing business-side client logic.

Use cases:
- You are not in the same country/region as the target endpoint, but still need stable access to that LLM API.
- Your target model service is outside your country, and cross-border network jitter is noticeable.
- You want one client SDK workflow to work across multiple providers.

## What This Relay Provides

The Worker currently supports:
- OpenAI Chat Completions: `/v1/chat/completions`
- Anthropic Messages: `/anthropic/v1/messages`
- OpenAI Models list: `/v1/models` (optional)

Both prefixed and non-prefixed routes are supported:
- Non-prefixed: `/v1/*`, `/anthropic/v1/*`
- Prefixed: `/<ROUTE_PREFIX>/v1/*`, `/<ROUTE_PREFIX>/anthropic/v1/*`

For example, when `ROUTE_PREFIX=yourprefix`, you can use:
- `/yourprefix/v1/chat/completions`
- `/yourprefix/anthropic/v1/messages`
- `/yourprefix/v1/models`

## Built-in Examples (Ready to Deploy)

`wrangler.jsonc` includes two environment examples:

1. `baidu`
- Smart Placement Host: `qianfan.baidubce.com:443`
- OpenAI-compatible upstream: `https://qianfan.baidubce.com/v2/coding`
- Anthropic-compatible upstream: `https://qianfan.baidubce.com/anthropic/coding`
- Useful as a China-region endpoint aggregation entry (including Baidu Qianfan model capabilities)

2. `minimax`
- Smart Placement Host: `api.minimaxi.com:443`
- OpenAI-compatible upstream: `https://api.minimaxi.com/v1`
- Anthropic-compatible upstream: `https://api.minimaxi.com/anthropic`
- For MiniMax China endpoints

## Quick Start

### 1) Install dependencies

```bash
pnpm install
```

### 2) Local development

Default environment:

```bash
pnpm dev
```

Specific environments:

```bash
pnpm dev --env baidu
pnpm dev --env minimax
```

### 3) Deploy

Deploy Baidu example:

```bash
pnpm deploy -- --env baidu
```

Deploy MiniMax example:

```bash
pnpm deploy -- --env minimax
```

## Request Examples

> Replace `YOUR_WORKER_URL` with your deployed Worker domain, `YOUR_ROUTE_PREFIX` with the current environment `ROUTE_PREFIX`, and `YOUR_UPSTREAM_KEY` with your upstream API key.

OpenAI Chat Completions:

```bash
curl -X POST "https://YOUR_WORKER_URL/YOUR_ROUTE_PREFIX/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_UPSTREAM_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ernie-4.5-turbo-20260402",
    "messages": [{"role":"user","content":"Hello"}],
    "stream": false
  }'
```

Anthropic Messages:

```bash
curl -X POST "https://YOUR_WORKER_URL/YOUR_ROUTE_PREFIX/anthropic/v1/messages" \
  -H "Authorization: Bearer YOUR_UPSTREAM_KEY" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-7-sonnet",
    "max_tokens": 256,
    "messages": [{"role":"user","content":"Hello"}]
  }'
```

## Key Configuration

Behavior can be adjusted via Worker environment variables:

- `ROUTE_PREFIX`: route prefix (examples: `baidu`, `minimax`)
- `UPSTREAM_BASE_URL`: OpenAI-compatible upstream base URL
- `ANTHROPIC_UPSTREAM_BASE_URL`: Anthropic-compatible upstream base URL
- `MODELS_ENABLED`: whether to expose `/v1/models` on root path (default `true`)
- `MODELS_JSON`: override the `/v1/models` response list (JSON array)

Example:

```json
[
  { "id": "your-model-1" },
  { "id": "your-model-2", "owned_by": "your-provider", "created": 1775601600 }
]
```

## Latency Optimization Notes

Low latency comes from two layers:
- Near-user ingress: requests first enter the nearest Cloudflare edge location.
- Near-upstream execution: Smart Placement uses `placement.host` to run the Worker closer to the upstream provider, reducing Worker -> upstream latency.

This architecture is usually very effective for cross-region scenarios where users and target endpoints are in different countries/regions.

## Testing

```bash
pnpm test
pnpm smoke
```

> `pnpm smoke` requires the corresponding upstream key in environment variables.

## Project Structure

- `src/index.ts`: Worker entry and route/proxy logic
- `wrangler.jsonc`: deployment and multi-environment (`baidu`/`minimax`) config
- `test/index.spec.ts`: unit tests
- `scripts/smoke-test.sh`: smoke test script

## Notes

To add more providers/endpoints (for example, another regional target), you usually only need to:
1. Add a new `env` block in `wrangler.jsonc`.
2. Set the corresponding `placement.host` and upstream URLs.
3. Deploy that environment and route client requests to its prefix.
