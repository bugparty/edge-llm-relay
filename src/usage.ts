import type {
	Entitlements,
	PlanInfo,
	PlanStatus,
	ProviderId,
	ProviderInfo,
	QuotaEntry,
	QuotaMetric,
	QuotaWindow,
	UsageModel,
	UsageResponse,
} from "./types/usage";

const PROVIDERS: Record<ProviderId, ProviderInfo> = {
	zai: {
		id: "zai",
		name: "z.ai",
		route_prefix: "zai",
		kind: "coding_plan",
		interfaces: {
			openai: {
				compatible: true,
				models_path: "/v1/models",
				chat_completions_path: "/v1/chat/completions",
			},
			anthropic: {
				compatible: true,
				messages_path: "/anthropic/v1/messages",
			},
			usage: {
				native: true,
			},
		},
	},
	jd: {
		id: "jd",
		name: "JD Cloud",
		route_prefix: "jd",
		kind: "coding_plan",
		interfaces: {
			openai: {
				compatible: true,
				models_path: "/v1/models",
				chat_completions_path: "/v1/chat/completions",
			},
			anthropic: {
				compatible: true,
				messages_path: "/anthropic/v1/messages",
			},
			usage: {
				native: true,
			},
		},
	},
	baidu: {
		id: "baidu",
		name: "Baidu Qianfan",
		route_prefix: "baidu",
		kind: "coding_plan",
		interfaces: {
			openai: {
				compatible: true,
				models_path: "/v1/models",
				chat_completions_path: "/v1/chat/completions",
			},
			anthropic: {
				compatible: true,
				messages_path: "/anthropic/v1/messages",
			},
			usage: {
				native: true,
			},
		},
	},
};

type ZaiPayload = {
	data?: {
		level?: string;
		limits?: ZaiLimit[];
	};
};

type ZaiLimit = {
	type?: string;
	unit?: number;
	number?: number;
	usage?: number;
	currentValue?: number;
	remaining?: number;
	percentage?: number;
	nextResetTime?: number;
	usageDetails?: Array<{
		modelCode?: string;
		usage?: number;
	}>;
};

type JdPayload = {
	result?: {
		plan_id?: string;
		name?: string;
		code?: string;
		description?: string;
		plan_type?: string;
		default_model?: string;
		auto_renew?: number;
		start_time?: string;
		end_time?: string;
		benefits?: Array<{
			type?: string;
			title?: string;
			content?: string;
		}>;
		limits?: Array<{
			metric_type?: string;
			limit_value?: number;
			unit?: string;
			period?: string;
		}>;
		models?: Array<{
			model?: string;
			logo?: string;
			description?: string;
		}>;
		usages?: Array<{
			type?: string;
			count?: number;
		}>;
	};
	responseObj?: {
		headerObj?: {
			date?: string;
		};
	};
};

type BaiduPayload = {
	result?: {
		items?: Array<{
			resourceId?: string;
			planType?: string;
			resourceStatus?: string;
			effectiveAt?: string;
			expiresAt?: string;
			quota?: Record<
				string,
				{
					used?: number;
					limit?: number;
					resetAt?: string;
				}
			>;
			autoRenew?: {
				renewTime?: number;
				renewTimeUnit?: string;
			};
		}>;
	};
};

function normalizeTimestamp(value: unknown): string | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return new Date(value).toISOString();
	}

	if (typeof value !== "string" || value.trim().length === 0) {
		return null;
	}

	const trimmed = value.trim();
	if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
		return trimmed.replace(" ", "T");
	}

	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) {
		return trimmed;
	}

	return parsed.toISOString();
}

function computeRemaining(limit: number | null, used: number | null): number | null {
	if (limit === null || used === null) {
		return null;
	}

	return limit - used;
}

function computePercent(limit: number | null, used: number | null): number | null {
	if (limit === null || used === null || limit <= 0) {
		return null;
	}

	return Number(((used / limit) * 100).toFixed(4));
}

