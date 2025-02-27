import { createRouter, createWebHistory } from 'vue-router';
import { loadLayoutMiddleware } from "@/router/middleware/loadLayoutMiddleware.js";
import LoginView from "@/views/LoginView.vue";
import CalendarView from "@/views/CalendarView.vue";
import CalendarDayView from "@/views/CalendarDayView.vue";
import LivestreamView from "@/views/LivestreamView.vue";
import SettingsView from "@/views/SettingsView.vue";
import ImageRegionView from "@/views/ImageRegionView.vue";
import { useInitializeStore } from '@/stores/initialize';
import { useAuthStore } from '@/stores/authentication';
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

  // Check if token is valid and biometric has been verified in this session
  const tokenValid = await useAuthStore().isTokenValid();
  const biometricVerified = await useAuthStore().isBiometricVerified();
  const appActive = await useAuthStore().isAppActive();
  console.log('statusss', tokenValid, biometricVerified, appActive)
  // Always route to login page if app has been restarted or token is invalid
  if (to.meta.requiresAuth && (!tokenValid || !biometricVerified || !appActive)) {
    return next({ path: '/', replace: true });
  }

  // If going to login page but already verified, redirect to calendar
  if (to.path === '/' && tokenValid && biometricVerified && appActive) {
    return next({ path: '/calendar', replace: true });
  }

  next(); // Proceed as normal
});

// Execute the loadLayoutMiddleware before each route change
router.beforeEach(loadLayoutMiddleware);

export default router;