<template>
  <div class="login-container">
    <form @submit.prevent="handleSubmit">
      <h2>Login</h2>

      <div class="form-group">
        <label for="username">Username</label>
        <input
            type="text"
            id="username"
            v-model="username"
            placeholder="Enter your username"
            required
            ref="usernameInput"
        />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input
            type="password"
            id="password"
            v-model="password"
            placeholder="Enter your password"
            required
        />
      </div>

      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
      </div>

      <div class="button-container">
        <button type="submit" class="submit-button">Login</button>
        <button
            type="button"
            @click="authenticateWithFingerprint"
            class="fingerprint-button"
            :disabled="!bioAuthAvailable"
        >
          <i class="fa-solid fa-fingerprint"></i>
        </button>
      </div>
    </form>
  </div>
</template>

<script>
import { Preferences } from '@capacitor/preferences';
import { useInitializeStore } from '@/stores/initialize';
import { useAuthStore } from '@/stores/authentication';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';

export default {
  name: 'LoginForm',
  data() {
    return {
      username: 'admin',
      password: 'admin',
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
            this.$router.push('/calendar');
          } else {
            // Token expired, show error
            this.errorMessage = 'Your session has expired. Please log in with your credentials.';
          }
        } else {
          this.errorMessage = 'Biometric authentication failed. Please try again or use credentials.';
        }
      } catch (error) {
        console.error('Biometric auth error:', error);
        this.errorMessage = 'Biometric authentication is not available. Please use your credentials.';
      }
    },

    async handleSubmit() {
      const initStore = useInitializeStore();
      try {
        this.errorMessage = '';
        const response = await this.$api.post('/api/login', {
          username: this.username,
          password: this.password,
        });

        // Grab the token from the response
        const token = response.data.token;

        // Save the token with expiry information
        const authStore = useAuthStore();
        await authStore.saveAuthToken(token, 60); // 60 minutes expiry

        // Set app as active and mark authentication state
        await authStore.setAppActive();
        await authStore.setBiometricVerified(true);

        // Store that the user has logged in with credentials at least once
        await Preferences.set({
          key: 'hasLoggedInWithCredentials',
          value: 'true',
        });

        // Call the Pinia store function
        await initStore.getInitializingInfo(true);

        // Redirect to the calendar page
        this.$router.push('/calendar');
      } catch (error) {
        // Handle errors
        if (error.response && error.response.status === 401) {
          this.errorMessage = 'Invalid username or password. Please try again.';
        } else {
          this.errorMessage = 'An error occurred. Please try again later.';
        }
        console.error('Login failed:', error.response?.data || error.message);
      }
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