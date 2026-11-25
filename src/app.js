import {
  today,
  showDate,
  validDate,
  blocksFor,
  lookup,
  range,
  clockText,
  numeric,
  toLocalRow,
  mergeHistory,
  detailsOf,
  volume,
  peak,
  repText,
  weightText,
  exportedLift,
  compact,
  csvText,
} from './model.js';
import { fieldKey, save, openStore, readSessions, fetchFeed } from './storage.js';
import { demoFiles } from './demo-files.js';
import { icon } from './icons.js';

const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const attrs = (action, extra = '') => 'type="button" data-action="' + action + '" ' + extra;
const button = (action, label, ico, classes = '', extra = '') =>
  '<button ' +
  attrs(action, extra) +
  ' class="' +
  classes +
  '">' +
  (ico ? icon(ico) : '') +
  label +
  '</button>';
const title = (label, ico) => '<h2 class="panel-title">' + icon(ico) + esc(label) + '</h2>';
const shortDate = (d) => showDate(d, { month: 'short', day: 'numeric' });
let date = today(),
  followToday = true,
  feed = {},
  program = null,
  blocks = [],
  lifts = [],
  sessions,
  history = [],
  selectedLift = '',
  expanded = new Set(),
  serial = 0,
  ready = false;
let notices = [],
  deviceNotice = '',
  exportDate = '',
  exportingHistory = false;
let pendingUpdate = null;
let activeTimer = null,
  audioContext,
  tick,
  toastTimeout;
const knownDemos = new Set(demoFiles),
  seenDemos = new Set();
