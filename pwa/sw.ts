import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { revision?: string; url: string }>;
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

const navigationStrategy = new NetworkFirst({
  cacheName: "draw-lab-navigation-v1",
  networkTimeoutSeconds: 3,
});
const appShellHandler = createHandlerBoundToURL("/index.html");

const navigationHandler = async ({ event }: { event: FetchEvent }): Promise<Response> => {
  try {
    const response = await navigationStrategy.handle({ event });
    if (response) {
      return response;
    }
  } catch {
    // Fall through to the precached app shell when navigation is offline.
  }

  return appShellHandler({ event });
};

registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/assets\//, /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/draw-lab-icon/],
  }),
);
