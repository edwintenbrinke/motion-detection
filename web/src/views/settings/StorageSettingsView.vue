<template>
  <AppScreen title="Opslag" back="/settings">
    <EmptyState
        icon="pi pi-database"
        title="Nog in aanbouw"
        description="Bewaartermijn per soort en het wissen van de lokale cache."
    />
  </AppScreen>
</template>

<script setup>
import AppScreen from '@/components/ui/AppScreen.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
</script>
