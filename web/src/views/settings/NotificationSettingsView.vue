<template>
  <AppScreen title="Notificaties" back="/settings">
    <template #actions>
      <button type="button" class="link" :disabled="!dirty || saving" @click="save">Opslaan</button>
    </template>

    <section class="block">
      <p class="block-title">Sluimeren</p>
      <div class="snooze">
        <button type="button" @click="snooze(60)">1 uur</button>
        <button type="button" @click="snooze(untilTomorrowMinutes())">Tot morgen</button>
      </div>
      <p v-if="snoozedUntil" class="snoozed">Stil tot {{ formatTime(snoozedUntil) }}</p>
    </section>

    <section class="block">
      <p class="block-title">Regels</p>
      <p class="explain">
        Van boven naar beneden; de eerste regel die past wint. Past er geen enkele, dan blijft
        het stil. Dat is met opzet: een camera die overal voor piept is een camera die je
        binnen twee weken uitzet.
      </p>

      <ul class="rules">
        <li v-for="(rule, index) in rules" :key="rule.id ?? index" class="rule" :class="{ off: !rule.enabled }">
          <div class="rule-head">
            <span class="priority">{{ index + 1 }}</span>
            <span class="action" :class="rule.action">{{ actionLabel(rule.action) }}</span>
            <label class="switch">
              <input type="checkbox" :checked="rule.enabled" @change="patch(index, { enabled: $event.target.checked })" />
              <span></span>
            </label>
          </div>

          <p class="rule-summary">{{ summarise(rule) }}</p>

          <div class="rule-controls">
            <label>
              <span>Actie</span>
              <select :value="rule.action" @change="patch(index, { action: $event.target.value })">
                <option value="notify">Melden</option>
                <option value="priority">Met voorrang</option>
                <option value="silent">Stil</option>
              </select>
            </label>
            <label>
              <span>Rustperiode</span>
              <select :value="rule.cooldown_seconds" @change="patch(index, { cooldown_seconds: Number($event.target.value) })">
                <option :value="0">geen</option>
                <option :value="30">30 s</option>
                <option :value="60">1 min</option>
                <option :value="90">1,5 min</option>
                <option :value="300">5 min</option>
              </select>
            </label>
            <label>
              <span>Van</span>
              <input type="time" :value="rule.from_time ?? ''" @change="patch(index, { from_time: $event.target.value || null })" />
            </label>
            <label>
              <span>Tot</span>
              <input type="time" :value="rule.to_time ?? ''" @change="patch(index, { to_time: $event.target.value || null })" />
            </label>
          </div>

          <div class="rule-actions">
            <button type="button" :disabled="index === 0" @click="move(index, -1)">
              <i class="pi pi-arrow-up" aria-hidden="true"></i>
            </button>
            <button type="button" :disabled="index === rules.length - 1" @click="move(index, 1)">
              <i class="pi pi-arrow-down" aria-hidden="true"></i>
            </button>
            <button type="button" class="danger" @click="remove(index)">
              <i class="pi pi-trash" aria-hidden="true"></i>
            </button>
          </div>
        </li>
      </ul>

      <button type="button" class="ghost" @click="add">
        <i class="pi pi-plus" aria-hidden="true"></i> Regel toevoegen
      </button>
    </section>

    <section class="block">
      <p class="block-title">Testen</p>
      <p class="explain">Stuurt één melding naar dit toestel, zodat je niet op een bezorger hoeft te wachten.</p>
      <button type="button" class="ghost" :disabled="testing" @click="test">
        {{ testing ? 'Versturen…' : 'Testnotificatie sturen' }}
      </button>
    </section>

    <p v-if="loadError" class="note error">
      {{ loadError.message }}
    </p>
  </AppScreen>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '@/api';
import { formatTime, dayjs } from '@/lib/datetime.js';
import { LABELS_NL, SUB_LABELS_NL } from '@/lib/vocabulary.js';
import { useNotify } from '@/composables/useNotify.js';
import AppScreen from '@/components/ui/AppScreen.vue';

const notify = useNotify();

const rules = ref([]);
const dirty = ref(false);
const saving = ref(false);
const testing = ref(false);
const snoozedUntil = ref(null);
const loadError = ref(null);

const ACTION_LABELS = { notify: 'Melden', priority: 'Voorrang', silent: 'Stil' };
const actionLabel = (action) => ACTION_LABELS[action] ?? action;

