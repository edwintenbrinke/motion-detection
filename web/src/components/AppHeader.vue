<template>
  <header class="header">
    <div class="left-buttons">
      <button class="icon-button" @click="openLivestream">
        <i class="fa-solid fa-camera"></i>
      </button>
    </div>
    <h1 class="header-title icon-button" @click="openCalendar">Motion Detected</h1>
    <div class="right-buttons">
      <button class="icon-button" @click="openSettings">
        <i class="fas fa-cog"></i>
      </button>
    </div>
  </header>
</template>

<script>
export default {
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
  },
};
</script>

<style scoped>
.header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  background-color: var(--p-content-background);
  padding: 10px 20px;
  border-bottom: 1px solid #444;
  color: white;
}

.left-buttons {
  justify-self: start;
  display: flex;
  gap: 10px;
}

.right-buttons {
  justify-self: end;
}

.header-title {
  grid-column: 2;
  font-size: 1.2rem;
  font-weight: bold;
  color: white;
  margin: 0;
  padding: 0 20px;
}

.icon-button {
  background: none;
  border: none;
  color: white;
  font-size: 1.5rem;
  cursor: pointer;
  transition: color 0.3s;
}

.icon-button:hover {
  color: #00b4d8;
}
</style>