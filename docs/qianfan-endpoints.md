# Qianfan Coding Plan Endpoint Notes

Base URL: `https://qianfan.baidubce.com/v2/coding`

## Available

- `POST /chat/completions` works with OpenAI-style chat payloads.
- Non-stream returns `object: "chat.completion"`.
- Stream returns `text/event-stream` with `data: {...}` and `data: [DONE]`.

## Unavailable

- `GET /models` returns `401` with `coding_plan_api_key_not_allowed`.
- `POST /responses` returns `404 ResourceNotFound`.
- `POST /caching` and `GET /caching/{id}` return `404 ResourceNotFound`.

## Response Notes

- Responses include `reasoning_content`.
- `usage` includes `prompt_tokens`, `completion_tokens`, `total_tokens`.
- `usage.completion_tokens_details.reasoning_tokens` is present.
- No cache read/write fields were observed.

## Current Models

- `ernie-4.5-turbo-20260402`
- `minimax-m2.5`
- `deepseek-v3.2`
- `glm-5`
- `kimi-k2.5`
