<template>
  <div v-if="isLoading" class="loading-bar">
    <div class="loading-bar-progress" :style="{ width: `${progress}%` }"></div>
  </div>
</template>

<script>
import { ref, watch, onMounted, onUnmounted } from 'vue';

export default {
  name: 'LoadingBar',
  setup() {
    const isLoading = ref(false);
    const progress = ref(0);
    let interval;

    const startLoading = () => {
      isLoading.value = true;
      progress.value = 0;
      interval = setInterval(() => {
        if (progress.value < 90) {
          progress.value += 10; // Gradually increase progress
        }
      }, 200);
    };

    const finishLoading = () => {
      progress.value = 100; // Instantly complete the bar
      setTimeout(() => {
        isLoading.value = false;
        progress.value = 0; // Reset progress
        clearInterval(interval);
      }, 500); // Delay to let users see the complete bar
    };

    watch(
        () => window.$isLoading,
        (newVal) => {
          if (newVal) startLoading();
          else finishLoading();
        }
    );

    onMounted(() => {
      window.$isLoading = false; // Initialize global state
    });

    onUnmounted(() => {
      clearInterval(interval);
    });

    return {
      isLoading,
      progress,
    };
  },
};
</script>

<style>
.loading-bar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px;
  background: rgba(0, 0, 0, 0.1);
  z-index: 9999;
  overflow: hidden;
}

.loading-bar-progress {
  height: 100%;
  background-color: #4caf50; /* Change this color as needed */
  transition: width 0.2s ease-in-out;
}
</style>
