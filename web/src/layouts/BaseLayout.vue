<template>
  <component :is="this.$route.meta.layoutComponent">
    <slot/>
  </component>
</template>

<script>
export default {
  name: "BaseLayout",
}
</script>

<style scoped>

</style>