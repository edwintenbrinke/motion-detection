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
import {Preferences} from "@capacitor/preferences";
import TestView from "@/views/TestView.vue"; // Import the Pinia store

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
      path: '/test',
      name: 'test',
      component: TestView,
      meta: {
        layout: 'CalendarLayout',
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

router.beforeEach(async (to, from, next) => {
  await useInitializeStore()?.getInitializingInfo();

  const { value: token } = await Preferences.get({ key: 'authToken' });

  if (to.path === '/') {
    if (token) {
      // Redirect authenticated users to /calendar
      return next({ path: '/calendar', replace: true });
    } else {
      return next(); // Allow unauthenticated users to stay on /
    }
  }

  if (to.meta.requiresAuth && !token) {
    // Redirect unauthenticated users trying to access protected routes
    return next({ path: '/', replace: true });
  }

  next(); // Proceed as normal
});


// Execute the loadLayoutMiddleware before each route change
router.beforeEach(loadLayoutMiddleware);

export default router;
