<template>
  <div class="app-shell">
    <LoadingSpinner />
    <main class="app-content">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </main>
    <AppTabBar />
  </div>
</template>

<script setup>
import { RouterView } from 'vue-router';
import AppTabBar from '@/components/AppTabBar.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
</script>

<style scoped>
.app-shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.app-content {
  flex: 1;
  /* Clear the fixed tab bar, so the last card is never half-covered. */
  padding-bottom: calc(var(--app-tabbar-height) + var(--app-safe-bottom));
}
</style>
