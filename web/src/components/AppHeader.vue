<template>
  <header class="header">
    <button class="icon-button" @click="goHome">
      <i class="fas fa-home"></i>
    </button>
    <h1 class="header-title">App Name</h1>
    <button class="icon-button" @click="openSettings">
      <i class="fas fa-cog"></i>
    </button>
  </header>
</template>

<script>
export default {
  methods: {
    goHome() {
      this.$router.push('/calendar');
    },
    openSettings() {
      // Logic to open settings
      console.log("Settings button clicked");
    },
  },
};
</script>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #222;
  padding: 10px 20px;
  border-bottom: 1px solid #444;
  color: white;
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

.header-title {
  font-size: 1.2rem;
  font-weight: bold;
  color: white;
}
</style>
