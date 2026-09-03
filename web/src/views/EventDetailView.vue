<template>
  <AppScreen title="Event" back="/events">
    <EmptyState
        icon="pi pi-play"
        title="Nog in aanbouw"
        description="De speler, alle tags en de feedbackknop."
    />
  </AppScreen>
</template>

<script setup>
import AppScreen from '@/components/ui/AppScreen.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
</script>
