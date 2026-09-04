// The VAPID public key is passed as a base64url string, but pushManager.subscribe requires a Uint8Array, so convert it
const urlBase64ToUint8Array = (base64Url: string): Uint8Array<ArrayBuffer> => {
	const base64 = base64Url.replaceAll("-", "+").replaceAll("_", "/");
	const binary = atob(base64);
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (const [index, char] of [...binary].entries()) {
		bytes[index] = char.codePointAt(0) ?? 0;
	}
	return bytes;
};

const isPushSupported = (): boolean =>
	"serviceWorker" in navigator && "PushManager" in window;

const DEFAULT_SERVICE_WORKER_URL = "/service-worker.js";

export type PushRegistrationErrorReason =
	| "unsupported"
	| "permission-denied"
	| "subscribe-failed";

export type PushRegistrationErrorDetail = {
	reason: PushRegistrationErrorReason;
	error?: unknown;
};

// NOTE: A bare 'error' name would bubble up to window because of bubbles: true, feeding a CustomEvent that is not an
//   ErrorEvent into monitoring tools that collect errors via window.addEventListener('error'). Prefix the tag name as a namespace
export const PUSH_REGISTRATION_ERROR_EVENT = "push-registration:error";

export class PushRegistration extends HTMLElement {
	static formAssociated = true;

	private internals = this.attachInternals();
	private submitting = false;
	// NOTE: By the time disconnectedCallback runs, internals.form has already reverted to null, so the form to remove
	//   the listener from cannot be reached. Keep a reference to the form captured in connectedCallback
	private listeningForm: HTMLFormElement | null = null;

	connectedCallback(): void {
		this.hidden = true;
		this.listeningForm = this.internals.form;
		this.listeningForm?.addEventListener("submit", this.handleSubmit);

		// NOTE: At connectedCallback time the submit button that follows is not in the DOM yet, so disable it after parsing completes
		if (!isPushSupported()) {
			requestAnimationFrame(() => this.disableSubmitButton());
		}
	}

	disconnectedCallback(): void {
		this.listeningForm?.removeEventListener("submit", this.handleSubmit);
		this.listeningForm = null;
	}

	get vapidPublicKey(): string {
		const value = this.getAttribute("vapid-public-key");
		if (!value) throw new Error("vapid-public-key attribute is missing");
		return value;
	}

	get serviceWorkerUrl(): string {
		return (
			this.getAttribute("service-worker-url") ?? DEFAULT_SERVICE_WORKER_URL
		);
	}

	private disableSubmitButton(): void {
		const button = this.internals.form?.querySelector<HTMLButtonElement>(
			'button[type="submit"]',
		);
		if (button) button.disabled = true;
	}

	// NOTE: Wording shown to users is the application's responsibility, so this element only reports the reason code
	private dispatchError(
		reason: PushRegistrationErrorReason,
		error?: unknown,
	): void {
		this.dispatchEvent(
			new CustomEvent<PushRegistrationErrorDetail>(
				PUSH_REGISTRATION_ERROR_EVENT,
				{
					bubbles: true,
					detail: { reason, error },
				},
			),
		);
	}

	private handleSubmit = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault();
		if (this.submitting) return;

		if (!isPushSupported()) {
			this.disableSubmitButton();
			this.dispatchError("unsupported");
			return;
		}

		this.submitting = true;
		let subscription: PushSubscription | undefined;
		try {
			// NOTE: If the service worker script itself is HTTP-cached long term, updates can no longer be detected,
			//   so updateViaCache: 'none' makes the browser bypass the HTTP cache for the script
			const registration = await navigator.serviceWorker.register(
				this.serviceWorkerUrl,
				{ updateViaCache: "none" },
			);

			const permission = await Notification.requestPermission();
			if (permission !== "granted") {
				this.dispatchError("permission-denied");
				return;
			}

			subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(this.vapidPublicKey),
			});

			// NOTE: toJSON() returns { endpoint, expirationTime, keys: { p256dh, auth } }. The server side assumes this shape
			this.internals.setFormValue(JSON.stringify(subscription.toJSON()));
			this.internals.form?.submit();
		} catch (error) {
			try {
				await subscription?.unsubscribe();
			} catch {
				// NOTE: Ignore cleanup failures. What the user should hear about is the original registration error
			}
			this.dispatchError("subscribe-failed", error);
		} finally {
			this.submitting = false;
		}
	};
}

declare global {
	interface Window {
		PushRegistration: typeof PushRegistration;
	}

	// NOTE: HTMLElementEventMap / DocumentEventMap / WindowEventMap all extend GlobalEventHandlersEventMap, so
	//   extending it in this single place also types document.addEventListener at the bubble target
	interface GlobalEventHandlersEventMap {
		"push-registration:error": CustomEvent<PushRegistrationErrorDetail>;
	}

	interface HTMLElementTagNameMap {
		"push-registration": PushRegistration;
	}
}

if (!window.customElements.get("push-registration")) {
	window.PushRegistration = PushRegistration;
	window.customElements.define("push-registration", PushRegistration);
}
