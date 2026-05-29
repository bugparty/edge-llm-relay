import { normalizeUsage } from "./usage";
import type { ProviderId } from "./types/usage";

const DEFAULT_UPSTREAM_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_ANTHROPIC_UPSTREAM_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_MODEL_CREATED_AT = 1775601600;
const DEFAULT_MODEL_OWNER = "openai";
const DEFAULT_ROUTE_PREFIX = "openai";

const DEFAULT_MODELS = [
	"gpt-4",
	"gpt-4-turbo",
	"gpt-3.5-turbo",
];

type ModelResponseItem = {
	id: string;
	object: "model";
	created: number;
	owned_by: string;
};

type ModelInput = {
	id?: string;
	name?: string;
	created?: number;
	owned_by?: string;
	limit?: {
		context?: number;
		output?: number;
	};
};

type RuntimeConfig = {
	providers: Record<string, ProviderRuntimeConfig>;
	defaultProviderPrefix: string | null;
};

type UpstreamControlAuthMaterial = {
	headers?: Record<string, string>;
	cookies?: Record<string, string>;
	query?: Record<string, string>;
};

type UpstreamControlAuthConfig = {
	profiles?: Record<string, UpstreamControlAuthMaterial>;
};

type UsageQueryRequestConfig = {
	url: string;
	method?: string;
	authProfile?: string;
	headers?: Record<string, string>;
	query?: Record<string, string>;
};

type UsageQueryConfig = {
	provider: ProviderId;
	request: UsageQueryRequestConfig;
};

type ProviderRuntimeInput = {
	routePrefix?: string;
	modelsEnabled?: boolean | string;
	upstreamBaseUrl?: string;
	anthropicUpstreamBaseUrl?: string;
	models?: unknown;
	upstreamControlAuth?: string | UpstreamControlAuthConfig;
	usageQuery?: string | UsageQueryConfig;
	MODELS_ENABLED?: boolean | string;
	UPSTREAM_BASE_URL?: string;
	ANTHROPIC_UPSTREAM_BASE_URL?: string;
	MODELS_JSON?: unknown;
	UPSTREAM_CONTROL_AUTH?: string | UpstreamControlAuthConfig;
	USAGE_QUERY_CONFIG?: string | UsageQueryConfig;
};

type ProviderRuntimeConfig = {
	routePrefix: string;
	modelsEnabled: boolean;
	upstreamBaseUrl: string;
	anthropicUpstreamBaseUrl: string;
	models: ModelResponseItem[];
	upstreamControlAuth: UpstreamControlAuthConfig;
	usageQuery: UsageQueryConfig | null;
};

type RuntimeEnv = {
	ROUTE_PREFIX?: string;
	MODELS_ENABLED?: string;
	UPSTREAM_BASE_URL?: string;
	ANTHROPIC_UPSTREAM_BASE_URL?: string;
	MODELS_JSON?: string;
	UPSTREAM_CONTROL_AUTH?: string | UpstreamControlAuthConfig;
	USAGE_QUERY_CONFIG?: string | UsageQueryConfig;
	DEFAULT_PROVIDER_PREFIX?: string;
	PROVIDERS_CONFIG?: string | Record<string, ProviderRuntimeInput>;
};

function json(data: unknown, init?: ResponseInit): Response {
	const headers = new Headers(init?.headers);
	if (!headers.has("content-type")) {
		headers.set("content-type", "application/json; charset=utf-8");
	}

	return new Response(JSON.stringify(data), {
		...init,
		headers,
	});
}

function errorResponse(status: number, code: string, message: string): Response {
	return json(
		{
			error: {
				message,
				type: "invalid_request_error",
				code,
			},
		},
		{ status },
	);
}

function methodNotAllowed(method: string, allowed: string): Response {
	return errorResponse(
		405,
		"method_not_allowed",
		`Method ${method} is not allowed for this endpoint. Use ${allowed}.`,
	);
}

function parseBoolean(value: unknown, defaultValue: boolean): boolean {
	if (typeof value === "boolean") {
		return value;
	}

	if (typeof value !== "string" || value.length === 0) {
		return defaultValue;
	}

	const normalized = value.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) {
		return true;
	}
	if (["0", "false", "no", "off"].includes(normalized)) {
		return false;
	}

	return defaultValue;
}

