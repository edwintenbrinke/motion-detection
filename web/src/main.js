import './assets/main.css'
import "@fortawesome/fontawesome-free/css/all.css";
import "@fortawesome/fontawesome-free/js/all.js";

import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import {registerPlugins} from "@/plugins/index.js";

const app = createApp(App)


registerPlugins(app)

app.mount('#app')
