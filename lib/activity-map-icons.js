const ICONS = Object.freeze({
  alpine: '<svg viewBox="0 0 50 50" aria-hidden="true"><path fill="currentColor" d="M44.17 18.642c2.118 0 3.83-1.732 3.83-3.864c0-2.13-1.712-3.852-3.83-3.852c-2.108 0-3.824 1.721-3.824 3.852s1.716 3.864 3.824 3.864M43.091 45.08L2.79 21.217L2 22.579l40.283 23.869a3.87 3.87 0 0 0 5.332-1.367l-1.337-.811a2.31 2.31 0 0 1-3.187.81m3.875-17.914l-6.854-4.034l-.791-10.336a4.22 4.22 0 0 0-1.756-3.031l-9.871-5.892a5.04 5.04 0 0 0-7.045 1.402c-.864 1.288-1.102 2.917-.678 4.239l2.678 8.844l-8.079 2.598a3.14 3.14 0 0 0-1.927 2.541c-.209 1.721 1.062 2.861 2.774 3.064c.39.047.649-.066 1.011-.158l11.028-3.681c.809-.296 1.693-1.106 1.779-1.812c.063-.513.226-.946.119-1.254l-1.678-6.051l6.632 3.978l.802 5.801c.069 1.014.527 1.743 1.301 2.176l8.667 5.105a1.95 1.95 0 0 0 2.665-.797a2 2 0 0 0-.777-2.702"/></svg>',
  crossCountry: '<svg viewBox="0 0 50 50" aria-hidden="true"><g fill="currentColor"><ellipse cx="36.615" cy="6.695" rx="3.683" ry="3.695"/><path d="M13.26 42.202L1 29.869l.005 2.154L12.416 43.51c1.311 1.425 3.557-.223 3.557-.223l-1.077-1.157s-1.061.698-1.61.104zM1 19h13v1H1zm46.57-3.506l1.43.677L34.755 45h-1.577zm-23.639-2.36l-5.733 6.638c-.337.42-.854.682-1.431.682a1.855 1.855 0 0 1-1.854-1.86c0-.556.239-1.052.625-1.391l6.179-7.14a1.86 1.86 0 0 1 1.43-.671l8.948-.005c.658 0 1.246.268 1.681.682l5.705 5.722l4.727-4.729a1.9 1.9 0 0 1 1.229-.453c1.061 0 1.915.862 1.915 1.92c0 .463-.158.883-.43 1.216l-5.7 5.76c-1.729 1.735-3.123.262-3.123.262l-3.496-3.523l-5.467 6.338l5.009 5.023s1.055.982.452 2.94L31.79 43.091A2.39 2.39 0 0 1 29.457 45a2.386 2.386 0 0 1-2.383-2.389c0-.208.021-.409.077-.601l2.306-10.297l-5.689-5.543l-4.895 5.471s-.794.982-2.894.906l-9.926.017a2.38 2.38 0 0 1-2.366-1.866a2.35 2.35 0 0 1 1.784-2.836q.303-.07.598-.055l8.54.021L27.234 13.15z"/></g><path fill="currentColor" d="M45.825 45.168c-.003.967-.804 1.832-1.765 1.832H15v1h29.056c1.617.009 2.936-1.239 2.944-2.864z"/></svg>',
  cycling: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M388 448a92 92 0 1 1 92-92a92.1 92.1 0 0 1-92 92m0-152a60 60 0 1 0 60 60a60.07 60.07 0 0 0-60-60M124 448a92 92 0 1 1 92-92a92.1 92.1 0 0 1-92 92m0-152a60 60 0 1 0 60 60a60.07 60.07 0 0 0-60-60m196-168a31.89 31.89 0 0 0 32-32.1A31.55 31.55 0 0 0 320.2 64a32 32 0 1 0-.2 64"/><path fill="currentColor" d="M367.55 192h-43.76a4 4 0 0 1-3.51-2.08l-31.74-58.17a31 31 0 0 0-49.38-7.75l-69.86 70.4a32.56 32.56 0 0 0-9.3 22.4c0 17.4 12.6 23.6 18.5 27.1c28.5 16.42 48.57 28.43 59.58 35.1a4 4 0 0 1 1.92 3.41v69.12c0 8.61 6.62 16 15.23 16.43A16 16 0 0 0 272 352v-86a16 16 0 0 0-6.66-13l-37-26.61a4 4 0 0 1-.58-6l42-44.79a4 4 0 0 1 6.42.79L298 215.77a16 16 0 0 0 14 8.23h56a16 16 0 0 0 16-16.77c-.42-8.61-7.84-15.23-16.45-15.23"/></svg>',
  training: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M48 256h416"/><rect width="32" height="256" x="384" y="128" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" rx="16" ry="16"/><rect width="32" height="256" x="96" y="128" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" rx="16" ry="16"/><rect width="16" height="128" x="32" y="192" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" rx="8" ry="8"/><rect width="16" height="128" x="464" y="192" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" rx="8" ry="8"/></svg>',
  hiking: '<svg viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M120 48a32 32 0 1 1 32 32a32 32 0 0 1-32-32m72 88c-23.37 0-28.92-8.56-36.6-20.4c-3.65-5.64-7.79-12-14.16-17.55a41 41 0 0 0-8-5.47a8 8 0 0 0-11 3.92L64.66 228.81a8 8 0 0 0 4.15 10.52A7.8 7.8 0 0 0 72 240a8 8 0 0 0 7.34-4.81l33.59-77.27l31.07 22.2V232a8 8 0 0 0 16 0v-56a8 8 0 0 0-3.35-6.51l-37.2-26.57l13.4-30.81c3.57 3.62 6.28 7.8 9.13 12.19c7.67 11.84 16.27 25.11 42 27.36V232a8 8 0 0 0 16 0v-88a8 8 0 0 0-7.98-8M72 152a8 8 0 0 0 7.36-4.85l24-56a8 8 0 0 0-4.2-10.5l-28-12a8 8 0 0 0-10.5 4.2l-24 56a8 8 0 0 0 4.2 10.5l28 12A8 8 0 0 0 72 152"/></svg>',
  retail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" d="M5.5 21a2 2 0 1 0 4 0m3 0a2 2 0 1 0 4 0M7 7.5h15.5v.25l-.239.283A16 16 0 0 0 18.5 18.34v.16h-13v-1.88c0-2.08-.066-4.158-.386-6.212C4.56 6.852 3.337 1.5 1 1.5"/></svg>',
  serving: '<svg viewBox="0 0 50 50" aria-hidden="true"><path fill="currentColor" d="M48.894 15.154L44.959 46H31.668l-3.919-31h16.226l3.207-11.077L49 4.471l-3.077 10.66zM25.87 33s.497-4-6.395-4H8.499c-6.882 0-6.395 4-6.395 4zM2.104 42s-.487 4 6.395 4h10.977c6.892 0 6.395-4 6.395-4zm22.735-2c1.128 0 2.039-1.114 2.039-2.499c0-1.393-.911-2.501-2.039-2.501H3.04C1.917 35 1 36.108 1 37.501C1 38.886 1.917 40 3.04 40z"/></svg>',
  lift: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16"/></svg>',
  bowlLift: '<svg viewBox="0 0 15 15" aria-hidden="true"><path d="M0 0h15v15H0z" fill="none"/><path fill="currentColor" d="M7 11.86V5.37c-.3-.18-.5-.5-.5-.87V2.38L1.56 3A.51.51 0 0 1 1 2.56A.51.51 0 0 1 1.44 2l5.07-.63C6.57.88 6.99.5 7.5.5c.42 0 .78.26.93.63L13.44.5c.27-.03.52.16.56.44a.51.51 0 0 1-.44.56l-5.06.63V4.5c0 .37-.2.69-.5.87v6.49l1.73 1.23a.5.5 0 0 1 .12.7c-.1.13-.25.21-.41.21H5.56c-.28 0-.5-.22-.5-.5c0-.16.08-.31.21-.41z"/></svg>',
  tBar: '<svg viewBox="0 0 15 15" aria-hidden="true"><path fill="currentColor" d="M7 12V5.37c-.3-.18-.5-.5-.5-.87V2.38L1.56 3A.51.51 0 0 1 1 2.56A.51.51 0 0 1 1.44 2l5.07-.63C6.57.88 6.99.5 7.5.5c.42 0 .78.26.93.63L13.44.5c.27-.03.52.16.56.44a.51.51 0 0 1-.44.56l-5.06.63V4.5c0 .37-.2.69-.5.87V12h4.53c.22 0 .42.15.48.36c.08.26-.08.54-.34.62L7.5 14.5l-5.17-1.52a.501.501 0 0 1 .14-.98z"/></svg>',
  chairlift: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v7m-5 0h10m-8 0v5h6v-5m-8 5h10"/></svg>',
  gondola: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v4m-5 0h10l-1 10H8L7 8Z"/><path d="M8 12h8"/></svg>',
  parking: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 3H5v18h4v-5h4.5c3.584 0 6.5-2.916 6.5-6.5S17.084 3 13.5 3m0 9H9V7h4.5C14.879 7 16 8.121 16 9.5S14.879 12 13.5 12"/></svg>',
  restroom: '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="currentColor" d="M132 139.824a61.912 61.912 0 1 0-61.912-61.912A61.98 61.98 0 0 0 132 139.824M132 48a29.912 29.912 0 1 1-29.912 29.912A29.947 29.947 0 0 1 132 48m44 104H88a48.053 48.053 0 0 0-48 48v152h32v144h120V352h32V200a48.053 48.053 0 0 0-48-48m16 168h-32v144h-56V320H72V200a16.02 16.02 0 0 1 16-16h88a16.02 16.02 0 0 1 16 16Zm178.088-180.176a61.912 61.912 0 1 0-61.912-61.912a61.98 61.98 0 0 0 61.912 61.912m0-91.824a29.912 29.912 0 1 1-29.912 29.912A29.947 29.947 0 0 1 370.088 48m55.671 145.354a61.586 61.586 0 0 0-115.833-1.392L248 357.1V400h64v96h104v-96h64v-50.7ZM448 368h-64v96h-40v-96h-64v-5.1l59.889-159.7a29.585 29.585 0 0 1 55.645.669L448 354.7Z"/></svg>',
  evCharging: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"><path d="M10 13.154V21m5-12.615v2.769a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-2.77a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2Zm-1.667-2V3M6.667 6.385V3"/><path stroke-linejoin="round" d="M16.667 16L15 19h4l-1.667 3"/></g></svg>',
  generic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.2"/></svg>',
});

