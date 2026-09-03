<template>
  <section class="screen">
    <header class="screen-header" :class="{ flush: !title }">
      <button v-if="back" type="button" class="back" @click="goBack" aria-label="Terug">
        <i class="pi pi-chevron-left" aria-hidden="true"></i>
      </button>
      <h1 v-if="title" class="title">{{ title }}</h1>
      <div class="actions">
        <slot name="actions" />
      </div>
    </header>

    <div v-if="$slots.subheader" class="subheader">
      <slot name="subheader" />
    </div>

    <div class="body">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { useRouter } from 'vue-router';

const props = defineProps({
  title: { type: String, default: null },
  /** A route to go back to, or `true` to use history. */
  back: { type: [String, Boolean], default: false },
});

const router = useRouter();

function goBack() {
  if (typeof props.back === 'string') {
    router.push(props.back);
  } else {
    router.back();
  }
}
</script>

<style scoped>
.screen {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.screen-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  padding: calc(var(--app-safe-top) + var(--app-space-3)) var(--app-space-4) var(--app-space-3);
  background: var(--app-bg);
  border-bottom: 1px solid var(--app-border);
}

.title {
  flex: 1;
  margin: 0;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.back {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  margin-left: -6px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--app-text);
  font-size: 17px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.back:active {
  background: var(--app-surface-hover);
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
}

.subheader {
  position: sticky;
  top: 0;
  z-index: 19;
  background: var(--app-bg);
}

.body {
  flex: 1;
}
</style>
