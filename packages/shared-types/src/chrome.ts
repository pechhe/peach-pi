// macOS traffic-light geometry — single-sourced so the native BrowserWindow
// config and any renderer chrome that must clear the OS-drawn buttons stay in
// lockstep. The lights are painted in window points and do NOT scale with
// renderer zoom, so chrome clearing them must be expressed against this and
// divided by the renderer zoom factor to keep a constant physical gap.
export const TRAFFIC_LIGHTS = {
  /** Top-left position handed to BrowserWindow.trafficLightPosition. */
  position: { x: 16, y: 16 },
  /** Button height (each light is a ~14pt circle). */
  buttonHeight: 14,
  /** Breathing room between the buttons and content below. */
  gap: 20,
} as const;

/**
 * Vertical offset (px, at 100% zoom) where sidebar/nav content can start,
 * clearing the traffic lights: their top + button height + a gap.
 * Reacts to the configured position so moving the buttons shifts the content.
 */
export const TRAFFIC_LIGHT_BOTTOM =
  TRAFFIC_LIGHTS.position.y + TRAFFIC_LIGHTS.buttonHeight + TRAFFIC_LIGHTS.gap; // 50
