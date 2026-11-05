const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const ICONS: Record<string, string> = {
  ink: svg('<path d="M12 3l5 8-5 10-5-10z"/><circle cx="12" cy="11" r="1.3"/><path d="M12 12.3V16"/>'),
  felt: svg('<path d="M15.5 4.5l4 4L9 19l-5 1 1-5z"/><path d="M13 7l4 4"/>'),
  highlighter: svg('<path d="M14 4l6 6-7 7-6-6z"/><path d="M7 11l-3 5 3 3 1-1"/><path d="M4 21h16" stroke-width="2.6" opacity=".45"/>'),
  strokeEraser: svg('<path d="M9 20h11"/><path d="M5.5 15.5L15 6l5 5-8.5 8.5H8z"/><path d="M10 11l5 5"/>'),
  areaEraser: svg('<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="2.2"/>'),
  ellipse: svg('<circle cx="12" cy="12" r="8"/>'),
  triangle: svg('<path d="M12 4l9 16H3z"/>'),
  rect: svg('<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/>'),
  arrow: svg('<path d="M5 19L19 5"/><path d="M9 5h10v10"/>'),
  text: svg('<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'),
  redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>'),
  caret: svg('<path d="M7 10l5 5 5-5"/>'),
}
