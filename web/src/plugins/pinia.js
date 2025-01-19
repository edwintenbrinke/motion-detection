import {createPinia} from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { apiClient } from "@/plugins/axios.js";

const pinia = createPinia();
pinia.use(({ store }) => {
    store.$api = apiClient; // Inject the actual Axios instance
});
pinia.use(piniaPluginPersistedstate)

export { pinia };
