# edge-llm-relay

一个面向跨地域调用的 Cloudflare Workers LLM 网关。

项目核心目标：
- 低延迟：结合 Cloudflare Smart Placement + 全球边缘节点，尽量把 Worker 运行位置贴近目标上游 API。
- 稳定访问：为末端用户提供统一且更稳定的 OpenAI/Anthropic 兼容入口。
- 易于扩展：通过环境变量快速切换/新增上游服务商，无需改业务调用方。

适用场景：
- 你不在目标端点所在国家（或地区），但希望稳定调用该地区的 LLM 端点。
- 你的目标模型服务不在本国，跨境链路抖动明显。
- 你希望同一套客户端 SDK 兼容不同厂商端点。

## 这个网关做了什么

当前 Worker 统一支持以下协议入口：
- OpenAI Chat Completions: `/v1/chat/completions`
- Anthropic Messages: `/anthropic/v1/messages`
- OpenAI Models 列表: `/v1/models`（可开关）
- Relay 用量元数据: `/v1/usage`（可选，返回 provider 原生 usage 的归一化视图）

同时支持带前缀和不带前缀两种路径：
- 不带前缀：`/v1/*`、`/anthropic/v1/*`
- 带前缀：`/<ROUTE_PREFIX>/v1/*`、`/<ROUTE_PREFIX>/anthropic/v1/*`

例如当 `ROUTE_PREFIX=yourprefix` 时，可以使用：
- `/yourprefix/v1/chat/completions`
- `/yourprefix/anthropic/v1/messages`
- `/yourprefix/v1/models`
- `/yourprefix/v1/usage`

## 内置示例（可直接部署）

`wrangler.jsonc` 现在内置五套可直接部署的环境示例：

1. `baidu`
- Smart Placement Host: `qianfan.baidubce.com:443`
- OpenAI 兼容上游：`https://qianfan.baidubce.com/v2/coding`
- Anthropic 兼容上游：`https://qianfan.baidubce.com/anthropic/coding`
- 适合作为中国端点聚合入口（可承载百度千帆等模型能力）

2. `jd`
- Smart Placement Host: `modelservice.jdcloud.com:443`
- OpenAI 兼容上游：`https://modelservice.jdcloud.com/coding/openai/v1`
- Anthropic 兼容上游：`https://modelservice.jdcloud.com/coding/anthropic`
- 已带 `describeUserActivePlan` 的 `/v1/usage` 鉴权配置

3. `zai`
- Smart Placement Host: `api.z.ai:443`
- OpenAI 兼容上游：`https://api.z.ai/api/coding/paas/v4`
- Anthropic 兼容上游：`https://api.z.ai/api/anthropic`
- 已带 `quota/limit` 的 `/v1/usage` 鉴权配置

4. `gateway`
- 一个 Worker 同时服务 `baidu` 和 `jd` 两套路由前缀
- 通过 `PROVIDERS_CONFIG` 按前缀区分上游、模型列表和 usage 鉴权
- `DEFAULT_PROVIDER_PREFIX=baidu`，所以不带前缀的 `/v1/*` 默认落到百度

5. `minimax`
- Smart Placement Host: `api.minimaxi.com:443`
- OpenAI 兼容上游：`https://api.minimaxi.com/v1`
- Anthropic 兼容上游：`https://api.minimaxi.com/anthropic`
- 面向 MiniMax 中国端点

## 快速开始

### 1) 安装依赖

```bash
pnpm install
```

### 2) 本地开发

默认环境：

```bash
pnpm dev
```

指定环境：

```bash
pnpm dev --env baidu
pnpm dev --env jd
pnpm dev --env zai
pnpm dev --env gateway
pnpm dev --env minimax
```

### 3) 部署

部署百度示例：

```bash
pnpm exec wrangler deploy --env baidu
```

部署 Baidu/JD 共用网关：

```bash
pnpm exec wrangler deploy --env gateway
```

部署 MiniMax 示例：

```bash
pnpm exec wrangler deploy --env minimax
```

## 调用示例

