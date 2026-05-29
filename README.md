[Doc in Chinese 中文文档](README_cn.md)

# edge-llm-relay

A Cloudflare Workers LLM relay for:

Normalizes non‑standard third‑party coding plan / LLM APIs into OpenAI‑compatible and Anthropic‑compatible endpoints.

Supports Cloudflare AI Gateway custom providers by exposing proper /chat/completions, /models and other universal paths so you can route requests through the Gateway and get unified logging, rate limiting and observability.

Adapts to JetBrains IDE’s model listing pattern: exposes /models in the right shape so you can use third‑party backends from JetBrains AI Assistant without needing a separate OpenAI‑compatible proxy.

Accelerates endpoints that have no global CDN or international acceleration by using Cloudflare Workers + Smart Placement, pushing requests closer to end users and reducing overseas latency.

Project goals:
- Low latency: combine Cloudflare Smart Placement and global edge nodes, so the Worker runs closer to upstream API endpoints.
- Stable access: provide a unified and more reliable OpenAI/Anthropic-compatible endpoint for end users.
- Easy extension: switch/add upstream providers through environment variables, without changing business-side client logic.



## What This Relay Provides

The Worker currently supports:
- OpenAI Chat Completions: `/v1/chat/completions`
- Anthropic Messages: `/anthropic/v1/messages`
- OpenAI Models list: `/v1/models` (optional)
- Relay usage metadata: `/v1/usage` (optional, provider-native normalized view)

Both prefixed and non-prefixed routes are supported:
- Non-prefixed: `/v1/*`, `/anthropic/v1/*`
- Prefixed: `/<ROUTE_PREFIX>/v1/*`, `/<ROUTE_PREFIX>/anthropic/v1/*`

For example, when `ROUTE_PREFIX=yourprefix`, you can use:
- `/yourprefix/v1/chat/completions`
- `/yourprefix/anthropic/v1/messages`
- `/yourprefix/v1/models`
- `/yourprefix/v1/usage`

## Built-in Examples (Ready to Deploy)

`wrangler.jsonc` includes five ready-to-deploy environment examples:

1. `baidu`
- Smart Placement Host: `qianfan.baidubce.com:443`
- OpenAI-compatible upstream: `https://qianfan.baidubce.com/v2/coding`
- Anthropic-compatible upstream: `https://qianfan.baidubce.com/anthropic/coding`
- Useful as a China-region endpoint aggregation entry (including Baidu Qianfan model capabilities)

2. `jd`
- Smart Placement Host: `modelservice.jdcloud.com:443`
- OpenAI-compatible upstream: `https://modelservice.jdcloud.com/coding/openai/v1`
- Anthropic-compatible upstream: `https://modelservice.jdcloud.com/coding/anthropic`
- Includes `/v1/usage` auth config for `describeUserActivePlan`

3. `zai`
- Smart Placement Host: `api.z.ai:443`
- OpenAI-compatible upstream: `https://api.z.ai/api/coding/paas/v4`
- Anthropic-compatible upstream: `https://api.z.ai/api/anthropic`
- Includes `/v1/usage` auth config for `quota/limit`

4. `gateway`
- One Worker serving both `baidu` and `jd` prefixes from the same deployment
- Uses `PROVIDERS_CONFIG` for per-prefix upstreams, models, and usage auth
- `DEFAULT_PROVIDER_PREFIX=baidu`, so unprefixed `/v1/*` falls back to Baidu

5. `minimax`
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
pnpm dev --env jd
pnpm dev --env zai
pnpm dev --env gateway
pnpm dev --env minimax
```

### 3) Deploy

Deploy Baidu example:

```bash
pnpm exec wrangler deploy --env baidu
```

Deploy the shared Baidu/JD gateway:

```bash
pnpm exec wrangler deploy --env gateway
```

Deploy MiniMax example:

```bash
pnpm exec wrangler deploy --env minimax
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
- `MODELS_JSON`: override the `/v1/models` response list (JSON array or keyed JSON object)
- `UPSTREAM_CONTROL_AUTH`: optional structured auth material for non-standard provider control/usage APIs
- `USAGE_QUERY_CONFIG`: optional structured config for fetching and normalizing provider-native usage APIs
- `PROVIDERS_CONFIG`: optional multi-provider map for serving multiple route prefixes from a single Worker deployment
- `DEFAULT_PROVIDER_PREFIX`: optional default provider for unprefixed `/v1/*` routes when `PROVIDERS_CONFIG` is used

Example:

```json
[
  { "id": "your-model-1" },
  { "id": "your-model-2", "owned_by": "your-provider", "created": 1775601600 }
]
```

Also supports keyed objects such as:

```json
{
  "DeepSeek-V3.2": {
    "id": "DeepSeek-V3.2",
    "limit": {
      "context": 128000,
      "output": 64000
    }
  },
  "GLM-5": {
    "id": "GLM-5",
    "limit": {
      "context": 200000,
      "output": 32000
    }
  }
}
```

`UPSTREAM_CONTROL_AUTH` is for provider-specific control-plane APIs such as
usage, plan, quota, or console metadata endpoints that do not use normal
OpenAI/Anthropic request auth. Use structured profiles so different providers,
or different operations under the same provider, can carry odd headers, cookies,
or query parameters without changing the config model:

```json
{
  "profiles": {
    "usage_default": {
      "cookies": {
        "sessionid": "..."
      }
    },
    "resource_list": {
      "headers": {
        "x-custom-token": "..."
      },
      "cookies": {
        "sessionid": "..."
      },
      "query": {
        "region": "cn"
      }
    }
  }
}
```

`USAGE_QUERY_CONFIG` tells the relay which provider-native usage endpoint to
call and which auth profile to use:

```json
{
  "provider": "baidu",
  "request": {
    "url": "https://console.bce.baidu.com/api/qianfan/charge/codingPlan/resourceList",
    "method": "GET",
    "authProfile": "resource_list"
  }
}
```

`PROVIDERS_CONFIG` lifts the runtime from a single provider to a prefix-keyed
provider table. This is what the built-in `gateway` environment uses to serve
Baidu and JD from one Worker:

```json
{
  "baidu": {
    "upstreamBaseUrl": "https://qianfan.baidubce.com/v2/coding",
    "anthropicUpstreamBaseUrl": "https://qianfan.baidubce.com/anthropic/coding",
    "models": [{ "id": "ernie-4.5-turbo-20260402" }],
    "usageQuery": {
      "provider": "baidu",
      "request": {
        "url": "https://console.bce.baidu.com/api/qianfan/charge/codingPlan/resourceList",
        "authProfile": "resource_list"
      }
    }
  },
  "jd": {
    "upstreamBaseUrl": "https://modelservice.jdcloud.com/coding/openai/v1",
    "anthropicUpstreamBaseUrl": "https://modelservice.jdcloud.com/coding/anthropic",
    "models": [{ "id": "GLM-5" }]
  }
}
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
