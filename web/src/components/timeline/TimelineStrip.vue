<template>
  <div
      ref="root"
      class="strip"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
  >
    <canvas ref="canvas" class="canvas"></canvas>
    <div class="playhead"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import {
  timeToX, xToTime, panCenter, zoomAround, snapWindow, clampCenter, ticks,
} from './useTimelineGeometry.js';

const props = defineProps({
  dayStart: { type: Number, required: true },
  dayEnd: { type: Number, required: true },
  centerTs: { type: Number, required: true },
  windowMs: { type: Number, required: true },
  recordings: { type: Array, default: () => [] },
  events: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:centerTs', 'update:windowMs', 'scrub-start', 'scrub', 'scrub-end', 'tap-event']);

const MARKER_HIT_PX = 14;

const root = ref(null);
const canvas = ref(null);

let width = 0;
let height = 0;
let ctx = null;
let observer = null;
let frame = null;

// Pointer bookkeeping: one pointer pans, two pinch.
const pointers = new Map();
let dragged = false;
let pinched = false;
let pinchStart = null;

/**
 * The view used while a gesture is in progress.
 *
 * Reading props on every pointermove looks equivalent and is not: prop updates are async, so
 * a burst of moves coalesced into one frame would each compute from the same stale window
 * and only the last emit would survive. A pinch would then apply one step's worth of zoom
 * no matter how far the fingers travelled. During a gesture the strip is the source of
 * truth; props take over again when the fingers lift.
 */
let gesture = null;

function view() {
  if (gesture) return { width, windowMs: gesture.windowMs, centerTs: gesture.centerTs };
  return { width, windowMs: props.windowMs, centerTs: props.centerTs };
}

// -- Drawing ----------------------------------------------------------------------------

function scheduleDraw() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    draw();
  });
}

function draw() {
  if (!ctx) return;

  const style = getComputedStyle(root.value);
  const colour = (name, fallback) => style.getPropertyValue(name).trim() || fallback;

  ctx.clearRect(0, 0, width, height);

  const trackTop = height * 0.42;
  const trackHeight = height * 0.3;

  // The day itself: everything not covered by a recording reads as a gap.
  ctx.fillStyle = colour('--app-surface-raised', '#21262d');
  ctx.fillRect(0, trackTop, width, trackHeight);

  ctx.fillStyle = colour('--app-border-strong', '#3b444e');
  for (const range of props.recordings) {
    const x1 = timeToX(Date.parse(range.start), view());
    const x2 = timeToX(Date.parse(range.end), view());
    ctx.fillRect(x1, trackTop, Math.max(1, x2 - x1), trackHeight);
  }

  // Ticks and their labels.
  ctx.fillStyle = colour('--app-text-faint', '#6b7681');
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';

  for (const ts of ticks({ ...view(), dayStart: props.dayStart })) {
    const x = timeToX(ts, view());
    ctx.fillRect(x, trackTop - 6, 1, 5);
    ctx.fillText(formatTick(ts), x, trackTop - 10);
  }

  // Event markers, alerts on top of detections so they are never hidden behind one.
  const alerts = [];
  for (const event of props.events) {
    const x = timeToX(Date.parse(event.start), view());
    if (x < -8 || x > width + 8) continue;
    if (event.severity === 'alert') {
      alerts.push(x);
    } else {
      drawMarker(x, trackTop, trackHeight, colour('--app-detection', '#6aa9e0'));
    }
  }
  for (const x of alerts) {
    drawMarker(x, trackTop, trackHeight, colour('--app-alert', '#ff6b5b'));
  }
}

function drawMarker(x, top, trackHeight, colour) {
  ctx.fillStyle = colour;
  ctx.fillRect(x - 1.5, top - 3, 3, trackHeight + 6);
}

