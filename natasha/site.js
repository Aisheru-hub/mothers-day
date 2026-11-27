const journey = document.querySelector('.journey');
const stage = journey.querySelector('.knit-stage');
const handle = stage.querySelector('.thread-end');
const arrival = journey.querySelector('.thread-arrival');
const canvas = journey.querySelector('.thread-layer');
const surprise = journey.querySelector('#surprise');
const heading = journey.querySelector('#surprise-title');
const context = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const texture = new Image();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const smooth = (value) => value * value * (3 - 2 * value);
const point = (x, y) => ({ x, y });

let geometry;
let grip = point(0, 0);
let drag;
let draggingProgress = 0;
let startProgress = 0;
let travelProgress = 0;
let phase = 'ready';
let autoScroll = true;
let suppressClickUntil = 0;

function measure() {
  const bounds = journey.getBoundingClientRect();
  const frame = stage.getBoundingClientRect();
  const end = arrival.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 1.6);
  const width = Math.round(bounds.width * ratio);
  const height = Math.round(bounds.height * ratio);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  geometry = {
    stage: { x: frame.left - bounds.left, y: frame.top - bounds.top, w: frame.width, h: frame.height },
    arrival: point(end.left - bounds.left + 1, end.top - bounds.top + 1),
    videoTop: surprise.getBoundingClientRect().top - bounds.top,
    width: bounds.width,
    height: bounds.height,
    ratio,
  };
  render();
}

// Sample cubic curves by length so the strand pays out at an even speed.
function curveSamples(start, segments, spacing) {
  const points = [{ ...start, length: 0 }];
  let from = start;

  for (const [a, b, end] of segments) {
    const steps = Math.max(12, Math.ceil((Math.hypot(a.x - from.x, a.y - from.y) +
      Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(end.x - b.x, end.y - b.y)) / 4));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const u = 1 - t;
      const x = u ** 3 * from.x + 3 * u ** 2 * t * a.x + 3 * u * t ** 2 * b.x + t ** 3 * end.x;
      const y = u ** 3 * from.y + 3 * u ** 2 * t * a.y + 3 * u * t ** 2 * b.y + t ** 3 * end.y;
      const last = points.at(-1);
      points.push({ x, y, length: last.length + Math.hypot(x - last.x, y - last.y) });
    }
    from = end;
  }

  const total = points.at(-1).length;
  const samples = [];
  let index = 1;
  for (let distance = 0; distance <= total; distance += spacing) {
    while (points[index].length < distance && index < points.length - 1) index++;
    const before = points[index - 1];
    const after = points[index];
    const weight = (distance - before.length) / (after.length - before.length || 1);
    samples.push({
      x: before.x + (after.x - before.x) * weight,
      y: before.y + (after.y - before.y) * weight,
      angle: Math.atan2(after.y - before.y, after.x - before.x),
      distance,
    });
  }
  const last = samples.at(-1);
  if (total - last.distance > .5) {
    const tip = points.at(-1);
    samples.push({ x: tip.x, y: tip.y, angle: Math.atan2(tip.y - last.y, tip.x - last.x), distance: total });
  }
  return samples;
}

