const paths={
  pause:'M8 5v14M16 5v14', sound:'M4 9h4l5-4v14l-5-4H4zM17 8c3 2 3 6 0 8',
  fullscreen:'M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5', close:'M6 6l12 12M18 6L6 18',
  map:'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
  plane:'M12 3l2 7 7 5v2l-8-2v5l2 1H9l2-1v-5l-8 2v-2l7-5z',
  network:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
  help:'M9 8a3 3 0 1 1 4 3c-1 1-1 2-1 3M12 18h.01',
};
export function icon(name) { return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name] || paths.plane}"/></svg>`; }
