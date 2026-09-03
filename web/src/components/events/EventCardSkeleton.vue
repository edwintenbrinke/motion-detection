<template>
  <div class="skeleton" aria-hidden="true">
    <div class="thumb shimmer"></div>
    <div class="lines">
      <div class="line short shimmer"></div>
      <div class="line shimmer"></div>
      <div class="line medium shimmer"></div>
    </div>
  </div>
</template>

<style scoped>
/* Skeletons rather than the full-screen overlay: the feed knows its own shape, and covering
   the screen for a list that is about to appear reads as slower than it is. */
.skeleton {
  display: flex;
  gap: var(--app-space-3);
  padding: var(--app-space-3) var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
}

.thumb {
  flex: 0 0 108px;
  width: 108px;
  aspect-ratio: 16 / 9;
  border-radius: var(--app-radius-sm);
}

.lines {
  flex: 1;
  padding-top: 4px;
}

.line {
  height: 11px;
  margin-bottom: 8px;
  border-radius: 4px;
}

.line.short { width: 35%; }
.line.medium { width: 60%; }

.shimmer {
  background: linear-gradient(
      90deg,
      var(--app-surface-raised) 25%,
      var(--app-surface-hover) 50%,
      var(--app-surface-raised) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .shimmer {
    animation: none;
  }
}
</style>
