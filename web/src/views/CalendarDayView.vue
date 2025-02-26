<template>
  <div class="motion-detection-container">
    <ScrollTop />
    <button
        v-if="isAnyExpanded"
        @click="closeAnyExpanded"
        class="p-button p-component p-button-icon-only p-button-rounded expand-button"
        :style="collapseButtonStyle"
    >
      <i class="fa-solid fa-compress" />
    </button>

    <!-- Date navigator -->
    <div class="date-navigator p-d-flex p-jc-between p-ai-center p-mb-3">
      <Button icon="pi pi-chevron-left" @click="changeDate(-1)">
        <i class="fas fa-chevron-left"></i>
      </Button>
      <h2 class="date-display">{{ currentDate.format("MMMM D, YYYY") }}</h2>
      <Button icon="pi pi-chevron-right" @click="changeDate(1)">
        <i class="fas fa-chevron-right"></i>
      </Button>
    </div>

    <!-- Importance filter toggle -->
    <div class="filter-toggle-container">
      <div class="toggle-tabs">
        <div
            class="toggle-tab"
            :class="{ 'active': !showImportantOnly }"
            @click="setImportanceFilter(false)"
        >
          <i class="fa-solid fa-list"></i>
          <span>Normal</span>
        </div>
        <div
            class="toggle-tab"
            :class="{ 'active': showImportantOnly }"
            @click="setImportanceFilter(true)"
        >
          <i class="fa-solid fa-flag"></i>
          <span>Important</span>
        </div>
      </div>
    </div>

    <!-- Timeline with hour blocks -->
    <div class="timeline-container">
      <div v-for="node in nodes" :key="node.key" class="hour-block">
        <!-- Hour header (sticky) -->
        <div
            class="hour-header p-d-flex p-jc-between p-ai-center"
            @click="toggleHourExpand(node)"
        >
          <div class="hour-label">
            <i :class="expandKey[node.key] ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="p-mr-2"></i>
            {{ node.label }}
          </div>
          <Badge :value="node.data.count" severity="success" />
        </div>

        <!-- Hour content (expandable) -->
        <transition name="expand">
          <div v-if="expandKey[node.key]" class="hour-content">
            <div v-if="node.children && node.children.length" class="detection-cards">
              <div
                  v-for="item in node.children"
                  :key="item.key"
                  class="detection-card p-ripple"
                  @click="viewDetection(item)"
              >
                <!-- Card content -->
                <div class="card-info">
                  <div class="card-title">{{ formatCreatedAt(item.data.created_at) }}</div>
                  <div class="card-time">{{ formatVideoDuration(item.data.video_duration) }}</div>
                </div>
                <div class="card-action">
                  <i class="pi pi-chevron-right"></i>
                </div>
                <span class="p-ripple-element"></span>
              </div>
            </div>

            <div v-else-if="node.children && node.children.length === 0" class="no-detections p-text-center p-my-2">
              No detection events found
            </div>
          </div>
        </transition>
      </div>

      <!-- Empty state message when no data is available -->
      <div v-if="nodes.length === 0" class="empty-state">
        <i class="pi pi-video empty-icon"></i>
        <p>No {{ showImportantOnly ? 'important ' : '' }}motion events detected on this date</p>
      </div>
    </div>

    <!-- Video Dialog -->
    <Dialog
        v-model:visible="videoDialogVisible"
        :modal="true"
        :dismissableMask="true"
        class="video-dialog"
        :style="{ width: '90vw', maxWidth: '800px' }"
    >
      <template #header>
        <div class="dialog-header">
          <span v-if="selectedVideoData" class="video-metadata">
            {{ dayjs(selectedVideoData.created_at).format("MMM D, YYYY • HH:mm:ss") }} •
            {{ formatVideoDuration(selectedVideoData.video_duration) }}
          </span>
        </div>
      </template>

      <div class="video-container">
        <SingleVideoPlayer
            v-if="videoDialogVisible && selectedVideoUrl"
            :videoUrl="selectedVideoUrl"
        />
      </div>
    </Dialog>
  </div>
</template>

<script>
import {defineComponent} from "vue";
import {useRoute, useRouter} from "vue-router";
import dayjs from "dayjs";
import SingleVideoPlayer from "@/components/VideoPlayer.vue";
import {useVideoStore} from "@/stores/video";

