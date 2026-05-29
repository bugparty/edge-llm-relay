import { describe, expect, it } from "vitest";
import baiduQuotaSample from "./fixtures/usage/baidu-quota.sample.json";
import jdActivePlanSample from "./fixtures/usage/jd-active-plan.sample.json";
import zaiUsageSample from "./fixtures/usage/zai-usage.sample.json";
import { normalizeUsage } from "../src/usage";

describe("normalizeUsage", () => {
	it("normalizes z.ai usage windows and breakdowns", () => {
		const normalized = normalizeUsage("zai", zaiUsageSample);

		expect(normalized.provider.id).toBe("zai");
		expect(normalized.plan?.tier).toBe("lite");
		expect(normalized.quotas).toHaveLength(3);
		expect(normalized.quotas[0]).toMatchObject({
			metric: "requests",
			scope: "account",
			window: {
				value: 5,
				unit: "hour",
				rolling: true,
				label: "5hours",
			},
			limit: 100,
			used: 1,
			remaining: 99,
			percent_used: 1,
		});
		expect(normalized.quotas[0].breakdown).toEqual([
			{ type: "model", id: "search-prime", used: 0 },
			{ type: "model", id: "web-reader", used: 1 },
			{ type: "model", id: "zread", used: 0 },
		]);
		expect(normalized.entitlements.tool_access).toEqual([
			"search-prime",
			"web-reader",
			"zread",
		]);
		expect(normalized.quotas[1].window.unit).toBeNull();
		expect(normalized.quotas[1].provider_meta).toMatchObject({
			raw_unit_code: 3,
			raw_number: 5,
		});
	});

	it("normalizes JD plan, joins quota usage by period, and surfaces entitlements", () => {
		const normalized = normalizeUsage("jd", jdActivePlanSample);

		expect(normalized.provider.id).toBe("jd");
		expect(normalized.plan).toMatchObject({
			id: "plan-redacted",
			code: "coding-plan-pro-package.original",
			name: "高级开发者套餐",
			tier: "pro",
			default_model: "GLM-5",
			effective_at: "2026-04-26T10:33:14",
			expires_at: "2026-06-29T23:59:59",
			auto_renew: false,
		});
		expect(normalized.observed_at).toBe("2026-05-29T22:30:12.000Z");
		expect(normalized.quotas).toHaveLength(3);
		expect(normalized.quotas[0]).toMatchObject({
			metric: "requests",
			scope: "plan",
			window: {
				value: 5,
				unit: "hour",
				rolling: true,
				label: "5hours",
			},
			limit: 1200,
			used: 18,
			remaining: 1182,
			percent_used: 1.5,
		});
		expect(normalized.entitlements.model_access).toContain("GLM-5");
		expect(normalized.entitlements.priority_processing).toBe(true);
		expect(normalized.models).toHaveLength(7);
		expect(normalized.models[0]).toMatchObject({
			id: "DeepSeek-V3.2",
			name: "DeepSeek-V3.2",
			available: true,
		});
		expect(normalized.provider_meta).toMatchObject({
			benefits: expect.any(Array),
		});
	});

	it("normalizes Baidu quota windows and resource plan status", () => {
		const normalized = normalizeUsage("baidu", baiduQuotaSample);

		expect(normalized.provider.id).toBe("baidu");
		expect(normalized.plan).toMatchObject({
			id: "resource-redacted",
			tier: "LITE",
			status: "active",
			effective_at: "2026-03-19T03:28:47.000Z",
			expires_at: "2026-06-19T03:28:47.000Z",
			auto_renew: true,
		});
		expect(normalized.quotas).toHaveLength(3);
		expect(normalized.quotas[0]).toMatchObject({
			metric: "requests",
			scope: "plan",
			window: {
				value: 5,
				unit: "hour",
				rolling: true,
				label: "fiveHour",
			},
			limit: 1200,
			used: 12,
			remaining: 1188,
			percent_used: 1,
		});
		expect(normalized.quotas[1].window).toMatchObject({
			value: 1,
			unit: "week",
			rolling: false,
			label: "week",
		});
		expect(normalized.provider_meta).toMatchObject({
			auto_renew: {
				renewTime: 1,
				renewTimeUnit: "month",
			},
		});
	});
});