function normalizePrefix(value: string | undefined): string {
	if (!value) {
		return DEFAULT_ROUTE_PREFIX;
	}

	const normalized = value.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
	if (!normalized) {
		return DEFAULT_ROUTE_PREFIX;
	}

	return normalized;
}

function normalizeUpstreamBaseUrl(value: string | undefined): string {
	const candidate = value?.trim() || DEFAULT_UPSTREAM_BASE_URL;

	try {
		const parsed = new URL(candidate);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return DEFAULT_UPSTREAM_BASE_URL;
		}
		return parsed.toString().replace(/\/+$/, "");
	} catch {
		return DEFAULT_UPSTREAM_BASE_URL;
	}
}

function normalizeAnthropicUpstreamBaseUrl(value: string | undefined): string {
	const candidate = value?.trim() || DEFAULT_ANTHROPIC_UPSTREAM_BASE_URL;

	try {
		const parsed = new URL(candidate);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return DEFAULT_ANTHROPIC_UPSTREAM_BASE_URL;
		}
		return parsed.toString().replace(/\/+$/, "");
	} catch {
		return DEFAULT_ANTHROPIC_UPSTREAM_BASE_URL;
	}
}

function defaultModels(): ModelResponseItem[] {
	return DEFAULT_MODELS.map((id) => ({
		id,
		object: "model",
		created: DEFAULT_MODEL_CREATED_AT,
		owned_by: DEFAULT_MODEL_OWNER,
	}));
}

function normalizeModelInput(
	item: unknown,
	fallbackId?: string,
): ModelResponseItem | null {
	if (!item || typeof item !== "object") {
		return null;
	}

	const model = item as ModelInput;
	const rawId =
		typeof model.id === "string"
			? model.id
			: typeof model.name === "string"
				? model.name
				: fallbackId;

	if (!rawId || rawId.trim().length === 0) {
		return null;
	}

	return {
		id: rawId.trim(),
		object: "model",
		created:
			typeof model.created === "number" && Number.isFinite(model.created)
				? model.created
				: DEFAULT_MODEL_CREATED_AT,
		owned_by:
			typeof model.owned_by === "string" && model.owned_by.trim().length > 0
				? model.owned_by.trim()
				: DEFAULT_MODEL_OWNER,
	};
}

function parseModelsInput(value: unknown): ModelResponseItem[] {
	if (value === undefined || value === null) {
		return defaultModels();
	}

	try {
		const parsed =
			typeof value === "string" ? (JSON.parse(value) as unknown) : value;
		let models: Array<ModelResponseItem | null> = [];

		if (Array.isArray(parsed)) {
			models = parsed.map((item) => normalizeModelInput(item));
		} else if (parsed && typeof parsed === "object") {
			models = Object.entries(parsed).map(([key, item]) =>
				normalizeModelInput(item, key),
			);
		} else {
			return defaultModels();
		}

		const normalizedModels = models.filter((item): item is ModelResponseItem => item !== null);

		return normalizedModels.length > 0 ? normalizedModels : defaultModels();
	} catch {
		return defaultModels();
	}
}

function parseUpstreamControlAuth(
	value: RuntimeEnv["UPSTREAM_CONTROL_AUTH"],
): UpstreamControlAuthConfig {
	if (!value) {
		return {};
	}

	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value) as unknown;
			if (parsed && typeof parsed === "object") {
				return parsed as UpstreamControlAuthConfig;
			}
		} catch {
			return {};
		}

		return {};
	}

	if (typeof value === "object") {
		return value;
	}

	return {};
}

function parseUsageQueryConfig(
	value: RuntimeEnv["USAGE_QUERY_CONFIG"],
): UsageQueryConfig | null {
	if (!value) {
		return null;
	}

	const isUsageQueryConfig = (candidate: unknown): candidate is UsageQueryConfig => {
		if (!candidate || typeof candidate !== "object") {
			return false;
		}

		const parsed = candidate as Partial<UsageQueryConfig>;
		return (
			typeof parsed.provider === "string" &&
			typeof parsed.request?.url === "string" &&
			parsed.request.url.trim().length > 0
		);
	};

	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value) as unknown;
			return isUsageQueryConfig(parsed) ? parsed : null;
		} catch {
			return null;
		}
	}

	return isUsageQueryConfig(value) ? value : null;
}

