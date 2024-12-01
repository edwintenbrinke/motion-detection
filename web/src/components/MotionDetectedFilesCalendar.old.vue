
<template>
  <div>
    <v-sheet class="d-flex" height="54" tile>
      <v-select
        v-model="type"
        :items="types"
        class="ma-2"
        label="View Mode"
        variant="outlined"
        dense
        hide-details
        @update:model-value="onViewTypeChange"
      ></v-select>
      <v-select
        v-model="weekday"
        :items="weekdays"
        class="ma-2"
        label="Weekdays"
        variant="outlined"
        dense
        hide-details
      @update:model-value="onWeekdaysChange"
      ></v-select>
    </v-sheet>
    <v-sheet>
      <v-calendar
        ref="calendar"
        v-model="value"
        :events="events"
        :view-mode="type"
        :weekdays="weekday"
        @update:model-value="onDateRangeChange"
        @change="onCalendarChange"
      ></v-calendar>
    </v-sheet>
  </div>
</template>

<script>
import { useDate } from 'vuetify';

export default {
  data() {
    return {
      type: 'month',
      types: ['month', 'week', 'day'],
      weekday: [0, 1, 2, 3, 4, 5, 6],
      weekdays: [
        { title: 'Sun - Sat', value: [0, 1, 2, 3, 4, 5, 6] },
        { title: 'Mon - Sun', value: [1, 2, 3, 4, 5, 6, 0] },
        { title: 'Mon - Fri', value: [1, 2, 3, 4, 5] },
        { title: 'Mon, Wed, Fri', value: [1, 3, 5] },
      ],
      value: [new Date()],
      events: [],
      currentStart: null,
      currentEnd: null,
    };
  },

  mounted() {
    const adapter = useDate();
    this.fetchInitialEvents();
  },

  methods: {
    fetchInitialEvents() {
      const adapter = useDate();
      const start = adapter.startOfDay(adapter.startOfMonth(new Date()));
      const end = adapter.endOfDay(adapter.endOfMonth(new Date()));

      this.currentStart = start;
      this.currentEnd = end;

      this.fetchEvents({ start, end });
    },

    async fetchEvents({ start, end }) {
      try {
        // Ensure start and end are valid Date objects
        const startDate = start instanceof Date ? start : new Date(start);
        const endDate = end instanceof Date ? end : new Date(end);

        const response = await this.$api.get('/api/motion-detected-file/calendar', {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        });

        const apiData = response.data;
        console.log(apiData);

        this.events = apiData.map(item => ({
          title: item.file_name,
          start: new Date(item.created_at),
          end: new Date(new Date(item.created_at).getTime() + 60 * 60 * 1000), // Assuming 1 hour duration
          color: this.getEventColor(item),
          allDay: false, // Modify as necessary
        }));
      } catch (error) {
        console.error('Failed to fetch events:', error);
        this.events = []; // Clear events on error
      }
    },

    getEventColor(event) {
      // Adjust color logic based on event properties
      return event.type === 1 ? 'blue' : 'green';
    },

    onCalendarChange({ start, end }) {
      // This method is called when the calendar view changes
      // It ensures we fetch events for the new date range
      this.currentStart = start;
      this.currentEnd = end;
      this.fetchEvents({ start, end });
    },

    onDateRangeChange(newValue) {
      // Handle direct date selection changes
      const adapter = useDate();
      const start = adapter.startOfDay(newValue[0]);
      const end = adapter.endOfDay(newValue[0]);

      this.currentStart = start;
      this.currentEnd = end;
      this.fetchEvents({ start, end });
    },

    onViewTypeChange(newType) {
      // When view type changes, refetch events for the current range
      if (this.currentStart && this.currentEnd) {
        this.fetchEvents({
          start: this.currentStart,
          end: this.currentEnd
        });
      }
    },

    onWeekdaysChange(newWeekdays) {
      // When weekdays change, refetch events for the current range
      if (this.currentStart && this.currentEnd) {
        this.fetchEvents({
          start: this.currentStart,
          end: this.currentEnd
        });
      }
    },
  },
};
</script>

<style scoped>
.v-calendar {
  height: 600px;
}
</style>
