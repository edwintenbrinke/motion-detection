<template>
  <div class="video-container">
    <img
        v-if="isStreamActive"
        :src="isStreamActive ? streamUrl : null"
        @error="handleStreamError"
        class="video-stream"
        alt="Video Stream"
        ref="streamRef"
    />
    <div v-if="streamError" class="error-message">
      {{ streamError }}
    </div>
  </div>
</template>

<script setup>
import {ref, onMounted, onUnmounted} from 'vue'

const streamRef = ref(null)
const streamUrl = ref('')
const streamError = ref(null)
const isStreamActive = ref(false)  // Start as false

const startStream = () => {
  streamUrl.value = `http://localhost/api/video/stream-alt?t=${Date.now()}`
  isStreamActive.value = true  // Only activate after URL is set
}

const stopStream = () => {
  isStreamActive.value = false  // This will remove the src attribute
  streamUrl.value = ''
  console.log('Stream stopped')
}

const handleStreamError = (error) => {
  streamError.value = 'Stream connection error. Please try again later.'
  console.error('Stream error:', error)
  stopStream()
}

onMounted(() => {
  startStream()
})

onUnmounted(() => {
  stopStream()
})
</script>

<style scoped>
.video-container {
  width: 100%;
  margin: 0 auto;
  position: relative;
}

.video-stream {
  width: 100%;
  height: auto;
  display: block;
}

.error-message {
  position: absolute;
  top: 100px;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 1rem;
  border-radius: 4px;
}
</style>