> 将 `YOUR_WORKER_URL` 替换为你部署后的 Worker 域名，将 `YOUR_ROUTE_PREFIX` 替换为当前环境的 `ROUTE_PREFIX`，将 `YOUR_UPSTREAM_KEY` 替换为目标上游 API Key。

OpenAI Chat Completions：

```bash
curl -X POST "https://YOUR_WORKER_URL/YOUR_ROUTE_PREFIX/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_UPSTREAM_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ernie-4.5-turbo-20260402",
    "messages": [{"role":"user","content":"你好"}],
    "stream": false
  }'
```

Anthropic Messages：

```bash
curl -X POST "https://YOUR_WORKER_URL/YOUR_ROUTE_PREFIX/anthropic/v1/messages" \
  -H "Authorization: Bearer YOUR_UPSTREAM_KEY" \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-3-7-sonnet",
    "max_tokens": 256,
    "messages": [{"role":"user","content":"你好"}]
  }'
```

## 关键配置

通过 Worker 环境变量即可调整行为：

- `ROUTE_PREFIX`: 路由前缀（示例：`baidu`、`minimax`）
- `UPSTREAM_BASE_URL`: OpenAI 兼容上游地址
- `ANTHROPIC_UPSTREAM_BASE_URL`: Anthropic 兼容上游地址
- `MODELS_ENABLED`: 是否开放根path下的 `/v1/models`（默认 `true`）
- `MODELS_JSON`: 自定义覆盖 `/v1/models` 接口返回列表（支持 JSON 数组或按模型名分组的 JSON 对象）
- `UPSTREAM_CONTROL_AUTH`: 给非标准 provider 控制台/usage 接口使用的结构化鉴权材料
- `USAGE_QUERY_CONFIG`: 获取并归一化 provider 原生 usage 接口的结构化请求配置
- `PROVIDERS_CONFIG`: 单个 Worker 同时承载多个 provider 时使用的前缀到配置映射
- `DEFAULT_PROVIDER_PREFIX`: 配合 `PROVIDERS_CONFIG` 使用时，不带前缀 `/v1/*` 默认落到哪个 provider

示例：

```json
[
  { "id": "your-model-1" },
  { "id": "your-model-2", "owned_by": "your-provider", "created": 1775601600 }
]
```

也支持这种按模型名分组的对象格式：

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

`UPSTREAM_CONTROL_AUTH` 用来承载 provider 自己的控制面接口鉴权信息，比如
usage、plan、quota、console metadata 这类不走标准 OpenAI/Anthropic 鉴权的
接口。建议按 profile 分组，这样同一 provider 下不同操作可以带不同的
headers、cookies 或 query 参数，而不需要再改配置模型：

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

`USAGE_QUERY_CONFIG` 用来告诉 relay 应该调用哪个 provider 原生 usage 接口，
以及要绑定哪个 auth profile：

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

`PROVIDERS_CONFIG` 用来把运行时从“单 provider”提升成“按前缀分流的 provider
表”。内置的 `gateway` 环境就是靠这个机制同时代理 Baidu 和 JD：

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

## 延迟优化说明

该项目的低延迟来自两层：
- 入口就近：用户请求先进入 Cloudflare 最近边缘节点。
- 上游贴近：Smart Placement 根据 `placement.host` 尽量把 Worker 调度到更靠近上游服务的位置，降低 Worker -> 上游链路时延。

这类“末端用户在 A 地、目标端点在 B 地”的跨地域场景，收益通常明显。

## 测试与验证

```bash
pnpm test
pnpm smoke
```

> `pnpm smoke` 需要你在环境变量中准备对应上游密钥。

## 目录结构

- `src/index.ts`: Worker 入口与路由转发逻辑
- `wrangler.jsonc`: 部署与多环境（baidu/jd/zai/gateway/minimax）配置
- `test/index.spec.ts`: 单元测试
- `scripts/smoke-test.sh`: 烟雾测试脚本

## 备注

如果你需要对接更多厂商（例如新增一个中国区或海外端点），通常只需要：
1. 在 `wrangler.jsonc` 新增一个 `env` 配置。
2. 设置对应的 `placement.host` 和上游 URL。
3. 按新环境部署并把客户端请求切到对应前缀。
