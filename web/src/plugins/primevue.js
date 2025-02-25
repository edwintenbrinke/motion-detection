import PrimeVue from 'primevue/config';

import Aura from '@primeuix/themes/aura';

import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Badge from 'primevue/badge';

export default {
    install(app) {
        app.use(PrimeVue, {
            theme: {
                ripple: true,
                preset: Aura,
                options: {
                    darkModeSelector: '.dark-mode'
                }
            }
        });

        // Register commonly used components globally
        app.component('Button', Button);
        app.component('Dialog', Dialog);
        app.component('Badge', Badge);
    }
};