/** Reads a rule back as a sentence, so its effect is obvious without decoding fields. */
function summarise(rule) {
  const parts = [];

  parts.push(rule.camera ? `Camera ${rule.camera}` : 'Elke camera');
  if (rule.zone) parts.push(`in ${rule.zone}`);

  if (rule.labels?.length) {
    parts.push(rule.labels.map((label) => (LABELS_NL[label] ?? label).toLowerCase()).join(' of '));
  }
  if (rule.sub_labels?.length) {
    parts.push(`herkend als ${rule.sub_labels.map((s) => (SUB_LABELS_NL[s] ?? s).toLowerCase()).join(' of ')}`);
  }

  if (rule.from_time && rule.to_time) parts.push(`tussen ${rule.from_time} en ${rule.to_time}`);

  return parts.join(', ');
}

function patch(index, changes) {
  rules.value = rules.value.map((rule, i) => (i === index ? { ...rule, ...changes } : rule));
  dirty.value = true;
}

function move(index, direction) {
  const next = [...rules.value];
  const target = index + direction;
  [next[index], next[target]] = [next[target], next[index]];
  // Priority is the order, so it has to follow the list rather than sit beside it.
  rules.value = next.map((rule, i) => ({ ...rule, priority: i + 1 }));
  dirty.value = true;
}

function remove(index) {
  rules.value = rules.value.filter((_, i) => i !== index).map((rule, i) => ({ ...rule, priority: i + 1 }));
  dirty.value = true;
}

function add() {
  rules.value = [
    ...rules.value,
    {
      id: null,
      priority: rules.value.length + 1,
      camera: null,
      zone: null,
      labels: ['person'],
      sub_labels: [],
      from_time: null,
      to_time: null,
      action: 'notify',
      cooldown_seconds: 90,
      enabled: true,
    },
  ];
  dirty.value = true;
}

function untilTomorrowMinutes() {
  return Math.max(1, Math.round(dayjs().add(1, 'day').startOf('day').diff(dayjs(), 'minute')));
}

async function snooze(minutes) {
  try {
    const result = await api.notifications.snooze(minutes);
    snoozedUntil.value = result?.snoozed_until ?? new Date(Date.now() + minutes * 60_000).toISOString();
    notify.success('Gesluimerd', `Stil tot ${formatTime(snoozedUntil.value)}.`);
  } catch (error) {
    notify.error('Sluimeren mislukt', error?.message);
  }
}

async function save() {
  saving.value = true;
  try {
    await api.notifications.putRules(rules.value);
    dirty.value = false;
    notify.success('Regels opgeslagen');
  } catch (error) {
    notify.error('Opslaan mislukt', error?.message);
  } finally {
    saving.value = false;
  }
}

async function test() {
  testing.value = true;
  try {
    await api.notifications.test();
    notify.success('Testnotificatie verstuurd');
  } catch (error) {
    notify.error('Versturen mislukt', error?.message);
  } finally {
    testing.value = false;
  }
}

onMounted(async () => {
  try {
    rules.value = await api.notifications.getRules();
  } catch (error) {
    loadError.value = error;
  }
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

.explain,
.note {
  margin: 0 0 var(--app-space-3);
  color: var(--app-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.note.error {
  padding: var(--app-space-4);
  color: var(--app-alert);
}

.link {
  border: none;
  background: transparent;
  color: var(--app-accent);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.link:disabled {
  color: var(--app-text-faint);
}

.snooze {
  display: flex;
  gap: var(--app-space-2);
}

.snooze button {
  flex: 1;
  padding: 10px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.snoozed {
  margin: var(--app-space-2) 0 0;
  color: var(--app-accent);
  font-size: 13px;
}

.rules {
  margin: 0 0 var(--app-space-3);
  padding: 0;
  list-style: none;
}

.rule {
  padding: var(--app-space-3);
  margin-bottom: var(--app-space-2);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}

.rule.off {
  opacity: 0.5;
}

.rule-head {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
}

.priority {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--app-surface-raised);
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 600;
}

.action {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
}

.action.notify { color: var(--app-detection); }
.action.priority { color: var(--app-alert); }
.action.silent { color: var(--app-text-faint); }

.switch input {
  width: 38px;
  height: 20px;
}

.rule-summary {
  margin: var(--app-space-2) 0;
  font-size: 13px;
  color: var(--app-text-muted);
  line-height: 1.45;
}

.rule-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--app-space-2);
}

.rule-controls label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: var(--app-text-faint);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.rule-controls select,
.rule-controls input {
  padding: 6px 8px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-bg);
  color: var(--app-text);
  font: inherit;
  font-size: 13px;
  text-transform: none;
  letter-spacing: 0;
}

.rule-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--app-space-1);
  margin-top: var(--app-space-2);
}

.rule-actions button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
}

.rule-actions button:disabled {
  opacity: 0.3;
}

.rule-actions .danger {
  color: var(--app-alert);
}

.ghost {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.ghost:disabled {
  opacity: 0.45;
}
</style>
