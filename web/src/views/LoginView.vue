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
      <button type="submit" class="submit-button">Login</button>
    </form>
  </div>
</template>
<script>
export default {
  name: 'LoginForm',
  meta: {
    layout: 'login'
  },
  data() {
    return {
      username: import.meta.env.VITE_API_BASE_URL,
      password: ''
    };
  },
  methods: {
    async handleSubmit() {
      try {
        const response = await this.$api.post('/api/login', {
          username: this.username,
          password: this.password
        });
        this.$router.push('/calendar')
        // console.log('Login successful:', response.data);
        // Handle successful login (e.g., redirect, save token, etc.)
      } catch (error) {
        console.error('Login failed:', error.response?.data || error.message);
        // Handle login failure (e.g., show error message)
      }
    }
  }
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
  box-sizing: border-box; /* Add this line */
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
</style>
