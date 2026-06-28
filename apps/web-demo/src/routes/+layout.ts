// The demo mounts the desktop renderer, which reads `window.peachPi` at
// runtime. SSR is off so we don't try to access `window` on the server.
// (prerender requires SSR — leaving it off.)
export const ssr = false;
