import { createRouter, createWebHistory } from 'vue-router';
import { loadLayoutMiddleware } from "@/router/middleware/loadLayoutMiddleware.js";
import LoginView from "@/views/LoginView.vue";
import CalendarView from "@/views/CalendarView.vue";
import CalendarDayView from "@/views/CalendarDayView.vue";
import CookieHelper from "@/utils/CookieHelper.js";
import LivestreamView from "@/views/LivestreamView.vue";
import SettingsView from "@/views/SettingsView.vue";
import ImageRegionView from "@/views/ImageRegionView.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView,
      meta: {
        layout: 'LoginLayout',
        requiresAuth: false,
      },
    },
    {
      path: '/livestream',
      name: 'livestream',
      component: LivestreamView,
      meta: {
        layout: 'CalendarLayout',
        requiresAuth: false,
      },
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
      meta: {
        layout: 'CalendarLayout',
        requiresAuth: false,
      },
    },
    {
      path: '/settings/image-region',
      name: 'settingsImageRegion',
      component: ImageRegionView,
      meta: {
        layout: 'ImageRegionSelectorLayout',
        requiresAuth: false,
      },
    },
    {
      path: '/calendar',
      name: 'calendar',
      component: CalendarView,
      meta: {
        layout: 'CalendarLayout',
        requiresAuth: false,
      },
    },
    {
      path: '/calendar/:date',
      name: 'calendarDayView',
      component: CalendarDayView,
      meta: {
        layout: 'CalendarLayout',
        requiresAuth: false,
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
