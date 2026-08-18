/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
let coepCredentialless = false;
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
    self.addEventListener("message", (ev) => {
        if (!ev.data) return;
        else if (ev.data.type === "deregister") {
            self.registration.unregister().then(() => self.clients.matchAll()).then(clients => {
                clients.forEach((client) => client.navigate(client.url));
            });
        } else if (ev.data.type === "coepCredentialless") {
            coepCredentialless = ev.data.value;
        }
    });
    self.addEventListener("fetch", function(event) {
        const r = event.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") return;
        const request = (coepCredentialless && r.mode === "no-cors") ? new Request(r, { credentials: "omit" }) : r;
        event.respondWith(
            fetch(request).then((response) => {
                if (response.status === 0) return response;
                const newHeaders = new Headers(response.headers);
                newHeaders.set("Cross-Origin-Embedder-Policy", coepCredentialless ? "credentialless" : "require-corp");
                newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
                return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
            }).catch(() => fetch(r))
        );
    });
} else {
    (async () => {
        const registration = await navigator.serviceWorker.register(document.currentScript.src).catch(console.error);
        if (registration && !navigator.serviceWorker.controller) location.reload();
    })();
}