export default defineComponent({
  components: {SingleVideoPlayer},
  setup() {
    const route = useRoute();
    const router = useRouter();
    const videoStore = useVideoStore();
    return { route, router, dayjs, videoStore };
  },
  data() {
    return {
      currentDate: this.route.params.date ? dayjs(this.route.params.date) : dayjs(),
      nodes: [],
      loadingKeys: new Set(),
      expandKey: {},
      showImportantOnly: false, // Default to normal view (all events)
      videoDialogVisible: false,
      selectedVideoUrl: null,
      selectedVideoData: null,
      scrollTopActive: false
    };
  },
  mounted() {
    // Restore filter preference from store
    this.showImportantOnly = this.videoStore.importanceFilter;
    this.load();

    this.checkScrollTopStatus()
    window.addEventListener('scroll', this.checkScrollTopStatus)
  },
  beforeUnmount() {
    window.removeEventListener('scroll', this.checkScrollTopStatus)
  },
  methods: {
    async load() {
      // Reset nodes when loading new data
      this.nodes = [];
      const dateString = this.currentDate.format("YYYY-MM-DD");

      try {
        // Check if we should refresh the data from API
        const shouldRefresh = this.videoStore.shouldRefreshDailyData(dateString, this.showImportantOnly);

        // Try to get cached data first
        let hourSummaries = this.videoStore.getDailyHoursForDate(dateString, this.showImportantOnly);

        // If we need to refresh or don't have data, fetch from API
        if (shouldRefresh || hourSummaries.length === 0) {
          const url = `/api/motion-detected-file/calendar/${dateString}`;
          const params = this.showImportantOnly ? { important: true } : {};

          // Add the since parameter for efficiency if we have existing data
          if (hourSummaries.length > 0) {
            params.since = this.videoStore.getSinceParameterForDate(dateString, this.showImportantOnly);
          }

          const response = await this.$api.get(url, { params });

          // If we're using the since parameter, merge the new data with existing data
          if (params.since && hourSummaries.length > 0) {
            // Merge the new data with the existing data
            // This assumes the API returns only new records since the provided timestamp
            const newData = response.data;

            // Update existing hours with new counts
            hourSummaries = this.mergeHourSummaries(hourSummaries, newData);
          } else {
            // Complete replacement of data
            hourSummaries = response.data;
          }

          // Store the data in the Pinia store
          this.videoStore.setDailyHoursForDate(dateString, hourSummaries, this.showImportantOnly);
        }

        // Transform the data for display
        this.nodes = hourSummaries.map((item) => ({
          key: `${item.hour}`,
          label: `${item.hour}:00`,
          data: item,
          leaf: false,
          children: null
        }));
      } catch (error) {
        console.error("API error:", error);
      }
    },

    mergeHourSummaries(existingData, newData) {
      // Create a map of existing data by hour
      const hourMap = {};
      existingData.forEach(item => {
        hourMap[item.hour] = item;
      });

      // Update or add new data
      newData.forEach(newItem => {
        if (hourMap[newItem.hour]) {
          // Update count if the hour already exists
          hourMap[newItem.hour].count = newItem.count;
        } else {
          // Add new hour data
          hourMap[newItem.hour] = newItem;
        }
      });

      // Convert back to array and sort by hour
      return Object.values(hourMap).sort((a, b) => b.hour - a.hour);
    },

    setImportanceFilter(showImportantOnly) {
      if (this.showImportantOnly !== showImportantOnly) {
        this.showImportantOnly = showImportantOnly;

        // Save preference to store
        this.videoStore.setImportanceFilter(showImportantOnly);

        // Reset expanded states
        this.expandKey = {};

        // Reload data with the new filter
        this.load();
      }
    },

    toggleHourExpand(node) {
      this.expandKey[node.key] = !this.expandKey[node.key];

      Object.keys(this.expandKey).forEach((key) => {
        if (node.key !== key) {
          this.expandKey[key] = false;
        }
      });

      // Load children if needed and not already loaded
      if (this.expandKey[node.key] && !node.children) {
        this.loadHourData(node);
      }
    },

    async loadHourData(node) {
      if (node.children) return; // Prevent multiple calls

      const hourString = node.key;
      const dateString = this.currentDate.format("YYYY-MM-DD");

      try {
        this.loadingKeys.add(node.key);

        // Check if we should refresh the data from API
        const shouldRefresh = this.videoStore.shouldRefreshHourlyData(
            dateString,
            hourString,
            this.showImportantOnly
        );

        // Try to get cached data first
        let hourlyVideos = this.videoStore.getVideosForHour(
            dateString,
            hourString,
            this.showImportantOnly
        );

        // If we need to refresh or don't have data, fetch from API
        if (shouldRefresh || hourlyVideos.length === 0) {
          const url = `/api/motion-detected-file/calendar/${dateString}/${hourString}`;
          const params = this.showImportantOnly ? { important: true } : {};

          const response = await this.$api.get(url, { params });
          hourlyVideos = response.data;

          // Store the data in the Pinia store
          this.videoStore.setVideosForHour(
              dateString,
              hourString,
              hourlyVideos,
              this.showImportantOnly
          );
        }

        // Transform the data for display
        node.children = hourlyVideos.map((item, index) => ({
          key: `${node.key}-${index}`,
          data: item,
          leaf: true,
        }));
      } catch (error) {
        console.error("API error:", error);
        node.children = []; // Set empty array to prevent repeated loading attempts
      } finally {
        this.loadingKeys.delete(node.key);
      }
    },

    formatCreatedAt(created_at) {
      return dayjs(created_at).format("HH:mm:ss");
    },

    formatVideoDuration(seconds) {
      if (!seconds) return '00:00'
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    },

    viewDetection(item) {
      // Store selected video data
      this.selectedVideoData = item.data;

      // Build the video URL based on the detection ID
      this.selectedVideoUrl = `/api/video/stream/${item.data.file_name}`;

      // Store the selected video ID in the store
      this.videoStore.selectVideo(item.data.file_name);

      // Open the dialog
      this.videoDialogVisible = true;
    },

    changeDate(offset) {
      // Change current date by offset days
      this.currentDate = this.currentDate.add(offset, 'day');
      const newDate = this.currentDate.format("YYYY-MM-DD");
      if (this.route.params.date !== newDate) {
        this.router.push(`/calendar/${newDate}`);
        Object.keys(this.expandKey).forEach((key) => {
          this.expandKey[key] = false;
        });
        this.load();
      }
    },

    closeAnyExpanded() {
      Object.keys(this.expandKey).forEach(key => {
        this.expandKey[key] = false;
      });
    },

    checkScrollTopStatus() {
      const scrollTopButton = document.querySelector('.p-scrolltop')
      this.scrollTopActive = scrollTopButton &&
          getComputedStyle(scrollTopButton).display !== 'none' &&
          scrollTopButton.classList.contains('p-scrolltop-leave-active') === false
    }
  },

  computed: {
    isAnyExpanded() {
      return Object.values(this.expandKey).some(value => value);
    },
    collapseButtonStyle() {
      return {
        bottom: this.scrollTopActive ? '70px' : '20px',
        zIndex: 5
      }
    }
  },

  watch: {
    "route.params.date"(newDate) {
      const newDateObj = dayjs(newDate);
      if (newDateObj.isValid() && !this.currentDate.isSame(newDateObj, "day")) {
        this.currentDate = newDateObj;
        this.expandKey = {}; // Reset expanded state
        this.load();
      }
    },
  },
});
</script>

