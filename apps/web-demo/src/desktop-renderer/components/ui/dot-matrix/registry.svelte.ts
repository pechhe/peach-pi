// Dot-matrix loader registry: maps each loader ID to its friendly name (as it
// appears on dotmatrix.zzzzshawn.cloud), its grid shape, and the component.
//
// Names are sourced 1:1 from sv-matrix's matrix-navigation.ts (the canonical
// titles used on the public site). Components are statically imported so the
// picker resolves synchronously — ~50 small shells over the shared dmx runtime.

import type { Component } from "svelte";

import Square1 from "../../../lib/components/loaders/square/square-1.svelte";
import Square2 from "../../../lib/components/loaders/square/square-2.svelte";
import Square3 from "../../../lib/components/loaders/square/square-3.svelte";
import Square4 from "../../../lib/components/loaders/square/square-4.svelte";
import Square5 from "../../../lib/components/loaders/square/square-5.svelte";
import Square6 from "../../../lib/components/loaders/square/square-6.svelte";
import Square7 from "../../../lib/components/loaders/square/square-7.svelte";
import Square8 from "../../../lib/components/loaders/square/square-8.svelte";
import Square9 from "../../../lib/components/loaders/square/square-9.svelte";
import Square10 from "../../../lib/components/loaders/square/square-10.svelte";
import Square11 from "../../../lib/components/loaders/square/square-11.svelte";
import Square12 from "../../../lib/components/loaders/square/square-12.svelte";
import Square13 from "../../../lib/components/loaders/square/square-13.svelte";
import Square14 from "../../../lib/components/loaders/square/square-14.svelte";
import Square15 from "../../../lib/components/loaders/square/square-15.svelte";
import Square16 from "../../../lib/components/loaders/square/square-16.svelte";
import Square17 from "../../../lib/components/loaders/square/square-17.svelte";
import Square18 from "../../../lib/components/loaders/square/square-18.svelte";
import Square19 from "../../../lib/components/loaders/square/square-19.svelte";
import Square20 from "../../../lib/components/loaders/square/square-20.svelte";

import Hex1 from "../../../lib/components/loaders/hex/hex-1.svelte";
import Hex2 from "../../../lib/components/loaders/hex/hex-2.svelte";
import Hex3 from "../../../lib/components/loaders/hex/hex-3.svelte";
import Hex4 from "../../../lib/components/loaders/hex/hex-4.svelte";
import Hex5 from "../../../lib/components/loaders/hex/hex-5.svelte";
import Hex6 from "../../../lib/components/loaders/hex/hex-6.svelte";
import Hex7 from "../../../lib/components/loaders/hex/hex-7.svelte";
import Hex8 from "../../../lib/components/loaders/hex/hex-8.svelte";
import Hex9 from "../../../lib/components/loaders/hex/hex-9.svelte";
import Hex10 from "../../../lib/components/loaders/hex/hex-10.svelte";

import Triangle1 from "../../../lib/components/loaders/triangle/triangle-1.svelte";
import Triangle2 from "../../../lib/components/loaders/triangle/triangle-2.svelte";
import Triangle3 from "../../../lib/components/loaders/triangle/triangle-3.svelte";
import Triangle4 from "../../../lib/components/loaders/triangle/triangle-4.svelte";
import Triangle5 from "../../../lib/components/loaders/triangle/triangle-5.svelte";
import Triangle6 from "../../../lib/components/loaders/triangle/triangle-6.svelte";
import Triangle7 from "../../../lib/components/loaders/triangle/triangle-7.svelte";
import Triangle8 from "../../../lib/components/loaders/triangle/triangle-8.svelte";
import Triangle9 from "../../../lib/components/loaders/triangle/triangle-9.svelte";
import Triangle10 from "../../../lib/components/loaders/triangle/triangle-10.svelte";
import Triangle11 from "../../../lib/components/loaders/triangle/triangle-11.svelte";
import Triangle12 from "../../../lib/components/loaders/triangle/triangle-12.svelte";
import Triangle13 from "../../../lib/components/loaders/triangle/triangle-13.svelte";
import Triangle14 from "../../../lib/components/loaders/triangle/triangle-14.svelte";
import Triangle15 from "../../../lib/components/loaders/triangle/triangle-15.svelte";
import Triangle16 from "../../../lib/components/loaders/triangle/triangle-16.svelte";
import Triangle17 from "../../../lib/components/loaders/triangle/triangle-17.svelte";
import Triangle18 from "../../../lib/components/loaders/triangle/triangle-18.svelte";
import Triangle19 from "../../../lib/components/loaders/triangle/triangle-19.svelte";
import Triangle20 from "../../../lib/components/loaders/triangle/triangle-20.svelte";

export type LoaderShape = "square" | "hex" | "triangle";

export interface LoaderEntry {
	id: string;
	name: string;
	shape: LoaderShape;
	component: Component;
}

