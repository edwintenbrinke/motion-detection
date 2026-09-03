<template>
  <AppScreen title="Account" back="/settings">
    <EmptyState
        icon="pi pi-user"
        title="Nog in aanbouw"
        description="Vergrendeling, pushmeldingen en uitloggen."
    />
  </AppScreen>
</template>

<script setup>
import AppScreen from '@/components/ui/AppScreen.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
</script>
