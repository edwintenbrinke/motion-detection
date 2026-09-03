<template>
  <component
      :is="to ? 'RouterLink' : 'button'"
      :to="to"
      :type="to ? undefined : 'button'"
      class="row"
      @click="!to && $emit('click')"
  >
    <i v-if="icon" :class="icon" class="row-icon" aria-hidden="true"></i>
    <span class="text">
      <span class="label">{{ label }}</span>
      <span v-if="description" class="description">{{ description }}</span>
    </span>
    <span v-if="value" class="value">{{ value }}</span>
    <i v-if="to" class="pi pi-chevron-right chevron" aria-hidden="true"></i>
  </component>
</template>

<script setup>
import { RouterLink } from 'vue-router';

defineProps({
  label: { type: String, required: true },
  description: { type: String, default: null },
  value: { type: String, default: null },
  icon: { type: String, default: null },
  to: { type: String, default: null },
});

defineEmits(['click']);
</script>

<style scoped>
.row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  padding: var(--app-space-3) var(--app-space-4);
  border: none;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text);
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.row:active {
  background: var(--app-surface-hover);
}

.row-icon {
  width: 20px;
  color: var(--app-text-muted);
  font-size: 16px;
}

.text {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.description {
  color: var(--app-text-muted);
  font-size: 13px;
}

.value {
  color: var(--app-text-muted);
  font-size: 14px;
}

.chevron {
  color: var(--app-text-faint);
  font-size: 13px;
}
</style>
