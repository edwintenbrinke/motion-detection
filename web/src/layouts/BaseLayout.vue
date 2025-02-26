<template>
  <component :is="this.$route.meta.layoutComponent">
    <slot/>
  </component>
  <Toast style="max-width: 90vw; overflow: hidden;" position="bottom-center" />
</template>

<script>
export default {
  name: "BaseLayout",
}
</script>

<style scoped>

</style>