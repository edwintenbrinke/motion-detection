<template>
  <header class="header">
    <Button @click="saveClick" severity="secondary" >
      <i class="fa-regular fa-floppy-disk"></i>
    </Button>

    <Button @click="resetClick" severity="secondary" >
      <i class="fa-solid fa-rotate"></i>
    </Button>

    <Button @click="placeholderClick" severity="secondary" >
      <i class="fa-solid fa-camera"></i>
    </Button>

    <input
        type="number"
        min="3"
        v-model="maxPoints"
        class="input"
    />

    <Button @click="closeClick" severity="secondary" >
      <i class="fa-solid fa-xmark"></i>
    </Button>
  </header>
  <div ref="containerRef" class="canvas-container">
    <canvas
        ref="canvasRef"
        :style="{ width: '100%', height: 'auto' }"
        @mousedown="handleStart"
        @mousemove="handleMove"
        @mouseup="handleEnd"
        @touchstart="handleStart"
        @touchmove="handleMove"
        @touchend="handleEnd"
    ></canvas>

  </div>
</template>

<script>
import {useInitializeStore} from "@/stores/initialize.js";

export default {
  name: 'DynamicCanvasImage',

  data() {
    return {
      image: null,
      observer: null,
      maxPoints: 6,
      relativePoints: [],
      isDragging: false,
      draggingPointIndex: null,
      initStore: null,
      imageUrl: "https://www.jacksonsquareshopping.co.uk/wp-content/uploads/2016/12/placeholder-1920x1080-copy.png"
    }
  },

  created() {
    this.initStore = useInitializeStore()
    this.relativePoints = this.initStore.getDetectionAreaPoints() || []
    this.maxPoints = (this.initStore.getDetectionAreaPoints() || []).length
    this.imageUrl = this.initStore.getImageUrl();
  },

  mounted() {
    this.setupResizeObserver()
    this.loadImage()
  },

  beforeUnmount() {
    if (this.observer) {
      this.observer.disconnect()
    }
  },

  methods: {
    loadImage() {
      this.image = new Image()
      this.image.onload = () => {
        this.renderCanvas()
      }
      this.image.src = `${this.imageUrl}?_=${new Date().getTime()}`;
    },

    setupResizeObserver() {
      this.observer = new ResizeObserver(() => {
        if (this.image && this.image.complete) {
          this.renderCanvas()
        }
      })

      this.observer.observe(this.$refs.containerRef)
    },

    // Convert relative coordinates to canvas coordinates
    relativeToCanvas(relativePoint) {
      const canvas = this.$refs.canvasRef
      return {
        x: relativePoint.x * canvas.width,
        y: relativePoint.y * canvas.height
      }
    },

    // Convert canvas coordinates to relative coordinates
    canvasToRelative(canvasPoint) {
      const canvas = this.$refs.canvasRef
      return {
        x: canvasPoint.x / canvas.width,
        y: canvasPoint.y / canvas.height
      }
    },

    renderCanvas() {
      const canvas = this.$refs.canvasRef
      const container = this.$refs.containerRef
      const ctx = canvas.getContext('2d')

      // Set canvas dimensions based on container width and image aspect ratio
      const containerWidth = container.clientWidth
      const aspectRatio = this.image.height / this.image.width

      canvas.width = containerWidth
      canvas.height = containerWidth * aspectRatio

      // Clear canvas and draw image
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(this.image, 0, 0, canvas.width, canvas.height)

      if (this.relativePoints.length > 0) {
        const canvasPoints = this.relativePoints.map(point => this.relativeToCanvas(point))

        ctx.beginPath()
        ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y)

        for (let i = 1; i < canvasPoints.length; i++) {
          ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y)
        }

        if (canvasPoints.length === this.maxPoints) {
          ctx.closePath()
        }

        ctx.strokeStyle = "#00FF00"
        ctx.lineWidth = 2
        ctx.stroke()

        if (canvasPoints.length === this.maxPoints) {
          ctx.fillStyle = "rgba(0, 255, 0, 0.3)"
          ctx.fill()
        }

        // Draw points
        canvasPoints.forEach((point) => {
          ctx.beginPath()
          ctx.arc(point.x, point.y, 7, 0, Math.PI * 2)
          ctx.fillStyle = "#00FF00"
          ctx.fill()
        })
      }
    },

    getCanvasCoordinates(event) {
      const canvas = this.$refs.canvasRef;
      const rect = canvas.getBoundingClientRect();

      let clientX, clientY;

      if (event.touches) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
      } else {
        clientX = event.clientX;
        clientY = event.clientY;
      }

      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    },

    findPointIndex(canvasPoint) {
      const radius = 15
      return this.relativePoints.findIndex((p) => {
        const canvasP = this.relativeToCanvas(p)
        return Math.hypot(canvasP.x - canvasPoint.x, canvasP.y - canvasPoint.y) <= radius
      })
    },

    handleStart(event) {
      const canvasPoint = this.getCanvasCoordinates(event);
      const index = this.findPointIndex(canvasPoint);

      if (index !== -1) {
        event.preventDefault(); // Prevent scrolling while dragging
        this.isDragging = true;
        this.draggingPointIndex = index;
      } else if (this.relativePoints.length < this.maxPoints) {
        const relativePoint = this.canvasToRelative(canvasPoint);
        this.relativePoints.push(relativePoint);
        this.renderCanvas();
      }
    },

    handleMove(event) {
      if (this.isDragging && this.draggingPointIndex !== null) {
        event.preventDefault(); // Prevent unintended scrolling

        const canvasPoint = this.getCanvasCoordinates(event);
        this.relativePoints[this.draggingPointIndex] = this.canvasToRelative(canvasPoint);
        this.renderCanvas();
      }
    },

    handleEnd() {
      this.isDragging = false;
      this.draggingPointIndex = null;
    },

    resetClick() {
      this.relativePoints = []
      this.renderCanvas();
    },

    async placeholderClick() {
      try {
        await this.$api.post(`/api/user/settings/1/placeholder-image`);
        this.loadImage();
        this.renderCanvas();
        this.$toast.add({ severity: 'success', summary: 'Success', detail: 'Reloaded placeholder image.', life: 2000 });
      } catch (error) {
        console.error('Failed to save settings:', error)
      }
    },

    closeClick() {
      this.$router.push('/settings');
    },

    async saveClick() {
      try {
        await this.$api.patch(`/api/user/settings/1/image-region`, {detection_area_points: this.relativePoints});
        this.initStore.updateDetectionAreaPoints(this.relativePoints);
        this.$router.push('/settings');
        this.$toast.add({ severity: 'success', summary: 'Success', detail: 'Successfully saved the image region.', life: 2000 });
      } catch (error) {
        console.error('Failed to save settings:', error)
      }
    },
  },

  watch: {
    imageUrl: {
      handler() {
        this.loadImage()
      },
    },
  },
}
</script>

<style scoped>
.canvas-container {
  width: 100%;
  height: auto;
}

.header {
  padding: 8px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #444;
  justify-content: space-between;
}

.input {
  max-width: 40px;
  color: white;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 4px;
  font-size: 16px;
}

.input:focus {
  outline: none;
  border-color: #52525B;
}
</style>