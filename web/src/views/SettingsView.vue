<template>
  <AppScreen title="Instellingen">
    <div class="group">
      <SettingsRow
          label="Notificaties"
          description="Regels, stille uren en sluimeren"
          icon="pi pi-bell"
          to="/settings/notifications"
      />
      <SettingsRow
          label="Zones"
          description="Teken waar je wel en niet op wilt letten"
          icon="pi pi-images"
          to="/settings/zones"
      />
      <SettingsRow
          label="Opslag"
          description="Bewaartermijn en lokale cache"
          icon="pi pi-database"
          to="/settings/storage"
      />
      <SettingsRow
          label="Account"
          description="Vergrendeling, push en uitloggen"
          icon="pi pi-user"
          to="/settings/account"
      />
    </div>

    <p class="group-title">Archief</p>
    <div class="group">
      <SettingsRow
          label="Oude opnames"
          description="De opnames van vóór Frigate, op datum"
          icon="pi pi-calendar"
          to="/archive"
      />
    </div>

    <template v-if="isMock">
      <p class="group-title">Mock</p>
      <MockControls />
    </template>

    <p class="version">Motion {{ appVersion }} · {{ apiMode }}</p>
  </AppScreen>
</template>

<script setup>
import { defineAsyncComponent } from 'vue';
import AppScreen from '@/components/ui/AppScreen.vue';
import SettingsRow from '@/components/ui/SettingsRow.vue';
import { APP_VERSION, IS_MOCK, API_MODE } from '@/lib/env.js';

const appVersion = APP_VERSION;
const isMock = IS_MOCK;
const apiMode = API_MODE === 'mock' ? 'mock-data' : 'live';

// Async so the mock panel is never in the production bundle's critical path.
const MockControls = defineAsyncComponent(() => import('@/components/dev/MockControls.vue'));
</script>

<style scoped>
.group {
  border-top: 1px solid var(--app-border);
}

.group-title {
  margin: var(--app-space-5) var(--app-space-4) var(--app-space-2);
  color: var(--app-text-muted);
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.version {
  margin: var(--app-space-5) 0;
  color: var(--app-text-faint);
  font-size: 12px;
  text-align: center;
}
</style>