function categoryText(feature) {
  return `${feature?.category || ''} ${feature?.categoryName || ''} ${feature?.featureType || ''} ${feature?.featureSubtype || ''}`.toLocaleLowerCase('nb-NO');
}

function isEvChargingText(value) {
  return value.includes('ladepunkt') || value.includes('elbillading') || value.includes('el-bil-lading')
    || value.includes('charging') || value.includes('lading');
}

function isCoordinate(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function coordinateOnPath(coordinates, closed = false) {
  const points = coordinates.filter(isCoordinate);
  if (points.length === 0) return null;
  const segments = [];
  for (let index = 1; index < points.length; index += 1) segments.push([points[index - 1], points[index]]);
  if (closed && (points.length > 2) && (points[0][0] !== points.at(-1)[0] || points[0][1] !== points.at(-1)[1])) segments.push([points.at(-1), points[0]]);
  const length = ([from, to]) => Math.hypot(to[0] - from[0], to[1] - from[1]);
  const total = segments.reduce((sum, segment) => sum + length(segment), 0);
  if (!total) return [...points[0]];
  let remaining = total / 2;
  for (const segment of segments) {
    const segmentLength = length(segment);
    if (remaining <= segmentLength) {
      const ratio = remaining / segmentLength;
      return [segment[0][0] + (segment[1][0] - segment[0][0]) * ratio, segment[0][1] + (segment[1][1] - segment[0][1]) * ratio];
    }
    remaining -= segmentLength;
  }
  return [...points.at(-1)];
}

// A label for a line or polygon belongs on its visible outline, not at the
// bounding-box centre (which may be empty space or outside a concave shape).
export function activityMapIconCoordinate(geometry) {
  if (geometry?.type === 'Point' && isCoordinate(geometry.coordinates)) return [...geometry.coordinates];
  if (geometry?.type === 'LineString') return coordinateOnPath(geometry.coordinates);
  if (geometry?.type === 'Polygon') return coordinateOnPath(geometry.coordinates?.[0], true);
  return null;
}

export function activityMapIconKind(feature) {
  const value = categoryText(feature);
  const name = String(feature?.name || '').toLocaleLowerCase('nb-NO');
  if (isEvChargingText(value) || isEvChargingText(name)) return 'evCharging';
  if (value.includes('parking') || value.includes('parkering')) return 'parking';
  if (value.includes('wc') || value.includes('toalett')) return 'restroom';
  if (value.includes('serving') || value.includes('servering')) return 'serving';
  if (value.includes('bowl_lift') || value.includes('skålheis')) return 'bowlLift';
  if (value.includes('t_bar') || value.includes('t-krok')) return 'tBar';
  if (value.includes('chairlift') || value.includes('stolheis')) return 'chairlift';
  if (value.includes('gondola') || value.includes('gondol')) return 'gondola';
  if (value.includes('lift') || value.includes('heis')) return 'lift';
  if (value.includes('alpine') || value.includes('alpint')) return 'alpine';
  if (value.includes('cross_country') || value.includes('langrenn')) return 'crossCountry';
  if (value.includes('cycling') || value.includes('sykkel')) return 'cycling';
  if (value.includes('training') || value.includes('trening')) return 'training';
  if (value.includes('hiking') || value.includes('tur')) return 'hiking';
  if (value.includes('retail') || value.includes('utsalg')) return 'retail';
  return 'generic';
}

export function activityMapIconMarkup(feature) {
  return ICONS[activityMapIconKind(feature)];
}

export function activityMapIconAnchor(feature) {
  return feature?.geometry?.type === 'Point' ? [15, 30] : [15, 15];
}
