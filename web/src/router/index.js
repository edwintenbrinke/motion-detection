import { createRouter, createWebHistory } from 'vue-router';
import { loadLayoutMiddleware } from "@/router/middleware/loadLayoutMiddleware.js";
import LoginView from "@/views/LoginView.vue";
import CalendarView from "@/views/CalendarView.vue";
import CalendarDayView from "@/views/CalendarDayView.vue";
import LivestreamView from "@/views/LivestreamView.vue";
import SettingsView from "@/views/SettingsView.vue";
import ImageRegionView from "@/views/ImageRegionView.vue";
import EventsView from "@/views/EventsView.vue";
import { useInitializeStore } from '@/stores/initialize';
import { useAuthStore } from '@/stores/authentication';
import { coldStartComplete } from '@/lib/coldStart.js';
import TestView from "@/views/TestView.vue";


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
      // Scaffolding for docs/v2/05-android-app.md's "events-first" redesign -- not the
      // default landing yet (that stays /calendar until motion-api's v2 endpoints are
      // actually deployed somewhere other than a local dev stack). Reachable directly
      // for testing.
      path: '/events',
      name: 'events',
      component: EventsView,
      meta: {
        layout: 'CalendarLayout',
        requiresAuth: true,
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
  // The cold-start reset must finish before the flags below are read, or the very first
  // navigation can see the previous session's state and skip the lock screen entirely.
  await coldStartComplete();

  const authStore = useAuthStore();

  await useInitializeStore()?.getInitializingInfo();

  // The three-flag gate: a valid token is not enough on its own.
  const tokenValid = await authStore.isTokenValid();
  const biometricVerified = await authStore.isBiometricVerified();
  const appActive = await authStore.isAppActive();

  if (to.meta.requiresAuth && (!tokenValid || !biometricVerified || !appActive)) {
    // Remember where they were headed so unlocking returns them there instead of home.
    authStore.stashPendingRoute(to.fullPath);
    return next({ path: '/', replace: true });
  }

  if (to.path === '/' && tokenValid && biometricVerified && appActive) {
    return next({ path: authStore.takePendingRoute() ?? '/events', replace: true });
  }

  next();
});

// Execute the loadLayoutMiddleware before each route change
router.beforeEach(loadLayoutMiddleware);

export default router;