<template>
  <LivestreamVideo stream-url="http://localhost/api/video/livestream" />
</template>

<script>
import {defineComponent} from "vue";
import LivestreamVideo from "@/components/LivestreamVideo.vue";

export default defineComponent({
  components: {LivestreamVideo}
})
</script>