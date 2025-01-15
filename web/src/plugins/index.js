/**
 * plugins/index.js
 *
 * Automatically included in `./src/main.js`
 */

// Plugins
import apiClient from './axios.js';
import { createPinia } from 'pinia'
import router from "@/router/index.js";
export function registerPlugins (app) {
  app
    .use(router)
    .use(createPinia())
    .use(apiClient);
}
