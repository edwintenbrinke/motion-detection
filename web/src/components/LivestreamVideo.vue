// LiveStreamViewer.vue
<template>
  <div class="live-stream-container" :class="{ 'is-loading': isLoading, 'has-error': hasError }">
    <!-- Main video stream -->
    <img
        v-if="!hasError"
        :src="streamUrl"
        @load="handleStreamLoad"
        @error="handleStreamError"
        :alt="alt"
        class="stream-video"
    />

    <!-- Loading state -->
    <div v-if="isLoading && !hasError" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>Connecting to stream...</p>
    </div>

    <!-- Error state -->
    <div v-if="hasError" class="error-message">
      <p>{{ errorMessage }}</p>
      <button @click="retryConnection" class="retry-button">
        Retry Connection
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps({
  streamUrl: {
    type: String,
    required: true,
  },
  alt: {
    type: String,
    default: 'Live video stream'
  },
  reconnectAttempts: {
    type: Number,
    default: 3
  },
  reconnectDelay: {
    type: Number,
    default: 5000 // 5 seconds
  }
});

const isLoading = ref(true);
const hasError = ref(false);
const errorMessage = ref('');
const attemptCount = ref(0);
let reconnectTimer = null;

const handleStreamLoad = () => {
  isLoading.value = false;
  hasError.value = false;
  errorMessage.value = '';
  attemptCount.value = 0;
};

const handleStreamError = () => {
  if (attemptCount.value < props.reconnectAttempts) {
    attemptCount.value++;
    errorMessage.value = `Connection failed. Retrying... (Attempt ${attemptCount.value}/${props.reconnectAttempts})`;
    reconnectTimer = setTimeout(retryConnection, props.reconnectDelay);
  } else {
    hasError.value = true;
    errorMessage.value = 'Unable to connect to the stream. Please check your connection and try again.';
  }
};

const retryConnection = () => {
  isLoading.value = true;
  hasError.value = false;
  // Force reload the image by adding a timestamp to the URL
  const img = document.querySelector('.stream-video');
  if (img) {
    img.src = `${props.streamUrl}?t=${Date.now()}`;
  }
};

// Watch for streamUrl changes
watch(() => props.streamUrl, () => {
  isLoading.value = true;
  hasError.value = false;
  attemptCount.value = 0;
});

// Cleanup
onUnmounted(() => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
});
</script>

<style scoped>
.live-stream-container {
  position: relative;
  width: 100%;
  min-height: 300px;
  background-color: #f5f5f5;
  border-radius: 8px;
  overflow: hidden;
}

.stream-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.loading-overlay,
.error-message {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  text-align: center;
  padding: 20px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 10px;
}

.retry-button {
  margin-top: 15px;
  padding: 8px 16px;
  background-color: #3498db;
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  transition: background-color 0.3s;
}

.retry-button:hover {
  background-color: #2980b9;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>