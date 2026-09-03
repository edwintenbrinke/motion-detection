<template>
  <div ref="container" class="canvas-container">
    <canvas
        ref="canvas"
        @pointerdown="onStart"
        @pointermove="onMove"
        @pointerup="onEnd"
        @pointercancel="onEnd"
    ></canvas>
  </div>
</template>

<script>
/**
 * Draws polygons over a camera still.
 *
 * The point handling comes from the v1 ImageRegionSelector: normalised 0-1 coordinates, a
 * 15-pixel grab radius, redraw on resize. What is new is that there are several named
 * polygons rather than one, and that the shapes are Frigate zones and motion masks instead
 * of a single detection area.
 *
 * Points keep the order they were drawn in. Frigate walks the polygon in the order it is
 * given, so sorting them -- which looks tidier -- silently redraws the zone.
 */
const GRAB_RADIUS = 15;

export default {
  name: 'ZoneCanvas',

  props: {
    imageUrl: { type: String, default: null },
    shapes: { type: Array, required: true },
    activeIndex: { type: Number, default: -1 },
    /** Editing is off while the list is being browsed, so a stray tap adds nothing. */
    editable: { type: Boolean, default: true },
  },

  emits: ['update:shapes'],

  data() {
    return {
      image: null,
      observer: null,
      draggingPoint: null,
    };
  },

  watch: {
    imageUrl: 'loadImage',
    shapes: { handler: 'render', deep: true },
    activeIndex: 'render',
  },

  mounted() {
    this.observer = new ResizeObserver(() => this.render());
    this.observer.observe(this.$refs.container);
    this.loadImage();
  },

  beforeUnmount() {
    this.observer?.disconnect();
  },

  methods: {
    loadImage() {
      if (!this.imageUrl) return;
      const image = new Image();
      image.onload = () => {
        this.image = image;
        this.render();
      };
      image.onerror = () => {
        // No frame available: still draw the polygons on a blank canvas rather than
        // showing nothing at all.
        this.image = null;
        this.render();
      };
      image.src = this.imageUrl;
    },

    render() {
      const canvas = this.$refs.canvas;
      const container = this.$refs.container;
      if (!canvas || !container) return;

      const width = container.clientWidth;
      if (!width) return;

      const aspect = this.image ? this.image.height / this.image.width : 9 / 16;
      canvas.width = width;
      canvas.height = Math.round(width * aspect);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${canvas.height}px`;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (this.image) {
        ctx.drawImage(this.image, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      this.shapes.forEach((shape, index) => this.drawShape(ctx, shape, index === this.activeIndex));
    },

    drawShape(ctx, shape, active) {
      const points = (shape.points ?? []).map((point) => this.toCanvas(point));
      if (points.length === 0) return;

      const colour = shape.color ?? '#f2b134';

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }

      if (points.length > 2) ctx.closePath();

      ctx.strokeStyle = colour;
      ctx.lineWidth = active ? 3 : 1.5;
      // Inactive shapes stay visible but recede, so it is obvious which one a tap will edit.
      ctx.globalAlpha = active ? 1 : 0.45;
      ctx.stroke();

      if (points.length > 2) {
        ctx.fillStyle = colour;
        ctx.globalAlpha = active ? 0.22 : 0.1;
        ctx.fill();
      }

      ctx.globalAlpha = 1;

      if (!active) return;

      points.forEach((point, index) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();

        // Number the handles: the order is what Frigate walks, so it has to be visible.
        ctx.fillStyle = '#000';
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(index + 1), point.x, point.y);
      });
    },

    toCanvas(point) {
      const canvas = this.$refs.canvas;
      return { x: point.x * canvas.width, y: point.y * canvas.height };
    },

    toRelative(x, y) {
      const canvas = this.$refs.canvas;
      return {
        // Clamp: a point dragged off the edge would be an invalid zone Frigate refuses.
        x: Math.min(1, Math.max(0, x / canvas.width)),
        y: Math.min(1, Math.max(0, y / canvas.height)),
      };
    },

    positionOf(event) {
      const rect = this.$refs.canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    },

    findHandle(position) {
      const shape = this.shapes[this.activeIndex];
      if (!shape) return -1;

      return (shape.points ?? []).findIndex((point) => {
        const canvasPoint = this.toCanvas(point);
        return Math.hypot(canvasPoint.x - position.x, canvasPoint.y - position.y) <= GRAB_RADIUS;
      });
    },

    onStart(event) {
      if (!this.editable || this.activeIndex < 0) return;

      const position = this.positionOf(event);
      const handle = this.findHandle(position);

      if (handle !== -1) {
        event.preventDefault();
        this.$refs.canvas.setPointerCapture?.(event.pointerId);
        this.draggingPoint = handle;
        return;
      }

      this.mutateActive((shape) => {
        shape.points = [...(shape.points ?? []), this.toRelative(position.x, position.y)];
      });
    },

    onMove(event) {
      if (this.draggingPoint === null) return;
      event.preventDefault();

      const position = this.positionOf(event);
      this.mutateActive((shape) => {
        const points = [...shape.points];
        points[this.draggingPoint] = this.toRelative(position.x, position.y);
        shape.points = points;
      });
    },

    onEnd() {
      this.draggingPoint = null;
    },

    mutateActive(fn) {
      const next = this.shapes.map((shape, index) =>
          index === this.activeIndex ? { ...shape, points: [...(shape.points ?? [])] } : shape,
      );
      fn(next[this.activeIndex]);
      this.$emit('update:shapes', next);
    },

    /** Removes the last point of the active shape. */
    undo() {
      this.mutateActive((shape) => {
        shape.points = shape.points.slice(0, -1);
      });
    },
  },
};
</script>

<style scoped>
.canvas-container {
  width: 100%;
  background: #000;
}

canvas {
  display: block;
  /* The canvas owns its gestures: without this a drag scrolls the page instead. */
  touch-action: none;
}
</style>
