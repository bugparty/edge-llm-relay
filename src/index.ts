const BAIDU_BASE_URL = "https://qianfan.baidubce.com/v2/coding";
const MODEL_CREATED_AT = 1775601600;
const MODEL_OWNER = "baidu-qianfan";

const BAIDU_MODELS = [
	"ernie-4.5-turbo-20260402",
	"minimax-m2.5",
	"deepseek-v3.2",
	"glm-5",
	"kimi-k2.5",
];

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

function buildUpstreamHeaders(request: Request): Headers {
	const headers = new Headers();

	// Standard HTTP headers
	const standardHeaders = [
		"authorization",
		"content-type",
		"accept",
		"accept-encoding",
		"connection",
		"user-agent",
	];

	// Custom headers to pass through
	const customHeaders = [
		"x-app",
		"x-claude-code-session-id",
		"x-forwarded-proto",
		"x-real-ip",
		"x-stainless-arch",
		"x-stainless-lang",
		"x-stainless-os",
		"x-stainless-package-version",
		"x-stainless-retry-count",
		"x-stainless-runtime",
		"x-stainless-runtime-version",
		"x-stainless-timeout",
	];

	for (const name of [...standardHeaders, ...customHeaders]) {
		const value = request.headers.get(name);
		if (value) {
			headers.set(name, value);
		}
	}

	return headers;
}

function modelsResponse(): Response {
	return json({
		object: "list",
		data: BAIDU_MODELS.map((id) => ({
			id,
			object: "model",
			created: MODEL_CREATED_AT,
			owned_by: MODEL_OWNER,
		})),
	});
}

function isModelsPath(pathname: string): boolean {
	return pathname === "/baidu/v1/models" || pathname === "/v1/models";
}

function isChatCompletionsPath(pathname: string): boolean {
	return (
		pathname === "/baidu/v1/chat/completions" ||
		pathname === "/v1/chat/completions"
	);
}

async function proxyChatCompletions(request: Request): Promise<Response> {
	const upstreamUrl = new URL(`${BAIDU_BASE_URL}/chat/completions`);
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
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (isModelsPath(url.pathname)) {
			if (request.method !== "GET") {
				return methodNotAllowed(request.method, "GET");
			}
			return modelsResponse();
		}

		if (isChatCompletionsPath(url.pathname)) {
			if (request.method !== "POST") {
				return methodNotAllowed(request.method, "POST");
			}
			return proxyChatCompletions(request);
		}

		return errorResponse(
			404,
			"not_found",
			`Path '${url.pathname}' was not found.`,
		);
	},
};
