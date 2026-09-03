<template>
  <div class="event-card" :class="{ unseen: !event.seen }" @click="$emit('open', event)">
    <div class="thumbnail">
      <!-- Real thumbnail wiring is a follow-up: /media/thumbnail/{id} needs a signed
           URL from the backend (docs/v2/07-api-and-data-model.md#media-tokens), which
           the API doesn't expose yet. Placeholder icon by severity in the meantime. -->
      <i :class="severityIcon" class="thumbnail-icon"></i>
    </div>
    <div class="details">
      <div class="top-row">
        <span class="camera">{{ event.camera }}</span>
        <span class="time">{{ formattedTime }}</span>
      </div>
      <div class="tags">
        <span class="tag label" :class="event.severity">{{ event.label }}</span>
        <span v-if="event.sub_label" class="tag sub-label">{{ event.sub_label }}</span>
        <span v-for="zone in event.zones" :key="zone" class="tag zone">{{ zone }}</span>
      </div>
      <p v-if="event.description" class="description">{{ event.description }}</p>
    </div>
    <span v-if="!event.seen" class="unseen-dot" aria-hidden="true"></span>
  </div>
</template>

<script>
import dayjs from 'dayjs';

export default {
  name: 'EventCard',
  props: {
    event: {
      type: Object,
      required: true,
    },
  },
  emits: ['open'],
  computed: {
    formattedTime() {
      return dayjs(this.event.started_at).format('HH:mm');
    },
    severityIcon() {
      return this.event.severity === 'alert'
          ? 'pi pi-exclamation-triangle'
          : 'pi pi-eye';
    },
  },
};
</script>

<style scoped>
.event-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  background: var(--p-content-background, #fff);
  cursor: pointer;
  position: relative;
}

.event-card.unseen {
  background: var(--p-highlight-background, #f0f6ff);
}

.thumbnail {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  background: #222;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.thumbnail-icon {
  color: #fff;
  font-size: 1.3rem;
}

.details {
  flex: 1;
  min-width: 0;
}

.top-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--p-text-muted-color, #666);
}

.camera {
  font-weight: 600;
  text-transform: capitalize;
}

.tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.tag {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eee;
}

.tag.label.alert {
  background: #ffe0e0;
  color: #a00;
}

.tag.label.detection {
  background: #e5f0ff;
  color: #2563eb;
}

.description {
  margin: 6px 0 0;
  font-size: 0.85rem;
  color: var(--p-text-muted-color, #666);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unseen-dot {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2563eb;
}
</style>
