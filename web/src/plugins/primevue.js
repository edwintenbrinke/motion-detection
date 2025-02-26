import PrimeVue from 'primevue/config';

import Aura from '@primeuix/themes/aura';

import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Badge from 'primevue/badge';
import ScrollTop from 'primevue/scrolltop';
import Toast from 'primevue/toast';
import ToastService from 'primevue/toastservice';

export default {
    install(app) {
        app.use(PrimeVue, {
            theme: {
                preset: Aura,
                options: {
                    darkModeSelector: '.dark-mode'
                }
            }
        });
        app.use(ToastService);

        app.component('Button', Button);
        app.component('Dialog', Dialog);
        app.component('Badge', Badge);
        app.component('ScrollTop', ScrollTop);
        app.component('Toast', Toast);
    }
};
