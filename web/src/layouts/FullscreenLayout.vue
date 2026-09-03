<template>
  <div class="fullscreen">
    <RouterView />
  </div>
</template>

<script setup>
import { RouterView } from 'vue-router';
</script>

<style scoped>
/* No tab bar, no header: the zone editor and landscape live view want every pixel. */
.fullscreen {
  min-height: 100dvh;
  background: #000;
}
</style>
