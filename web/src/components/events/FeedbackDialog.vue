<template>
  <div class="backdrop" @click.self="$emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Dit klopt niet">
      <h2>Dit klopt niet</h2>
      <p class="explain">
        Wat had het moeten zijn? Je correctie gaat mee naar de trainingsset, zodat de
        herkenning beter wordt.
      </p>

      <div class="options">
        <button
            v-for="option in options"
            :key="option.value"
            type="button"
            class="option"
            :class="{ on: choice === option.value }"
            @click="choice = option.value"
        >{{ option.label }}</button>
      </div>

      <textarea
          v-model="note"
          rows="2"
          placeholder="Toelichting (optioneel)"
          aria-label="Toelichting"
      ></textarea>

      <div class="actions">
        <button type="button" class="ghost" @click="$emit('close')">Annuleren</button>
        <button type="button" class="primary" :disabled="!choice || sending" @click="submit">
          {{ sending ? 'Versturen…' : 'Versturen' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { FEEDBACK_OPTIONS } from '@/lib/vocabulary.js';

defineProps({
  sending: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'submit']);

const options = FEEDBACK_OPTIONS;
const choice = ref(null);
const note = ref('');

/**
 * The endpoint validates one non-blank string (EventFeedbackInputDTO) while
 * docs/v2/07-api-and-data-model.md specifies `{correct, should_be}`. Until that is settled
 * (HANDOFF H8) the structure goes inside the string, so no information is lost either way
 * and the server side can start parsing it whenever it likes.
 */
function submit() {
  emit('submit', JSON.stringify({
    correct: false,
    should_be: choice.value,
    note: note.value.trim() || undefined,
  }));
}
</script>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.6);
}

.sheet {
  width: 100%;
  padding: var(--app-space-4) var(--app-space-4) calc(var(--app-space-4) + var(--app-safe-bottom));
  border-radius: var(--app-radius-lg) var(--app-radius-lg) 0 0;
  background: var(--app-surface);
}

h2 {
  margin: 0 0 var(--app-space-1);
  font-size: 17px;
}

.explain {
  margin: 0 0 var(--app-space-3);
  color: var(--app-text-muted);
  font-size: 13px;
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: var(--app-space-3);
}

.option {
  padding: 6px 12px;
  border: 1px solid var(--app-border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--app-text-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.option.on {
  border-color: var(--app-accent);
  background: rgba(242, 177, 52, 0.14);
  color: var(--app-accent);
}

textarea {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-bg);
  color: var(--app-text);
  font: inherit;
  font-size: 14px;
  resize: none;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--app-space-2);
  margin-top: var(--app-space-3);
}

.actions button {
  padding: 9px 18px;
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

.primary {
  border: none;
  background: var(--app-accent);
  color: #1a1206;
  font-weight: 600;
}

.primary:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
