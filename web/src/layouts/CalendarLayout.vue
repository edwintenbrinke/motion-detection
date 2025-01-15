<template>
  <LoadingSpinner />
  <AppHeader />
  <RouterView />
</template>

<script>
import AppHeader from "@/components/AppHeader.vue";
import {RouterView} from "vue-router";
import LoadingSpinner from "@/components/LoadingSpinner.vue";

export default {
  name: "CalendarLayout",
  components: {LoadingSpinner, RouterView, AppHeader},
}
</script>

<style scoped>

</style>