const route = () =>
  ['history', 'targets', 'attribution'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today';
const daySession = (d = date) => sessions?.get(d) || { lifts: new Map(), check: {}, soreness: new Map() };
const splitAt = (d) =>
  (d === date && program?.split) ||
  daySession(d).check.split ||
  history.find((e) => e.date === d)?.day ||
  (['Sat', 'Sun'].includes(showDate(d, { weekday: 'short' })) ? 'cardio' : 'rest');
function recompute() {
  sessions = readSessions();
  const locals = [];
  for (const [d, s] of sessions)
    for (const item of s.lifts.values()) {
      const row = toLocalRow(d, '', item);
      if (row) locals.push(row);
    }
  history = mergeHistory(feed.log?.entries || [], locals);
}
function displayBanners() {
  $('#banners').innerHTML = [...new Set([deviceNotice, ...notices, feed.meta?.message].filter(Boolean))]
    .map((s) => '<p>' + esc(s) + '</p>')
    .join('');
}
function tell(s) {
  if ($('#dialog').open && $('#dialog-status')) {
    $('#dialog-status').textContent = s;
    return;
  }
  $('#toast').textContent = s;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $('#toast').classList.remove('visible'), 3600);
}
function setupProgram(reset) {
  blocks = blocksFor(program, feed.exercises);
  const stored = daySession().lifts;
  const keys = new Set(blocks.flatMap((b) => b.items.map((l) => l.key)));
  const extra = [...stored.values()].filter((s) => s.meta && !keys.has(s.meta.key)).map((s) => s.meta);
  if (extra.length) blocks.push({ group: true, type: 'Saved on device', items: extra });
  for (const b of blocks) b.items = b.items.map((ex) => ({ ...ex, ...stored.get(ex.key)?.meta }));
  lifts = blocks.flatMap((b) => b.items);
  if (reset) expanded = new Set(lifts[0] ? [lifts[0].key] : []);
}
async function loadDay(reset = true) {
  const token = ++serial,
    d = date;
  const specs = [
    ['workout', 'data/workouts/' + d + '.json'],
    ['exercises', 'data/exercises.json'],
    ['targets', 'data/targets.json'],
    ['log', 'data/log.json'],
    ['meta', 'data/meta.json'],
    ['dates', 'data/dates.json'],
  ];
  const results = await Promise.all(specs.map(([k, p]) => fetchFeed(k, p, d)));
  if (token !== serial) return;
  const apply = () => {
    if (token !== serial) return;
    feed = Object.fromEntries(specs.map(([k], i) => [k, results[i].data]));
    program = feed.workout;
    notices = results.map((r) => r.notice).filter(Boolean);
    recompute();
    setupProgram(reset);
    ready = true;
    render();
  };
  if (!reset && (document.activeElement?.matches('input,textarea,select') || $('#dialog').open))
    pendingUpdate = apply;
  else {
    pendingUpdate = null;
    apply();
  }
}
function renderNav() {
  $('#nav').innerHTML = ['today', 'history', 'targets']
    .map(
      (k) =>
        '<a href="#' +
        k +
        '" ' +
        (route() === k ? 'aria-current="page"' : '') +
        '>' +
        icon(k) +
        '<span>' +
        k[0].toUpperCase() +
        k.slice(1) +
        '</span></a>',
    )
    .join('');
}
function render() {
  renderNav();
  displayBanners();
  if (!ready) return;
  $('#page').innerHTML =
    route() === 'history'
      ? historyView()
      : route() === 'targets'
        ? targetsView()
        : route() === 'attribution'
          ? creditsView()
          : workoutView();
  document.title =
    { today: 'Workout', history: 'History', targets: 'Next Targets', attribution: 'Attribution' }[route()] +
    ' · My Fitness Tracker';
  if (route() === 'history') requestAnimationFrame(drawCharts);
  if (route() === 'today') updateProgress();
}
function demoInfo(ex) {
  const library = lookup(ex, feed.exercises);
  const src = [
    ex.demo,
    library.demo,
    'demos/illustrations/' + ex.exerciseId + '.gif',
    'demos/video/' + ex.exerciseId + '.gif',
  ].find((p) => knownDemos.has(p) && /^demos\/(illustrations|video)\//.test(p));
  const fallback =
    ex.laterality === 'unilateral' ? 'demos/placeholders/dumbbell.gif' : 'demos/placeholders/plates.gif';
  if (src) seenDemos.add(src);
  return {
    src: src || fallback,
    fallback,
    caption: src
      ? [library.attribution || ex.attribution, library.license || ex.license]
          .filter(Boolean)
          .join(' · ') || 'See demonstration attribution.'
      : 'Equipment placeholder · Demo pending.',
  };
}
function demo(ex, index) {
  const d = demoInfo(ex);
  return (
    '<button class="demo" ' +
    attrs('demo', 'data-i="' + index + '"') +
    ' aria-label="Enlarge demo for ' +
    esc(ex.name) +
    '"><img src="./' +
    esc(d.src) +
    '" data-fallback="' +
    d.fallback +
    '" alt="' +
    (d.src === d.fallback ? 'Equipment placeholder' : esc(ex.name) + ' demonstration') +
    '"><span>' +
    icon('expand') +
    '</span></button>'
  );
}
const dateButton = () =>
  button(
    'dates',
    showDate(date, { weekday: 'long', month: 'short', day: 'numeric' }),
    'today',
    'date-btn',
    'aria-label="Choose workout date"',
  ).replace('</button>', icon('down') + '</button>');
function workoutView() {
  const heading = program?.title || (lifts.length ? 'Saved workout' : 'Rest day');
  const hero =
    '<section class="hero"><div class="hero-body">' +
    dateButton() +
    '<h1>' +
    esc(heading) +
    '</h1><div class="hero-meta"><span>' +
    icon('pin') +
    'Gym</span>' +
    (program?.estimatedMinutes != null
      ? '<span>' + icon('time') + esc(program.estimatedMinutes) + ' min</span>'
      : '') +
    '<span>' +
    icon('lift') +
    lifts.length +
    ' exercise' +
    (lifts.length === 1 ? '' : 's') +
    '</span></div></div></section>';
  const plan =
    '<section class="plan"><div class="section-head"><h2>Workout plan</h2>' +
    button(
      'export',
      'Share to TITAN',
      'share',
      'subtle share-top',
      'aria-label="Export / Share to TITAN"',
    ) +
    '</div>' +
    (!program
      ? '<div class="panel rest-state"><h3>' +
        (lifts.length ? 'Saved on this device' : 'No lifting programmed') +
        '</h3><p>' +
        (lifts.length ? 'Your previous set entries are available below.' : 'Cardio + abs, or rest.') +
        '</p>' +
        button('dates', 'Choose a workout', 'today', 'secondary') +
        '</div>'
      : '') +
    blocks
      .map(
        (b) =>
          (b.group
            ? '<section class="group"><div class="group-head">' +
              icon('layers') +
              '<strong>' +
              esc(b.type) +
              '</strong>' +
              (b.rounds != null ? '<span>' + esc(b.rounds) + ' rounds</span>' : '') +
              (b.restSec != null ? '<span>' + clockText(b.restSec) + ' rest</span>' : '') +
              '</div>'
            : '') +
          b.items.map((ex) => exerciseCard(ex, lifts.indexOf(ex))).join('') +
          (b.group ? '</section>' : ''),
      )
      .join('') +
    checkinView() +
    '</section>';
  const rail =
    '<aside class="rail"><section class="panel progress-panel">' +
    title('Session progress', 'chart') +
    '<div class="progress-line"><div><strong id="completed">0</strong><span> / <b id="planned">—</b> sets logged</span></div><span class="percent" id="percent"></span></div><div class="save-note">' +
    icon('shield') +
    'Logs stay on this device</div></section>' +
    (program?.coachNote
      ? '<section class="panel coach-panel"><div class="coach-head"><div class="coach-logo"><i class="brandmark"></i></div><div><h2>Coach note</h2><small>TITAN</small></div></div><p>“' +
        esc(program.coachNote) +
        '”</p></section>'
      : '') +
    (program?.warmup
      ? '<section class="panel warm-panel"><div class="panel-row">' +
        title('Warm-up', 'warm') +
        (program.warmup.durationMin != null
          ? '<span class="pill">' + program.warmup.durationMin + ' min</span>'
          : '') +
        '</div><p>' +
        esc(program.warmup.instructions) +
        '</p></section>'
      : '') +
    (program?.progressionRule
      ? '<section class="rule-panel">' +
        title('Progression rule', 'targets') +
        '<p>' +
        esc(program.progressionRule) +
        '</p></section>'
      : '') +
    '</aside>';
  const brief =
    program?.warmup || program?.coachNote
      ? '<details class="guidance mobile-brief"><summary>' +
        icon('coach') +
        'Warm-up &amp; coach note' +
        icon('down') +
        '</summary>' +
        (program.warmup
          ? '<p><b>Warm-up' +
            (program.warmup.durationMin != null ? ' · ' + program.warmup.durationMin + ' min' : '') +
            '</b> ' +
            esc(program.warmup.instructions) +
            '</p>'
          : '') +
        (program.coachNote ? '<p><b>TITAN</b> ' + esc(program.coachNote) + '</p>' : '') +
        '</details>'
      : '';
  return hero + brief + '<div class="workout-layout">' + plan + rail + '</div>';
}
function exerciseCard(ex, i) {
  const log = daySession().lifts.get(ex.key) || { slots: {} },
    on = expanded.has(ex.key),
    uni = ex.laterality === 'unilateral';
  const number = String(i + 1).padStart(2, '0');
  const tags = [
    ex.sets != null ? ex.sets + ' sets' : 'Sets open',
    range(ex) + ' reps',
    ex.weightLb == null ? 'Choose load' : ex.weightLb + ' lb',
  ];
  const header =
    '<button ' +
    attrs('toggle', 'data-i="' + i + '" aria-expanded="' + on + '" aria-controls="lift-' + i + '"') +
    ' class="lift-head"><span class="lift-num">' +
    number +
    '</span><span class="lift-name"><strong>' +
    esc(ex.name) +
    '</strong><span>' +
    esc(tags.join('  ·  ')) +
    '</span></span><span class="chev">' +
    icon(on ? 'up' : 'down') +
    '</span></button>';
  if (!on) return '<article class="lift-card">' + header + '</article>';
  const stats = [
    ['Weight', ex.weightLb == null ? 'Open' : ex.weightLb, ex.weightLb == null ? '' : 'lb'],
    ['Sets × reps', (ex.sets ?? '—') + ' × ' + range(ex), ''],
    ['Rest', ex.restSec == null ? '—' : clockText(ex.restSec), ''],
    ['RIR', ex.rir ?? '—', ''],
  ];
  const previous = history.findLast((r) => r.date < date && r.exerciseId === ex.exerciseId);
  const last = ex.lastSession || (previous ? weightText(previous) + ' lb · ' + repText(previous) : '—');
  const info = [
    ['Load note', ex.weightNote],
    ['Cues', ex.cues],
    ['Last session', last],
    ['Goal', ex.goal || '—'],
    ['Swap', ex.swap || '—'],
  ].filter(([, v]) => v);
  const visibleSlots = Math.max(
    ex.sets || 1,
    Number(log.extraSets) || 0,
    ...Object.keys(log.slots).map((n) => Number(n) + 1),
  );
  const fields = (field, slot, label, placeholder, inputmode, value) =>
    '<input type="text" inputmode="' +
    inputmode +
    '" autocomplete="off" data-i="' +
    i +
    '" data-field="' +
    field +
    '" data-slot="' +
    slot +
    '" aria-label="' +
    esc(ex.name + ' set ' + (slot + 1) + ' ' + label) +
    '" placeholder="' +
    placeholder +
    '" value="' +
    esc(value) +
    '">';
  const rows = Array.from({ length: Math.min(visibleSlots, 1000) }, (_, s) => {
    const input = log.slots[s] || {};
    return (
      '<div class="set-row ' +
      (uni ? 'uni' : '') +
      '"><span class="set-index" data-set="' +
      i +
      '-' +
      s +
      '">' +
      String(s + 1).padStart(2, '0') +
      '</span>' +
      fields('weight', s, 'weight in pounds', '—', 'decimal', input.weight ?? ex.weightLb) +
      (uni
        ? fields('right', s, 'right reps', '—', 'numeric', input.right) +
          fields('left', s, 'left reps', '—', 'numeric', input.left)
        : fields('reps', s, 'reps', '—', 'numeric', input.reps)) +
      (ex.restSec > 0
        ? button(
            'rest',
            icon('timer') + '<span class="rest-word">Rest</span>',
            '',
            'rest-btn',
            'data-i="' +
              i +
              '" aria-label="Start ' +
              ex.restSec +
              ' second rest after set ' +
              (s + 1) +
              '"',
          )
        : '<span></span>') +
      '</div>' +
      (uni
        ? '<details class="side-notes"><summary>Side notes · set ' +
          (s + 1) +
          '</summary><div class="note-grid">' +
          ['right', 'left']
            .map(
              (side) =>
                '<label>' +
                side +
                '<input data-i="' +
                i +
                '" data-slot="' +
                s +
                '" data-field="' +
                side +
                'Note" value="' +
                esc(input[side + 'Note']) +
                '"></label>',
            )
            .join('') +
          '</div></details>'
        : '')
    );
  }).join('');
  return (
    '<article class="lift-card open">' +
    header +
    '<div class="lift-body" id="lift-' +
    i +
    '"><div class="lift-details"><div class="prescription">' +
    demo(ex, i) +
    '<div class="metrics">' +
    stats
      .map(
        ([label, v, u]) =>
          '<div><small>' + label + '</small><b>' + esc(v) + (u ? ' <em>' + u + '</em>' : '') + '</b></div>',
      )
      .join('') +
    '</div></div>' +
    (info.length
      ? '<details class="guidance"><summary>' +
        icon('note') +
        'Lift notes &amp; goal ' +
        icon('down') +
        '</summary><dl>' +
        info.map(([l, v]) => '<dt>' + l + '</dt><dd>' + esc(v) + '</dd>').join('') +
        '</dl></details>'
      : '') +
    (uni
      ? '<p class="side-cue">' +
        icon('flag') +
        '<span><b>Right side first</b>' +
        (ex.sideNote ? ' · ' + esc(ex.sideNote) : '') +
        '</span></p>'
      : ex.sideNote
        ? '<p class="side-cue">' + esc(ex.sideNote) + '</p>'
        : '') +
    '</div><div class="logger"><div class="logger-head"><h3>Set log</h3><span class="save-status" data-save="' +
    i +
    '"></span></div><div class="set-labels ' +
    (uni ? 'uni' : '') +
    '"><span>Set</span><span>Load (lb)</span>' +
    (uni ? '<span>Right</span><span>Left</span>' : '<span>Reps</span>') +
    '<span>Timer</span></div>' +
    rows +
    (ex.sets == null ? button('add-set', 'Add set', 'plus', 'text-btn', 'data-i="' + i + '"') : '') +
    '<details class="guidance log-notes"><summary>' +
    icon('note') +
    'Session notes ' +
    icon('down') +
    '</summary><label>Lift notes<textarea data-i="' +
    i +
    '" data-field="notes">' +
    esc(log.notes) +
    '</textarea></label><label>Hit top of range<select data-i="' +
    i +
    '" data-field="manualTop">' +
    ['auto', 'yes', 'no']
      .map(
        (v, n) =>
          '<option value="' +
          v +
          '" ' +
          ((log.manualTop || 'auto') === v ? 'selected' : '') +
          '>' +
          ['Calculate from sets', 'Yes', 'No'][n] +
          '</option>',
      )
      .join('') +
    '</select></label></details></div></div></article>'
  );
}
function checkinView() {
  const s = daySession(),
    a = program?.abs;
  return (
    '<section class="panel checkin">' +
    title('Session check-in', 'note') +
    '<label class="abs-check"><input type="checkbox" data-check="absDone" ' +
    (s.check.absDone ? 'checked' : '') +
    '><span>Abs complete</span></label>' +
    (a
      ? '<details class="guidance"><summary>Abs block · ' +
        (a.rounds == null ? 'Open rounds' : a.rounds + ' rounds') +
        icon('down') +
        '</summary><ul>' +
        (a.items || [])
          .map(
            (v, i) =>
              '<li>' +
              esc(v.name || v.exerciseId) +
              ' · ' +
              esc(v.reps ?? '—') +
              button('abs-demo', 'Demo', 'play', 'text-btn', 'data-i="' + i + '"') +
              '</li>',
          )
          .join('') +
        '</ul>' +
        (a.restSec == null ? '' : '<p>Rest ' + clockText(a.restSec) + '</p>') +
        '</details>'
      : '') +
    '<label class="bw">Bodyweight (lb)<input type="text" inputmode="decimal" data-check="bodyweightLb" placeholder="—" value="' +
    esc(s.check.bodyweightLb) +
    '"></label><div class="panel-row"><h3>Soreness</h3>' +
    button('add-sore', 'Add entry', 'plus', 'text-btn') +
    '</div>' +
    [...s.soreness]
      .filter(([, v]) => !v.deleted)
      .map(
        ([id, v]) =>
          '<div class="sore" data-sore="' +
          esc(id) +
          '"><div class="note-grid"><label>Area<input list="areas" data-field="area" value="' +
          esc(v.area) +
          '" placeholder="e.g. shoulder"></label><label>Level (0–5)<select data-field="level"><option value="">Choose</option>' +
          Array.from(
            { length: 6 },
            (_, n) =>
              '<option ' + (String(v.level) === String(n) ? 'selected' : '') + '>' + n + '</option>',
          ).join('') +
          '</select></label></div><label>Notes<textarea data-field="notes">' +
          esc(v.notes) +
          '</textarea></label>' +
          button('remove-sore', 'Remove entry', '', 'text-btn') +
          '</div>',
      )
      .join('') +
    '<datalist id="areas">' +
    ['Knee', 'Neck', 'Back', 'Shoulders'].map((a) => '<option>' + a + '</option>').join('') +
    '</datalist><div class="check-share">' +
    button('export', 'Export / Share to TITAN', 'share', 'primary') +
    '</div></section>'
  );
}
function updateProgress() {
  let total = 0,
    done = 0,
    unspecified = false;
  for (const [i, e] of lifts.entries()) {
    const draft = daySession().lifts.get(e.key) || { slots: {} },
      uni = e.laterality === 'unilateral';
    const complete = Object.entries(draft.slots).filter(([, s]) =>
      uni ? numeric(s.right) !== null && numeric(s.left) !== null : numeric(s.reps) !== null,
    );
    if (e.sets == null) unspecified = true;
    else total += e.sets;
    done += complete.length;
    const mark = document.querySelector('[data-save="' + i + '"]');
    if (mark) mark.textContent = complete.length + (e.sets != null ? ' / ' + e.sets : '') + ' logged';
    for (const badge of document.querySelectorAll('[data-set^="' + i + '-"]'))
      badge.classList.toggle(
        'done',
        complete.some(([idx]) => badge.dataset.set === i + '-' + idx),
      );
  }
  if (!$('#completed')) return;
  $('#completed').textContent = done;
  $('#planned').textContent = unspecified ? '—' : total;
  const p = total && !unspecified ? Math.min(100, Math.round((100 * done) / total)) : 0;
  $('#percent').textContent = total && !unspecified ? p + '%' : '';
  $('#percent').style.setProperty('--completion', p + '%');
}

function heading(name, action = '') {
  return '<div class="page-head"><h1>' + esc(name) + '</h1>' + action + '</div>';
}
function flags(e) {
  const labels = [
    e.pr?.includes('weight') && 'Weight PR',
    e.pr?.includes('rep') && 'Rep PR',
    e.hitTopOfRange && 'Hit top',
  ].filter(Boolean);
  return labels.map((s) => '<span class="flag">' + esc(s) + '</span>').join('');
}
function historyView() {
  const choices = new Map(history.map((e) => [e.exerciseId, e.exercise || e.exerciseId]));
  if (!choices.has(selectedLift)) selectedLift = history.at(-1)?.exerciseId || '';
  const rows = history.filter((e) => e.exerciseId === selectedLift).toReversed();
  const select =
    '<label class="filter">Exercise<select id="lift-filter">' +
    [...choices]
      .map(
        ([k, v]) =>
          '<option value="' +
          esc(k) +
          '" ' +
          (k === selectedLift ? 'selected' : '') +
          '>' +
          esc(v) +
          '</option>',
      )
      .join('') +
    '</select></label>';
  return (
    heading('Lift history', button('export-history', 'Export / Share to TITAN', 'share', 'primary')) +
    (!rows.length
      ? '<section class="panel empty"><h2>No logged lifts yet</h2><p>Your first logged set will appear here.</p></section>'
      : select +
        '<div class="charts">' +
        [
          ['weight', 'Working weight', 'lb'],
          ['volume', 'Estimated volume', 'lb × reps'],
        ]
          .map(
            ([k, n, u]) =>
              '<section class="panel chart"><div class="panel-row">' +
              title(n, 'chart') +
              '<small>' +
              u +
              '</small></div><canvas id="chart-' +
              k +
              '" role="img" aria-label="' +
              n +
              ' by session date. Values appear in the session list below."></canvas></section>',
          )
          .join('') +
        '</div>' +
        '<div class="section-head"><h2>Sessions</h2><span>' +
        rows.length +
        '</span></div><div class="history-list">' +
        rows
          .map(
            (e) =>
              '<article class="panel session"><div class="panel-row"><strong>' +
              esc(showDate(e.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })) +
              '</strong><small>' +
              esc(e.synced ? 'Synced with TITAN' : e.source === 'TITAN' ? 'TITAN log' : 'On device') +
              '</small></div><h3>' +
              esc(e.exercise || e.exerciseId) +
              '</h3><div class="session-reps"><b>' +
              esc(weightText(e)) +
              ' <small>lb</small></b><span>' +
              esc(repText(e)) +
              ' reps</span></div><div class="flags">' +
              flags(e) +
              '</div><p class="muted">Volume ' +
              (volume(e) == null ? '—' : volume(e).toLocaleString('en-US') + ' lb × reps') +
              '</p>' +
              (e.notes ? '<p>' + esc(e.notes) + '</p>' : '') +
              (e.local?.notes && e.local.notes !== e.notes ? '<p>' + esc(e.local.notes) + '</p>' : '') +
              detailsOf(e.local || e)
                .filter((s) => s.rightNote || s.leftNote)
                .map(
                  (s) =>
                    '<p>Set ' +
                    s.set +
                    ' · ' +
                    esc(
                      [s.rightNote && 'R: ' + s.rightNote, s.leftNote && 'L: ' + s.leftNote]
                        .filter(Boolean)
                        .join(' / '),
                    ) +
                    '</p>',
                )
                .join('') +
              button(
                'export-for',
                'Export session',
                'share',
                'text-btn',
                'data-date="' + esc(e.date) + '"',
              ) +
              '</article>',
          )
          .join('') +
        '</div>')
  );
}
function drawCharts() {
  const entries = history.filter((e) => e.exerciseId === selectedLift);
  for (const [key, metric] of [
    ['weight', peak],
    ['volume', volume],
  ]) {
    const canvas = $('#chart-' + key);
    if (!canvas) continue;
    const width = canvas.clientWidth,
      height = 155,
      scale = window.devicePixelRatio || 1;
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    const vals = entries.map(metric),
      known = vals.filter((v) => v != null);
    ctx.font = '12px system-ui';
    ctx.fillStyle = '#b9bbbe';
    if (!known.length) {
      ctx.fillText('No recorded load', 8, 76);
      continue;
    }
    const hi = Math.max(1, ...known),
      left = 53,
      right = width - 18,
      top = 17,
      bottom = 122;
    const times = entries.map((e) => Date.parse(e.date)),
      start = times[0],
      end = times.at(-1);
    const x = (i) =>
      start === end ? (left + right) / 2 : left + ((right - left) * (times[i] - start)) / (end - start);
    const y = (v) => bottom - ((bottom - top) * v) / hi;
    for (let n = 0; n < 3; n++) {
      const val = (hi * n) / 2;
      ctx.fillStyle = '#b9bbbe';
      ctx.fillText(Number(val.toFixed(1)).toLocaleString('en-US'), 0, y(val) + 4);
      ctx.strokeStyle = '#404245';
      ctx.beginPath();
      ctx.moveTo(left, y(val));
      ctx.lineTo(right, y(val));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.strokeStyle = '#829cb6';
    ctx.lineWidth = 2;
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      if (pen) ctx.lineTo(x(i), y(v));
      else ctx.moveTo(x(i), y(v));
      pen = true;
    });
    ctx.stroke();
    vals.forEach((v, i) => {
      if (v == null) return;
      ctx.fillStyle = '#aec0d0';
      ctx.beginPath();
      ctx.arc(x(i), y(v), 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#b9bbbe';
    ctx.textAlign = start === end ? 'center' : 'left';
    ctx.fillText(shortDate(entries[0].date), x(0), 149);
    if (end !== start) {
      ctx.textAlign = 'right';
      ctx.fillText(shortDate(entries.at(-1).date), right, 149);
    }
  }
}
function targetsView() {
  const targets = feed.targets?.targets || [];
  return (
    heading('Next targets') +
    (feed.targets?.updated && validDate(feed.targets.updated)
      ? '<p class="muted">Updated ' +
        esc(showDate(feed.targets.updated, { month: 'long', day: 'numeric', year: 'numeric' })) +
        ' · TITAN</p>'
      : '') +
    '<div class="target-grid">' +
    targets
      .map((t) => {
        const last = history.findLast((e) => e.exerciseId === t.exerciseId);
        return (
          '<article class="panel target">' +
          title(t.name || t.exerciseId, 'targets') +
          '<div class="target-load">' +
          esc(t.nextWeightLb ?? '—') +
          ' <span>lb</span></div><strong>' +
          esc(t.targetSets ?? '—') +
          ' × ' +
          esc(t.targetReps ?? '—') +
          ' reps</strong><p>' +
          esc(t.rule) +
          '</p>' +
          (last
            ? '<small>Last logged · ' +
              esc(shortDate(last.date)) +
              ' · ' +
              esc(weightText(last)) +
              ' lb · ' +
              esc(repText(last)) +
              '</small>'
            : '') +
          '</article>'
        );
      })
      .join('') +
    '</div>' +
    (!targets.length ? '<p class="panel">No targets posted yet.</p>' : '')
  );
}
function creditsView() {
  return (
    heading('Attribution') +
    '<section class="panel credits"><h2>Exercise illustrations</h2><p>Bryl Lim created the workout-guide illustrations. Some first frames use work by Everkinetic. TITAN adapted the GIFs with a dark background at 360 × 360 pixels and a 1–2–3–2 frame sequence at 0.8 seconds per frame. These adaptations remain under Creative Commons Attribution-ShareAlike 4.0 International.</p><p><a href="https://github.com/bryllim/workout-guide">Bryl Lim · workout-guide</a> · <a href="https://github.com/everkinetic/data">Everkinetic</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></p><h2>Gym clips</h2><p>The optional video library uses GymPlan clips from namnq’s workout-free-videos v2.0.0, released under CC0 1.0 Universal.</p><p><a href="https://github.com/namnq/workout-free-videos">Clip source</a> · <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0 1.0</a></p><h2>Starter artwork</h2><p>The animated equipment placeholders are original CC0 illustrations. Barlow Condensed by Jeremy Tribby is distributed under the SIL Open Font License.</p><p><a href="./demos/ATTRIBUTION.md">Demo credits</a> · <a href="./demos/licenses/CC-BY-SA-4.0.txt">BY-SA license</a> · <a href="./demos/licenses/CC0-1.0.txt">CC0 dedication</a> · <a href="./assets/fonts/OFL.txt">Font license</a></p></section>'
  );
}
function dialog(name, body) {
  $('#dialog-body').innerHTML =
    '<div class="dialog-head"><h2 id="dialog-title">' +
    esc(name) +
    '</h2>' +
    button('close', '', 'close', 'icon-btn', 'aria-label="Close"') +
    '</div>' +
    body +
    '<p id="dialog-status" role="status"></p>';
  if (!$('#dialog').open) $('#dialog').showModal();
}
function availableDates() {
  return [
    ...new Set(
      [
        today(),
        date,
        ...(feed.dates?.dates || []),
        feed.meta?.latestWorkoutDate,
        ...sessions.keys(),
      ].filter(validDate),
    ),
  ]
    .sort()
    .reverse();
}
function datesDialog() {
  dialog(
    'Workout date',
    '<label>Choose date<input id="pick-date" type="date" value="' +
      date +
      '"></label><div class="date-list">' +
      availableDates()
        .map((d) =>
          button(
            'choose-date',
            esc(showDate(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })) +
              (d === today() ? ' · Today' : ''),
            d === date ? 'check' : 'today',
            'secondary',
            'data-date="' + d + '"',
          ),
        )
        .join('') +
      '</div>',
  );
}
function setDay(d) {
  if (!validDate(d)) return;
  $('#dialog').close();
  changeDay(d);
}
function changeDay(d) {
  date = d;
  followToday = d === today();
  pendingUpdate = null;
  ready = false;
  $('#page').innerHTML = '<p role="status">Opening workout…</p>';
  loadDay();
}
function flushUpdate() {
  setTimeout(() => {
    if (pendingUpdate && !$('#dialog').open && !document.activeElement?.matches('input,textarea,select')) {
      const update = pendingUpdate;
      pendingUpdate = null;
      update();
    }
  }, 0);
}
document.addEventListener('focusout', flushUpdate);
$('#dialog').addEventListener('close', flushUpdate);
function demoDialog(ex) {
  const d = demoInfo(ex);
  dialog(
    ex.name || ex.exerciseId,
    '<img class="enlarged" src="./' +
      esc(d.src) +
      '" data-fallback="' +
      d.fallback +
      '" alt="' +
      esc(
        (d.src === d.fallback ? 'Equipment placeholder for ' : 'Demonstration of ') +
          (ex.name || ex.exerciseId),
      ) +
      '"><p class="muted demo-caption">' +
      esc(d.caption) +
      '</p><a href="#attribution" data-action="credits">Attribution</a>',
  );
}
function localExport(d, allHistory) {
  const s = daySession(d),
    onDate = history.filter((e) => e.date === d);
  const rows = allHistory ? onDate : onDate.filter((e) => e.source === 'device' || e.synced);
  const soreness = [...s.soreness.values()]
    .filter((v) => !v.deleted && (v.area || v.notes || numeric(v.level) != null))
    .map((v) => ({ area: v.area || '', level: numeric(v.level), notes: v.notes || '' }));
  return {
    rows,
    json: {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      workoutDate: d,
      split: splitAt(d),
      bodyweightLb: numeric(s.check.bodyweightLb),
      absDone: s.check.absDone ?? null,
      soreness,
      lifts: rows.map(exportedLift),
    },
  };
}
function exportDialog(d = date, allHistory = false) {
  exportDate = d;
  exportingHistory = allHistory;
  const { json } = localExport(d, allHistory),
    days = [...new Set([d, ...history.map((e) => e.date), ...sessions.keys()])].sort().reverse();
  const text = compact(json);
  dialog(
    'Share to TITAN',
    (allHistory
      ? '<label>Session<select id="export-date">' +
        days.map((day) => '<option ' + (d === day ? 'selected' : '') + '>' + day + '</option>').join('') +
        '</select></label>'
      : '') +
      '<label>Session summary<textarea class="summary" id="summary" readonly rows="' +
      Math.min(10, Math.max(3, text.split('\n').length + 1)) +
      '">' +
      esc(text) +
      '</textarea></label><div class="export-actions">' +
      button('copy', 'Copy text', 'copy', 'primary') +
      (navigator.share ? button('share-text', 'Share text', 'share', 'secondary') : '') +
      '</div><div class="export-actions">' +
      button('json', 'JSON', 'download', 'secondary') +
      button('csv', 'CSV', 'download', 'secondary') +
      (navigator.canShare ? button('share-json', 'Share JSON', 'share', 'secondary') : '') +
      (allHistory ? button('csv-all', 'Full history CSV', 'download', 'secondary') : '') +
      '</div>',
  );
}
function download(name, blob) {
  const a = document.createElement('a'),
    url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function doExport(action) {
  const { json, rows } = localExport(exportDate, exportingHistory),
    txt = compact(json),
    name = 'TITAN-' + exportDate;
  if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(txt);
      tell('Session summary copied.');
    } catch {
      $('#summary').select();
      if (document.execCommand('copy')) tell('Session summary copied.');
      else tell('Select and copy the session summary.');
    }
  } else if (action === 'share-text') {
    await navigator.share({ text: txt });
  } else if (action === 'csv' || action === 'csv-all') {
    download(
      (action === 'csv-all' ? 'TITAN-history' : name) + '.csv',
      new Blob([csvText(action === 'csv-all' ? history : rows)], { type: 'text/csv;charset=utf-8' }),
    );
  } else {
    const file = new File([JSON.stringify(json, null, 2)], name + '.json', { type: 'application/json' });
    if (action === 'share-json' && navigator.canShare?.({ files: [file] }))
      await navigator.share({ files: [file] });
    else {
      download(file.name, file);
      if (action === 'share-json') tell('JSON downloaded for sharing.');
    }
  }
}
function timerPaint() {
  if (!activeTimer) {
    $('#timer').hidden = true;
    return;
  }
  const remaining = Math.max(0, Math.ceil((activeTimer.end - Date.now()) / 1000));
  $('#timer').hidden = false;
  $('#time-left').textContent = clockText(remaining);
  $('#timer-label').textContent = remaining ? 'Rest · ' + activeTimer.name : 'Rest complete';
  if (!remaining && !activeTimer.finished) {
    activeTimer.finished = true;
    clearInterval(tick);
    $('#timer').classList.add('finished');
    navigator.vibrate?.([150, 80, 150]);
    if (audioContext?.state === 'running') {
      const osc = audioContext.createOscillator(),
        gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.frequency.value = 740;
      gain.gain.setValueAtTime(0.1, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.32);
      osc.start();
      osc.stop(audioContext.currentTime + 0.33);
    }
  }
}
function startTimer(ex) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      audioContext ??= new AC();
      audioContext.resume().catch(() => {});
    }
  } catch {}
  clearInterval(tick);
  activeTimer = { end: Date.now() + ex.restSec * 1000, name: ex.name };
  $('#timer').classList.remove('finished');
  $('#timer').innerHTML =
    icon('timer') +
    '<div><b id="timer-label" role="status"></b><small>Keep the screen awake</small></div><strong id="time-left" role="timer"></strong>' +
    button('stop-rest', '', 'close', 'icon-btn', 'aria-label="Dismiss rest timer"');
  timerPaint();
  tick = setInterval(timerPaint, 200);
}
function writeLift(i, field, value, slot) {
  const ex = lifts[i],
    local = daySession().lifts.get(ex.key),
    pairs = [];
  if (!local?.meta) pairs.push([fieldKey(date, 'lift', ex.key, 'meta'), { ...ex, split: splitAt(date) }]);
  pairs.push([fieldKey(date, 'lift', ex.key, field, slot ?? null), value]);
  save(pairs);
}
function handleInput(e) {
  const el = e.target,
    field = el.dataset.field,
    sore = el.closest('[data-sore]');
  if (el.dataset.check) {
    if (el.dataset.check === 'bodyweightLb' && !validInput(el, false)) return;
    save([
      [fieldKey(date, 'check', 'split'), splitAt(date)],
      [fieldKey(date, 'check', el.dataset.check), el.type === 'checkbox' ? el.checked : el.value],
    ]);
  } else if (field && sore) {
    const id = sore.dataset.sore;
    save([[fieldKey(date, 'sore', id, field), el.value]]);
    const combined = Object.values({ ...daySession().soreness.get(id), [field]: el.value }).join(' ');
    if (!daySession().check.reminder && /sharp pain|numbness/i.test(combined)) {
      save([[fieldKey(date, 'check', 'reminder'), true]]);
      tell('Stop and get it checked if pain is sharp or radiating.');
    }
  } else if (field && el.hasAttribute('data-i')) {
    if (['reps', 'right', 'left', 'weight'].includes(field) && !validInput(el, field !== 'weight')) return;
    writeLift(Number(el.dataset.i), field, el.value, el.dataset.slot);
  } else return;
  recompute();
  updateProgress();
}
function validInput(el, integer) {
  const val = el.value;
  const ok =
    val === '' ||
    ((integer ? /^\d+$/ : /^(?:\d+(?:\.\d*)?|\.\d+)$/).test(val) && Number.isFinite(Number(val)));
  el.setCustomValidity(
    ok ? '' : integer ? 'Enter whole reps, zero or more.' : 'Enter a load of zero or more.',
  );
  el.setAttribute('aria-invalid', String(!ok));
  if (!ok) el.reportValidity();
  return ok;
}
document.addEventListener('input', handleInput);
document.addEventListener('change', (e) => {
  if (e.target.id === 'lift-filter') {
    selectedLift = e.target.value;
    render();
  }
  if (e.target.id === 'pick-date') setDay(e.target.value);
  if (e.target.id === 'export-date') exportDialog(e.target.value, true);
});
document.addEventListener('click', async (e) => {
  if (e.target.closest('#nav a[href="#today"]') && date !== today()) {
    changeDay(today());
  }
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const act = btn.dataset.action,
    i = Number(btn.dataset.i),
    ex = lifts[i];
  try {
    switch (act) {
      case 'toggle': {
        const opening = !expanded.has(ex.key);
        if (opening) expanded.add(ex.key);
        else expanded.delete(ex.key);
        render();
        const toggle = document.querySelector('[data-action="toggle"][data-i="' + i + '"]');
        toggle?.focus({ preventScroll: true });
        if (opening && matchMedia('(max-width: 740px)').matches) {
          const logger = toggle.closest('.lift-card').querySelector('.logger');
          logger.scrollIntoView({ block: 'nearest' });
        }
        break;
      }
      case 'demo':
        demoDialog(ex);
        break;
      case 'abs-demo': {
        const a = program.abs.items[i];
        demoDialog({ ...lookup(a, feed.exercises), ...a });
        break;
      }
      case 'credits':
      case 'close':
        $('#dialog').close();
        break;
      case 'dates':
        datesDialog();
        break;
      case 'choose-date':
        setDay(btn.dataset.date);
        break;
      case 'rest':
        startTimer(ex);
        break;
      case 'stop-rest':
        clearInterval(tick);
        activeTimer = null;
        timerPaint();
        break;
      case 'add-set': {
        const s = daySession().lifts.get(ex.key);
        writeLift(
          i,
          'extraSets',
          Math.max(1, s?.extraSets || 0, ...Object.keys(s?.slots || {}).map((n) => Number(n) + 1)) + 1,
        );
        recompute();
        render();
        break;
      }
      case 'add-sore':
        save([[fieldKey(date, 'sore', crypto.randomUUID(), 'area'), '']]);
        recompute();
        render();
        document.querySelector('.sore:last-of-type input')?.focus();
        break;
      case 'remove-sore':
        save([[fieldKey(date, 'sore', btn.closest('[data-sore]').dataset.sore, 'deleted'), true]]);
        recompute();
        render();
        break;
      case 'export':
        exportDialog();
        break;
      case 'export-history':
        exportDialog(history.at(-1)?.date || date, true);
        break;
      case 'export-for':
        exportDialog(btn.dataset.date, true);
        break;
      default:
        await doExport(act);
    }
  } catch (err) {
    if (err.name !== 'AbortError') tell('That action could not finish. Try again.');
  }
});
document.addEventListener(
  'error',
  (e) => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.dataset.fallback) {
      const fallback = img.dataset.fallback;
      delete img.dataset.fallback;
      img.src = './' + fallback;
      img.alt = 'Equipment placeholder';
      if (img.classList.contains('enlarged') && $('.demo-caption'))
        $('.demo-caption').textContent = 'Equipment placeholder · Demo pending.';
    }
  },
  true,
);
$('#dialog').addEventListener('click', (e) => {
  if (e.target === $('#dialog')) {
    const r = $('#dialog').getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      $('#dialog').close();
  }
});
window.addEventListener('hashchange', () => {
  if ($('#dialog').open) $('#dialog').close();
  render();
  window.scrollTo(0, 0);
});
window.addEventListener('resize', () => {
  if (route() === 'history') drawCharts();
});
function setConnection() {
  $('#availability').textContent = !navigator.onLine
    ? 'Offline'
    : navigator.serviceWorker?.controller
      ? 'Offline ready'
      : 'On device';
}
window.addEventListener('online', () => {
  setConnection();
  if (ready) loadDay(false);
});
window.addEventListener('offline', setConnection);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    timerPaint();
    if (ready && followToday && date !== today()) {
      changeDay(today());
    }
  }
});
setInterval(() => {
  if (ready && followToday && !document.hidden && date !== today()) {
    changeDay(today());
  }
}, 30000);
async function init() {
  renderNav();
  await openStore(
    (msg) => {
      deviceNotice = msg;
      displayBanners();
    },
    () => {
      if (ready) {
        recompute();
        if (document.activeElement?.matches('input,textarea,select')) updateProgress();
        else {
          setupProgram(false);
          render();
        }
      }
    },
  );
  await loadDay();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', setConnection);
    try {
      await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      setConnection();
      for (const p of seenDemos) fetch('./' + p).catch(() => {});
    } catch {
      deviceNotice = 'Offline installation is unavailable in this browser.';
      displayBanners();
    }
  }
}
init().catch(() => {
  deviceNotice = 'Unable to open the tracker. Reload to retry.';
  displayBanners();
});
