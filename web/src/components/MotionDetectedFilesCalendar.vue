<template>
  <div class="motion-calendar-container">
    <div class="calendar-controls">
      <button @click="previousMonth" class="nav-button">&lt;</button>
      <h2 class="month-title">{{ currentMonthYear }}</h2>
      <button @click="nextMonth" class="nav-button">&gt;</button>
    </div>

    <div class="calendar-grid">
      <div class="weekday-header" v-for="day in weekdays" :key="day">
        {{ day }}
      </div>

      <div
        v-for="day in calendarDays"
        :key="day.date"
        class="calendar-day"
        :class="{
          'current-month': day.isCurrentMonth,
          'has-items': day.hasItems,
          'selected': isSelectedDate(day.date)
        }"
        @click="selectDate(day)"
      >
        {{ day.dayOfMonth }}
        <span v-if="day.hasItems" class="item-indicator">•</span>
      </div>
    </div>

    <div v-if="selectedDateItems.length" class="items-list">
      <h3>Items for {{ formatSelectedDate }}</h3>
      <ul>
        <li v-for="item in selectedDateItems" :key="item.id">
          {{ item.file_name }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'

const props = defineProps({
  api: {
    type: Object,
    required: true
  }
})

// Current selected month and year
const currentDate = ref(new Date())
const selectedDate = ref(null)

// Calendar data
const calendarDays = ref([])
const itemsByDate = ref({})

// Weekday headers
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Computed current month and year display
const currentMonthYear = computed(() => {
  return currentDate.value.toLocaleString('default', { month: 'long', year: 'numeric' })
})

// Formatted selected date for display
const formatSelectedDate = computed(() => {
  return selectedDate.value
    ? selectedDate.value.toLocaleDateString('default', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
    : ''
})

// Items for the selected date
const selectedDateItems = computed(() => {
  if (!selectedDate.value) return []
  const dateKey = selectedDate.value.toISOString().split('T')[0]
  return itemsByDate.value[dateKey] || []
})

// Navigate to previous month
function previousMonth() {
  currentDate.value = new Date(
    currentDate.value.getFullYear(),
    currentDate.value.getMonth() - 1,
    1
  )
  fetchCalendarData()
}

// Navigate to next month
function nextMonth() {
  currentDate.value = new Date(
    currentDate.value.getFullYear(),
    currentDate.value.getMonth() + 1,
    1
  )
  fetchCalendarData()
}

// Fetch calendar data for the current month
async function fetchCalendarData() {
  // Calculate start and end dates for the month view
  const firstDay = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth(), 1)
  const lastDay = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1, 0)

  // Extend range to ensure full calendar view
  const startDate = new Date(firstDay)
  startDate.setDate(firstDay.getDate() - firstDay.getDay())

  const endDate = new Date(lastDay)
  endDate.setDate(lastDay.getDate() + (6 - lastDay.getDay()))

  try {
    const response = await props.api.get('/api/motion-detected-file/calendar', {
      params: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    })

    // Process items by date
    itemsByDate.value = response.data.reduce((acc, item) => {
      const dateKey = new Date(item.created_at).toISOString().split('T')[0]
      if (!acc[dateKey]) {
        acc[dateKey] = []
      }
      acc[dateKey].push(item)
      return acc
    }, {})

    // Generate calendar days
    calendarDays.value = generateCalendarDays(startDate, endDate)
  } catch (error) {
    console.error('Error fetching calendar data:', error)
  }
}

// Generate days for the calendar view
function generateCalendarDays(startDate, endDate) {
  const days = []
  const currentMonth = currentDate.value.getMonth()

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateKey = d.toISOString().split('T')[0]
    days.push({
      date: new Date(d),
      dayOfMonth: d.getDate(),
      isCurrentMonth: d.getMonth() === currentMonth,
      hasItems: !!itemsByDate.value[dateKey]
    })
  }

  return days
}

// Select a specific date
function selectDate(day) {
  if (day.isCurrentMonth) {
    selectedDate.value = day.date
  }
}

// Check if a date is selected
function isSelectedDate(date) {
  return selectedDate.value &&
    date.toISOString().split('T')[0] ===
    selectedDate.value.toISOString().split('T')[0]
}

// Fetch data on component mount
onMounted(fetchCalendarData)

// Refetch when month changes
watch(currentDate, fetchCalendarData)
</script>

<style scoped>
.motion-calendar-container {
  max-width: 600px;
  margin: 0 auto;
  font-family: Arial, sans-serif;
}

.calendar-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.nav-button {
  background: none;
  border: 1px solid #ddd;
  padding: 5px 10px;
  cursor: pointer;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
  text-align: center;
}

.weekday-header {
  font-weight: bold;
  padding: 10px 0;
  background-color: #f0f0f0;
}

.calendar-day {
  border: 1px solid #eee;
  padding: 10px;
  cursor: pointer;
  position: relative;
}

.calendar-day.current-month {
  background-color: white;
}

.calendar-day:not(.current-month) {
  background-color: #f9f9f9;
  color: #999;
}

.calendar-day.has-items {
  background-color: #e6f3ff;
}

.calendar-day.selected {
  border: 2px solid #007bff;
  background-color: #f0f8ff;
}

.item-indicator {
  position: absolute;
  top: 5px;
  right: 5px;
  color: red;
  font-size: 20px;
}

.items-list {
  margin-top: 20px;
  padding: 15px;
  background-color: #f9f9f9;
  border-radius: 5px;
}

.items-list ul {
  list-style-type: none;
  padding: 0;
}

.items-list li {
  padding: 10px;
  border-bottom: 1px solid #eee;
}

.items-list li:last-child {
  border-bottom: none;
}
</style>
