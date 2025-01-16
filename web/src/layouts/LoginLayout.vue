<template>
  <LoadingSpinner />
  <AppHeader />
  <RouterView />
</template>

<script>
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import AppHeader from "@/components/AppHeader.vue";

export default {
  name: "LoginLayout",
  components: {AppHeader, LoadingSpinner},
}
</script>

<style scoped>

</style>