function mapPlanStatus(value: string | undefined): PlanStatus {
	const normalized = value?.trim().toLowerCase();
	if (!normalized) {
		return "unknown";
	}
	if (["running", "active"].includes(normalized)) {
		return "active";
	}
	if (["expired"].includes(normalized)) {
		return "expired";
	}
	if (["suspended", "paused"].includes(normalized)) {
		return "suspended";
	}
	return "unknown";
}

function defaultEntitlements(): Entitlements {
	return {
		model_access: [],
		tool_access: [],
		priority_processing: null,
	};
}

function normalizeZaiWindow(limit: ZaiLimit): QuotaWindow {
	if (limit.type === "TIME_LIMIT") {
		return {
			value: limit.unit ?? null,
			unit: "hour",
			rolling: true,
			label: typeof limit.unit === "number" ? `${limit.unit}hours` : "time_limit",
		};
	}

	return {
		value: limit.number ?? null,
		unit: null,
		rolling: null,
		label:
			typeof limit.unit === "number" && typeof limit.number === "number"
				? `unit:${limit.unit}/number:${limit.number}`
				: limit.type ?? null,
	};
}

function normalizeZaiUsage(payload: ZaiPayload): UsageResponse {
	const plan: PlanInfo = {
		id: null,
		code: null,
		name: null,
		tier: payload.data?.level ?? null,
		status: "unknown",
		description: null,
		default_model: null,
		effective_at: null,
		expires_at: null,
		auto_renew: null,
	};

	const quotas: QuotaEntry[] = (payload.data?.limits ?? []).map((limit) => {
		const metric: QuotaMetric = limit.type === "TIME_LIMIT" ? "requests" : "tokens_total";
		const used = typeof limit.currentValue === "number" ? limit.currentValue : null;
		const rawLimit = typeof limit.usage === "number" ? limit.usage : null;
		const rawRemaining = typeof limit.remaining === "number" ? limit.remaining : null;

		return {
			metric,
			scope: "account",
			window: normalizeZaiWindow(limit),
			limit: rawLimit,
			used,
			remaining: rawRemaining ?? computeRemaining(rawLimit, used),
			percent_used:
				typeof limit.percentage === "number"
					? limit.percentage
					: computePercent(rawLimit, used),
			reset_at: normalizeTimestamp(limit.nextResetTime),
			breakdown: (limit.usageDetails ?? [])
				.filter((entry) => typeof entry.modelCode === "string" && entry.modelCode.length > 0)
				.map((entry) => ({
					type: "model" as const,
					id: entry.modelCode as string,
					used: typeof entry.usage === "number" ? entry.usage : null,
				})),
			provider_meta: {
				raw_type: limit.type ?? null,
				raw_unit_code: limit.unit ?? null,
				raw_number: limit.number ?? null,
			},
		};
	});

	const entitlements = defaultEntitlements();
	entitlements.tool_access = quotas
		.flatMap((quota) => quota.breakdown)
		.map((entry) => entry.id);

	return {
		object: "usage",
		provider: PROVIDERS.zai,
		plan,
		quotas,
		entitlements,
		models: [],
		observed_at: null,
		provider_meta: {},
	};
}

function normalizeJdPeriod(period: string | undefined): QuotaWindow {
	switch (period) {
		case "5hours":
			return { value: 5, unit: "hour", rolling: true, label: period };
		case "7days":
			return { value: 7, unit: "day", rolling: true, label: period };
		case "month":
			return { value: 1, unit: "month", rolling: false, label: period };
		default:
			return { value: null, unit: null, rolling: null, label: period ?? null };
	}
}

