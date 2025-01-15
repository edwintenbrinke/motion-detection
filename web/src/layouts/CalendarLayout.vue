<template>
  <AppHeader />
  <RouterView />
</template>

<script>
import AppHeader from "@/components/AppHeader.vue";
import {RouterView} from "vue-router";

export default {
  name: "CalendarLayout",
  components: {RouterView, AppHeader},
}
</script>

<style scoped>

</style>