function formatTick(ts) {
  const date = new Date(ts);
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  if (seconds !== 0) return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${String(date.getHours()).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// -- Interaction ------------------------------------------------------------------------

function beginGesture() {
  gesture = { windowMs: props.windowMs, centerTs: props.centerTs };
}

function onPointerDown(event) {
  root.value.setPointerCapture?.(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pointers.size === 1) {
    dragged = false;
    pinched = false;
    beginGesture();
    emit('scrub-start');
  }

  if (pointers.size === 2) {
    pinched = true;
    pinchStart = pinchState();
  }
}

function onPointerMove(event) {
  const previous = pointers.get(event.pointerId);
  if (!previous || !gesture) return;

  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (pointers.size >= 2) {
    const current = pinchState();
    if (pinchStart && current.distance > 0 && pinchStart.distance > 0) {
      const scale = current.distance / pinchStart.distance;
      const next = zoomAround(current.midX - rect().left, scale, view());

      gesture.windowMs = next.windowMs;
      gesture.centerTs = clampCenter(next.centerTs, { ...props, windowMs: next.windowMs });

      emit('update:windowMs', gesture.windowMs);
      emit('update:centerTs', gesture.centerTs);
      pinchStart = current;
    }
    dragged = true;
    scheduleDraw();
    return;
  }

  const dx = event.clientX - previous.x;
  if (dx !== 0) dragged = true;

  gesture.centerTs = clampCenter(panCenter(gesture.centerTs, dx, view()), props);
  emit('update:centerTs', gesture.centerTs);
  emit('scrub', gesture.centerTs);
  scheduleDraw();
}

function onPointerUp(event) {
  pointers.delete(event.pointerId);
  if (pointers.size > 0) return;

  if (pinched) {
    // Settle on a level rather than leaving the strip at an arbitrary zoom.
    const snapped = snapWindow(gesture?.windowMs ?? props.windowMs);
    if (gesture) gesture.windowMs = snapped;
    emit('update:windowMs', snapped);
  } else if (!dragged) {
    const x = event.clientX - rect().left;
    const marker = markerAt(x);
    if (marker) {
      gesture = null;
      pinchStart = null;
      emit('tap-event', marker);
      return;
    }
    // A tap on empty strip is still a seek: it is what the playhead is for.
    gesture.centerTs = clampCenter(xToTime(x, view()), props);
    emit('update:centerTs', gesture.centerTs);
  }

  const endTs = gesture?.centerTs ?? props.centerTs;
  gesture = null;
  pinchStart = null;
  emit('scrub-end', endTs);
}

function markerAt(x) {
  let best = null;
  let bestDistance = MARKER_HIT_PX;

  for (const event of props.events) {
    const distance = Math.abs(timeToX(Date.parse(event.start), view()) - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = event;
    }
  }
  return best;
}

function pinchState() {
  const [a, b] = [...pointers.values()];
  return { distance: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2 };
}

function rect() {
  return root.value.getBoundingClientRect();
}

// -- Sizing -----------------------------------------------------------------------------

function resize() {
  if (!canvas.value || !root.value) return;

  const bounds = root.value.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  width = bounds.width;
  height = bounds.height;

  canvas.value.width = Math.round(width * dpr);
  canvas.value.height = Math.round(height * dpr);
  canvas.value.style.width = `${width}px`;
  canvas.value.style.height = `${height}px`;

  ctx = canvas.value.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  draw();
}

onMounted(() => {
  resize();
  observer = new ResizeObserver(resize);
  observer.observe(root.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  if (frame) cancelAnimationFrame(frame);
});

watch(() => [props.centerTs, props.windowMs, props.recordings, props.events], scheduleDraw, { deep: false });
</script>

<style scoped>
.strip {
  position: relative;
  width: 100%;
  height: 82px;
  background: var(--app-surface);
  border-top: 1px solid var(--app-border);
  border-bottom: 1px solid var(--app-border);
  /* The strip owns horizontal gestures; the page keeps vertical scrolling. */
  touch-action: pan-y;
  user-select: none;
  cursor: grab;
}

.canvas {
  display: block;
}

.playhead {
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  background: var(--app-accent);
  pointer-events: none;
}

.playhead::before {
  content: '';
  position: absolute;
  top: -3px;
  left: -4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--app-accent);
}
</style>
