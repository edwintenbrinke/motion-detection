<template>
  <AppScreen title="Zones" back="/settings">
    <EmptyState
        icon="pi pi-images"
        title="Nog in aanbouw"
        description="Meerdere benoemde zones en maskers over een live camerabeeld."
    />
  </AppScreen>
</template>

<script setup>
import AppScreen from '@/components/ui/AppScreen.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
</script>