<style scoped>
/* Styles remain unchanged */
.motion-detection-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: #ffffff;
}

.date-navigator {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background-color: #3a3a3a;;
  border-bottom: 1px solid #333;
}

.date-display {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 500;
}

/* Filter toggle styles */
.filter-toggle-container {
  padding: 0.5rem 1rem;
  background-color: #2a2a2a;
  border-bottom: 1px solid #333;
}

.toggle-tabs {
  display: flex;
  background-color: #222;
  border-radius: 8px;
  overflow: hidden;
}

.toggle-tab {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0.6rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
  gap: 0.5rem;
  color: #aaa;
}

.toggle-tab.active {
  background-color: #3a3a3a;
  color: #fff;
}

.toggle-tab i {
  font-size: 1rem;
}

.timeline-container {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0.5rem 0;
}

.hour-block {
  margin-bottom: 0.5rem;
  border-radius: 8px;
  overflow: hidden;
  background-color: #2a2a2a;
}

.hour-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background-color: #333;
  cursor: pointer;
  user-select: none;
  position: sticky;
  top: 0;
  z-index: 1;
}

.hour-label {
  display: flex;
  align-items: center;
  font-weight: 500;
}

.hour-content {
  padding: 0.5rem;
}

.detection-cards {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.detection-card {
  display: flex;
  align-items: center;
  padding: 0.75rem;
  background-color: #3a3a3a;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.detection-card:active {
  background-color: #444;
}

.card-info {
  flex: 1;
  font-weight: 500;
}

.card-title {
  width:50%;
  float:left;
}

.card-time {
  float:right;
  color: #aaa;
}

.card-action {
  display: flex;
  align-items: center;
  color: #aaa;
}

.no-detections {
  color: #888;
  padding: 1rem 0;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: #888;
  text-align: center;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

/* Video Dialog styles */
.video-dialog {
  background-color: #1a1a1a;
  border-radius: 8px;
  color: #fff;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.video-container {
  margin: -1rem;
  border-radius: 0;
  overflow: hidden;
}

.video-metadata {
  color: #aaa;
  font-size: 0.9rem;
}

/* Transition animations */
.expand-enter-active,
.expand-leave-active {
  transition: max-height 0.3s ease, opacity 0.3s ease;
  max-height: 1000px;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.expand-button {
  position: fixed !important;
  inset-block-end: 20px;
  inset-inline-end: 20px;
}
</style>