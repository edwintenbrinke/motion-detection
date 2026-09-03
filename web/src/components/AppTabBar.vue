<template>
  <nav class="tab-bar" aria-label="Hoofdnavigatie">
    <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="tab"
        :class="{ active: isActive(tab) }"
    >
      <span class="icon-wrap">
        <i :class="tab.icon" aria-hidden="true"></i>
        <span v-if="tab.badge" class="badge">{{ tab.badge > 99 ? '99+' : tab.badge }}</span>
      </span>
      <span class="label">{{ tab.label }}</span>
    </RouterLink>
  </nav>
</template>

<script setup>
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useEventsStore } from '@/stores/events';

const route = useRoute();
const eventsStore = useEventsStore();

const tabs = computed(() => [
  { to: '/events', label: 'Events', icon: 'pi pi-list', match: '/events', badge: eventsStore.unreadCount },
  { to: '/live', label: 'Live', icon: 'pi pi-video', match: '/live' },
  { to: '/timeline', label: 'Tijdlijn', icon: 'pi pi-clock', match: '/timeline' },
  { to: '/settings', label: 'Instellingen', icon: 'pi pi-cog', match: '/settings' },
]);

// Match on prefix so /events/:id and /settings/zones keep their tab lit.
const isActive = (tab) => route.path === tab.match || route.path.startsWith(`${tab.match}/`);
</script>

<style scoped>
.tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 40;
  display: flex;
  height: calc(var(--app-tabbar-height) + var(--app-safe-bottom));
  padding-bottom: var(--app-safe-bottom);
  background: var(--app-surface);
  border-top: 1px solid var(--app-border);
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  text-decoration: none;
  color: var(--app-text-faint);
  font-size: 11px;
  /* No tap highlight: it flashes a grey box over the whole tab on Android. */
  -webkit-tap-highlight-color: transparent;
  transition: color 0.15s ease;
}

.tab.active {
  color: var(--app-accent);
}

.icon-wrap {
  position: relative;
  display: block;
}

.icon-wrap i {
  font-size: 19px;
}

.badge {
  position: absolute;
  top: -6px;
  left: 12px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--app-alert);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
}

.label {
  letter-spacing: 0.01em;
}
</style>
