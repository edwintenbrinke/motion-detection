<template>
  <AppScreen title="Tijdlijn">
    <EmptyState
        icon="pi pi-clock"
        title="Nog in aanbouw"
        description="De scrubber over de dag, met previews en markers."
    />
  </AppScreen>
</template>

<script setup>
import AppScreen from '@/components/ui/AppScreen.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
</script>
