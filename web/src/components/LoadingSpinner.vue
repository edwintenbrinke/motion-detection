<template>
    <!-- Show a loading spinner when isLoading is true -->
  <div v-if="loadingStore.isLoading" class="loading-overlay">
    <div class="spinner"></div>
  </div>
</template>

<script>
import {useLoadingStore} from '@/stores/loading';

export default {
  setup() {
    const loadingStore = useLoadingStore();
    return {loadingStore};
  }
};
</script>

<style scoped>
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  animation: spin 2s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