function readRuntimeConfig(env: RuntimeEnv): RuntimeConfig {
	const parseProvidersConfig = (
		value: RuntimeEnv["PROVIDERS_CONFIG"],
	): Record<string, ProviderRuntimeInput> => {
		if (!value) {
			return {};
		}

		if (typeof value === "string") {
			try {
				const parsed = JSON.parse(value) as unknown;
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
					return parsed as Record<string, ProviderRuntimeInput>;
				}
			} catch {
				return {};
			}

			return {};
		}

		if (typeof value === "object" && !Array.isArray(value)) {
			return value;
		}

		return {};
	};

	const buildProviderRuntimeConfig = (
		input: ProviderRuntimeInput,
		fallbackPrefix?: string,
	): ProviderRuntimeConfig => ({
		routePrefix: normalizePrefix(input.routePrefix ?? fallbackPrefix),
		modelsEnabled: parseBoolean(
			input.modelsEnabled ?? input.MODELS_ENABLED,
			true,
		),
		upstreamBaseUrl: normalizeUpstreamBaseUrl(
			input.upstreamBaseUrl ?? input.UPSTREAM_BASE_URL,
		),
		anthropicUpstreamBaseUrl: normalizeAnthropicUpstreamBaseUrl(
			input.anthropicUpstreamBaseUrl ?? input.ANTHROPIC_UPSTREAM_BASE_URL,
		),
		models: parseModelsInput(input.models ?? input.MODELS_JSON),
		upstreamControlAuth: parseUpstreamControlAuth(
			input.upstreamControlAuth ?? input.UPSTREAM_CONTROL_AUTH,
		),
		usageQuery: parseUsageQueryConfig(
			input.usageQuery ?? input.USAGE_QUERY_CONFIG,
		),
	});

	const configuredProviders = Object.entries(parseProvidersConfig(env.PROVIDERS_CONFIG))
		.map(([key, value]) => buildProviderRuntimeConfig(value, key))
		.filter((provider) => provider.routePrefix.length > 0);

	if (configuredProviders.length > 0) {
		const providers = Object.fromEntries(
			configuredProviders.map((provider) => [provider.routePrefix, provider]),
		);
		const defaultProviderPrefix = env.DEFAULT_PROVIDER_PREFIX
			? normalizePrefix(env.DEFAULT_PROVIDER_PREFIX)
			: null;

		return {
			providers,
			defaultProviderPrefix:
				defaultProviderPrefix && providers[defaultProviderPrefix]
					? defaultProviderPrefix
					: null,
		};
	}

	const singleProvider = buildProviderRuntimeConfig(
		{
			routePrefix: env.ROUTE_PREFIX,
			MODELS_ENABLED: env.MODELS_ENABLED,
			UPSTREAM_BASE_URL: env.UPSTREAM_BASE_URL,
			ANTHROPIC_UPSTREAM_BASE_URL: env.ANTHROPIC_UPSTREAM_BASE_URL,
			MODELS_JSON: env.MODELS_JSON,
			UPSTREAM_CONTROL_AUTH: env.UPSTREAM_CONTROL_AUTH,
			USAGE_QUERY_CONFIG: env.USAGE_QUERY_CONFIG,
		},
		env.ROUTE_PREFIX,
	);

	return {
		providers: {
			[singleProvider.routePrefix]: singleProvider,
		},
		defaultProviderPrefix: singleProvider.routePrefix,
	};
}

function buildUpstreamHeaders(request: Request): Headers {
	const headers = new Headers();

	// Standard HTTP headers
	const standardHeaders = [
		"authorization",
		"content-type",
		"cache-control",
		"openai-processing-ms",
		"openai-version",
		"accept",
		"user-agent",
	];

	// Pass through standard headers and all headers starting with "x-"
	for (const [name, value] of request.headers.entries()) {
		const key = name.toLowerCase();
		if (standardHeaders.includes(key) || key.startsWith("x-")) {
			if (value) {
				headers.set(key, value);
			}
		}
	}

	return headers;
}

