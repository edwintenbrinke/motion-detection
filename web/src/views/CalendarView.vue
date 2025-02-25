<script>
import { defineComponent } from "vue";
import FullCalendar from "@fullcalendar/vue3";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useRouter } from 'vue-router';

export default defineComponent({
  components: {
    FullCalendar,
  },
  setup() {
    const router = useRouter();
    return { router };
  },
  data() {
    return {
      calendarOptions: {
        plugins: [
          dayGridPlugin,
          interactionPlugin,
        ],
        headerToolbar: {
          left: "prev,next today",
          center: "title",
          right: "",
        },
        initialView: "dayGridMonth",
        editable: false,
        selectable: false,
        dayMaxEvents: true,
        weekends: true,
        dateClick: this.handleDateClick,
        events: [], // Static empty array for the monthly view
      },
    };
  },
  methods: {
    handleDateClick(info) {
      this.$router.push(`/calendar/${info.dateStr}`);
    },
  },
});
</script>

<template>
  <div class="demo-app-calendar">
    <FullCalendar :options="calendarOptions"/>
  </div>
</template>

<style scoped>
.demo-app-calendar {
  max-width: 1100px;
  margin: 0 auto;
}
</style>
