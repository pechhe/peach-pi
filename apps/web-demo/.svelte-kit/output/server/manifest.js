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
		client: {start:"_app/immutable/entry/start.DtF4MzOS.js",app:"_app/immutable/entry/app.BCEs6ogG.js",imports:["_app/immutable/entry/start.DtF4MzOS.js","_app/immutable/chunks/Dlaq1uLH.js","_app/immutable/chunks/zONpWwEL.js","_app/immutable/entry/app.BCEs6ogG.js","_app/immutable/chunks/zONpWwEL.js","_app/immutable/chunks/BEA4a2CZ.js","_app/immutable/chunks/28V5PsRJ.js","_app/immutable/chunks/BVUgP6ZU.js","_app/immutable/chunks/q-PTNDSZ.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js'))
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
