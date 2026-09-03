<template>
  <AppScreen title="Account" back="/settings">
    <section class="block">
      <p class="block-title">Ingelogd als</p>
      <p class="user">{{ username }}</p>
    </section>

    <section class="block">
      <p class="block-title">Vergrendelen</p>
      <p class="explain">
        Na deze tijd op de achtergrond vraagt de app opnieuw om je vingerafdruk. Handig als
        je telefoon in de recente-apps-lijst blijft staan.
      </p>

      <div class="choices">
        <button
            v-for="minutes in [1, 5, 15, 30]"
            :key="minutes"
            type="button"
            class="chip"
            :class="{ on: relockMinutes === minutes }"
            @click="setRelock(minutes)"
        >{{ minutes }} min</button>
      </div>
    </section>

    <section class="block">
      <p class="block-title">Pushmeldingen</p>
      <p class="explain">{{ pushDescription }}</p>
      <button v-if="canRetryPush" type="button" class="ghost" @click="retryPush">Opnieuw proberen</button>
    </section>

    <section class="block">
      <button type="button" class="danger" @click="logout">
        <i class="pi pi-sign-out" aria-hidden="true"></i> Uitloggen
      </button>
    </section>

    <p class="version">Motion {{ appVersion }} · {{ apiMode }}</p>
  </AppScreen>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api';
import { useAuthStore } from '@/stores/authentication';
import { useInitializeStore } from '@/stores/initialize';
import { useEventsStore } from '@/stores/events';
import { usePushStore } from '@/stores/push';
import { APP_VERSION, API_MODE } from '@/lib/env.js';
import { useNotify } from '@/composables/useNotify.js';
import AppScreen from '@/components/ui/AppScreen.vue';

const router = useRouter();
const notify = useNotify();
const authStore = useAuthStore();
const initStore = useInitializeStore();
const eventsStore = useEventsStore();
const pushStore = usePushStore();

const relockMinutes = ref(5);
const appVersion = APP_VERSION;
const apiMode = API_MODE === 'mock' ? 'mock-data' : 'live';

const username = computed(() => initStore.user?.username ?? 'onbekend');

const PUSH_DESCRIPTIONS = {
  unsupported: 'Pushmeldingen werken alleen in de Android-app, niet in de browser.',
  idle: 'Nog niet aangemeld voor pushmeldingen.',
  registering: 'Aanmelden…',
  registered: 'Dit toestel ontvangt meldingen.',
  permission_denied: 'Je hebt meldingen geweigerd. Zet ze aan in de Android-instellingen.',
  failed: 'Aanmelden is mislukt.',
};

const pushDescription = computed(() => {
  const base = PUSH_DESCRIPTIONS[pushStore.status] ?? pushStore.status;
  return pushStore.status === 'failed' && pushStore.lastError ? `${base} ${pushStore.lastError}` : base;
});

const canRetryPush = computed(() => ['failed', 'idle'].includes(pushStore.status));

async function setRelock(minutes) {
  relockMinutes.value = minutes;
  await authStore.setRelockMinutes(minutes);
}

async function retryPush() {
  await pushStore.ensureRegistered();
}

async function logout() {
  try {
    // Best effort: a device that cannot be unregistered will be pruned when FCM reports it
    // as UNREGISTERED anyway (docs/v2/04-notifications.md).
    await pushStore.unregister();
  } catch {
    /* ignore */
  }

  try {
    await api.auth.logout();
  } catch {
    /* the endpoint only clears cookies */
  }

  await authStore.clearAuthData({ forgetRefreshToken: true });
  await authStore.setAppInactive();
  await eventsStore.resetStore();
  initStore.resetStore();

  notify.success('Uitgelogd');
  await router.replace('/');
}

onMounted(async () => {
  relockMinutes.value = await authStore.getRelockMinutes();
});
</script>

<style scoped>
.block {
  padding: var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
}

.block-title {
  margin: 0 0 var(--app-space-2);
  color: var(--app-text-faint);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.user {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.explain {
  margin: 0 0 var(--app-space-3);
  color: var(--app-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.choices {
  display: flex;
  gap: 6px;
}

.chip {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-text-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.chip.on {
  border-color: var(--app-accent);
  background: rgba(242, 177, 52, 0.14);
  color: var(--app-accent);
}

.ghost,
.danger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 11px;
  border-radius: var(--app-radius-sm);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.ghost {
  border: 1px solid var(--app-border-strong);
  background: transparent;
  color: var(--app-text);
}

.danger {
  border: 1px solid var(--app-alert);
  background: transparent;
  color: var(--app-alert);
}

.version {
  margin: var(--app-space-5) 0;
  color: var(--app-text-faint);
  font-size: 12px;
  text-align: center;
}
</style>
