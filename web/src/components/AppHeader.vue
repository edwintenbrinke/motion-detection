<template>
  <header class="app-header">
    <router-link to="/calendar" class="header-box">
      Calendar
    </router-link>
    <router-link to="/table" class="header-box">
      Table
    </router-link>
  </header>
</template>

<script>
export default {
  name: 'AppHeader'
}
</script>

<style scoped>
.app-header {
  display: flex;
  height: 40px; /* Adjust height as needed */
}

.header-box {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  text-decoration: none;
  font-size: 1.5rem;
  font-weight: bold;
  border-right: 1px solid white; /* Separator line between boxes */
  border-bottom: 1px solid white; /* Separator line between boxes */
  transition: background-color 0.3s ease;
}

.header-box:last-child {
  border-right: none; /* Remove border on the last box */
}

.header-box:hover {
  background-color: #333;
}
</style>
