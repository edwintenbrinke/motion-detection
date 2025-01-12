<template>
  <div class="video-player">
    <!-- Skeleton loader while video is loading -->
    <div v-if="isLoading" class="skeleton-loader">
      <div class="loader-animation"></div>
      <p>Loading video...</p>
    </div>

    <!-- Video player -->
    <video
      v-else-if="videoUrl"
      ref="videoPlayer"
      :src="videoUrl"
      controls
      preload="metadata"
      @error="handleVideoError"
      @loadedmetadata="handleMetadataLoaded"
      class="video-element"
    >
      Your browser does not support the video tag.
    </video>

    <!-- Error message -->
    <div v-if="errorMessage" class="error-message">
      <p>{{ errorMessage }}</p>
      <button @click="retryLoading" class="retry-button">
        Retry Loading
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'VideoPlayer',
  props: {
    videoId: {
      type: [String, Number],
      required: true,
      validator: (value) => value !== '' && value !== null
    },
    autoplay: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      videoUrl: null,
      isLoading: true,
      errorMessage: null
    }
  },
  watch: {
    videoId: {
      handler(newId, oldId) {
        if (newId !== oldId) {
          // Cleanup old blob URL if it exists
          if (this.videoUrl) {
            URL.revokeObjectURL(this.videoUrl)
          }
          this.fetchVideoUrl()
        }
      }
    }
  },
  mounted() {
    this.fetchVideoUrl()
  },
  beforeDestroy() {
    // Cleanup blob URL when component is destroyed
    if (this.videoUrl) {
      URL.revokeObjectURL(this.videoUrl)
    }
  },
  methods: {
    async fetchVideoUrl() {
      // Reset states
      this.isLoading = true
      this.errorMessage = null
      this.videoUrl = null

      try {
        // Use global $api for the call
        const response = await this.$api.get(`/api/video/stream/${this.videoId}`, {
          responseType: 'blob', // Ensure we're getting a blob for video
          timeout: 10000 // 10 second timeout
        })

        // Create a blob URL for the video
        this.videoUrl = URL.createObjectURL(response.data)

        // Emit success event
        this.$emit('video-loaded', this.videoId)
      } catch (error) {
        // Comprehensive error handling
        let errorMsg = 'Failed to load video'
        if (error.response) {
          // The request was made and the server responded with a status code
          errorMsg = `Server error: ${error.response.status}`
        } else if (error.request) {
          // The request was made but no response was received
          errorMsg = 'No response from server'
        } else {
          // Something happened in setting up the request
          errorMsg = error.message || 'An unexpected error occurred'
        }

        this.errorMessage = errorMsg
        this.$emit('video-error', error)
      } finally {
        this.isLoading = false
      }
    },
    handleVideoError(event) {
      this.errorMessage = 'Video playback failed'
      this.$emit('video-error', event)
    },
    handleMetadataLoaded() {
      if (this.autoplay && this.$refs.videoPlayer) {
        this.$refs.videoPlayer.play()
      }
    },
    retryLoading() {
      this.$emit('retry-attempt', this.videoId)
      this.fetchVideoUrl()
    }
  }
}
</script>

<style scoped>
.video-player {
  max-width: 600px;
  margin: 0 auto;
  text-align: center;
}

.video-element {
  width: 100%;
  max-width: 100%;
  height: auto;
}

.skeleton-loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  background-color: #f0f0f0;
}

.loader-animation {
  width: 50px;
  height: 50px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.error-message {
  color: #d9534f;
  background-color: #f2dede;
  padding: 15px;
  border-radius: 4px;
  margin-top: 10px;
}

.retry-button {
  background-color: #5bc0de;
  color: white;
  border: none;
  padding: 10px 15px;
  border-radius: 4px;
  margin-top: 10px;
  cursor: pointer;
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
