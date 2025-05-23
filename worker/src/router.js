// worker/src/router.js
class Router {
    constructor() {
        this.routes = [];
    }

    add(method, path, handler) {
        this.routes.push({ method, path, handler });
    }

    get(path, handler) {
        this.add('GET', path, handler);
    }

    post(path, handler) {
        this.add('POST', path, handler);
    }

    delete(path, handler) {
        this.add('DELETE', path, handler);
    }

    async route(request, env, ctx) {
        const url = new URL(request.url);
        const method = request.method;

        for (const route of this.routes) {
            if (route.method === method && url.pathname.startsWith(route.path)) {
                return await route.handler(request, env, ctx);
            }
        }

        return null; // No route matched
    }
}

export default Router;
