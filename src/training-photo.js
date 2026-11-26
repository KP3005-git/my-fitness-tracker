const themes = [
  ['full-body', /\b(full[- ]body|total[- ]body|push|pull|upper body)\b/i],
  ['shoulders', /\b(shoulders?|delts?|deltoids?)\b/i],
  ['chest', /\b(chest|pecs?|pectorals?)\b/i],
  ['back', /\b(back|lats?|latissimus)\b/i],
  ['legs', /\b(legs?|lower body|quads?|quadriceps|hamstrings?|glutes?|calves)\b/i],
  ['arms', /\b(arms?|biceps?|triceps?|forearms?)\b/i],
  ['cardio', /\b(cardio|cycling|conditioning|endurance)\b/i],
  ['core', /\b(abs|core|abdominals?)\b/i],
  ['neon-wall', /\b(rest|recovery)\b/i],
];

const themeFor = text => themes.find(([, pattern]) => pattern.test(text || ''))?.[0];

export function trainingPhoto(program, lifts) {
  const explicit = themeFor(program?.split) || themeFor(program?.title);
  if (explicit) return explicit;
  const muscles = new Set(lifts.map(lift => themeFor(lift.primaryMuscle)).filter(Boolean));
  if (muscles.size === 1) return [...muscles][0];
  return lifts.length ? 'full-body' : 'neon-wall';
}
