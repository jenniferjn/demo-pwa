import { precacheAndRoute } from 'workbox-precaching';
import { cacheNames, clientsClaim } from 'workbox-core';
import { registerRoute, setCatchHandler, setDefaultHandler } from 'workbox-routing';
// import { StrategyHandler } from 'workbox-strategies';
import { CacheFirst, NetworkFirst, NetworkOnly, Strategy } from 'workbox-strategies';
// import { cache, skipWaiting } from 'workbox-sw';
import {BackgroundSyncPlugin, Queue} from 'workbox-background-sync';
import {ExpirationPlugin} from 'workbox-expiration';
import {CacheableResponsePlugin} from 'workbox-cacheable-response';


self.skipWaiting();

const queue = new Queue('myQueueName');

const bgSyncPlugin = new BackgroundSyncPlugin('myQueue', {
  maxRetentionTime: 24 * 60, // Retry for max of 24 Hours (specified in minutes)
});

const statusPlugin = {
  fetchDidSucceed: ({response}) => {
    if (response.status >= 500) {
      // Throwing anything here will trigger fetchDidFail.
      console.log('satu')
      throw new Error('Server error.');
    }
    // If it's not 5xx, use the response as-is.
    console.log('response.status success:', response.status)
    return response;
  },
  fetchDidFail: ({error}) => {
    console.log('response fail:', error)
    throw new Error(error);
  },
};

const data = {
  race: false,
  debug: false,
  credentials: 'same-origin',
  networkTimeoutSeconds: 0,
  fallback: 'index.html'
};

const cacheName = cacheNames.runtime;

const buildStrategy = () => {
  if (data.race) {
    class CacheNetworkRace extends Strategy {
      async _handle(request, handler) {
        const fetchAndCachePutDone = handler.fetchAndCachePut(request);
        const cacheMatchDone = handler.cacheMatch(request);

        return new Promise((resolve, reject) => {
          fetchAndCachePutDone.then(resolve).catch((e) => {
            if (data.debug)
              console.log(`Cannot fetch resource: ${request.url}`, e);
          });
          cacheMatchDone.then(response => response && resolve(response));

          // Reject if both network and cache error or find no response.
          Promise.allSettled([fetchAndCachePutDone, cacheMatchDone]).then((results) => {
            const [fetchAndCachePutResult, cacheMatchResult] = results;
            if (fetchAndCachePutResult.status === 'rejected' && !cacheMatchResult.value)
              reject(fetchAndCachePutResult.reason);
          });
        });
      }
    }
    return new CacheNetworkRace();
  }
  else {
    if (data.networkTimeoutSeconds > 0)
      return new NetworkFirst({ cacheName, networkTimeoutSeconds: data.networkTimeoutSeconds });
    else
      return new NetworkFirst({ cacheName });
  }
};

const manifest = self.__WB_MANIFEST;

const cacheEntries = [];

const manifestURLs = manifest.map(
  (entry) => {
    const url = new URL(entry.url, self.location);
    cacheEntries.push(new Request(url.href, {
      credentials: data.credentials
    }));
    return url.href;
  }
);

precacheAndRoute(manifest);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) => {
      return cache.addAll(cacheEntries);
    })
  );
});

self.addEventListener('activate', (event) => {
  // Clean up outdated runtime cache
  event.waitUntil(
    caches.open(cacheName).then((cache) => {
      // Clean up those that are not listed in manifestURLs
      cache.keys().then((keys) => {
        keys.forEach((request) => {
          if (data.debug)
            console.log(`Checking cache entry to be removed: ${request.url}`);
          if (!manifestURLs.includes(request.url)) {
            cache.delete(request).then((deleted) => {
              if (data.debug) {
                if (deleted)
                  console.log(`Precached data removed: ${request.url || request}`);
                else
                  console.log(`No precache found: ${request.url || request}`);
              }
            });
          }
        });
      });
    })
  );
});

self.addEventListener('fetch', event => {
  // Add in your own criteria here to return early if this
  // isn't a request that should use background sync.
  if (event.request.method !== 'POST') {
    return;
  }

  const bgSyncLogic = async () => {
    try {
      const response = await fetch(event.request.clone());
      return response;
    } catch (error) {
      await queue.pushRequest({request: event.request});
      return error;
    }
  };

  event.respondWith(bgSyncLogic());
});

// Create Broadcast Channel to send messages to the page
const broadcast = new BroadcastChannel('sw-update-channel');

self.addEventListener("sync", async (event) => {
  console.log("sync triggered")
  broadcast.postMessage({
    type: 'CRITICAL_SW_UPDATE',
    payload: {
      version: '1.0.1',
      details: 'This is a critical update. Please update your app.'
    }
   });
  // broadcast.postMessage({ type: 'MSG_ID', });
  // Check if the sync event is for the sync tag we are interested in.
  // if (event.tag !== "my-sync-tag") {
  //   return;
  // }

  // // Get the queue of pending requests.
  // const queue = new workbox.backgroundSync.Queue("my-sync-queue");

  // // Replay all of the pending requests.
  // await queue.replayRequests();
});

self.addEventListener("push", async (event) => {
  console.log('event:', event.data.text());
  console.log("push")

  broadcast.postMessage({
    type: 'CRITICAL_SW_UPDATE',
    payload: {
      version: '1.0.1',
      details: 'This is a critical update. Please update your app.'
    }
   });
});

registerRoute(
  ({ url }) => manifestURLs.includes(url.href),
  buildStrategy()
);

// Define your runtime caching strategy here
registerRoute(
  /^https:\/\/pokeapi.co\/api\/v2\/pokemon/,
  // new CacheFirst({
  //   cacheName: 'auth-user-cache',
  //   plugins: [
  //     new ExpirationPlugin({
  //       maxEntries: 10,
  //       maxAgeSeconds: 3, // 3 seconds for development, adjust for production
  //     }),
  //     new CacheableResponsePlugin({
  //       statuses: [0, 200],
  //     }),
  //   ],
  // })

  new NetworkOnly({
    plugins: [
      bgSyncPlugin,
      statusPlugin
    ],
  }),
  'GET'
);

setDefaultHandler(new NetworkOnly());

// Fallback to app-shell for document request
setCatchHandler(({ event }) => {
  switch (event.request.destination) {
    case 'document':
      return caches.match(data.fallback).then((r) => {
        return r ? Promise.resolve(r) : Promise.resolve(Response.error());
      });
    default:
      return Promise.resolve(Response.error());
  }
});
clientsClaim();