<script setup>
import { RouterView, useRouter } from 'vue-router';
import BaseLayout from '@/layouts/BaseLayout.vue';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAuthStore } from '@/stores/authentication';
import { useAppLifecycle } from '@/composables/useAppLifecycle.js';
import { runColdStart } from '@/lib/coldStart.js';
import { createPushService } from '@/lib/push/pushService.js';

const router = useRouter();
const authStore = useAuthStore();

// A fresh launch always lands on the login screen, even with a valid token.
runColdStart();

// Deep links and push listeners are registered once, at boot, rather than by whichever
// screen happens to be mounted -- a notification tapped from a killed app arrives before
// any view exists.
createPushService({ router }).install();

if (Capacitor.isNativePlatform?.()) {
  CapacitorApp.addListener('appTerminated', async () => {
    await authStore.resetAppState();
  });
}

// Backgrounding starts the clock; coming back checks it. The `pause` listener that used to
// live here only logged, which meant a camera app stayed unlocked indefinitely in the
// recents list -- see docs/v2/05-android-app.md.
useAppLifecycle({
  onBackground: () => {
    authStore.markBackgrounded();
  },
  onForeground: async () => {
    const relocked = await authStore.relockIfExpired();
    if (relocked) {
      authStore.stashPendingRoute(router.currentRoute.value.fullPath);
      await router.replace('/');
    } else {
      await authStore.touchLastActive();
    }
  },
});
</script>

<template>
  <BaseLayout>
    <RouterView />
  </BaseLayout>
</template>
