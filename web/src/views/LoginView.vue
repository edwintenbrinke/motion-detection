<template>
  <div class="login-container">
    <form @submit.prevent="handleSubmit">
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

      <button type="submit" class="submit-button">Login</button>
    </form>
  </div>
</template>

<script>
import { Preferences } from '@capacitor/preferences';
import { useInitializeStore } from '@/stores/initialize'; // Import the Pinia store

export default {
  name: 'LoginForm',
  data() {
    return {
      username: 'admin',
      password: 'admin',
      errorMessage: '', // State to hold error message
    };
  },
  mounted() {
    this.$refs.usernameInput.focus(); // Automatically focus on username input
  },
  methods: {
    async handleSubmit() {
      const initStore = useInitializeStore(); // Access the store
      try {
        this.errorMessage = '';
        const response = await this.$api.post('/api/login', {
          username: this.username,
          password: this.password,
        });

        // Grab the token from the response
        const token = response.data.token;

        // Save the token securely using Capacitor Preferences
        await Preferences.set({
          key: 'authToken',
          value: token,
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

h1 {
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

.submit-button {
  width: 100%;
  padding: 0.75rem;
  border: none;
  border-radius: 4px;
  background-color: #555;
  color: white;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.3s;
}

.submit-button:hover {
  background-color: #2c2c2c;
}

.error-message {
  margin-bottom: 1rem;
  color: #ff4d4d; /* Red color for errors */
  text-align: center;
}
</style>
