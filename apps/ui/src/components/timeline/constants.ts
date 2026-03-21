/**
 * Timeline layout constants.
 * All values in pixels unless otherwise noted.
 */

/** Width of the track header panel (left sidebar) */
export const TRACK_HEADER_WIDTH = 150;

/** Height of the time ruler at the top */
export const RULER_HEIGHT = 40;

/** Height of each track */
export const TRACK_HEIGHT = 80;

/** Padding inside clips */
export const CLIP_PADDING = 4;

/** Snap threshold in pixels */
export const SNAP_THRESHOLD = 10;

/** Maximum zoom level (pixels per second) */
export const MAX_ZOOM = 500;

/** Minimum zoom level (pixels per second) */
export const MIN_ZOOM = 1;

/** Default zoom level (pixels per second) */
export const DEFAULT_ZOOM = 50;

/** Colors for the timeline */
export const COLORS = {
  background: "#1a1a1a",
  trackBackground: "#242424",
  trackBackgroundAlt: "#1e1e1e",
  trackBorder: "#333333",
  ruler: "#2a2a2a",
  rulerText: "#888888",
  rulerMajorLine: "#444444",
  rulerMinorLine: "#333333",
  playhead: "#ffffff",
  playheadLine: "#ffffff",
  snapLine: "#ffcc00",
  selection: "rgba(66, 133, 244, 0.3)",
  selectionBorder: "#4285f4",
  clipVideo: "#4a90d9",
  clipAudio: "#5cb85c",
  clipImage: "#9b59b6",
  clipText: "#e67e22",
  clipShape: "#1abc9c",
  clipSelected: "#ffffff",
  clipBorder: "rgba(255, 255, 255, 0.3)",
  trimHandle: "#ffffff",
  headerBackground: "#1e1e1e",
  headerText: "#cccccc",
  headerBorder: "#333333",
  transitionOverlay: "rgba(140, 0, 140, 0.50)",
  transitionHandle: "#ffffff",
  transitionDropZone: "rgba(255, 200, 50, 0.3)",
};
