# Provider Usage Interface

This document defines a repo-local normalized interface for provider
plan/quota/entitlement data. It is intentionally separate from OpenAI and
Anthropic model APIs. The goal is to provide one stable response shape for
upstreams whose native usage APIs are incompatible.

## Raw Fixtures

Source samples are stored under:

- `test/fixtures/usage/zai-usage.sample.json`
- `test/fixtures/usage/jd-active-plan.sample.json`
- `test/fixtures/usage/baidu-quota.sample.json`

Sensitive values such as API keys, request IDs, trace IDs, and user headers are
redacted in fixtures while preserving response shape.

## Proposed Route

Use a dedicated relay-specific endpoint instead of overloading `/v1/models`:

- `GET /v1/usage`
- `GET /<ROUTE_PREFIX>/v1/usage`

This avoids relying on non-standard fields inside OpenAI-compatible model
objects.

## Proposed Response Shape

```json
{
  "object": "usage",
  "provider": {
    "id": "jd",
    "name": "JD Cloud",
    "route_prefix": "jd",
    "kind": "coding_plan",
    "interfaces": {
      "openai": {
        "compatible": true,
        "models_path": "/v1/models",
        "chat_completions_path": "/v1/chat/completions"
      },
      "anthropic": {
        "compatible": true,
        "messages_path": "/anthropic/v1/messages"
      },
      "usage": {
        "native": true
      }
    }
  },
  "plan": {
    "id": "plan-eyw1a1ah4h",
    "code": "coding-plan-pro-package.original",
    "name": "高级开发者套餐",
    "tier": "pro",
    "status": "unknown",
    "description": "高阶用户大规模编程需求",
    "default_model": "GLM-5",
    "effective_at": "2026-04-26T10:33:14",
    "expires_at": "2026-06-29T23:59:59",
    "auto_renew": false
  },
  "quotas": [
    {
      "metric": "requests",
      "scope": "plan",
      "window": {
        "value": 5,
        "unit": "hour",
        "rolling": true,
        "label": "5hours"
      },
      "limit": 1200,
      "used": 18,
      "remaining": 1182,
      "percent_used": 1.5,
      "reset_at": null,
      "breakdown": []
    }
  ],
  "entitlements": {
    "model_access": ["GLM-5", "GLM-4.7"],
    "tool_access": [],
    "priority_processing": true
  },
  "models": [
    {
      "id": "GLM-5",
      "name": "GLM-5",
      "description": "GLM-5专注于复杂系统工程和长周期智能体任务。",
      "logo_url": "https://example.com/logo.png",
      "available": true
    }
  ],
  "observed_at": "2026-05-29T22:30:12.000Z",
  "provider_meta": {
    "benefits": []
  }
}
```

## Field Definitions

### Top Level

- `object`: always `"usage"`
- `provider`: normalized provider identity and interface capabilities
- `plan`: normalized plan/subscription metadata
- `quotas`: normalized quota windows
- `entitlements`: non-quota capabilities granted by the plan
- `models`: optional list of plan-exposed models
- `observed_at`: relay observation time if available from upstream metadata
- `provider_meta`: passthrough bucket for provider-specific details not worth
  normalizing yet

### Provider

- `id`: stable provider slug such as `zai`, `jd`, `baidu`
- `name`: human-readable provider name
- `route_prefix`: relay route prefix used for this provider
- `kind`: provider class such as `coding_plan`, `llm_gateway`, `native_llm`,
  `aggregator`
- `interfaces.openai.compatible`: whether the provider is exposed through an
  OpenAI-compatible relay path
- `interfaces.anthropic.compatible`: whether the provider is exposed through an
  Anthropic-compatible relay path
- `interfaces.usage.native`: whether the usage information comes from a native
  provider API instead of an OpenAI/Anthropic-compatible endpoint

This matters because many providers expose both OpenAI-compatible and
Anthropic-compatible request APIs, while usage data comes from a different,
provider-specific endpoint family.

### Plan

- `id`: upstream plan or resource ID when available
- `code`: upstream product code when available
- `name`: human-readable plan name
- `tier`: normalized tier such as `lite`, `pro`
- `status`: normalized lifecycle state such as `active`, `expired`, `unknown`
- `description`: provider plan description when available
- `default_model`: provider default model if present
- `effective_at`: ISO 8601 timestamp or ISO-like local timestamp
- `expires_at`: ISO 8601 timestamp or ISO-like local timestamp
- `auto_renew`: boolean or `null`

