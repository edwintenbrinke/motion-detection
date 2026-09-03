import AppLayout from '@/layouts/AppLayout.vue';

/**
 * Resolves `meta.layout` to a component.
 *
 * The fallback used to import 'AppLayoutDefault.vue', which does not exist -- so a route
 * with a bad layout threw twice and rendered nothing at all. The fallback is now a real,
 * statically imported layout.
 */
export async function loadLayoutMiddleware(route) {
    const layout = route.meta.layout;

    if (!layout) {
        route.meta.layoutComponent = AppLayout;
        return;
    }

    try {
        const module = await import(`@/layouts/${layout}.vue`);
        route.meta.layoutComponent = module.default;
    } catch (error) {
        console.error(`Unknown layout "${layout}", falling back to AppLayout:`, error?.message);
        route.meta.layoutComponent = AppLayout;
    }
}
