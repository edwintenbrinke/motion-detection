<template>
  <div class="image-region-selector">
    <header class="header">
      <button @click="saveClick">SAVE</button>
      <button @click="resetClick">RESET</button>
      <input
          min="3"
          type="number"
          v-model="maxPoints"
      >
      <button @click="closeClick">CLOSE</button>
    </header>
    <canvas
        ref="canvas"
        :width="canvasWidth"
        :height="canvasHeight"
        @mousedown="handleMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="handleMouseUp"
    ></canvas>
  </div>
</template>

<script>
export default {
  name: "ImageRegionSelector",
  props: {
    imageUrl: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      points: [],
      isDragging: false,
      draggingPointIndex: null,
      canvasWidth: 0,
      canvasHeight: 0,
      image: null,
      maxPoints: 6,
      aspectRatio: 1, // To store the image's aspect ratio
    };
  },
  mounted() {
    this.loadImage();
    window.addEventListener("resize", this.updateCanvasSize);
    window.addEventListener("orientationchange", this.updateCanvasSize);
  },
  beforeUnmount() {
    window.removeEventListener("resize", this.updateCanvasSize);
    window.removeEventListener("orientationchange", this.updateCanvasSize);
  },
  methods: {
    loadImage() {
      this.image = new Image();
      this.image.src = this.imageUrl;
      this.image.onload = () => {
        this.aspectRatio = this.image.width / this.image.height;
        this.updateCanvasSize();
      };
    },
    updateCanvasSize() {
      const maxWidth = window.innerWidth;
      const maxHeight = window.innerHeight - 50;

      if (maxWidth / maxHeight > this.aspectRatio) {
        this.canvasHeight = maxHeight;
        this.canvasWidth = maxHeight * this.aspectRatio;
      } else {
        this.canvasWidth = maxWidth;
        this.canvasHeight = maxWidth / this.aspectRatio;
      }

      this.updateCanvas();
    },
    handleMouseDown(event) {
      const point = this.getCanvasCoordinates(event);

      const index = this.findPointIndex(point);
      if (index !== -1) {
        this.isDragging = true;
        this.draggingPointIndex = index;
      } else if (this.points.length < this.maxPoints) {
        this.points.push(point);
        this.updateCanvas();
      }
    },
    handleMouseMove(event) {
      if (this.isDragging && this.draggingPointIndex !== null) {
        this.points[this.draggingPointIndex] = this.getCanvasCoordinates(event);
        this.updateCanvas();
      }
    },
    handleMouseUp() {
      this.isDragging = false;
      this.draggingPointIndex = null;
    },
    getCanvasCoordinates(event) {
      const canvas = this.$refs.canvas;
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    },
    findPointIndex(point) {
      const radius = 15;
      return this.points.findIndex(
          (p) => Math.hypot(p.x - point.x, p.y - point.y) <= radius
      );
    },
    updateCanvas() {
      const canvas = this.$refs.canvas;
      const ctx = canvas.getContext("2d");

      ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

      if (this.image) {
        ctx.drawImage(this.image, 0, 0, this.canvasWidth, this.canvasHeight);
      }

      if (this.points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);

        for (let i = 1; i < this.points.length; i++) {
          ctx.lineTo(this.points[i].x, this.points[i].y);
        }

        if (this.points.length === this.maxPoints) {
          ctx.closePath();
        }

        ctx.strokeStyle = "#00FF00";
        ctx.lineWidth = 2;
        ctx.stroke();

        if (this.points.length === this.maxPoints) {
          ctx.fillStyle = "rgba(0, 255, 0, 0.3)";
          ctx.fill();
        }
      }

      this.points.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = "#00FF00";
        ctx.fill();
      });
    },
    resetClick() {
      this.points = []
      this.updateCanvas();
    },
    closeClick() {
      this.$router.push('/settings');
    },
    async saveClick() {
      try {
        await this.$api.patch(`/api/user/settings/1/image-region`, {detection_area_points: this.points});
        // await this.$api.post(`/api/user/settings/${this.settings.id}/image-region`, {detection_area_points: this.settings.detection_area_points});
        this.$router.push('/settings');
      } catch (error) {
        console.error('Failed to save settings:', error)
      }
    },
  },
};
</script>

<style scoped>
.image-region-selector {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.header {
  height: 50px;
  width: 100%;
  display: flex;
  justify-content: space-around;
  background-color: #f8f9fa;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

button {
  padding: 5px 10px;
  font-size: 16px;
  border: none;
  border-radius: 4px;
  background-color: #007bff;
  color: #fff;
  cursor: pointer;
}

button:hover {
  background-color: #0056b3;
}

input {
  width: 50px;
}

canvas {
  display: block;
}
</style>