function normalizeJdUsage(payload: JdPayload): UsageResponse {
	const result = payload.result;
	const plan: PlanInfo = {
		id: result?.plan_id ?? null,
		code: result?.code ?? null,
		name: result?.name ?? null,
		tier: result?.plan_type ?? null,
		status: "unknown",
		description: result?.description ?? null,
		default_model: result?.default_model ?? null,
		effective_at: normalizeTimestamp(result?.start_time),
		expires_at: normalizeTimestamp(result?.end_time),
		auto_renew:
			typeof result?.auto_renew === "number" ? result.auto_renew !== 0 : null,
	};

	const usagesByType = new Map(
		(result?.usages ?? [])
			.filter((entry) => typeof entry.type === "string")
			.map((entry) => [entry.type as string, entry.count ?? null]),
	);

	const quotas: QuotaEntry[] = (result?.limits ?? []).map((limit) => {
		const used = usagesByType.get(limit.period ?? "") ?? null;
		const normalizedLimit =
			typeof limit.limit_value === "number" ? limit.limit_value : null;

		return {
			metric: limit.metric_type === "request_count" ? "requests" : "requests",
			scope: "plan",
			window: normalizeJdPeriod(limit.period),
			limit: normalizedLimit,
			used,
			remaining: computeRemaining(normalizedLimit, used),
			percent_used: computePercent(normalizedLimit, used),
			reset_at: null,
			breakdown: [],
			provider_meta: {
				raw_metric_type: limit.metric_type ?? null,
				raw_unit: limit.unit ?? null,
			},
		};
	});

	const entitlements = defaultEntitlements();
	entitlements.model_access = (result?.models ?? [])
		.map((model) => model.model)
		.filter((model): model is string => typeof model === "string" && model.length > 0);
	entitlements.priority_processing = (result?.benefits ?? []).some(
		(benefit) =>
			benefit.title === "响应" &&
			typeof benefit.content === "string" &&
			benefit.content.includes("优先"),
	);

	const models: UsageModel[] = (result?.models ?? [])
		.filter((model) => typeof model.model === "string" && model.model.length > 0)
		.map((model) => ({
			id: model.model as string,
			name: model.model as string,
			description: model.description ?? null,
			logo_url: model.logo ?? null,
			available: true,
		}));

	return {
		object: "usage",
		provider: PROVIDERS.jd,
		plan,
		quotas,
		entitlements,
		models,
		observed_at: normalizeTimestamp(payload.responseObj?.headerObj?.date),
		provider_meta: {
			benefits: result?.benefits ?? [],
		},
	};
}

function normalizeBaiduQuotaWindow(label: string): QuotaWindow {
	switch (label) {
		case "fiveHour":
			return { value: 5, unit: "hour", rolling: true, label };
		case "week":
			return { value: 1, unit: "week", rolling: false, label };
		case "month":
			return { value: 1, unit: "month", rolling: false, label };
		default:
			return { value: null, unit: null, rolling: null, label };
	}
}

function normalizeBaiduUsage(payload: BaiduPayload): UsageResponse {
	const item = payload.result?.items?.[0];
	const plan: PlanInfo = {
		id: item?.resourceId ?? null,
		code: null,
		name: null,
		tier: item?.planType ?? null,
		status: mapPlanStatus(item?.resourceStatus),
		description: null,
		default_model: null,
		effective_at: normalizeTimestamp(item?.effectiveAt),
		expires_at: normalizeTimestamp(item?.expiresAt),
		auto_renew: item?.autoRenew ? true : null,
	};

	const quotas: QuotaEntry[] = Object.entries(item?.quota ?? {}).map(([label, quota]) => {
		const limit = typeof quota.limit === "number" ? quota.limit : null;
		const used = typeof quota.used === "number" ? quota.used : null;

		return {
			metric: "requests",
			scope: "plan",
			window: normalizeBaiduQuotaWindow(label),
			limit,
			used,
			remaining: computeRemaining(limit, used),
			percent_used: computePercent(limit, used),
			reset_at: normalizeTimestamp(quota.resetAt),
			breakdown: [],
		};
	});

	return {
		object: "usage",
		provider: PROVIDERS.baidu,
		plan,
		quotas,
		entitlements: defaultEntitlements(),
		models: [],
		observed_at: null,
		provider_meta: {
			auto_renew: item?.autoRenew ?? null,
		},
	};
}

export function normalizeUsage(provider: ProviderId, payload: unknown): UsageResponse {
	switch (provider) {
		case "zai":
			return normalizeZaiUsage(payload as ZaiPayload);
		case "jd":
			return normalizeJdUsage(payload as JdPayload);
		case "baidu":
			return normalizeBaiduUsage(payload as BaiduPayload);
	}
}
