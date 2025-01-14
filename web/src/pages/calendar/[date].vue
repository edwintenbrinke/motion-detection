<script>
import { defineComponent, watch } from "vue";
import { useRoute, useRouter } from 'vue-router';
import FullCalendar from "@fullcalendar/vue3";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import VideoSlider from '@/components/VideoSlider.vue';

export default defineComponent({
  components: {
    FullCalendar,
    VideoSlider,
  },
  setup() {
    const route = useRoute();
    const router = useRouter();
    return { route, router };
  },
  data() {
    return {
      videoUrls: [],
      selectedVideoId: null,
      hasVideos: false,
      listViewOptions: {
        plugins: [listPlugin, interactionPlugin],
        headerToolbar: {
          left: "prev,next today",
          center: "title",
          right: "",
        },
        initialView: "listDay",
        eventTimeFormat: {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          meridiem: false,
          hour12: false
        },
        editable: false,
        selectable: false,
        events: this.fetchDayEvents,
        eventClick: this.handleEventClick,
        eventDidMount: this.eventStyling,
        datesSet: this.handleDatesSet,
      },
    };
  },
  created() {
    if (this.route.params.date) {
      this.listViewOptions.initialDate = this.route.params.date;
    }
  },
  methods: {
    eventStyling(info) {
      if (info.event.type === 0) {
        info.el.style.backgroundColor = 'red';
        const dotEl = info.el.getElementsByClassName('fc-event-dot')[0];
        if (dotEl) {
          dotEl.style.backgroundColor = 'purple';
        }
      }
    },
    handleDatesSet(dateInfo) {
      const newDate = dateInfo.startStr.split('T')[0];
      if (this.route.params.date !== newDate) {
        this.router.push(`/calendar/${newDate}`);
      }
    },
    fetchDayEvents(info, successCallback, failureCallback) {
      // Reset state before fetching new data
      this.videoUrls = [];
      this.selectedVideoId = null;
      this.hasVideos = false;

      const dateString = info.startStr;
      this.$api
        .get("http://10.0.2.2/api/motion-detected-file/calendar", {
          params: { date: dateString },
        })
        .then((response) => {
          const data = response.data;
          if (data && data.length > 0) {
            this.videoUrls = data.map(item =>
              `http://10.0.2.2/api/video/stream/${item.title}`
            );
            this.hasVideos = true;
          }
          successCallback(data);
        })
        .catch((error) => {
          this.hasVideos = false;
          failureCallback(null);
        });
    },
    handleEventClick(clickInfo) {
      this.selectedVideoId = clickInfo.event.title;
    },
  },
  watch: {
    // Watch for route changes to reset video state
    'route.params.date'() {
      this.videoUrls = [];
      this.selectedVideoId = null;
      this.hasVideos = false;
    }
  }
});
</script>

<template>
  <div>
    <router-link to="/calendar" class="back-button">
      Back to Month View
    </router-link>
    <div class="demo-app-calendar">
      <FullCalendar :options="listViewOptions" />
      <VideoSlider
        v-if="hasVideos"
        :key="route.params.date"
        :apiResult="videoUrls"
        :active-video-url="selectedVideoId"
      />
    </div>
  </div>
</template>

<style scoped>
.demo-app-calendar {
  max-width: 1100px;
  margin: 0 auto;
}

.back-button {
  display: inline-block;
  margin-bottom: 1rem;
  padding: 0.5rem 1rem;
  text-decoration: none;
  background-color: #f0f0f0;
  border-radius: 4px;
  color: #333;
}

.back-button:hover {
  background-color: #e0e0e0;
}
</style>
