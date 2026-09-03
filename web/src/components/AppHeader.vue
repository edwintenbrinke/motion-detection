<template>
  <header class="header">
    <span>
      <button class="icon-button" @click="openLivestream">
        <i class="pi pi-camera"></i>
      </button>
      <button class="icon-button" style="margin-left:10px;" v-show="testButton" @click="openTest">
        <i class="pi pi-bolt"></i>
      </button>
      <!-- Scaffolding for docs/v2/05-android-app.md, gated the same way as the test
           button -- not shipped as the default nav until motion-api's v2 endpoints
           are deployed anywhere but a local dev stack. See docs/v2/HANDOFF.md. -->
      <button class="icon-button" style="margin-left:10px;" v-show="testButton" @click="openEvents">
        <i class="pi pi-bell"></i>
      </button>
    </span>
    <h1 class="header-title icon-button" @click="openCalendar">Motion Detected</h1>
    <button class="icon-button" @click="openSettings">
      <i class="pi pi-cog"></i>
    </button>
  </header>
</template>

<script>
export default {
  computed: {
    testButton() {
      return import.meta.env.VITE_TEST_BUTTON === 'true';
    }
  },
  methods: {
    openCalendar() {
      this.$router.push('/calendar');
    },
    openSettings() {
      this.$router.push('/settings');
    },
    openLivestream() {
      this.$router.push('/livestream');
    },
    openTest() {
      this.$router.push('/test');
    },
    openEvents() {
      this.$router.push('/events');
    },
  },
};
</script>

<style scoped>
.header {
  display: flex;
  align-items: center;
  padding: 10px 20px;
  border-bottom: 1px solid #444;
  color: white;
  justify-content: space-between;
}

.header-title {
  font-size: 1.2rem;
  font-weight: bold;
  margin: 0;
}

.icon-button {
  border: 0;
  background-color: var(--p-content-background);
  font-size: 1.5rem;
  cursor: pointer;
  transition: color 0.3s;
}

.icon-button:hover {
  color: var(--p-primary-color);
}
</style>