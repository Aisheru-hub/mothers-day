const scene = document.querySelector('.tv-scene');
const remote = scene.querySelector('.remote');
const start = scene.querySelector('.remote-start');
const announcement = scene.querySelector('#tv-status');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const dialog = document.querySelector('#theater');
const video = dialog.querySelector('video');
let playerTrigger;

function modifiedClick(event) {
  return event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;
}

function showChannel() {
  scene.dataset.phase = 'on';
  remote.hidden = false;
  tvVideo.preload = 'metadata';
  announcement.textContent = 'Телевизор включён. Нажми «Пуск» на пульте, чтобы посмотреть видео.';
  start.focus({ preventScroll: true });
}

function turnOn(event) {
  if (event.currentTarget.classList.contains('power-link') &&
      scene.getBoundingClientRect().bottom > innerHeight - 12) {
    scene.scrollIntoView({ behavior: motion.matches ? 'instant' : 'smooth', block: 'center' });
  }
  if (scene.dataset.phase === 'on') {
    start.focus({ preventScroll: true });
    return;
  }
  if (scene.dataset.phase === 'tuning') return;

  scene.dataset.phase = 'tuning';
  if (motion.matches) showChannel();
  else setTimeout(showChannel, 900);
}

for (const power of document.querySelectorAll('[data-power]')) {
  power.addEventListener('click', turnOn);
  power.hidden = false;
}

for (const control of document.querySelectorAll('[data-watch]')) {
  control.addEventListener('click', (event) => {
    if (modifiedClick(event) || typeof dialog.showModal !== 'function') return;
    event.preventDefault();
    if (dialog.open) return;
    playerTrigger = control;
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
  playerTrigger?.focus({ preventScroll: true });
});
video.addEventListener('error', () => { dialog.querySelector('.media-error').hidden = false; });

const tvDialog = document.querySelector('#tv-theater');
const tvVideo = tvDialog.querySelector('video');
const tvError = tvDialog.querySelector('.tv-error');
const cameraFrame = tvDialog.querySelector('.camera-frame');
const sourceSet = scene.querySelector('.set');
const sourceScreen = sourceSet.querySelector('.screen');
const zoomSet = sourceSet.cloneNode(true);
const zoomScreen = zoomSet.querySelector('.screen');
const zoomKnob = zoomSet.querySelector('.knob');
zoomScreen.removeAttribute('id');
zoomScreen.querySelector('.program').remove();
zoomKnob.removeAttribute('data-power');
zoomKnob.removeAttribute('aria-controls');
zoomKnob.removeAttribute('aria-label');
zoomKnob.setAttribute('aria-hidden', 'true');
zoomKnob.hidden = false;
zoomKnob.disabled = true;
zoomScreen.prepend(tvVideo);
cameraFrame.append(zoomSet);

// The TV file starts with 39 silent frames at 30 fps so playback can be
// requested during the tap while the camera moves before the first scene.
const preroll = 1.3;
const zoomStart = .12;
const zoomEnd = 1.25;
let view;
let destination;
let progress = 0;
let cameraAnimation;
let playbackAttempt = 0;

function measureDestination() {
  const width = tvDialog.clientWidth;
  const height = tvDialog.clientHeight;
  const scale = Math.min((width - Math.max(25, width * .069)) / view.screenWidth,
    (height - Math.max(46, height * .12)) / view.screenHeight);
  destination = {
    x: width / 2 - view.screenX * scale,
    y: height / 2 - view.screenY * scale,
    scale,
  };
}

function placeCamera(amount) {
  progress = amount;
  const ease = amount * amount * (3 - 2 * amount);
  const x = view.left + (destination.x - view.left) * ease;
  const y = view.top + (destination.y - view.top) * ease;
  const scale = 1 + (destination.scale - 1) * ease;
  cameraFrame.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0) scale(' + scale + ')';
  tvDialog.style.setProperty('--tv-shade', ease * .97);
}

function finishZoom() {
  cancelAnimationFrame(cameraAnimation);
  placeCamera(1);
  tvDialog.classList.remove('is-tuning');
  tvVideo.controls = true;
}

function followVideo() {
  if (!tvDialog.open) return;
  const timeline = (tvVideo.currentTime - zoomStart) / (zoomEnd - zoomStart);
  if (timeline >= 1) {
    finishZoom();
    return;
  }
  placeCamera(Math.max(0, timeline));
  cameraAnimation = requestAnimationFrame(followVideo);
}

start.addEventListener('click', (event) => {
  if (modifiedClick(event) || typeof tvDialog.showModal !== 'function') return;
  event.preventDefault();
  if (tvDialog.open) return;

  const set = sourceSet.getBoundingClientRect();
  const screen = sourceScreen.getBoundingClientRect();
  view = {
    left: set.left,
    top: set.top,
    screenX: screen.left - set.left + screen.width / 2,
    screenY: screen.top - set.top + screen.height / 2,
    screenWidth: screen.width,
    screenHeight: screen.height,
  };
  cameraFrame.style.width = scene.clientWidth + 'px';
  tvVideo.controls = false;
  tvError.hidden = true;
  tvDialog.classList.add('is-tuning');
  tvDialog.showModal();
  measureDestination();

  const attempt = ++playbackAttempt;
  if (motion.matches) {
    tvVideo.currentTime = preroll;
    finishZoom();
  } else {
    tvVideo.currentTime = 0;
    placeCamera(0);
    cameraAnimation = requestAnimationFrame(followVideo);
  }
  tvVideo.play().catch(() => {
    if (!tvDialog.open || attempt !== playbackAttempt) return;
    if (!tvVideo.error) tvVideo.currentTime = preroll;
    finishZoom();
    tvError.hidden = !tvVideo.error;
  });
});

window.addEventListener('resize', () => {
  if (!tvDialog.open) return;
  measureDestination();
  placeCamera(progress);
});
tvDialog.querySelector('[data-tv-close]').addEventListener('click', () => tvDialog.close());
tvDialog.addEventListener('close', () => {
  playbackAttempt++;
  cancelAnimationFrame(cameraAnimation);
  tvVideo.pause();
  start.focus({ preventScroll: true });
});
tvVideo.addEventListener('error', () => {
  if (!tvDialog.open) return;
  finishZoom();
  tvError.hidden = false;
});
