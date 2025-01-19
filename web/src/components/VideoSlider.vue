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
                      :src="authenticatedVideoUrls[index]"
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
      authenticatedVideoUrls: {}, // Use an object to store fetched URLs
      splideInstance: null,
      isReady: false,
      currentVideoIndex: 0,
      loadedVideos: new Set(),
      fetchingVideos: new Set(),
      autoplayTimeout: null,
    };
  },
  watch: {
    apiResult: {
      immediate: true,
      async handler(newVal) {
        if (newVal && newVal.length) {
          this.videoUrls = [...newVal];
          this.currentVideoIndex = 0;
          this.loadedVideos.clear();
          this.authenticatedVideoUrls = {};

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
    async fetchAuthenticatedUrl(index) {
      if (this.authenticatedVideoUrls[index] || this.fetchingVideos.has(index)) {
        return; // Skip if already fetched or in progress
      }

      this.fetchingVideos.add(index); // Mark this video as being fetched
      try {
        const url = this.videoUrls[index];
        const response = await this.$api.get(url, {
          responseType: 'blob'
        });
        const blobUrl = URL.createObjectURL(response.data);
        this.authenticatedVideoUrls[index] = blobUrl;
        // this.$set(this.authenticatedVideoUrls, index, blobUrl);
      } catch (error) {
        console.error(`Error fetching video ${this.videoUrls[index]}:`, error);
      } finally {
        this.fetchingVideos.delete(index); // Remove from fetching set
      }
    },
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

      if (this.autoplayTimeout) {
        clearTimeout(this.autoplayTimeout);
      }

      this.autoplayTimeout = setTimeout(() => {
        this.playCurrentVideo();
      }, 100);
    }, 150),
    preloadAdjacentVideos(currentIndex) {
      const preloadIndexes = [
        currentIndex
      ].filter(index => index >= 0 && index < this.videoUrls.length);

      preloadIndexes.forEach(index => {
        this.loadedVideos.add(index);
        this.fetchAuthenticatedUrl(index); // Fetch video only when preloading
      });
    },
    isVideoVisible(index) {
      return this.loadedVideos.has(index) && !!this.authenticatedVideoUrls[index];
    },
    moveToVideo(url) {
      const index = this.videoUrls.findIndex(videoUrl => videoUrl.includes(url));
      if (index !== -1 && this.splideInstance) {
        this.splideInstance.go(index);
        setTimeout(() => {
          this.playCurrentVideo();
        }, 100);
      }
    },
    playCurrentVideo() {
      if (this.$refs.videoPlayers && this.$refs.videoPlayers[this.currentVideoIndex]) {
        const video = this.$refs.videoPlayers[this.currentVideoIndex];
        if (video.readyState >= 2) {
          video.play()
              .catch(error => {
                console.warn('Autoplay prevented:', error);
              });
        } else {
          video.addEventListener('loadeddata', () => {
            video.play()
                .catch(error => {
                  console.warn('Autoplay prevented:', error);
                });
          }, { once: true });
        }
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
    Object.values(this.authenticatedVideoUrls).forEach(url => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
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