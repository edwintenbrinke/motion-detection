import { createRouter, createWebHistory } from 'vue-router'
import LoginView from "@/views/LoginView.vue";
import CalendarView from "@/views/CalendarView.vue";
import CalendarDayView from "@/views/CalendarDayView.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/calendar',
      name: 'calendar',
      component: CalendarView,
    },
    {
      path: '/calendar/:date',
      name: 'calendarDayView',
      component: CalendarDayView,
    },
  ],
})

export default router
