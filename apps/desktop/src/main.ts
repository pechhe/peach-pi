import { mount } from "svelte";
import App from "./app/App.svelte";
import OverlayComposer from "./app/OverlayComposer.svelte";
import "./styles/app.css";

// Same bundle serves both windows; overlay window loads with #overlay.
const Root = window.location.hash === "#overlay" ? OverlayComposer : App;
const app = mount(Root, { target: document.getElementById("app")! });

export default app;
