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
		client: {start:"_app/immutable/entry/start.zDVzg8lF.js",app:"_app/immutable/entry/app.CoIKjNkW.js",imports:["_app/immutable/entry/start.zDVzg8lF.js","_app/immutable/chunks/B19-yIFJ.js","_app/immutable/chunks/Cl7UFxbD.js","_app/immutable/entry/app.CoIKjNkW.js","_app/immutable/chunks/Cl7UFxbD.js","_app/immutable/chunks/Btbzkeod.js","_app/immutable/chunks/CWznhN6c.js","_app/immutable/chunks/CPo_hOuH.js","_app/immutable/chunks/50PH0yl5.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
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
