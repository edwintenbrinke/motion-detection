<template>
  <div class="video-player-container">
    <div v-if="!isLoading && error" class="error-message">
      <i class="pi pi-exclamation-triangle error-icon"></i>
      <p>Failed to load video</p>
      <Button label="Try Again" @click="loadVideo" class="p-button-sm" />
    </div>
    <div v-if="!isLoading && !error" class="video-wrapper">
      <video
          ref="videoElement"
          class="video-element"
          controls
          playsinline
          autoplay
      >
        <source
            v-if="authenticatedVideoUrl"
            :src="authenticatedVideoUrl"
            type="video/mp4"
        >
      </video>
    </div>
  </div>
</template>

<script>
export default {
  name: 'SingleVideoPlayer',
  props: {
    videoUrl: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      authenticatedVideoUrl: null,
      isLoading: true,
      error: false
    };
  },
  watch: {
    videoUrl: {
      immediate: true,
      handler(newUrl) {
        if (newUrl) {
          this.loadVideo();
        }
      }
    }
  },
  methods: {
    async loadVideo() {
      if (!this.videoUrl) return;

      this.isLoading = true;
      this.error = false;

      // Clear previous blob URL to prevent memory leaks
      if (this.authenticatedVideoUrl && this.authenticatedVideoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(this.authenticatedVideoUrl);
        this.authenticatedVideoUrl = null;
      }

      try {
        const response = await this.$api.get(this.videoUrl, {
          responseType: 'blob'
        });

        this.authenticatedVideoUrl = URL.createObjectURL(response.data);
      } catch (error) {
        console.error('Error loading video:', error);
        this.error = true;
      } finally {
        this.isLoading = false;
      }
    },
    playVideo() {
      if (this.$refs.videoElement) {
        this.$refs.videoElement.play().catch(error => {
          console.warn('Autoplay prevented:', error);
        });
      }
    }
  },
  beforeUnmount() {
    // Clean up blob URL when component is destroyed
    if (this.authenticatedVideoUrl && this.authenticatedVideoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(this.authenticatedVideoUrl);
    }
  }
};
</script>

<style scoped>
.video-player-container {
  width: 100%;
  height: 100%;
  background-color: #000;
  position: relative;
  border-radius: 4px;
  overflow: hidden;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

.loading-spinner {
  width: 50px;
  height: 50px;
}

.error-message {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  color: #fff;
  padding: 1rem;
  text-align: center;
}

.error-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  color: #f59e0b;
}

.video-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.video-element {
  width: 100%;
  height: auto;
  max-height: 100%;
  object-fit: contain;
}
</style>