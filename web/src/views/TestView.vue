<script setup>
import { ref, onMounted } from 'vue';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

const isAuthenticated = ref(false);
const errorMessage = ref('');

const authenticate = async () => {
  try {
    // Check if biometrics are available first
    const checkResult = await BiometricAuth.checkBiometry();

    if (!checkResult.isAvailable) {
      errorMessage.value = 'Biometric authentication is not available on this device';
      return;
    }

    // Authenticate the user
    const result = await BiometricAuth.authenticate({
      reason: 'Please authenticate',
      cancelTitle: 'Cancel',
      allowDeviceCredential: true,
      iosFallbackTitle: 'Use passcode',
      android: {
        title: 'Biometric login',
        subtitle: 'Log in using biometric authentication',
        confirmationRequired: false
      }
    });
  } catch (error) {
    errorMessage.value = error.message || 'Authentication failed';
    isAuthenticated.value = false;
  }
};

onMounted(() => {
  authenticate();
});
</script>

<template>
  <div>
    <p v-if="isAuthenticated">Authentication successful!</p>
    <p v-else-if="errorMessage">Authentication failed: {{ errorMessage }}</p>
    <p v-else>Authenticating...</p>
    <button @click="authenticate">Retry</button>
  </div>
</template>