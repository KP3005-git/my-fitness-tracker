const paths = {
  today: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h3m3 0h2"/>',
  history: '<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6m3-3v5l3 2"/>',
  targets: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  timer: '<circle cx="12" cy="14" r="8"/><path d="M9 2h6m-3 0v4m0 5v4l2-2m4-7 2-2"/>',
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  lift: '<path d="m5 9 4-4m6 14 4-4M4 6l2-2 4 4-2 2zm10 10 2-2 4 4-2 2zm-5-7 6 6M2 8l2-2m14 14 2-2"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  layers:
    '<path d="m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5m-18 9 9 5 9-5" transform="translate(0 -1) scale(1 .93)"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  share: '<path d="M12 15V3m-4 4 4-4 4 4M7 10H5v10h14V10h-2"/>',
  coach: '<path d="M4 4h16a1 1 0 0 1 1 1v11H9l-5 4zm4 5h8m-8 3h5"/>',
  warm: '<path d="M13 2c2 6-1 6 1 10 2-1 3-3 3-5 4 4 5 9 1 13-3 3-10 3-13-2-2-4 1-9 4-12-1 3 0 5 2 6 2-3-1-5 2-10Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  expand: '<path d="M13 4h7v7m0-7-8 8M4 13v7h7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  note: '<path d="M5 3h11l3 3v15H5zm3 6h8m-8 4h8m-8 4h5"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chart: '<path d="M4 4v16h16M7 15l4-5 3 2 5-7"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  flag: '<path d="M5 21V4c6-4 8 4 15 0v10c-6 4-9-4-15 0"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  link: '<path d="m9 8 3-3a5 5 0 0 1 7 7l-3 3M8 9l-3 3a5 5 0 0 0 7 7l3-3m-6-1 6-6"/>',
};
export const icon = (key) =>
  '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  (paths[key] || '') +
  '</svg>';
