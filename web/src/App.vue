<script setup>
import { RouterView } from 'vue-router'
import BaseLayout from "@/layouts/BaseLayout.vue";
import { App as CapacitorApp } from '@capacitor/app';
import {useAuthStore} from "@/stores/authentication";

// Add this to your main.js or App.vue (created/mounted hook)
const setupAppLifecycleListeners = () => {
  CapacitorApp.addListener('pause', async () => {
    console.log('App minimized. Keeping user session active.');
  });

  CapacitorApp.addListener('appTerminated', async () => {
    console.log('App terminated. Resetting authentication state.');
    await useAuthStore().resetAppState();
  });

  // Optional: Reset state when app first launches
  useAuthStore().resetAppState();
};

setupAppLifecycleListeners();

</script>

<template>
  <BaseLayout>
    <RouterView />
  </BaseLayout>
</template>

<style scoped>

</style>
