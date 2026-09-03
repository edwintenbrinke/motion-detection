<template>
  <div class="empty" role="status">
    <i :class="icon" aria-hidden="true"></i>
    <p class="title">{{ title }}</p>
    <p v-if="description" class="description">{{ description }}</p>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  icon: { type: String, default: 'pi pi-inbox' },
  title: { type: String, required: true },
  description: { type: String, default: null },
});
</script>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-2);
  padding: var(--app-space-6) var(--app-space-5);
  text-align: center;
  color: var(--app-text-muted);
}

.empty i {
  font-size: 30px;
  color: var(--app-text-faint);
  margin-bottom: var(--app-space-2);
}

.title {
  margin: 0;
  color: var(--app-text);
  font-weight: 600;
}

.description {
  margin: 0;
  max-width: 34ch;
  font-size: 14px;
}
</style>
