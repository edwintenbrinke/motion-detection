<template>
  <div class="demo-app-calendar">
    <div class="calendar-header">
      <div class="nav-controls">
        <button class="nav-button" @click="changeDate(-1)">
          <i class="fas fa-chevron-left"></i>
        </button>
        <button class="today-button" @click="goToToday">Today</button>
        <button class="nav-button" @click="changeDate(1)">
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
      <h2 class="date-display">{{ formattedDate }}</h2>
    </div>

    <div class="main-content">
      <div class="video-container">
        <VideoSlider
            :key="route.params.date"
            :api-result="videoUrls"
            :active-video-url="selectedVideoId"
        />
      </div>

      <div class="video-list-wrapper">
        <div v-if="!hasVideos" class="no-videos">
          No videos found for this date.
        </div>
        <div v-else class="video-list">
          <div
              v-for="(video, index) in videoList"
              :key="index"
              :class="['video-item', listItemClass(video.type), { 'selected': selectedVideoId === video.file_name }]"
              @click="selectVideo(video.file_name)"
          >
            <span class="video-time">{{ formattedItemDate(video.created_at) }}</span>
            <span class="video-title">{{ video.file_name }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent } from "vue";
import { useRoute, useRouter } from "vue-router";
import VideoSlider from "@/components/VideoSlider.vue";
import dayjs from "dayjs";

export default defineComponent({
  components: { VideoSlider },
  setup() {
    const route = useRoute();
    const router = useRouter();
    return { route, router };
  },
  data() {
    return {
      videoList: [],
      videoUrls: [],
      selectedVideoId: null,
      hasVideos: false,
      currentDate: this.route.params.date ? dayjs(this.route.params.date) : dayjs(),
    };
  },
  computed: {
    formattedDate() {
      return this.currentDate.format("MMMM D, YYYY");
    },
  },
  created() {
    if (this.route.params.date) {
      const newDate = dayjs(this.route.params.date);
      if (newDate.isValid() && !this.currentDate.isSame(newDate, 'day')) {
        this.currentDate = newDate;
      }
    }
    this.fetchDayEvents();
  },
  methods: {
    listItemClass(type) {
      return type === 0 ? 'normal-item' : 'important-item';
    },
    formattedItemDate(date) {
      return dayjs(date).format("HH:mm:ss");
    },
    changeDate(days) {
      this.currentDate = this.currentDate.add(days, "day");
      this.updateUrl();
      this.fetchDayEvents();
    },
    goToToday() {
      this.currentDate = dayjs();
      this.updateUrl();
      this.fetchDayEvents();
    },
    updateUrl() {
      const newDate = this.currentDate.format("YYYY-MM-DD");
      if (this.route.params.date !== newDate) {
        this.router.push(`/calendar/${newDate}`);
      }
    },
    fetchDayEvents() {
      this.videoList = [];
      this.videoUrls = [];
      this.selectedVideoId = null;
      this.hasVideos = false;

      const dateString = this.currentDate.format("YYYY-MM-DD");
      this.$api
          .get("/api/motion-detected-file/calendar", {
            params: { date: dateString },
          })
          .then((response) => {
            const data = response.data;
            if (data && data.length > 0) {
              this.videoList = data;
              this.videoUrls = data.map(
                  (item) => import.meta.env.VITE_API_BASE_URL + "/api/video/stream/" + item.file_name
              );
              this.hasVideos = true;
            }
          })
          .catch(() => {
            this.hasVideos = false;
          });
    },
    selectVideo(title) {
      this.selectedVideoId = title;
    },
  },
  watch: {
    "route.params.date"(newDate) {
      const newDateObj = dayjs(newDate);
      if (newDateObj.isValid() && !this.currentDate.isSame(newDateObj, "day")) {
        this.currentDate = newDateObj;
        this.fetchDayEvents();
      }
    },
  },
});
</script>

<style scoped>
.demo-app-calendar {
  width: 100%;
  height: calc(100vh - 60px); /* Subtract header height (41px) + border (1px) + margin for safety (9px) */
  display: flex;
  flex-direction: column;
  background-color: #1a1a1a;
  color: white;
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background-color: #333;
}

.nav-controls {
  display: flex;
  gap: 2px;
}

.nav-button, .today-button {
  background-color: #444;
  border: none;
  color: white;
  padding: 0.5rem 1rem;
  cursor: pointer;
}

.nav-button:hover, .today-button:hover {
  background-color: #555;
}

.date-display {
  margin: 0;
  font-size: 1.2rem;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.video-container {
  width: 100%;
  min-height: 250px;
  background-color: #000;
}

.video-list-wrapper {
  flex: 1;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  background-color: #1a1a1a;
  border: 1px solid #333;
  margin: 0.5rem;
  border-radius: 4px;
  overflow-y: auto;
}

.video-list {
  flex: 1;
  overflow-y: auto;
}

.video-item {
  display: flex;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #333;
  cursor: pointer;
}

.video-item:hover {
  background-color: #2a2a2a;
}

.normal-item {
  background: linear-gradient(90deg, rgba(51,51,51,0) 60%, rgba(43,119,1,0.30) 100%);
}

.important-item {
  background: linear-gradient(90deg, rgba(51,51,51,0) 60%, rgba(119, 1, 1, 0.82) 100%);
}

.selected {
  background-color: #2a2a2a;
}

.video-time {
  color: #888;
}

.video-title {
  color: white;
}

.no-videos {
  padding: 1rem;
  text-align: center;
  color: #888;
}

/* Scrollbar styling */
.video-list::-webkit-scrollbar {
  width: 8px;
}

.video-list::-webkit-scrollbar-track {
  background: #1a1a1a;
}

.video-list::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 4px;
}

.video-list::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>