<template>
  <div class="mock">
    <p class="hint">
      Deze app draait op gegenereerde data. Hiermee kun je een trage of kapotte verbinding
      nabootsen zonder iets uit te zetten.
    </p>

    <label class="field">
      <span>Vertraging</span>
      <input type="range" min="0" max="2000" step="50" :value="settings.latencyMs"
             @input="update('latencyMs', Number($event.target.value))" />
      <span class="value">{{ settings.latencyMs }} ms</span>
    </label>

    <label class="field">
      <span>Foutkans</span>
      <input type="range" min="0" max="100" step="5" :value="Math.round(settings.failureRate * 100)"
             @input="update('failureRate', Number($event.target.value) / 100)" />
      <span class="value">{{ Math.round(settings.failureRate * 100) }} %</span>
    </label>

    <label class="field">
      <span>Media verloopt na</span>
      <input type="range" min="10" max="600" step="10" :value="settings.mediaTtlSeconds"
             @input="update('mediaTtlSeconds', Number($event.target.value))" />
      <span class="value">{{ settings.mediaTtlSeconds }} s</span>
    </label>

    <label class="toggle">
      <input type="checkbox" :checked="settings.offline" @change="update('offline', $event.target.checked)" />
      <span>Offline</span>
    </label>

    <p class="sub">Laat deze live-treden mislukken</p>
    <div class="chips">
      <button
          v-for="rung in rungs"
          :key="rung"
          type="button"
          class="chip"
          :class="{ on: settings.failRungs.includes(rung) }"
          @click="toggleRung(rung)"
      >{{ rung }}</button>
    </div>

    <button type="button" class="reset" @click="reset">Standaardwaarden</button>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { getMockSettings, setMockSettings, resetMockSettings } from '@/api/adapters/mock/settings.js';

const rungs = ['webrtc', 'mse', 'hls', 'file', 'snapshot'];
const settings = ref(getMockSettings());

function update(key, value) {
  settings.value = setMockSettings({ [key]: value });
}

function toggleRung(rung) {
  const current = settings.value.failRungs;
  update('failRungs', current.includes(rung) ? current.filter((r) => r !== rung) : [...current, rung]);
}

function reset() {
  settings.value = resetMockSettings();
}
</script>

<style scoped>
.mock {
  padding: var(--app-space-4);
  background: var(--app-surface);
  border-top: 1px solid var(--app-border);
  border-bottom: 1px solid var(--app-border);
}

.hint,
.sub {
  margin: 0 0 var(--app-space-3);
  color: var(--app-text-muted);
  font-size: 13px;
}

.sub {
  margin-top: var(--app-space-4);
}

.field {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  align-items: center;
  gap: var(--app-space-3);
  margin-bottom: var(--app-space-3);
  font-size: 14px;
}

.field input {
  width: 100%;
}

.value {
  min-width: 56px;
  color: var(--app-text-muted);
  font-size: 13px;
  text-align: right;
}

.toggle {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  font-size: 14px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-2);
}

.chip {
  padding: 5px 10px;
  border: 1px solid var(--app-border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--app-text-muted);
  font-size: 12px;
  cursor: pointer;
}

.chip.on {
  border-color: var(--app-alert);
  background: var(--app-alert-dim);
  color: var(--app-alert);
}

.reset {
  margin-top: var(--app-space-4);
  padding: 8px 14px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-text);
  font-size: 13px;
  cursor: pointer;
}
</style>