function buildBufferedErrorHeaders(upstreamHeaders: Headers): Headers {
	const headers = new Headers(upstreamHeaders);
	headers.delete("content-encoding");
	headers.delete("content-length");
	headers.delete("transfer-encoding");
	return headers;
}

function modelsResponse(models: ModelResponseItem[]): Response {
	return json({
		object: "list",
		data: models,
	});
}

type RouteKind = "models" | "chat" | "anthropic" | "usage";

type ResolvedRoute = {
	kind: RouteKind;
	provider: ProviderRuntimeConfig;
};

function resolveRoute(pathname: string, config: RuntimeConfig): ResolvedRoute | null {
	const suffixes: Array<{ kind: RouteKind; suffix: string }> = [
		{ kind: "models", suffix: "/v1/models" },
		{ kind: "chat", suffix: "/v1/chat/completions" },
		{ kind: "anthropic", suffix: "/anthropic/v1/messages" },
		{ kind: "usage", suffix: "/v1/usage" },
	];

	for (const provider of Object.values(config.providers)) {
		for (const { kind, suffix } of suffixes) {
			if (pathname === `/${provider.routePrefix}${suffix}`) {
				return { kind, provider };
			}
		}
	}

	if (!config.defaultProviderPrefix) {
		return null;
	}

	const defaultProvider = config.providers[config.defaultProviderPrefix];
	if (!defaultProvider) {
		return null;
	}

	for (const { kind, suffix } of suffixes) {
		if (pathname === suffix) {
			return { kind, provider: defaultProvider };
		}
	}

	return null;
}

function buildCookieHeader(cookies: Record<string, string> | undefined): string | null {
	if (!cookies) {
		return null;
	}

	const pairs = Object.entries(cookies)
		.filter(([, value]) => typeof value === "string" && value.trim().length > 0)
		.map(([name, value]) => `${name}=${value}`);

	return pairs.length > 0 ? pairs.join("; ") : null;
}

function buildUsageRequest(
	usageQuery: UsageQueryConfig,
	upstreamControlAuth: UpstreamControlAuthConfig,
): Request {
	const upstreamUrl = new URL(usageQuery.request.url);
	const profile = usageQuery.request.authProfile
		? upstreamControlAuth.profiles?.[usageQuery.request.authProfile]
		: undefined;

	for (const [key, value] of Object.entries(profile?.query ?? {})) {
		upstreamUrl.searchParams.set(key, value);
	}
	for (const [key, value] of Object.entries(usageQuery.request.query ?? {})) {
		upstreamUrl.searchParams.set(key, value);
	}

	const headers = new Headers();
	for (const [key, value] of Object.entries(profile?.headers ?? {})) {
		headers.set(key, value);
	}
	for (const [key, value] of Object.entries(usageQuery.request.headers ?? {})) {
		headers.set(key, value);
	}

	const cookieHeader = buildCookieHeader(profile?.cookies);
	if (cookieHeader) {
		headers.set("cookie", cookieHeader);
	}

	return new Request(upstreamUrl, {
		method: usageQuery.request.method ?? "GET",
		headers,
	});
}

