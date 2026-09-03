<script>
import { defineComponent } from "vue";
import FullCalendar from "@fullcalendar/vue3";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import nlLocale from "@fullcalendar/core/locales/nl";
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
          left: "prev,next",
          center: "title",
          right: "",
        },
        // The rest of the app is Dutch; FullCalendar defaults to English.
        locale: nlLocale,
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
      this.$router.push(`/archive/${info.dateStr}`);
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
