
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/private';
 * 
 * console.log(ENVIRONMENT); // => "production"
 * console.log(PUBLIC_BASE_URL); // => throws error during build
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/private' {
	export const COLORTERM: string;
	export const AEROLINK_API_KEY: string;
	export const OSLogRateLimit: string;
	export const BUN_INSTALL: string;
	export const GHOSTTY_BIN_DIR: string;
	export const npm_lifecycle_script: string;
	export const LOGNAME: string;
	export const VP_TOOL_RECURSION: string;
	export const npm_config_prefix: string;
	export const SHLVL: string;
	export const XDG_DATA_DIRS: string;
	export const pnpm_config_verify_deps_before_run: string;
	export const XPC_SERVICE_NAME: string;
	export const npm_package_version: string;
	export const GHOSTTY_RESOURCES_DIR: string;
	export const NODE_ENV: string;
	export const FIRECRAWL_API_KEY: string;
	export const npm_package_name: string;
	export const DEEPSEEK_API_KEY: string;
	export const LEMLIST_API_KEY: string;
	export const npm_config_node_gyp: string;
	export const TELNYX_API_KEY: string;
	export const PWD: string;
	export const npm_config__jsr_registry: string;
	export const npm_lifecycle_event: string;
	export const USER: string;
	export const __CFBundleIdentifier: string;
	export const PI_SUBAGENT_PI_COMMAND: string;
	export const GHOSTTY_SHELL_FEATURES: string;
	export const npm_config_node_linker: string;
	export const LaunchInstanceID: string;
	export const npm_config_verify_deps_before_run: string;
	export const npm_config_frozen_lockfile: string;
	export const npm_execpath: string;
	export const __CF_USER_TEXT_ENCODING: string;
	export const SECURITYSESSIONID: string;
	export const SSH_AUTH_SOCK: string;
	export const COMMAND_MODE: string;
	export const npm_package_json: string;
	export const npm_config_npm_globalconfig: string;
	export const npm_config_user_agent: string;
	export const POSTHOG_PERSONAL_API_KEY: string;
	export const VITE_CJS_IGNORE_WARNING: string;
	export const TERM: string;
	export const TMPDIR: string;
	export const NODE: string;
	export const TERMINFO: string;
	export const npm_command: string;
	export const XPC_FLAGS: string;
	export const SVELTEKIT_FORK: string;
	export const _: string;
	export const npm_node_execpath: string;
	export const PNPM_SCRIPT_SRC_DIR: string;
	export const npm_config_registry: string;
	export const npm_config_catalog: string;
	export const LANG: string;
	export const BWS_ACCESS_TOKEN: string;
	export const SHELL: string;
	export const npm_config_globalconfig: string;
	export const XIAOMI_MIMO_API_KEY: string;
	export const RAILWAY_TOKEN: string;
	export const TERM_PROGRAM_VERSION: string;
	export const PATH: string;
	export const TAVILY_API_KEY: string;
	export const npm_config_recursive: string;
	export const HOME: string;
	export const TERM_PROGRAM: string;
	export const INIT_CWD: string;
	export const MANPATH: string;
}

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/public';
 * 
 * console.log(ENVIRONMENT); // => throws error during build
 * console.log(PUBLIC_BASE_URL); // => "http://site.com"
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * 
 * console.log(env.ENVIRONMENT); // => "production"
 * console.log(env.PUBLIC_BASE_URL); // => undefined
 * ```
 */
declare module '$env/dynamic/private' {
	export const env: {
		COLORTERM: string;
		AEROLINK_API_KEY: string;
		OSLogRateLimit: string;
		BUN_INSTALL: string;
		GHOSTTY_BIN_DIR: string;
		npm_lifecycle_script: string;
		LOGNAME: string;
		VP_TOOL_RECURSION: string;
		npm_config_prefix: string;
		SHLVL: string;
		XDG_DATA_DIRS: string;
		pnpm_config_verify_deps_before_run: string;
		XPC_SERVICE_NAME: string;
		npm_package_version: string;
		GHOSTTY_RESOURCES_DIR: string;
		NODE_ENV: string;
		FIRECRAWL_API_KEY: string;
		npm_package_name: string;
		DEEPSEEK_API_KEY: string;
		LEMLIST_API_KEY: string;
		npm_config_node_gyp: string;
		TELNYX_API_KEY: string;
		PWD: string;
		npm_config__jsr_registry: string;
		npm_lifecycle_event: string;
		USER: string;
		__CFBundleIdentifier: string;
		PI_SUBAGENT_PI_COMMAND: string;
		GHOSTTY_SHELL_FEATURES: string;
		npm_config_node_linker: string;
		LaunchInstanceID: string;
		npm_config_verify_deps_before_run: string;
		npm_config_frozen_lockfile: string;
		npm_execpath: string;
		__CF_USER_TEXT_ENCODING: string;
		SECURITYSESSIONID: string;
		SSH_AUTH_SOCK: string;
		COMMAND_MODE: string;
		npm_package_json: string;
		npm_config_npm_globalconfig: string;
		npm_config_user_agent: string;
		POSTHOG_PERSONAL_API_KEY: string;
		VITE_CJS_IGNORE_WARNING: string;
		TERM: string;
		TMPDIR: string;
		NODE: string;
		TERMINFO: string;
		npm_command: string;
		XPC_FLAGS: string;
		SVELTEKIT_FORK: string;
		_: string;
		npm_node_execpath: string;
		PNPM_SCRIPT_SRC_DIR: string;
		npm_config_registry: string;
		npm_config_catalog: string;
		LANG: string;
		BWS_ACCESS_TOKEN: string;
		SHELL: string;
		npm_config_globalconfig: string;
		XIAOMI_MIMO_API_KEY: string;
		RAILWAY_TOKEN: string;
		TERM_PROGRAM_VERSION: string;
		PATH: string;
		TAVILY_API_KEY: string;
		npm_config_recursive: string;
		HOME: string;
		TERM_PROGRAM: string;
		INIT_CWD: string;
		MANPATH: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://example.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.ENVIRONMENT); // => undefined, not public
 * console.log(env.PUBLIC_BASE_URL); // => "http://example.com"
 * ```
 * 
 * ```
 * 
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
