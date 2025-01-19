<template>
  <LivestreamVideo api-base-url="http://localhost" />
</template>

<script>
import {defineComponent} from "vue";
import LivestreamVideo from "@/components/LivestreamVideo.vue";

export default defineComponent({
  components: {LivestreamVideo}
})
</script>