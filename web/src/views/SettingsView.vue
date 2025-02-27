<template>
  <form class="settings-form">
    <div class="form-row" style="margin-top: 24px">
      <div class="form-group">
        <label>Motion threshold</label>
        <input
            type="number"
            v-model="settings.motion_threshold"
        >
      </div>

      <div class="form-group">
        <label>ROI Motion threshold</label>
        <input
            type="number"
            v-model="settings.roi_motion_threshold"
        >
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Recording extension</label>
        <input
            type="number"
            v-model="settings.recording_extension"
        >
      </div>

      <div class="form-group">
        <label>Max recording duration</label>
        <input
            type="number"
            v-model="settings.max_recording_duration"
        >
      </div>
    </div>

    <div class="form-group">
      <label>Max disk usage in GB per type</label>
      <input
          type="number"
          v-model="settings.max_disk_usage_in_gb"
      >
    </div>
    <div class="button-container">
      <button type="button" @click="handleImageRegion" class="button action-button">
        <i class="fa-solid fa-plus"></i>
        Region
      </button>
      <button type="button" @click="resetLocalStorage" class="button action-button">
        <i class="fa-solid fa-rotate-right"></i>
        Storage
      </button>
    </div>
    <div class="button-container">
      <button type="button" @click="handleLogout" class="button">
        <i class="fa-solid fa-right-from-bracket"></i>
        Logout
      </button>
      <button type="button" @click="saveSettings" class="button">
        <i class="fa-regular fa-floppy-disk"></i>
        Save changes
      </button>
    </div>
  </form>
</template>

<script>
import {useInitializeStore} from "@/stores/initialize";
import {useVideoStore} from "@/stores/video";
import Toast from 'primevue/toast';
import {useAuthStore} from "@/stores/authentication";

export default {
  name: 'SettingsPage',
  components: {
    Toast
  },
  data() {
    return {
      settings: {
        motion_threshold: 0,
        roi_motion_threshold: 0,
        recording_extension: 0,
        max_recording_duration: 0,
        max_disk_usage_in_gb: 0,
      }
    }
  },
  async created() {
    this.settings = useInitializeStore().getSettings();
  },
  methods: {
    handleImageRegion() {
      this.$router.push('/settings/image-region')
    },
    async saveSettings() {
      try {
        await this.$api.patch('/api/user/settings/' + this.settings.id, this.settings)
        this.$router.push('/calendar');
        this.$toast.add({ severity: 'success', summary: 'Success', detail: 'Successfully saved settings.', life: 2000 });
      } catch (error) {
        console.error('Failed to save settings:', error)
      }
    },
    async handleLogout() {
      await useAuthStore().clearAuthData();
      await this.$api.post('/api/logout')
      this.$router.push('/');
      this.$toast.add({ severity: 'success', summary: 'Success', detail: 'Successfully logged out.', life: 2000 });
    },
    resetLocalStorage() {
      useVideoStore().resetStore();
      useInitializeStore().resetStore()
      this.$toast.add({ severity: 'success', summary: 'Success', detail: 'Successfully reset storage.', life: 2000 });
    }
  }
}
</script>

<style scoped>
.settings-form {
  max-width: 100%;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 0 16px;
  box-sizing: border-box;
}

.form-row {
  display: flex;
  gap: 16px;
  width: 100%;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

label {
  font-size: 16px;
  font-weight: 500;
}

input {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  background: white;
  box-sizing: border-box;
  color: #666;
}

input::placeholder {
  color: #666;
}

.button-container {
  display: flex;
  gap: 16px;
}

.action-button {
  flex: 1;
  padding: 10px;
  font-size: 14px;
}

.button {
  flex: 1;
  padding: 10px;
  border: 1px solid #444;
  border-radius: 4px;
  font-size: 18px;
  cursor: pointer;
  text-align: center;
  background-color: #1e1e1e;
  transition: color 0.3s;
}

.button:hover {
  color: var(--p-primary-color);
}
</style>