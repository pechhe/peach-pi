// Dot-matrix loader preferences. Each surface area of the app uses a different
// grid shape, and the user can curate which loaders appear in each area from
// the Settings playground. Three independent selection sets:
//
//   square   → chat surface (Thinking… indicators)
//   hex      → sidebar (session running spinners)
//   triangle → agents (subagent active nodes)
//
// Persisted to localStorage; the `storage` event keeps every window in sync.
// The random picker draws from the user's selected set per shape.

import {
	DEFAULT_HEX,
	DEFAULT_SQUARE,
	DEFAULT_TRIANGLE,
	type LoaderShape,
} from "../components/ui/dot-matrix/registry.svelte";

const KEY: Record<LoaderShape, string> = {
	square: "peachpi:dotMatrixLoaders:square",
	hex: "peachpi:dotMatrixLoaders:hex",
	triangle: "peachpi:dotMatrixLoaders:triangle",
};

const DEFAULTS: Record<LoaderShape, readonly string[]> = {
	square: DEFAULT_SQUARE,
	hex: DEFAULT_HEX,
	triangle: DEFAULT_TRIANGLE,
};

function readStored(shape: LoaderShape): string[] {
	try {
		const raw = localStorage.getItem(KEY[shape]);
		if (!raw) return [...DEFAULTS[shape]];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULTS[shape]];
	} catch {
		return [...DEFAULTS[shape]];
	}
}

function persist(shape: LoaderShape, ids: string[]): void {
	try {
		localStorage.setItem(KEY[shape], JSON.stringify(ids));
	} catch {
		/* ignore */
	}
}

class LoaderPrefsStore {
	square = $state<string[]>([...DEFAULT_SQUARE]);
	hex = $state<string[]>([...DEFAULT_HEX]);
	triangle = $state<string[]>([...DEFAULT_TRIANGLE]);

	/** Hydrate from localStorage. Call once before mount. */
	init(): void {
		this.square = readStored("square");
		this.hex = readStored("hex");
		this.triangle = readStored("triangle");

		window.addEventListener("storage", (e) => {
			if (e.key === KEY.square && e.newValue) this.square = safeParse(e.newValue, "square");
			else if (e.key === KEY.hex && e.newValue) this.hex = safeParse(e.newValue, "hex");
			else if (e.key === KEY.triangle && e.newValue)
				this.triangle = safeParse(e.newValue, "triangle");
		});
	}

	/** The set the picker should draw from for a given shape. */
	selection(shape: LoaderShape): string[] {
		const ids = this[shape];
		return ids.length > 0 ? ids : [...DEFAULTS[shape]];
	}

	toggle(shape: LoaderShape, id: string): void {
		const current = this[shape];
		const next = current.includes(id)
			? current.filter((x) => x !== id)
			: [...current, id];
		// Never allow an empty selection — fall back to defaults so the picker
		// always has something to draw from.
		this[shape] = next.length > 0 ? next : [...DEFAULTS[shape]];
		persist(shape, this[shape]);
	}

	setSelection(shape: LoaderShape, ids: string[]): void {
		this[shape] = ids.length > 0 ? ids : [...DEFAULTS[shape]];
		persist(shape, this[shape]);
	}
}

function safeParse(raw: string, shape: LoaderShape): string[] {
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULTS[shape]];
	} catch {
		return [...DEFAULTS[shape]];
	}
}

export const loaderPrefs = new LoaderPrefsStore();
