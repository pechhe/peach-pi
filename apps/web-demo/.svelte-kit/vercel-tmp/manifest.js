export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set([]),
	mimeTypes: {},
	_: {
		client: {start:"_app/immutable/entry/start.DeuhIfr5.js",app:"_app/immutable/entry/app.CMCIX79g.js",imports:["_app/immutable/entry/start.DeuhIfr5.js","_app/immutable/chunks/DJrwsUqv.js","_app/immutable/chunks/BvMv5qkY.js","_app/immutable/entry/app.CMCIX79g.js","_app/immutable/chunks/BvMv5qkY.js","_app/immutable/chunks/BAZFl48W.js","_app/immutable/chunks/Bl-FVfji.js","_app/immutable/chunks/BSh6u4GM.js","_app/immutable/chunks/Ddf-Y033.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('../output/server/nodes/0.js')),
			__memo(() => import('../output/server/nodes/1.js')),
			__memo(() => import('../output/server/nodes/2.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
