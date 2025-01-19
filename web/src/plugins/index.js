// import { createPinia } from 'pinia';
import router from '@/router/index.js';
import axiosPlugin from './axios.js';
import { pinia } from './pinia.js';

export function registerPlugins(app) {
  app
      .use(pinia)
      .use(router)
      .use(axiosPlugin);
}
