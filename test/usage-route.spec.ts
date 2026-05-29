import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import baiduQuotaSample from "./fixtures/usage/baidu-quota.sample.json";
import jdActivePlanSample from "./fixtures/usage/jd-active-plan.sample.json";
import zaiUsageSample from "./fixtures/usage/zai-usage.sample.json";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const originalFetch = globalThis.fetch;

function withRuntimeEnv(overrides: Record<string, unknown> = {}): Env {
	return { ...env, ...overrides } as Env;
}

afterEach(() => {
	vi.restoreAllMocks();
	globalThis.fetch = originalFetch;
});

describe("usage query route", () => {
	it("fetches upstream usage data and returns normalized output", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const upstreamRequest =
				input instanceof Request ? input : new Request(input, init);
			expect(upstreamRequest.url).toBe(
				"https://console.bce.baidu.com/api/qianfan/charge/codingPlan/resourceList",
			);
			expect(upstreamRequest.method).toBe("GET");

			const requestHeaders = new Headers(upstreamRequest.headers);
			expect(requestHeaders.get("cookie")).toBe("bce-sessionid=test-session-id");

			return new Response(JSON.stringify(baiduQuotaSample), {
				status: 200,
				headers: { "content-type": "application/json; charset=utf-8" },
			});
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const request = new IncomingRequest("http://example.com/baidu/v1/usage");
		const ctx = createExecutionContext();

		const response = await worker.fetch(
			request,
			withRuntimeEnv({
				ROUTE_PREFIX: "baidu",
				UPSTREAM_CONTROL_AUTH: {
					profiles: {
						resource_list: {
							cookies: {
								"bce-sessionid": "test-session-id",
							},
						},
					},
				},
				USAGE_QUERY_CONFIG: {
					provider: "baidu",
					request: {
						url: "https://console.bce.baidu.com/api/qianfan/charge/codingPlan/resourceList",
						method: "GET",
						authProfile: "resource_list",
					},
				},
			}),
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			object: "usage",
			provider: {
				id: "baidu",
			},
			plan: {
				id: "resource-redacted",
				tier: "LITE",
			},
			quotas: expect.arrayContaining([
				expect.objectContaining({
					metric: "requests",
					limit: 1200,
					used: 12,
				}),
			]),
		});
	});

	it("fetches JD upstream usage data and returns normalized output", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const upstreamRequest =
				input instanceof Request ? input : new Request(input, init);
			expect(upstreamRequest.url).toBe(
				"https://joybuilder-console.jdcloud.com/openApi/modelservice/describeUserActivePlan",
			);
			expect(upstreamRequest.method).toBe("GET");

			const requestHeaders = new Headers(upstreamRequest.headers);
			expect(requestHeaders.get("cookie")).toBe("thor=test-thor");

			return new Response(JSON.stringify(jdActivePlanSample), {
				status: 200,
				headers: { "content-type": "application/json; charset=utf-8" },
			});
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const request = new IncomingRequest("http://example.com/jd/v1/usage");
		const ctx = createExecutionContext();

		const response = await worker.fetch(
			request,
			withRuntimeEnv({
				ROUTE_PREFIX: "jd",
				UPSTREAM_CONTROL_AUTH: {
					profiles: {
						active_plan: {
							cookies: {
								thor: "test-thor",
							},
						},
					},
				},
				USAGE_QUERY_CONFIG: {
					provider: "jd",
					request: {
						url: "https://joybuilder-console.jdcloud.com/openApi/modelservice/describeUserActivePlan",
						method: "GET",
						authProfile: "active_plan",
					},
				},
			}),
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			object: "usage",
			provider: {
				id: "jd",
			},
			plan: {
				id: "plan-redacted",
				tier: "pro",
				default_model: "GLM-5",
			},
			quotas: expect.arrayContaining([
				expect.objectContaining({
					metric: "requests",
					limit: 1200,
					used: 18,
				}),
			]),
		});
	});

	it("fetches z.ai upstream usage data with bearer auth and returns normalized output", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const upstreamRequest =
				input instanceof Request ? input : new Request(input, init);
			expect(upstreamRequest.url).toBe(
				"https://api.z.ai/api/monitor/usage/quota/limit",
			);
			expect(upstreamRequest.method).toBe("GET");

			const requestHeaders = new Headers(upstreamRequest.headers);
			expect(requestHeaders.get("authorization")).toBe("Bearer test-zai-token");

			return new Response(JSON.stringify(zaiUsageSample), {
				status: 200,
				headers: { "content-type": "application/json; charset=utf-8" },
			});
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const request = new IncomingRequest("http://example.com/zai/v1/usage");
		const ctx = createExecutionContext();

		const response = await worker.fetch(
			request,
			withRuntimeEnv({
				ROUTE_PREFIX: "zai",
				UPSTREAM_CONTROL_AUTH: {
					profiles: {
						quota_limit: {
							headers: {
								authorization: "Bearer test-zai-token",
							},
						},
					},
				},
				USAGE_QUERY_CONFIG: {
					provider: "zai",
					request: {
						url: "https://api.z.ai/api/monitor/usage/quota/limit",
						method: "GET",
						authProfile: "quota_limit",
					},
				},
			}),
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			object: "usage",
			provider: {
				id: "zai",
			},
			plan: {
				tier: "lite",
			},
			quotas: expect.arrayContaining([
				expect.objectContaining({
					metric: "requests",
					limit: 100,
					used: 1,
				}),
			]),
		});
	});

	it("returns 501 when usage query config is missing", async () => {
		const request = new IncomingRequest("http://example.com/baidu/v1/usage");
		const ctx = createExecutionContext();

		const response = await worker.fetch(
			request,
			withRuntimeEnv({ ROUTE_PREFIX: "baidu" }),
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(501);
		await expect(response.json()).resolves.toMatchObject({
			error: { code: "usage_query_not_configured" },
		});
	});

	it("returns 405 for non-GET usage requests", async () => {
		const request = new IncomingRequest("http://example.com/baidu/v1/usage", {
			method: "POST",
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(
			request,
			withRuntimeEnv({ ROUTE_PREFIX: "baidu" }),
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(405);
		await expect(response.json()).resolves.toMatchObject({
			error: { code: "method_not_allowed" },
		});
	});

	it("routes multi-provider usage requests by prefix", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const upstreamRequest =
				input instanceof Request ? input : new Request(input, init);

			if (
				upstreamRequest.url ===
				"https://console.bce.baidu.com/api/qianfan/charge/codingPlan/resourceList"
			) {
				expect(new Headers(upstreamRequest.headers).get("cookie")).toBe(
					"bce-sessionid=test-baidu-session",
				);
				return new Response(JSON.stringify(baiduQuotaSample), {
					status: 200,
					headers: { "content-type": "application/json; charset=utf-8" },
				});
			}

			if (
				upstreamRequest.url ===
				"https://joybuilder-console.jdcloud.com/openApi/modelservice/describeUserActivePlan"
			) {
				expect(new Headers(upstreamRequest.headers).get("cookie")).toBe(
					"thor=test-thor",
				);
				return new Response(JSON.stringify(jdActivePlanSample), {
					status: 200,
					headers: { "content-type": "application/json; charset=utf-8" },
				});
			}

			throw new Error(`unexpected upstream ${upstreamRequest.url}`);
		});
		globalThis.fetch = fetchMock as typeof fetch;

		const ctx = createExecutionContext();
		const runtimeEnv = withRuntimeEnv({
			DEFAULT_PROVIDER_PREFIX: "baidu",
			PROVIDERS_CONFIG: {
				baidu: {
					upstreamBaseUrl: "https://qianfan.baidubce.com/v2/coding",
					anthropicUpstreamBaseUrl: "https://qianfan.baidubce.com/anthropic/coding",
					models: [{ id: "ernie-4.5-turbo-20260402" }],
					upstreamControlAuth: {
						profiles: {
							resource_list: {
								cookies: {
									"bce-sessionid": "test-baidu-session",
								},
							},
						},
					},
					usageQuery: {
						provider: "baidu",
						request: {
							url: "https://console.bce.baidu.com/api/qianfan/charge/codingPlan/resourceList",
							authProfile: "resource_list",
						},
					},
				},
				jd: {
					upstreamBaseUrl: "https://modelservice.jdcloud.com/coding/openai/v1",
					anthropicUpstreamBaseUrl: "https://modelservice.jdcloud.com/coding/anthropic",
					models: [{ id: "GLM-5" }],
					upstreamControlAuth: {
						profiles: {
							active_plan: {
								cookies: {
									thor: "test-thor",
								},
							},
						},
					},
					usageQuery: {
						provider: "jd",
						request: {
							url: "https://joybuilder-console.jdcloud.com/openApi/modelservice/describeUserActivePlan",
							authProfile: "active_plan",
						},
					},
				},
			},
		});

		const baiduResponse = await worker.fetch(
			new IncomingRequest("http://example.com/v1/usage"),
			runtimeEnv,
			ctx,
		);
		const jdResponse = await worker.fetch(
			new IncomingRequest("http://example.com/jd/v1/usage"),
			runtimeEnv,
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		await expect(baiduResponse.json()).resolves.toMatchObject({
			provider: { id: "baidu" },
		});
		await expect(jdResponse.json()).resolves.toMatchObject({
			provider: { id: "jd" },
		});
	});
});
