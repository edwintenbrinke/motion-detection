import { createRouter, createWebHistory } from 'vue-router';
import { loadLayoutMiddleware } from "@/router/middleware/loadLayoutMiddleware.js";
import LoginView from "@/views/LoginView.vue";
import CalendarView from "@/views/CalendarView.vue";
import CalendarDayView from "@/views/CalendarDayView.vue";
import CookieHelper from "@/utils/CookieHelper.js";
import LivestreamView from "@/views/LivestreamView.vue";
import SettingsView from "@/views/SettingsView.vue";
import ImageRegionView from "@/views/ImageRegionView.vue";
import { useInitializeStore } from '@/stores/initialize';
import {Preferences} from "@capacitor/preferences"; // Import the Pinia store

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
        requiresAuth: true,
      },
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
      meta: {
        layout: 'CalendarLayout',
        requiresAuth: true,
      },
    },
    {
      path: '/settings/image-region',
      name: 'settingsImageRegion',
      component: ImageRegionView,
      meta: {
        layout: 'ImageRegionSelectorLayout',
        requiresAuth: true,
      },
    },
    {
      path: '/calendar',
      name: 'calendar',
      component: CalendarView,
      meta: {
        layout: 'CalendarLayout',
        requiresAuth: true,
      },
    },
    {
      path: '/calendar/:date',
      name: 'calendarDayView',
      component: CalendarDayView,
      meta: {
        layout: 'CalendarLayout',
        requiresAuth: true,
      },
    },
  ],
});


// Middleware to check authentication before each route
router.beforeEach(async (to, from, next) => {
  // Check if the route requires authentication
  if (to.meta.requiresAuth) {
    await useInitializeStore()?.getInitializingInfo();

    const { value: token } = await Preferences.get({ key: 'authToken' });
    const username = CookieHelper.getCookie('username'); // Get the 'username' cookie
    if (!username && !token) {
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
