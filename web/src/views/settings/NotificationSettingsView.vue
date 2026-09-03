<template>
  <AppScreen title="Notificaties" back="/settings">
    <EmptyState
        icon="pi pi-bell"
        title="Nog in aanbouw"
        description="Regels, stille uren en de sluimerknop komen hier te staan."
    />
  </AppScreen>
</template>

<script setup>
import AppScreen from '@/components/ui/AppScreen.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
</script>
