import { createRouter, createWebHistory } from 'vue-router';
import { loadLayoutMiddleware } from "@/router/middleware/loadLayoutMiddleware.js";
import LoginView from "@/views/LoginView.vue";
import CalendarView from "@/views/CalendarView.vue";
import CalendarDayView from "@/views/CalendarDayView.vue";
import CookieHelper from "@/utils/CookieHelper.js";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView,
      meta: {
        layout: 'LoginLayout',
        requiresAuth: false, // No authentication required for the login page
      },
    },
    {
      path: '/calendar',
      name: 'calendar',
      component: CalendarView,
      meta: {
        layout: 'CalendarLayout',
        requiresAuth: true, // Authentication required
      },
    },
    {
      path: '/calendar/:date',
      name: 'calendarDayView',
      component: CalendarDayView,
      meta: {
        layout: 'CalendarLayout',
        requiresAuth: true, // Authentication required
      },
    },
  ],
});

// Middleware to check authentication before each route
router.beforeEach((to, from, next) => {
  // Check if the route requires authentication
  if (to.meta.requiresAuth) {
    const username = CookieHelper.getCookie('username'); // Get the 'username' cookie

    if (!username) {
      // Redirect to login page if no username cookie is found
      next({ path: '/', replace: true }); // Ensure route changes
    } else {
      next(); // Proceed to the route
    }
  } else {
    next(); // Proceed to the route if no authentication is required
  }
});

// Execute the loadLayoutMiddleware before each route change
router.beforeEach(loadLayoutMiddleware);

export default router;
