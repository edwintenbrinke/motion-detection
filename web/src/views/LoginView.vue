<template>
  <div class="login-container">
    <form @submit.prevent="handleSubmit">
      <h2>Inloggen</h2>

      <div class="form-group">
        <label for="username">Gebruikersnaam</label>
        <input
            type="text"
            id="username"
            v-model="username"
            placeholder="Je gebruikersnaam"
            required
            ref="usernameInput"
        />
      </div>

      <div class="form-group">
        <label for="password">Wachtwoord</label>
        <input
            type="password"
            id="password"
            v-model="password"
            placeholder="Je wachtwoord"
            required
        />
      </div>

      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
      </div>

      <div class="button-container">
        <button type="submit" class="submit-button">Inloggen</button>
        <button
            type="button"
            @click="authenticateWithFingerprint"
            class="fingerprint-button"
            :disabled="!bioAuthAvailable"
        >
          <i class="pi pi-verified"></i>
        </button>
      </div>
    </form>
  </div>
</template>

<script>
import { Preferences } from '@capacitor/preferences';
import { api } from '@/api';
import { useInitializeStore } from '@/stores/initialize';
import { useAuthStore } from '@/stores/authentication';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

export default {
  name: 'LoginForm',
  data() {
    return {
      username: '',
      password: '',
      errorMessage: '',
      bioAuthAvailable: false
    };
  },
  async mounted() {
    // Check if biometric authentication is available
    try {
      const checkResult = await BiometricAuth.checkBiometry();
      this.bioAuthAvailable = checkResult.isAvailable;

      // Check if token is valid and if user has previously logged in
      const authStore = useAuthStore();
      const tokenValid = await authStore.isTokenValid()
      const { value: hasLoggedIn } = await Preferences.get({ key: 'hasLoggedInWithCredentials' });

      // If user has logged in before and token is valid, try auto-authenticating with biometrics
      if (tokenValid && hasLoggedIn === 'true' && this.bioAuthAvailable) {
        await this.authenticateWithFingerprint();
      }
    } catch (error) {
      console.error('Error checking biometry:', error);
      this.bioAuthAvailable = false;
    }

    // Focus on username field
    await this.$nextTick(() => {
      this.$refs.usernameInput?.focus();
    });
  },
  methods: {
    async authenticateWithFingerprint() {
      try {

        const authStore = useAuthStore();
        const authenticated = await authStore.authenticateWithBiometrics()

        if (authenticated) {
          // Verify the token is still valid (not expired)
          const isValid = await authStore.isTokenValid();

          if (isValid) {
            // Set app as active and mark biometric as verified
            await authStore.setAppActive();
            await authStore.setBiometricVerified(true);

            // Initialize app data and navigate
            const initStore = useInitializeStore();
            await initStore.getInitializingInfo(true);
            await this.goToDestination();
          } else {
            this.errorMessage = 'Je sessie is verlopen. Log opnieuw in met je wachtwoord.';
          }
        } else {
          this.errorMessage = 'Ontgrendelen is mislukt. Probeer het opnieuw of gebruik je wachtwoord.';
        }
      } catch (error) {
        console.error('Biometric auth error:', error);
        this.errorMessage = 'Ontgrendelen met vingerafdruk is niet beschikbaar. Gebruik je wachtwoord.';
      }
    },

    async handleSubmit() {
      const initStore = useInitializeStore();
      try {
        this.errorMessage = '';
        const { token, refresh_token } = await api.auth.login({
          username: this.username,
          password: this.password,
        });

        // The expiry comes from the token itself; the 60 is only a fallback.
        const authStore = useAuthStore();
        await authStore.saveAuthToken(token, refresh_token, 60);

        // Set app as active and mark authentication state
        await authStore.setAppActive();
        await authStore.setBiometricVerified(true);

        // Store that the user has logged in with credentials at least once
        await Preferences.set({
          key: 'hasLoggedInWithCredentials',
          value: 'true',
        });

        await initStore.getInitializingInfo(true);
        await this.goToDestination();
      } catch (error) {
        this.errorMessage = error?.status === 401
          ? 'Onjuiste gebruikersnaam of wachtwoord.'
          : (error?.message ?? 'Er ging iets mis. Probeer het later opnieuw.');
        console.error('Login failed:', error?.message);
      }
    },

    /**
     * After unlocking, go where the user was headed -- a re-lock or a notification deep
     * link parks the route on the auth store -- and otherwise to the feed.
     */
    async goToDestination() {
      const target = useAuthStore().takePendingRoute() ?? '/events';
      await this.$router.replace(target);
    },
  },
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  color: white;
}

form {
  padding: 2rem;
  max-width: 400px;
  width: 100%;
}

h2 {
  text-align: center;
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
  box-sizing: border-box;
}

label {
  display: block;
  margin-bottom: 0.5rem;
}

input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #333;
  border-radius: 4px;
  background: #2c2c2c;
  color: white;
  box-sizing: border-box;
}

input:focus {
  outline: none;
  border-color: #555;
}

.button-container {
  display: flex;
  gap: 10px;
  margin-top: 1rem;
}

.submit-button {
  flex: 1;
  padding: 0.75rem;
  border: none;
  border-radius: 4px;
  background-color: #555;
  color: white;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.3s;
}

.fingerprint-button {
  width: 50px;
  height: 50px;
  border: none;
  border-radius: 4px;
  background-color: #2c2c2c;
  color: white;
  font-size: 1.5rem;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: background-color 0.3s;
}

.fingerprint-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-button:hover, .fingerprint-button:hover:not(:disabled) {
  background-color: #444;
}

.fingerprint-icon {
  font-size: 1.5rem;
}

.error-message {
  margin-bottom: 1rem;
  color: #ff4d4d; /* Red color for errors */
  text-align: center;
}
</style>