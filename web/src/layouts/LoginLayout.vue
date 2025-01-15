<template>
  <LoadingSpinner />
  <RouterView />
</template>

<script>
import LoadingSpinner from "@/components/LoadingSpinner.vue";

export default {
  name: "LoginLayout",
  components: {LoadingSpinner},
}
</script>

<style scoped>

</style>