const ENTRIES: LoaderEntry[] = [
	{ id: "square-1", name: "Neon Drift", shape: "square", component: Square1 },
	{ id: "square-2", name: "Pulse Ladder", shape: "square", component: Square2 },
	{ id: "square-3", name: "Core Spiral", shape: "square", component: Square3 },
	{ id: "square-4", name: "Twin Orbit", shape: "square", component: Square4 },
	{ id: "square-5", name: "Prism Sweep", shape: "square", component: Square5 },
	{ id: "square-6", name: "Flux Columns", shape: "square", component: Square6 },
	{ id: "square-7", name: "Block Drop", shape: "square", component: Square7 },
	{ id: "square-8", name: "Strobe Stack", shape: "square", component: Square8 },
	{ id: "square-9", name: "Glyph Pulse", shape: "square", component: Square9 },
	{ id: "square-10", name: "CRT Glide", shape: "square", component: Square10 },
	{ id: "square-11", name: "Echo Ring", shape: "square", component: Square11 },
	{ id: "square-12", name: "Origin Wave", shape: "square", component: Square12 },
	{ id: "square-13", name: "Core Rotar", shape: "square", component: Square13 },
	{ id: "square-14", name: "Prism Bloom", shape: "square", component: Square14 },
	{ id: "square-15", name: "Helix Glow", shape: "square", component: Square15 },
	{ id: "square-16", name: "Helix Core", shape: "square", component: Square16 },
	{ id: "square-17", name: "Half Helix", shape: "square", component: Square17 },
	{ id: "square-18", name: "Sound Bars", shape: "square", component: Square18 },
	{ id: "square-19", name: "Lemniscate Pulse", shape: "square", component: Square19 },
	{ id: "square-20", name: "Mobius Ring", shape: "square", component: Square20 },

	{ id: "hex-1", name: "Hex Orbit", shape: "hex", component: Hex1 },
	{ id: "hex-2", name: "Prism Bloom", shape: "hex", component: Hex2 },
	{ id: "hex-3", name: "Honey Gate", shape: "hex", component: Hex3 },
	{ id: "hex-4", name: "Vertex Relay", shape: "hex", component: Hex4 },
	{ id: "hex-5", name: "Spiral Lattice", shape: "hex", component: Hex5 },
	{ id: "hex-6", name: "Chevron March", shape: "hex", component: Hex6 },
	{ id: "hex-7", name: "Hourglass Flip", shape: "hex", component: Hex7 },
	{ id: "hex-8", name: "Glyph Flip", shape: "hex", component: Hex8 },
	{ id: "hex-9", name: "Petal Shimmer", shape: "hex", component: Hex9 },
	{ id: "hex-10", name: "Liquid Vortex", shape: "hex", component: Hex10 },

	{ id: "triangle-1", name: "Core Spokes", shape: "triangle", component: Triangle1 },
	{ id: "triangle-2", name: "Altitude Wave", shape: "triangle", component: Triangle2 },
	{ id: "triangle-3", name: "Corner Bounce", shape: "triangle", component: Triangle3 },
	{ id: "triangle-4", name: "Vertex Chase", shape: "triangle", component: Triangle4 },
	{ id: "triangle-5", name: "Row Sweep", shape: "triangle", component: Triangle5 },
	{ id: "triangle-6", name: "Braille Beat", shape: "triangle", component: Triangle6 },
	{ id: "triangle-7", name: "Oblique Weave", shape: "triangle", component: Triangle7 },
	{ id: "triangle-8", name: "Wing Metronome", shape: "triangle", component: Triangle8 },
	{ id: "triangle-9", name: "Corona Tier", shape: "triangle", component: Triangle9 },
	{ id: "triangle-10", name: "Column Rake", shape: "triangle", component: Triangle10 },
	{ id: "triangle-11", name: "Shelf Descent", shape: "triangle", component: Triangle11 },
	{ id: "triangle-12", name: "Skew Drift", shape: "triangle", component: Triangle12 },
	{ id: "triangle-13", name: "Serpent Zip", shape: "triangle", component: Triangle13 },
	{ id: "triangle-14", name: "Pillar Sweep", shape: "triangle", component: Triangle14 },
	{ id: "triangle-15", name: "Tripod Handoff", shape: "triangle", component: Triangle15 },
	{ id: "triangle-16", name: "Updraft", shape: "triangle", component: Triangle16 },
	{ id: "triangle-17", name: "Infinity Trace", shape: "triangle", component: Triangle17 },
	{ id: "triangle-18", name: "Hollow Shell", shape: "triangle", component: Triangle18 },
	{ id: "triangle-19", name: "Pivot Ray", shape: "triangle", component: Triangle19 },
	{ id: "triangle-20", name: "Twin Perimeter", shape: "triangle", component: Triangle20 },
];

export const REGISTRY: readonly LoaderEntry[] = ENTRIES;

// Default curated selection per shape (10 each) — visually distinct + legible
// at small inline sizes. The random picker draws from these unless the user
// changes the selection in the playground.
export const DEFAULT_SQUARE = [
	"square-1", // Neon Drift
	"square-3", // Core Spiral
	"square-4", // Twin Orbit
	"square-5", // Prism Sweep
	"square-7", // Block Drop
	"square-8", // Strobe Stack
	"square-10", // CRT Glide
	"square-11", // Echo Ring
	"square-12", // Origin Wave
	"square-18", // Sound Bars
] as const;

export const DEFAULT_HEX = [
	"hex-1", // Hex Orbit
	"hex-2", // Prism Bloom
	"hex-3", // Honey Gate
	"hex-4", // Vertex Relay
	"hex-5", // Spiral Lattice
	"hex-6", // Chevron March
	"hex-7", // Hourglass Flip
	"hex-8", // Glyph Flip
	"hex-9", // Petal Shimmer
	"hex-10", // Liquid Vortex
] as const;

export const DEFAULT_TRIANGLE = [
	"triangle-1", // Core Spokes
	"triangle-2", // Altitude Wave
	"triangle-3", // Corner Bounce
	"triangle-4", // Vertex Chase
	"triangle-5", // Row Sweep
	"triangle-6", // Braille Beat
	"triangle-13", // Serpent Zip
	"triangle-14", // Pillar Sweep
	"triangle-16", // Updraft
	"triangle-17", // Infinity Trace
] as const;

export function byId(id: string): LoaderEntry | undefined {
	return ENTRIES.find((e) => e.id === id);
}

export function byShape(shape: LoaderShape): LoaderEntry[] {
	return ENTRIES.filter((e) => e.shape === shape);
}
