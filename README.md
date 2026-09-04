# &lt;push-registration&gt; element

`<push-registration>` is a form-associated custom element that intercepts the submit event of its parent form and, in order, registers a Service Worker, requests Notification permission, subscribes to Web Push, and submits the subscription information as a form value.

## Installation

```
npm install --save @aki77/push-registration-element
```

## Usage

```js
import '@aki77/push-registration-element'
```

```html
<form action="/push_subscriptions" method="post">
  <push-registration name="push_subscription" vapid-public-key="BEl62iUYgUivxIkv69yViEuiBIa40HI0DLLuxazjB..."></push-registration>
  <button type="submit">Enable push notifications</button>
</form>
```

## Attributes

| Attribute | Description |
| --- | --- |
| `name` | The key used for the form value that carries the subscription JSON. |
| `vapid-public-key` | **Required.** The VAPID public key (P-256, base64url-encoded). The `vapidPublicKey` getter throws if this attribute is missing. |
| `service-worker-url` | The URL of the Service Worker script to register. Defaults to `/service-worker.js` when omitted. |

## Submitted value

On successful subscription, the element sets its form value to the JSON string form of [`PushSubscription.toJSON()`](https://developer.mozilla.org/en-US/docs/Web/API/PushSubscription/toJSON), submitted under the `name` attribute's key:

```json
{"endpoint": "...", "expirationTime": null, "keys": {"p256dh": "...", "auth": "..."}}
```

## Events

The element dispatches a `push-registration:error` event (`bubbles: true`) when it cannot complete the subscription flow:

```ts
type PushRegistrationErrorDetail = { reason: PushRegistrationErrorReason; error?: unknown }
```

`reason` is one of:

- `unsupported` — the browser does not support Service Worker or the Push API.
- `permission-denied` — the user denied (or dismissed) the notification permission prompt.
- `subscribe-failed` — Service Worker registration or `pushManager.subscribe()` failed; the original error is available as `error`.

The element only notifies the reason code; presenting user-facing copy for each reason is the responsibility of the host application.

## Behavior notes

- On unsupported browsers, the element disables the parent form's `button[type="submit"]` on the next animation frame after `connectedCallback` runs (the button is not guaranteed to exist in the DOM yet at `connectedCallback` time).
- On success, the element calls `form.submit()` directly, which bypasses the form's `submit` event handlers and constraint validation. Frameworks like Turbo or Rails UJS do not intercept this call, so the result is a full page navigation.
- The element registers the Service Worker with `updateViaCache: 'none'`, so the script itself ignores the browser's HTTP cache.

## TypeScript

Importing the package augments the global `HTMLElementTagNameMap`, so `document.querySelector('push-registration')` is typed as `PushRegistration` without any extra work.

```ts
import { PUSH_REGISTRATION_ERROR_EVENT, type PushRegistrationErrorReason } from '@aki77/push-registration-element'

document.addEventListener(PUSH_REGISTRATION_ERROR_EVENT, (event) => {
  event.detail.reason
})
```

## Browser support

Safari versions below 16.4 do not support `ElementInternals`. To support those browsers, import [`element-internals-polyfill`](https://www.npmjs.com/package/element-internals-polyfill) **before** importing this package.

## License

MIT
