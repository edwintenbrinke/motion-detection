<script setup>
import { ref, onMounted, getCurrentInstance } from 'vue'

// Get the Vue instance to access global properties
const app = getCurrentInstance()
const api = app?.appContext.config.globalProperties.$api

if (!api) {
  console.error('API instance not found. Make sure it is registered correctly in your plugin.')
}

const networkCalls = ref([])
const isVisible = ref(false)

// Function to add interceptors to axios instance
const setupAxiosInterceptors = () => {
  if (!api) return

  // Request interceptor
  api.interceptors.request.use(
    (config) => {
      const timestamp = new Date().toLocaleTimeString()
      networkCalls.value.push({
        id: Date.now(),
        timestamp,
        url: config.url,
        showUrl: config.baseURL + config.url + JSON.stringify(config.params) + JSON.stringify(config.headers),
        method: config.method.toUpperCase(),
        status: 'Pending',
        duration: 0,
        startTime: Date.now()
      })
      return config
    },
    (error) => {
      return Promise.reject(error)
    }
  )

  // Response interceptor
  api.interceptors.response.use(
    (response) => {
      const call = networkCalls.value.find(
        call => call.url === response.config.url && call.status === 'Pending'
      )
      if (call) {
        call.status = response.status
        call.duration = Date.now() - call.startTime
      }
      return response
    },
    (error) => {
      const call = networkCalls.value.find(
        call => call.url === error.config.url && call.status === 'Pending'
      )
      if (call) {
        call.showUrl = JSON.stringify(error);
        call.status = error.response?.status || 'Error'
        call.duration = Date.now() - call.startTime
      }
      return Promise.reject(error)
    }
  )
}

const toggleVisibility = () => {
  isVisible.value = !isVisible.value
}

const clearHistory = () => {
  networkCalls.value = []
}

onMounted(() => {
  setupAxiosInterceptors()
})
</script>

<!-- Rest of template and style remains exactly the same -->
<template>
  <div class="network-logger" :class="{ 'network-logger--collapsed': !isVisible }">
    <div class="network-logger__header">
      <h3>Network Calls</h3>
      <div class="network-logger__actions">
        <button @click="clearHistory" class="network-logger__button">Clear</button>
        <button @click="toggleVisibility" class="network-logger__button">
          {{ isVisible ? 'Hide' : 'Show' }}
        </button>
      </div>
    </div>

    <div v-if="isVisible" class="network-logger__content">
      <div v-if="networkCalls.length === 0" class="network-logger__empty">
        No network calls yet
      </div>
      <div v-else class="network-logger__calls">
        <div
          v-for="call in networkCalls"
          :key="call.id"
          class="network-logger__call"
          :class="{
            'network-logger__call--success': call.status >= 200 && call.status < 300,
            'network-logger__call--error': call.status >= 400
          }"
        >
<!--          <div class="network-logger__call-method">{{ call.method }}</div>-->
          <div class="network-logger__call-url">{{ call.showUrl }}</div>
<!--          <div class="network-logger__call-status">{{ call.status }}</div>-->
<!--          <div class="network-logger__call-time">-->
<!--            {{ call.timestamp }}-->
<!--            <span v-if="call.duration">({{ call.duration }}ms)</span>-->
<!--          </div>-->
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Styles remain exactly the same */
.network-logger {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #f8f9fa;
  border-top: 1px solid #dee2e6;
  font-family: monospace;
  z-index: 9999;
  color:black;
}

.network-logger--collapsed {
  height: 40px;
}

.network-logger__header {
  padding: 8px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #e9ecef;
}

.network-logger__header h3 {
  margin: 0;
  font-size: 14px;
}

.network-logger__actions {
  display: flex;
  gap: 8px;
}

.network-logger__button {
  padding: 4px 8px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}

.network-logger__button:hover {
  background: #e9ecef;
}

.network-logger__content {
  height: 200px;
  overflow-y: auto;
  padding: 8px;
}

.network-logger__empty {
  text-align: center;
  color: #6c757d;
  padding: 16px;
}

.network-logger__calls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.network-logger__call {
  display: grid;
  grid-template-columns: 80px 1fr 80px 200px;
  gap: 16px;
  padding: 8px;
  border-radius: 4px;
  background: white;
  border: 1px solid #dee2e6;
  font-size: 12px;
}

.network-logger__call--success {
  border-left: 4px solid #28a745;
}

.network-logger__call--error {
  border-left: 4px solid #dc3545;
}

.network-logger__call-method {
  font-weight: bold;
}

.network-logger__call-url {
  //overflow: hidden;
  text-overflow: ellipsis;
  //white-space: nowrap;
}

.network-logger__call-status {
  text-align: center;
}

.network-logger__call-time {
  text-align: right;
  color: #6c757d;
}
</style>