async function proxyChatCompletions(
	request: Request,
	upstreamBaseUrl: string,
): Promise<Response> {
	if (!request.headers.get("authorization")) {
		return errorResponse(
			401,
			"missing_authorization",
			"Authorization header is required.",
		);
	}

	const clonedRequest = request.clone();

	const upstreamUrl = new URL(`${upstreamBaseUrl}/chat/completions`);
	const incomingUrl = new URL(request.url);
	upstreamUrl.search = incomingUrl.search;

	const [upstreamResponse, bodyText] = await Promise.all([
		fetch(upstreamUrl, {
			method: "POST",
			headers: buildUpstreamHeaders(request),
			body: request.body,
		}),
		clonedRequest.text(),
	]);

	if (!upstreamResponse.ok) {
		const errorText = await upstreamResponse.text();
		console.warn(`${upstreamResponse.status} response error`, {
			provider: new URL(upstreamBaseUrl).hostname,
			path: incomingUrl.pathname,
			upstreamBaseUrl,
			status: upstreamResponse.status,
			request_id: upstreamResponse.headers.get("x-request-id"),
			content_type: upstreamResponse.headers.get("content-type"),
			payload: bodyText,
			error: errorText.slice(0, 2048),
		});

		return new Response(errorText, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: buildBufferedErrorHeaders(upstreamResponse.headers),
		});
	}

	return new Response(upstreamResponse.body, {
		status: upstreamResponse.status,
		statusText: upstreamResponse.statusText,
		headers: upstreamResponse.headers,
	});
}

async function proxyAnthropicMessages(
	request: Request,
	anthropicUpstreamBaseUrl: string,
): Promise<Response> {
	const upstreamUrl = new URL(`${anthropicUpstreamBaseUrl}/v1/messages`);
	const incomingUrl = new URL(request.url);
	upstreamUrl.search = incomingUrl.search;

	const upstreamResponse = await fetch(upstreamUrl, {
		method: "POST",
		headers: buildUpstreamHeaders(request),
		body: request.body,
	});

	if (!upstreamResponse.ok) {
		const errorText = await upstreamResponse.text();
		return new Response(errorText, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: buildBufferedErrorHeaders(upstreamResponse.headers),
		});
	}

	return new Response(upstreamResponse.body, {
		status: upstreamResponse.status,
		statusText: upstreamResponse.statusText,
		headers: upstreamResponse.headers,
	});
}

async function proxyUsage(provider: ProviderRuntimeConfig): Promise<Response> {
	if (!provider.usageQuery) {
		return errorResponse(
			501,
			"usage_query_not_configured",
			"Usage query is not configured for this provider.",
		);
	}

	const upstreamRequest = buildUsageRequest(
		provider.usageQuery,
		provider.upstreamControlAuth,
	);
	const upstreamResponse = await fetch(upstreamRequest);

	if (!upstreamResponse.ok) {
		const errorText = await upstreamResponse.text();
		return new Response(errorText, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: buildBufferedErrorHeaders(upstreamResponse.headers),
		});
	}

	const payload = await upstreamResponse.json();
	const normalized = normalizeUsage(provider.usageQuery.provider, payload);
	return json(normalized);
}

export default {
	async fetch(
		request: Request,
		env: RuntimeEnv = {},
		_ctx?: unknown,
	): Promise<Response> {
		const url = new URL(request.url);
		const config = readRuntimeConfig(env);
		const resolvedRoute = resolveRoute(url.pathname, config);

		if (resolvedRoute?.kind === "models") {
			if (!resolvedRoute.provider.modelsEnabled) {
				return errorResponse(
					403,
					"models_endpoint_disabled",
					"Models endpoint is disabled.",
				);
			}

			if (request.method !== "GET") {
				return methodNotAllowed(request.method, "GET");
			}
			return modelsResponse(resolvedRoute.provider.models);
		}

		if (resolvedRoute?.kind === "usage") {
			if (request.method !== "GET") {
				return methodNotAllowed(request.method, "GET");
			}
			return proxyUsage(resolvedRoute.provider);
		}

		if (resolvedRoute?.kind === "chat") {
			if (request.method !== "POST") {
				return methodNotAllowed(request.method, "POST");
			}
			return proxyChatCompletions(
				request,
				resolvedRoute.provider.upstreamBaseUrl,
			);
		}

		if (resolvedRoute?.kind === "anthropic") {
			if (request.method !== "POST") {
				return methodNotAllowed(request.method, "POST");
			}
			return proxyAnthropicMessages(
				request,
				resolvedRoute.provider.anthropicUpstreamBaseUrl,
			);
		}

		console.warn("request_not_found", {
			method: request.method,
			path: url.pathname,
			search: url.search,
			hostname: url.hostname,
		});

		return errorResponse(
			404,
			"not_found",
			`Path '${url.pathname}' was not found.`,
		);
	},
};
