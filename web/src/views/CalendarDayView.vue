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
          .get("/api/motion-detected-file/calendar", {
            params: { date: dateString },
          })
          .then((response) => {
            const data = response.data;
            if (data && data.length > 0) {
              this.videoUrls = data.map(item =>
                  import.meta.env.VITE_API_BASE_URL + "api/video/stream/" + item.title
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
  <div class="demo-app-calendar">
    <FullCalendar :options="listViewOptions" />
    <VideoSlider
        v-if="hasVideos"
        :key="route.params.date"
        :api-result="videoUrls"
        :active-video-url="selectedVideoId"
    />
  </div>
</template>

<style scoped>
.demo-app-calendar {
  max-width: 1100px;
  margin: 0 auto;
  color: white;
}

:deep(.fc-list-day) {
  display: none;
}
</style>
