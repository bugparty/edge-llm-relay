declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./src/index");
	}
	interface Env {
		BAIDU_KEY: string;
		ROUTE_PREFIX: string;
		MODELS_ENABLED: string;
		UPSTREAM_BASE_URL: string;
		ANTHROPIC_UPSTREAM_BASE_URL: string;
		MODELS_JSON: string;
	}
}
interface Env extends Cloudflare.Env {}
type StringifyValues<EnvType extends Record<string, unknown>> = {
	[Binding in keyof EnvType]: EnvType[Binding] extends string ? EnvType[Binding] : string;
};
declare namespace NodeJS {
	interface ProcessEnv
		extends StringifyValues<
			Pick<
				Cloudflare.Env,
				| "BAIDU_KEY"
				| "ROUTE_PREFIX"
				| "MODELS_ENABLED"
				| "UPSTREAM_BASE_URL"
				| "ANTHROPIC_UPSTREAM_BASE_URL"
				| "MODELS_JSON"
			>
		> {}
}
