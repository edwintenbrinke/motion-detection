<template>
  <div class="motion-detection-container">
    <!-- Date navigator -->
    <div class="date-navigator p-d-flex p-jc-between p-ai-center p-mb-3">
      <Button icon="pi pi-chevron-left" severity="secondary" @click="changeDate(-1)">
        <i class="fas fa-chevron-left"></i>
      </Button>
      <h2 class="date-display">{{ currentDate.format("MMMM D, YYYY") }}</h2>
      <Button icon="pi pi-chevron-right" severity="secondary" @click="changeDate(1)">
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
            <ProgressSpinner v-if="loadingKeys.has(node.key)" class="p-d-flex p-jc-center p-my-3" style="width:50px;height:50px" />

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
        :closable="true"
        class="video-dialog"
        :style="{ width: '90vw', maxWidth: '800px' }"
    >
      <template #header>
        <div class="dialog-header">
          <span v-if="selectedVideoData" class="video-metadata">
            {{ dayjs(selectedVideoData.created_at).format("MMM D, YYYY • HH:mm:ss") }} •
            {{ formatVideoDuration(selectedVideoData.video_duration) }}
          </span>

          <Button
              icon="pi pi-times"
              @click="closeVideoDialog"
              class="p-button-rounded p-button-text"
              aria-label="Close"
          />
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

export default defineComponent({
  components: {SingleVideoPlayer},
  setup() {
    const route = useRoute();
    const router = useRouter();
    return { route, router, dayjs };
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
    };
  },
  mounted() {
    // Restore filter preference if saved in localStorage
    const savedFilter = localStorage.getItem('motionDetectionImportanceFilter');
    if (savedFilter) {
      this.showImportantOnly = savedFilter === 'important';
    }

    this.load();
  },
  methods: {
    async load() {
      // Reset nodes when loading new data
      this.nodes = [];

      try {
        const dateString = this.currentDate.format("YYYY-MM-DD");
        const url = `/api/motion-detected-file/calendar/${dateString}`;

        // Add the important query parameter if showing important events only
        const params = this.showImportantOnly ? { important: true } : {};

        const response = await this.$api.get(url, { params });

        this.nodes = response.data.map((item) => ({
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

    setImportanceFilter(showImportantOnly) {
      if (this.showImportantOnly !== showImportantOnly) {
        this.showImportantOnly = showImportantOnly;

        // Save preference to localStorage
        localStorage.setItem('motionDetectionImportanceFilter', showImportantOnly ? 'important' : 'normal');

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

      this.loadingKeys.add(node.key);
      try {
        const hourString = node.key;
        const dateString = this.currentDate.format("YYYY-MM-DD");
        const url = `/api/motion-detected-file/calendar/${dateString}/${hourString}`;

        const params = this.showImportantOnly ? { important: true } : {};

        const response = await this.$api.get(url, { params });

        node.children = response.data.map((item, index) => ({
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

      // Open the dialog
      this.videoDialogVisible = true;
    },

    closeVideoDialog() {
      this.videoDialogVisible = false;
      // Reset video source to free memory
      setTimeout(() => {
        this.selectedVideoUrl = null;
        this.selectedVideoData = null;
      }, 300); // A small delay to let transition complete
    },

    changeDate(offset) {
      // Change current date by offset days
      this.currentDate = this.currentDate.add(offset, 'day');
      this.nodes = {}
      this.expandKey = {}; // Reset expanded state
      const newDate = this.currentDate.format("YYYY-MM-DD");
      if (this.route.params.date !== newDate) {
        this.router.push(`/calendar/${newDate}`);
      }
    }
  },

  watch: {
    "route.params.date"(newDate) {
      const newDateObj = dayjs(newDate);
      if (newDateObj.isValid() && !this.currentDate.isSame(newDateObj, "day")) {
        this.currentDate = newDateObj;
        this.nodes = {}
        this.expandKey = {}; // Reset expanded state
        this.load();
      }
    },
  },
});
</script>

<style scoped>
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
  height: 350px;
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
</style>