### Quota Entry

- `metric`: `requests`, `tokens_input`, `tokens_output`, `tokens_total`,
  `tool_calls`
- `scope`: `account`, `plan`, `model`, `tool`
- `window.value`: numeric window size when known
- `window.unit`: `minute`, `hour`, `day`, `week`, `month`, or `null` if the
  provider uses an opaque code
- `window.rolling`: whether the window is rolling or calendar-based
- `window.label`: original provider label such as `5hours`, `week`, or a raw
  fallback label
- `limit`: allowed total for this window, or `null`
- `used`: current usage, or `null`
- `remaining`: remaining allowance, or `null`
- `percent_used`: normalized percent in range `0..100`, or `null`
- `reset_at`: ISO 8601 timestamp if the provider gives a reset moment
- `breakdown`: optional sub-usage entries, usually by model/tool
- `provider_meta`: optional bucket for raw unit codes or metric labels that
  could not be safely normalized

### Breakdown Entry

```json
{
  "type": "model",
  "id": "web-reader",
  "used": 1
}
```

Use breakdowns only when the upstream returns scoped usage. Do not infer them.

### Entitlements

Entitlements hold capabilities that are not quota windows:

- `model_access`: model IDs explicitly granted by the plan
- `tool_access`: tool IDs surfaced by the provider usage API
- `priority_processing`: boolean capability inferred only when the provider
  explicitly states it

### Models

Models in this response are plan catalog metadata, not OpenAI `/v1/models`
objects. They may later be enriched with relay-local `limit.context` and
`limit.output` data, but raw provider usage responses often do not include those
limits.

## Mapping Notes by Provider

### z.ai

- `data.level` -> `plan.tier`
- `data.limits[]` -> `quotas[]`
- `type=TIME_LIMIT` -> `metric=requests`
- `type=TOKENS_LIMIT` -> `metric=tokens_total`
- `currentValue` -> `used`
- `usage` -> `limit` when the provider is clearly returning allowance total
- `remaining` -> `remaining`
- `percentage` is preserved as `percent_used`
- `nextResetTime` is epoch milliseconds; convert to ISO 8601
- `usageDetails[]` -> `breakdown[]` with `type="model"`
- `unit` and `number` are not fully self-describing, so raw codes should remain
  in `provider_meta` when normalization is uncertain

### JD

- `result.plan_id` -> `plan.id`
- `result.code` -> `plan.code`
- `result.plan_type` -> `plan.tier`
- `result.start_time` / `end_time` -> plan timestamps
- `result.auto_renew` -> boolean
- `result.limits[]` provides request window limits
- `result.usages[]` provides used counts keyed by the same period string
- join `limits[]` and `usages[]` by `period/type`
- `remaining` and `percent_used` can be computed when both limit and used exist
- `result.models[]` maps to `models[]`
- `benefits[]` should feed `entitlements` where possible and stay in
  `provider_meta.benefits` for lossless preservation

### Baidu

- `items[0].resourceId` -> `plan.id`
- `planType` -> `plan.tier`
- `resourceStatus` -> `plan.status`
- `effectiveAt` / `expiresAt` -> plan timestamps
- `quota.*` -> `quotas[]`
- `autoRenew` -> `plan.auto_renew` and `provider_meta.auto_renew`
- `used`, `limit`, and `resetAt` are already explicit
- `remaining` and `percent_used` can be computed

## Normalization Rules

1. Preserve provider facts. Do not invent missing `used`, `limit`, or `reset`
   values.
2. Keep timestamps in ISO 8601 or ISO-like normalized strings.
3. Keep derived fields (`remaining`, `percent_used`) only when they are exact or
   safely computable.
4. Use `provider_meta` when upstream fields do not fit the common contract.
5. Keep `quotas` for measured allowances and `entitlements` for non-quantitative
   plan capabilities.
6. Do not overload `/v1/models` with usage metadata.

## Recommended Next Step

Implement a `normalizeUsage(provider, payload)` helper and unit tests that load
these fixtures and assert the normalized output for each provider. Then expose
the normalized shape through a dedicated `/v1/usage` relay endpoint.