function stroke(samples, width, color, offset = 0, twist = 0) {
  context.beginPath();
  for (const sample of samples) {
    const wave = offset + twist * Math.sin(sample.distance * .39);
    const x = sample.x - Math.sin(sample.angle) * wave;
    const y = sample.y + Math.cos(sample.angle) * wave;
    if (sample === samples[0]) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.strokeStyle = color;
  context.lineWidth = width;
  context.stroke();
}

function paintYarn(samples, width, movingTip) {
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.save();
  context.shadowColor = '#58365755';
  context.shadowBlur = width * .55;
  context.shadowOffsetY = width * .28;
  stroke(samples, width + 1.4, '#9b4b68');
  context.restore();
  stroke(samples, width, '#b86483');
  stroke(samples, width * .65, '#cf829c', -width * .15);
  stroke(samples, width * .28, '#f1b9ca', -width * .25);

  if (texture.complete && texture.naturalWidth) {
    context.globalAlpha = .74;
    for (const sample of samples) {
      const sourceX = Math.floor(sample.distance * 2.8) % (texture.naturalWidth - 12);
      context.save();
      context.translate(sample.x, sample.y);
      context.rotate(sample.angle);
      context.drawImage(texture, sourceX, 0, 12, texture.naturalHeight, -2.7, -width * .4, 5.4, width * .79);
      context.restore();
    }
    context.globalAlpha = 1;
  }

  stroke(samples, .75, '#f9d2dbbb', -width * .18, 1.18);
  stroke(samples, .65, '#712e5f77', width * .14, 1.08);
  context.beginPath();
  for (const [index, sample] of samples.entries()) {
    const direction = index % 2 ? 1 : -1;
    const normalX = -Math.sin(sample.angle);
    const normalY = Math.cos(sample.angle);
    const base = width * .35 * direction;
    const length = (width * .61 + (index % 5) * .36) * direction;
    context.moveTo(sample.x + normalX * base, sample.y + normalY * base);
    context.quadraticCurveTo(sample.x + normalX * length, sample.y + normalY * length,
      sample.x + normalX * length + 2.1, sample.y + normalY * length + 1.8);
  }
  context.lineWidth = .55;
  context.strokeStyle = '#d893aea6';
  context.stroke();

  if (!movingTip) return;
  const tip = samples.at(-1);
  const knot = context.createRadialGradient(tip.x - 2, tip.y - 2, 1, tip.x, tip.y, width * .78);
  knot.addColorStop(0, '#fddbdf');
  knot.addColorStop(.53, '#e798b2');
  knot.addColorStop(1, '#994964');
  context.beginPath();
  context.arc(tip.x, tip.y, width * .68, 0, Math.PI * 2);
  context.fillStyle = knot;
  context.fill();
}

function render() {
  if (!geometry) return;
  const { stage: box, width, height, ratio } = geometry;
  const running = phase !== 'ready';
  const amount = running ? startProgress + (1 - startProgress) * smooth(travelProgress) : draggingProgress;

  const moveX = amount * box.w * .15;
  const moveY = amount * box.h * .18;
  const scale = 1 - amount * .94;
  stage.style.setProperty('--unraveled', amount);
  stage.style.setProperty('--ball-x', moveX + 'px');
  stage.style.setProperty('--ball-y', moveY + 'px');
  stage.style.setProperty('--ball-turn', (reducedMotion.matches ? 0 : amount * 247) + 'deg');
  stage.style.setProperty('--ball-scale', scale);
  stage.style.setProperty('--ball-opacity', Math.min(1, (1 - amount) * 3));

  const tip = point(box.x + box.w * .82 + grip.x, box.y + box.h * .81 + grip.y);
  if (!running) {
    stage.style.setProperty('--tip-x', (tip.x - box.x) + 'px');
    stage.style.setProperty('--tip-y', (tip.y - box.y) + 'px');
  }
  if (!context || !width || !height) return;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const origin = point(box.x + box.w * .5 + moveX + box.w * .23 * scale,
    box.y + box.h * .49 + moveY + box.h * .22 * scale);
  const segments = [
    [point(origin.x - box.w * .025, origin.y + box.h * .15),
      point(tip.x - box.w * .18, tip.y + box.h * .24 - amount * 23), tip],
  ];

  if (running) {
    const end = geometry.arrival;
    const gutter = Math.min(width - 17, Math.max(box.x + box.w * .98, end.x + 25));
    const mid = Math.max(tip.y + 42, geometry.videoTop - 18);
    segments.push(
      [point(tip.x + 45, tip.y - 5), point(gutter + 3, mid - 65), point(gutter, mid)],
      [point(gutter + 1, mid + 55), point(gutter - 29, (mid + end.y) / 2 + 10),
        point(gutter - 18, (mid + end.y) / 2 + 15)],
      [point(gutter + 14, end.y - 33), point(end.x + 24, end.y - 38), end],
    );
  }

  const localSamples = curveSamples(origin, segments.slice(0, 1), 4);
  const allSamples = running ? curveSamples(origin, segments, 4) : localSamples;
  const initialLength = localSamples.at(-1).distance;
  const totalLength = allSamples.at(-1).distance;
  const availableLength = initialLength + (totalLength - initialLength) * smooth(travelProgress);
  const visible = phase === 'complete' ? allSamples : allSamples.filter((sample) => sample.distance <= availableLength + .08);
  if (visible.length > 1) paintYarn(visible, width < 520 ? 7 : 10, running);
}

function finishTravel() {
  phase = 'complete';
  travelProgress = 1;
  render();
  if (autoScroll) heading.focus({ preventScroll: true });
}

function unwind() {
  if (phase === 'travelling') return;
  if (phase === 'complete') {
    surprise.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start' });
    heading.focus({ preventScroll: true });
    return;
  }

  phase = 'travelling';
  startProgress = draggingProgress;
  handle.hidden = true;
  autoScroll = true;
  const startY = window.scrollY;
  const endY = Math.min(document.documentElement.scrollHeight - innerHeight,
    window.scrollY + surprise.getBoundingClientRect().top);
  const begun = performance.now();
  const duration = 1580 - startProgress * 280;

  if (reducedMotion.matches) {
    window.scrollTo({ top: endY, behavior: 'instant' });
    finishTravel();
    return;
  }

  function advance(now) {
    travelProgress = clamp((now - begun) / duration, 0, 1);
    render();

    const scrollProgress = smooth(clamp((travelProgress - .1) / .90, 0, 1));
    if (autoScroll) window.scrollTo({ top: startY + (endY - startY) * scrollProgress, behavior: 'instant' });
    if (travelProgress < 1) requestAnimationFrame(advance);
    else finishTravel();
  }
  requestAnimationFrame(advance);
}

texture.addEventListener('load', render);
texture.src = 'thread-texture.webp';
if ('ResizeObserver' in window) new ResizeObserver(measure).observe(journey);
window.addEventListener('resize', measure);
for (const name of ['wheel', 'touchstart']) {
  window.addEventListener(name, () => {
    if (phase === 'travelling') autoScroll = false;
  }, { passive: true });
}
measure();

handle.addEventListener('dragstart', (event) => event.preventDefault());
handle.addEventListener('pointerdown', (event) => {
  if (phase !== 'ready' || drag || !event.isPrimary || event.button !== 0) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  handle.setPointerCapture(event.pointerId);
});
handle.addEventListener('pointermove', (event) => {
  if (drag?.id !== event.pointerId) return;
  const x = event.clientX - drag.x;
  const y = event.clientY - drag.y;
  const distance = Math.hypot(x, y);
  if (distance > 6) drag.moved = true;
  if (!drag.moved || reducedMotion.matches) return;
  const box = geometry.stage;
  grip = point(clamp(x, -box.w * .31, box.w * .14), clamp(y, -box.h * .36, box.h * .15));
  draggingProgress = clamp(distance / Math.max(126, box.w * .4), 0, .63);
  render();
});
handle.addEventListener('pointerup', (event) => {
  if (drag?.id !== event.pointerId) return;
  const moved = drag.moved;
  drag = undefined;
  if (moved) {
    suppressClickUntil = performance.now() + 360;
    unwind();
  }
});
handle.addEventListener('pointercancel', (event) => {
  if (drag?.id !== event.pointerId) return;
  drag = undefined;
  draggingProgress = 0;
  grip = point(0, 0);
  render();
});

function modifiedClick(event) {
  return event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
}
for (const control of document.querySelectorAll('[data-unwind]')) {
  control.addEventListener('click', (event) => {
    if (modifiedClick(event)) return;
    event.preventDefault();
    if (control !== handle || performance.now() >= suppressClickUntil) unwind();
  });
}

const dialog = document.querySelector('#theater');
const video = dialog.querySelector('video');
let trigger;

for (const control of document.querySelectorAll('[data-watch]')) {
  control.addEventListener('click', (event) => {
    if (modifiedClick(event) || typeof dialog.showModal !== 'function') return;
    event.preventDefault();
    if (dialog.open) return;
    trigger = control;
    dialog.showModal();
    video.play().catch(() => {});
  });
}
dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
dialog.addEventListener('close', () => {
  video.pause();
  trigger?.focus({ preventScroll: true });
});
video.addEventListener('error', () => { dialog.querySelector('.media-error').hidden = false; });
