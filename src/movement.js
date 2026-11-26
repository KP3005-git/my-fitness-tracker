import { lookup } from './model.js';

export function movementFor(ex, catalog, mapping, files) {
  const fallback = ex.laterality === 'unilateral' ? 'demos/placeholders/dumbbell.gif' : 'demos/placeholders/plates.gif';
  const override = ex.demoOverride?.trim() || '';
  const entry = key => Object.hasOwn(mapping,key) ? mapping[key] : null;
  const local = override.replace(/^\.?\/(?=demos\/)/,'');
  const named = lookup({name:ex.name},catalog).id;
  const id = Object.hasOwn(catalog?.exercises || {},named) ? named : ex.exerciseId;
  let matched = entry(override);
  if (!matched && files.has(local)) matched = Object.values(mapping).find(item => item.src === local) || {src:local};
  if (!matched && /^https:\/\//i.test(override)) {
    try { matched = {src:new URL(override).href,credit:'TITAN sheet override'}; } catch {}
  }
  matched ??= entry(id);
  return {src:matched?.src || fallback, fallback,
    caption: matched ? [matched.credit,matched.license].filter(Boolean).join(' · ') || 'TITAN demo override.' :
      'Equipment placeholder · Demo pending.'};
}
