import { createRouter, createWebHistory } from 'vue-router';
import { loadLayoutMiddleware } from '@/router/middleware/loadLayoutMiddleware.js';
import { useInitializeStore } from '@/stores/initialize';
import { useAuthStore } from '@/stores/authentication';
import { coldStartComplete } from '@/lib/coldStart.js';

/**
 * Events-first (docs/v2/05-android-app.md). The month calendar was the front door; it is
 * now the archive, reachable from Settings. Everything is lazily imported so the login
 * screen does not carry the timeline, the player and FullCalendar with it.
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { layout: 'LoginLayout', requiresAuth: false },
    },

    // -- The four tabs -------------------------------------------------------------------
    {
      path: '/events',
      name: 'events',
      component: () => import('@/views/EventsView.vue'),
      meta: { layout: 'AppLayout', requiresAuth: true },
    },
    {
      path: '/events/:id',
      name: 'eventDetail',
      component: () => import('@/views/EventDetailView.vue'),
      props: true,
      meta: { layout: 'AppLayout', requiresAuth: true },
    },
    {
      path: '/live',
      name: 'live',
      component: () => import('@/views/LiveView.vue'),
      meta: { layout: 'AppLayout', requiresAuth: true },
    },
    {
      path: '/timeline',
      name: 'timeline',
      component: () => import('@/views/TimelineView.vue'),
      meta: { layout: 'AppLayout', requiresAuth: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { layout: 'AppLayout', requiresAuth: true },
    },

    // -- Settings sub-screens ------------------------------------------------------------
    {
      path: '/settings/notifications',
      name: 'settingsNotifications',
      component: () => import('@/views/settings/NotificationSettingsView.vue'),
      meta: { layout: 'AppLayout', requiresAuth: true },
    },
    {
      path: '/settings/zones',
      name: 'settingsZones',
      component: () => import('@/views/settings/ZonesView.vue'),
      meta: { layout: 'FullscreenLayout', requiresAuth: true },
    },
    {
      path: '/settings/storage',
      name: 'settingsStorage',
      component: () => import('@/views/settings/StorageSettingsView.vue'),
      meta: { layout: 'AppLayout', requiresAuth: true },
    },
    {
      path: '/settings/account',
      name: 'settingsAccount',
      component: () => import('@/views/settings/AccountSettingsView.vue'),
      meta: { layout: 'AppLayout', requiresAuth: true },
    },

    // -- The frozen v1 archive -----------------------------------------------------------
    // Read-only, kept until the old clips stop mattering
    // (docs/v2/07-api-and-data-model.md, "Archive").
    {
      path: '/archive',
      name: 'archive',
      component: () => import('@/views/CalendarView.vue'),
      meta: { layout: 'AppLayout', requiresAuth: true },
    },
    {
      path: '/archive/:date',
      name: 'archiveDay',
      component: () => import('@/views/CalendarDayView.vue'),
      meta: { layout: 'AppLayout', requiresAuth: true },
    },

    // -- Compatibility -------------------------------------------------------------------
    // Deep links use /event/<id> (docs/v2/04-notifications.md); the old paths are kept so a
    // bookmark or an in-flight notification does not land on a blank screen.
    { path: '/event/:id', redirect: (to) => `/events/${to.params.id}` },
    { path: '/livestream', redirect: '/live' },
    { path: '/calendar', redirect: '/archive' },
    { path: '/calendar/:date', redirect: (to) => `/archive/${to.params.date}` },

    // There was no catch-all: an unknown path rendered an empty shell.
    { path: '/:pathMatch(.*)*', redirect: '/events' },
  ],
});

router.beforeEach(async (to, from, next) => {
  // The cold-start reset must finish before the flags below are read, or the very first
  // navigation can see the previous session's state and skip the lock screen entirely.
  await coldStartComplete();

  const authStore = useAuthStore();

  // The three-flag gate: a valid token is not enough on its own.
  const tokenValid = await authStore.isTokenValid();
  const biometricVerified = await authStore.isBiometricVerified();
  const appActive = await authStore.isAppActive();
  const unlocked = tokenValid && biometricVerified && appActive;

  if (to.meta.requiresAuth && !unlocked) {
    // Remember where they were headed so unlocking returns them there instead of home.
    authStore.stashPendingRoute(to.fullPath);
    return next({ path: '/', replace: true });
  }

  if (to.path === '/' && unlocked) {
    return next({ path: authStore.takePendingRoute() ?? '/events', replace: true });
  }

  // Only fetch user/settings once we are actually going somewhere that needs them. This
  // used to run on every navigation including the login screen, where there is no token.
  if (unlocked) {
    await useInitializeStore().getInitializingInfo();
  }

  next();
});

router.beforeEach(loadLayoutMiddleware);

export default router;
