/**
 * plugins/index.js
 *
 * Automatically included in `./src/main.js`
 */

// Plugins
import { createPinia } from 'pinia'
import router from "@/router/index.js";
import apiClient from './axios.js';
export function registerPlugins (app) {
  app
      .use(createPinia())
      .use(router)
      .use(apiClient);
}
