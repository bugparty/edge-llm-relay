export type ProviderId = "zai" | "jd" | "baidu";

export type ProviderKind =
	| "coding_plan"
	| "llm_gateway"
	| "native_llm"
	| "aggregator";

export type CompatibilityInterface = {
	compatible: boolean;
	models_path?: string;
	chat_completions_path?: string;
	messages_path?: string;
};

export type UsageInterface = {
	native: boolean;
};

export type ProviderInfo = {
	id: ProviderId;
	name: string;
	route_prefix: string;
	kind: ProviderKind;
	interfaces: {
		openai?: CompatibilityInterface;
		anthropic?: CompatibilityInterface;
		usage?: UsageInterface;
	};
};

export type PlanStatus = "active" | "expired" | "suspended" | "unknown";

export type PlanInfo = {
	id: string | null;
	code: string | null;
	name: string | null;
	tier: string | null;
	status: PlanStatus;
	description: string | null;
	default_model: string | null;
	effective_at: string | null;
	expires_at: string | null;
	auto_renew: boolean | null;
};

export type QuotaMetric =
	| "requests"
	| "tokens_input"
	| "tokens_output"
	| "tokens_total"
	| "tool_calls";

export type QuotaScope = "account" | "plan" | "model" | "tool";

export type QuotaWindowUnit =
	| "minute"
	| "hour"
	| "day"
	| "week"
	| "month"
	| null;

export type QuotaWindow = {
	value: number | null;
	unit: QuotaWindowUnit;
	rolling: boolean | null;
	label: string | null;
};

export type QuotaBreakdownEntry = {
	type: "model" | "tool" | "unknown";
	id: string;
	used: number | null;
};

export type QuotaEntry = {
	metric: QuotaMetric;
	scope: QuotaScope;
	window: QuotaWindow;
	limit: number | null;
	used: number | null;
	remaining: number | null;
	percent_used: number | null;
	reset_at: string | null;
	breakdown: QuotaBreakdownEntry[];
	provider_meta?: Record<string, unknown>;
};

export type Entitlements = {
	model_access: string[];
	tool_access: string[];
	priority_processing: boolean | null;
};

export type UsageModel = {
	id: string;
	name: string;
	description: string | null;
	logo_url: string | null;
	limit?: {
		context?: number;
		output?: number;
	};
	available: boolean;
};

export type UsageResponse = {
	object: "usage";
	provider: ProviderInfo;
	plan: PlanInfo | null;
	quotas: QuotaEntry[];
	entitlements: Entitlements;
	models: UsageModel[];
	observed_at: string | null;
	provider_meta: Record<string, unknown>;
};
