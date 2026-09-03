<template>
  <div class="badge" :class="quality">
    <span class="pip" :class="{ pulsing: connecting }"></span>
    {{ label }}
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { stateLabel, stateQuality } from '@/lib/live/labels.js';

const props = defineProps({
  state: { type: Object, required: true },
});

const label = computed(() => stateLabel(props.state));
const quality = computed(() => stateQuality(props.state));
const connecting = computed(() => props.state.phase === 'connecting' || props.state.phase === 'stalled');
</script>

<style scoped>
/* The rung is always on screen. A live view that is quietly five seconds behind is worse
   than one that says it is -- docs/v2/02-video-transport.md. */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  backdrop-filter: blur(4px);
}

.pip {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--app-success);
}

.badge.ok .pip { background: var(--app-accent); }
.badge.poor .pip { background: var(--app-alert); }

.pulsing {
  animation: pulse 1.1s ease-in-out infinite;
}

@keyframes pulse {
  50% { opacity: 0.25; }
}

@media (prefers-reduced-motion: reduce) {
  .pulsing { animation: none; }
}
</style>
