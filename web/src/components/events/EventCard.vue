<template>
  <article class="card" :class="{ alert: alert, unseen: !event.seen }" @click="$emit('open', event)">
    <div class="thumb">
      <img
          v-if="thumbnail && !thumbnailFailed"
          :src="thumbnail"
          :alt="`Beeld van ${headlineText.toLowerCase()}`"
          loading="lazy"
          decoding="async"
          @error="onThumbnailError"
      />
      <div v-else class="thumb-fallback">
        <i :class="fallbackIconClass" aria-hidden="true"></i>
      </div>
      <span v-if="duration" class="duration">{{ duration }}</span>
    </div>

    <div class="content">
      <div class="top">
        <span class="time">{{ time }}</span>
        <span class="camera">{{ cameraName }}</span>
        <span v-if="!event.seen" class="dot" aria-label="Nog niet bekeken"></span>
      </div>

      <p class="headline">{{ headlineText }}</p>

      <p v-if="event.description && event.description !== headlineText" class="description">
        {{ event.description }}
      </p>

      <div v-if="visibleChips.length" class="chips">
        <span v-for="chip in visibleChips" :key="chip.key" class="chip" :class="chip.kind">
          {{ chip.text }}
        </span>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { formatTime, formatDuration } from '@/lib/datetime.js';
import { headline, chips, cameraNl, isAlert, fallbackIcon } from '@/lib/eventPresenter.js';

const props = defineProps({
  event: { type: Object, required: true },
});

const emit = defineEmits(['open', 'refresh-media']);

const thumbnailFailed = ref(false);
const retried = ref(false);

const thumbnail = computed(() => props.event.media?.thumbnail ?? null);
const alert = computed(() => isAlert(props.event));
const time = computed(() => formatTime(props.event.started_at));
const cameraName = computed(() => cameraNl(props.event.camera));
const duration = computed(() => formatDuration(props.event.duration_s));
const headlineText = computed(() => headline(props.event));
const fallbackIconClass = computed(() => fallbackIcon(props.event));

// The label and sub-label are already in the headline; the chips carry the rest.
const visibleChips = computed(() => chips(props.event).filter((chip) => chip.kind !== 'label' && chip.kind !== 'sub'));

/**
 * A signed URL that has expired comes back as a broken image and nothing else -- the
 * browser gives no status, so `error` is the only signal there is. Ask for a fresh one
 * once; a second failure means the media genuinely is not there, and the icon is honest.
 */
function onThumbnailError() {
  if (retried.value) {
    thumbnailFailed.value = true;
    return;
  }
  retried.value = true;
  emit('refresh-media', props.event.id);
}

// A new URL arrived: try it.
watch(thumbnail, () => {
  thumbnailFailed.value = false;
});
</script>

<style scoped>
.card {
  display: flex;
  gap: var(--app-space-3);
  padding: var(--app-space-3) var(--app-space-4);
  background: var(--app-surface);
  border-bottom: 1px solid var(--app-border);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.card:active {
  background: var(--app-surface-hover);
}

/* An alert is the reason you installed this. It gets an edge; a detection does not. */
.card.alert {
  box-shadow: inset 3px 0 0 var(--app-alert);
}

.thumb {
  position: relative;
  flex: 0 0 108px;
  width: 108px;
  aspect-ratio: 16 / 9;
  border-radius: var(--app-radius-sm);
  overflow: hidden;
  background: var(--app-surface-raised);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumb-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--app-text-faint);
  font-size: 20px;
}

.duration {
  position: absolute;
  right: 4px;
  bottom: 4px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.content {
  flex: 1;
  min-width: 0;
}

.top {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  font-size: 12px;
  color: var(--app-text-muted);
}

.time {
  font-weight: 600;
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--app-alert);
  margin-left: auto;
}

.headline {
  margin: 2px 0 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}

.description {
  margin: 2px 0 0;
  color: var(--app-text-muted);
  font-size: 13px;
  /* One line: the feed is scanned, not read. The full text is in the detail view. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.chip {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.6;
  background: var(--app-surface-raised);
  color: var(--app-text-muted);
}

.chip.zone {
  background: var(--app-detection-dim);
  color: var(--app-detection);
}

.chip.tag {
  background: rgba(242, 177, 52, 0.12);
  color: var(--app-accent);
}
</style>
