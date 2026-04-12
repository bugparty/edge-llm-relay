const DEFAULT_UPSTREAM_BASE_URL = "https://qianfan.baidubce.com/v2/coding";
const DEFAULT_ANTHROPIC_UPSTREAM_BASE_URL = "https://qianfan.baidubce.com/anthropic/coding";
const DEFAULT_MODEL_CREATED_AT = 1775601600;
const DEFAULT_MODEL_OWNER = "baidu-qianfan";
const DEFAULT_ROUTE_PREFIX = "baidu";

const DEFAULT_MODELS = [
	"ernie-4.5-turbo-20260402",
	"minimax-m2.5",
	"deepseek-v3.2",
	"glm-5",
	"kimi-k2.5",
];

type ModelResponseItem = {
	id: string;
	object: "model";
	created: number;
	owned_by: string;
};

type ModelInput = {
	id: string;
	created?: number;
	owned_by?: string;
};

type RuntimeConfig = {
	routePrefix: string;
	modelsEnabled: boolean;
	upstreamBaseUrl: string;
	anthropicUpstreamBaseUrl: string;
	models: ModelResponseItem[];
};

type RuntimeEnv = {
	ROUTE_PREFIX?: string;
	MODELS_ENABLED?: string;
	UPSTREAM_BASE_URL?: string;
	ANTHROPIC_UPSTREAM_BASE_URL?: string;
	MODELS_JSON?: string;
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

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
	if (!value) {
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

function parseModelsJson(value: string | undefined): ModelResponseItem[] {
	if (!value) {
		return defaultModels();
	}

	try {
		const parsed = JSON.parse(value) as ModelInput[];
		if (!Array.isArray(parsed)) {
			return defaultModels();
		}

		const models = parsed
			.filter((item) => item && typeof item.id === "string" && item.id.trim().length > 0)
			.map((item) => ({
				id: item.id.trim(),
				object: "model" as const,
				created:
					typeof item.created === "number" && Number.isFinite(item.created)
						? item.created
						: DEFAULT_MODEL_CREATED_AT,
				owned_by:
					typeof item.owned_by === "string" && item.owned_by.trim().length > 0
						? item.owned_by.trim()
						: DEFAULT_MODEL_OWNER,
			}));

		return models.length > 0 ? models : defaultModels();
	} catch {
		return defaultModels();
	}
}

function readRuntimeConfig(env: RuntimeEnv): RuntimeConfig {
	return {
		routePrefix: normalizePrefix(env.ROUTE_PREFIX),
		modelsEnabled: parseBoolean(env.MODELS_ENABLED, true),
		upstreamBaseUrl: normalizeUpstreamBaseUrl(env.UPSTREAM_BASE_URL),
		anthropicUpstreamBaseUrl: normalizeAnthropicUpstreamBaseUrl(
			env.ANTHROPIC_UPSTREAM_BASE_URL,
		),
		models: parseModelsJson(env.MODELS_JSON),
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

function modelsResponse(models: ModelResponseItem[]): Response {
	return json({
		object: "list",
		data: models,
	});
}

function isModelsPath(pathname: string, prefix: string): boolean {
	return pathname === `/${prefix}/v1/models` || pathname === "/v1/models";
}

function isChatCompletionsPath(pathname: string, prefix: string): boolean {
	return (
		pathname === `/${prefix}/v1/chat/completions` ||
		pathname === "/v1/chat/completions"
	);
}

function isAnthropicMessagesPath(pathname: string, prefix: string): boolean {
	return (
		pathname === `/${prefix}/anthropic/v1/messages` ||
		pathname === "/anthropic/v1/messages"
	);
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

	const upstreamUrl = new URL(`${upstreamBaseUrl}/chat/completions`);
	const incomingUrl = new URL(request.url);
	upstreamUrl.search = incomingUrl.search;

	const upstreamResponse = await fetch(upstreamUrl, {
		method: "POST",
		headers: buildUpstreamHeaders(request),
		body: request.body,
	});

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

	return new Response(upstreamResponse.body, {
		status: upstreamResponse.status,
		statusText: upstreamResponse.statusText,
		headers: upstreamResponse.headers,
	});
}

export default {
	async fetch(
		request: Request,
		env: RuntimeEnv = {},
		_ctx?: unknown,
	): Promise<Response> {
		const url = new URL(request.url);
		const config = readRuntimeConfig(env);

		if (isModelsPath(url.pathname, config.routePrefix)) {
			if (!config.modelsEnabled) {
				return errorResponse(
					403,
					"models_endpoint_disabled",
					"Models endpoint is disabled.",
				);
			}

			if (request.method !== "GET") {
				return methodNotAllowed(request.method, "GET");
			}
			return modelsResponse(config.models);
		}

		if (isChatCompletionsPath(url.pathname, config.routePrefix)) {
			if (request.method !== "POST") {
				return methodNotAllowed(request.method, "POST");
			}
			return proxyChatCompletions(request, config.upstreamBaseUrl);
		}

		if (isAnthropicMessagesPath(url.pathname, config.routePrefix)) {
			if (request.method !== "POST") {
				return methodNotAllowed(request.method, "POST");
			}
			return proxyAnthropicMessages(request, config.anthropicUpstreamBaseUrl);
		}

		return errorResponse(
			404,
			"not_found",
			`Path '${url.pathname}' was not found.`,
		);
	},
};
