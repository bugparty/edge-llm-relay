import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

const originalFetch = globalThis.fetch;

afterEach(() => {
	vi.restoreAllMocks();
	globalThis.fetch = originalFetch;
});

describe("baidu gateway worker", () => {
	it("returns a static OpenAI-compatible model list", async () => {
		const request = new IncomingRequest("http://example.com/baidu/v1/models");
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			object: "list",
			data: [
				{
					id: "ernie-4.5-turbo-20260402",
					object: "model",
					created: 1775601600,
					owned_by: "baidu-qianfan",
				},
				{
					id: "minimax-m2.5",
					object: "model",
					created: 1775601600,
					owned_by: "baidu-qianfan",
				},
				{
					id: "deepseek-v3.2",
					object: "model",
					created: 1775601600,
					owned_by: "baidu-qianfan",
				},
				{
					id: "glm-5",
					object: "model",
					created: 1775601600,
					owned_by: "baidu-qianfan",
				},
				{
					id: "kimi-k2.5",
					object: "model",
					created: 1775601600,
					owned_by: "baidu-qianfan",
				},
			],
		});
	});

	it("supports the root OpenAI-compatible models path", async () => {
		const request = new IncomingRequest("http://example.com/v1/models");
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			object: "list",
			data: expect.arrayContaining([expect.objectContaining({ id: "glm-5" })]),
		});
	});

	it("returns 405 for invalid methods", async () => {
		const request = new IncomingRequest("http://example.com/baidu/v1/models", {
			method: "POST",
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(405);
		await expect(response.json()).resolves.toMatchObject({
			error: { code: "method_not_allowed" },
		});
	});

	it("returns 404 for unknown paths", async () => {
		const request = new IncomingRequest("http://example.com/nope");
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toMatchObject({
			error: { code: "not_found" },
		});
	});

	it("rejects chat requests without authorization", async () => {
		const request = new IncomingRequest("http://example.com/baidu/v1/chat/completions", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: "glm-5", messages: [] }),
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toMatchObject({
			error: { code: "missing_authorization" },
		});
	});

	it("proxies chat completions to the fixed upstream endpoint", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe(
				"https://qianfan.baidubce.com/v2/coding/chat/completions?trace=1",
			);
			expect(init?.method).toBe("POST");

			const headers = new Headers(init?.headers);
			expect(headers.get("authorization")).toBe("Bearer test-key");
			expect(headers.get("content-type")).toBe("application/json");

			const bodyText = await new Response(init?.body).text();
			expect(JSON.parse(bodyText)).toEqual({
				model: "glm-5",
				messages: [{ role: "user", content: "hi" }],
				stream: false,
			});

			return new Response(
				JSON.stringify({
					id: "resp_123",
					object: "chat.completion",
					model: "glm-5",
				}),
				{
					status: 200,
					headers: { "content-type": "application/json; charset=utf-8" },
				},
			);
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const request = new IncomingRequest(
			"http://example.com/baidu/v1/chat/completions?trace=1",
			{
				method: "POST",
				headers: {
					authorization: "Bearer test-key",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					model: "glm-5",
					messages: [{ role: "user", content: "hi" }],
					stream: false,
				}),
			},
		);
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			id: "resp_123",
			object: "chat.completion",
			model: "glm-5",
		});
	});

	it("supports the root OpenAI-compatible chat path", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("https://qianfan.baidubce.com/v2/coding/chat/completions");
			expect(init?.method).toBe("POST");
			return new Response(JSON.stringify({ object: "chat.completion", model: "glm-5" }), {
				status: 200,
				headers: { "content-type": "application/json; charset=utf-8" },
			});
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const request = new IncomingRequest("http://example.com/v1/chat/completions", {
			method: "POST",
			headers: {
				authorization: "Bearer test-key",
				"content-type": "application/json",
			},
			body: JSON.stringify({ model: "glm-5", messages: [] }),
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			object: "chat.completion",
			model: "glm-5",
		});
	});

	it("passes through upstream error responses", async () => {
		globalThis.fetch = vi.fn(async () => {
			return new Response(
				JSON.stringify({
					error: {
						code: "coding_plan_model_not_supported",
						message: "The current model does not support Coding Plan",
					},
				}),
				{
					status: 403,
					headers: { "content-type": "application/json; charset=utf-8" },
				},
			);
		}) as typeof fetch;

		const request = new IncomingRequest("http://example.com/baidu/v1/chat/completions", {
			method: "POST",
			headers: {
				authorization: "Bearer test-key",
				"content-type": "application/json",
			},
			body: JSON.stringify({ model: "not-a-real-model", messages: [] }),
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({
			error: { code: "coding_plan_model_not_supported" },
		});
	});

	it("passes through streaming responses without rewriting", async () => {
		globalThis.fetch = vi.fn(async () => {
			return new Response('data: {"delta":{"reasoning_content":"x"}}\n\ndata: [DONE]\n\n', {
				status: 200,
				headers: { "content-type": "text/event-stream; charset=utf-8" },
			});
		}) as typeof fetch;

		const request = new IncomingRequest("http://example.com/baidu/v1/chat/completions", {
			method: "POST",
			headers: {
				authorization: "Bearer test-key",
				"content-type": "application/json",
			},
			body: JSON.stringify({ model: "glm-5", messages: [], stream: true }),
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
		await expect(response.text()).resolves.toBe(
			'data: {"delta":{"reasoning_content":"x"}}\n\ndata: [DONE]\n\n',
		);
	});
});
