<template>
  <div class="stale" role="status">
    <i class="pi pi-wifi" aria-hidden="true"></i>
    <span class="text">Verouderd · {{ age }}</span>
    <button type="button" @click="$emit('retry')">Opnieuw</button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { formatRelative } from '@/lib/datetime.js';

const props = defineProps({
  since: { type: String, default: null },
});

defineEmits(['retry']);

const age = computed(() => (props.since ? formatRelative(props.since) : 'onbekend'));
</script>

<style scoped>
/* Not an error banner. The content below it is real, it is just old, and saying so beats
   replacing a usable feed with a failure message. */
.stale {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  padding: var(--app-space-2) var(--app-space-4);
  background: rgba(242, 177, 52, 0.12);
  color: var(--app-accent);
  font-size: 13px;
}

.text {
  flex: 1;
}

button {
  padding: 3px 10px;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
</style>
