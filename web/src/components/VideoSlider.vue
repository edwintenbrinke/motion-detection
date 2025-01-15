<template>
  <div class="video-slider-container">
    <template v-if="isReady">
      <div ref="slider" class="splide">
        <div class="splide__track">
          <ul class="splide__list">
            <li
              v-for="(videoUrl, index) in videoUrls"
              :key="videoUrl"
              class="splide__slide"
            >
              <div class="video-wrapper">
                <video
                  ref="videoPlayers"
                  controls
                  playsinline
                  :data-index="index"
                  class="video-player"
                  @play="pauseOtherVideos(index)"
                >
                  <source
                    v-if="isVideoVisible(index)"
                    :src="videoUrl"
                    type="video/mp4"
                  >
                </video>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import Splide from '@splidejs/splide';
import '@splidejs/splide/dist/css/splide.min.css';
import { debounce } from 'lodash';

export default {
  name: 'VideoSlider',
  props: {
    apiResult: {
      type: Array,
      required: true,
      default: () => [],
    },
    activeVideoUrl: {
      type: String,
      default: '',
    }
  },
  data() {
    return {
      videoUrls: [],
      splideInstance: null,
      isReady: false,
      currentVideoIndex: 0,
      loadedVideos: new Set(),
      autoplayTimeout: null,
    };
  },
  watch: {
    apiResult: {
      immediate: true,
      handler(newVal) {
        if (newVal && newVal.length) {
          this.videoUrls = [...newVal];
          this.currentVideoIndex = 0;
          this.loadedVideos.clear();

          this.$nextTick(() => {
            this.initializeSlider();
          });
        }
      },
    },
    activeVideoUrl: {
      immediate: true,
      handler(newUrl) {
        this.$nextTick(() => {
          if (newUrl && this.splideInstance) {
            this.moveToVideo(newUrl);
          }
        });
      }
    }
  },
  methods: {
    async initializeSlider() {
      if (this.splideInstance) {
        this.splideInstance.destroy();
        this.splideInstance = null;
      }

      this.isReady = true;
      await this.$nextTick();

      if (this.$refs.slider) {
        try {
          this.splideInstance = new Splide(this.$refs.slider, {
            type: 'loop',
            perPage: 1,
            gap: '1rem',
            pagination: false,
            arrows: true,
            drag: true,
            autoplay: false,
            rewind: true,
            pauseOnHover: true,
            pauseOnFocus: true,
            lazyLoad: 'nearby',
            preloadPages: 2,
          });

          this.splideInstance.on('moved', this.handleSlideChange);
          this.splideInstance.on('move', this.pauseAllVideos);

          await this.splideInstance.mount();

          if (this.activeVideoUrl) {
            this.moveToVideo(this.activeVideoUrl);
          }

          this.preloadAdjacentVideos(0);
        } catch (error) {
          console.error('Error initializing Splide:', error);
        }
      }
    },
    handleSlideChange: debounce(function(newIndex) {
      this.currentVideoIndex = newIndex;
      this.preloadAdjacentVideos(newIndex);

      // Clear any existing autoplay timeout
      if (this.autoplayTimeout) {
        clearTimeout(this.autoplayTimeout);
      }

      // Set timeout to play the video after it's loaded
      this.autoplayTimeout = setTimeout(() => {
        this.playCurrentVideo();
      }, 100);
    }, 150),
    playCurrentVideo() {
      if (this.$refs.videoPlayers && this.$refs.videoPlayers[this.currentVideoIndex]) {
        const video = this.$refs.videoPlayers[this.currentVideoIndex];
        if (video.readyState >= 2) { // Check if video is loaded enough to play
          video.play()
            .catch(error => {
              console.warn('Autoplay prevented:', error);
            });
        } else {
          // If video isn't loaded yet, wait for it
          video.addEventListener('loadeddata', () => {
            video.play()
              .catch(error => {
                console.warn('Autoplay prevented:', error);
              });
          }, { once: true });
        }
      }
    },
    preloadAdjacentVideos(currentIndex) {
      const preloadIndexes = [
        currentIndex - 2,
        currentIndex - 1,
        currentIndex,
        currentIndex + 1,
        currentIndex + 2
      ].filter(index => index >= 0 && index < this.videoUrls.length);

      preloadIndexes.forEach(index => {
        this.loadedVideos.add(index);
      });
    },
    isVideoVisible(index) {
      return this.loadedVideos.has(index);
    },
    moveToVideo(url) {
      const index = this.videoUrls.findIndex(videoUrl => videoUrl.includes(url));
      if (index !== -1 && this.splideInstance) {
        this.splideInstance.go(index);
        // Set timeout to allow the slide change to complete
        setTimeout(() => {
          this.playCurrentVideo();
        }, 100);
      }
    },
    pauseOtherVideos(activeIndex) {
      if (!this.$refs.videoPlayers) return;

      this.$refs.videoPlayers.forEach((video, index) => {
        if (index !== activeIndex && !video.paused) {
          video.pause();
        }
      });
    },
    pauseAllVideos() {
      if (!this.$refs.videoPlayers) return;

      this.$refs.videoPlayers.forEach(video => {
        if (!video.paused) {
          video.pause();
        }
      });
    },
  },
  beforeDestroy() {
    if (this.autoplayTimeout) {
      clearTimeout(this.autoplayTimeout);
    }
    this.apiResult = [];
    this.videoUrls = [];
    this.loadedVideos.clear();
    if (this.splideInstance) {
      this.splideInstance.destroy();
    }
  },
};
</script>

<style scoped>
.video-slider-container {
  width: 100%;
  max-width: 100vw;
  max-height: 250px;
  margin: 0 auto;
  overflow: hidden;
  position: relative;
}

.video-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.splide__slide {
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
}

.video-player {
  width: 100%;
  max-height: 250px;
  object-fit: contain;
  outline: none;
}
</style>
