import './assets/main.css'
import 'primeicons/primeicons.css'
import '@fontsource/inter'; // Default weight (400)
import '@fontsource/inter/500.css'; // Optional weights
import '@fontsource/inter/600.css';

import {registerPlugins} from "@/plugins/index.js";
import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)

registerPlugins(app)

app.mount('#app')
