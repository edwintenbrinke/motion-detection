<script setup>
import { RouterView } from 'vue-router'
import AppFooter from "@/components/AppFooter.vue";
import AppHeader from "@/components/AppHeader.vue";
</script>

<template>
  <AppHeader />
  <RouterView />
  <AppFooter />
</template>

<style scoped>

</style>
