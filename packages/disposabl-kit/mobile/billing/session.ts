import type Purchases from "react-native-purchases";

type SDK = typeof Purchases;

/** Serializes identity changes with purchases. Never creates an anonymous customer. */
export class BillingSession {
  private generation = 0;
  private owner: string | null = null;
  private leases = new Set<number>();
  private transaction = false;
  private queue: Promise<unknown> = Promise.resolve();
  private sdk: SDK | undefined;
  private configuredKey: string | undefined;
  private configuredOwner: string | undefined;

  constructor(private load: () => Promise<SDK>) {}

  select(owner: string | null) {
    this.owner = owner;
    this.leases.clear();
    const generation = ++this.generation;
    if (owner) this.leases.add(generation);
    return generation;
  }

  acquire(owner: string) {
    if (this.owner !== owner) {
      this.owner = owner;
      this.leases.clear();
    }
    const generation = ++this.generation;
    this.leases.add(generation);
    return generation;
  }

  current(owner: string, generation: number) {
    return this.owner === owner && this.leases.has(generation);
  }

  beginTransaction() {
    if (this.transaction) return false;
    this.transaction = true;
    return true;
  }

  endTransaction() {
    this.transaction = false;
  }

  release(owner: string, generation: number) {
    if (this.current(owner, generation)) {
      this.leases.delete(generation);
      if (!this.leases.size) this.owner = null;
    }
  }

  run<T>(
    owner: string,
    generation: number,
    key: string,
    work: (sdk: SDK) => Promise<T>,
  ) {
    const assertCurrent = () => {
      if (!owner || !this.current(owner, generation))
        throw new Error("Your account changed. Please try again.");
    };
    const result = this.queue
      .catch(() => undefined)
      .then(async () => {
        assertCurrent();
        if (!key) throw new Error("Store purchases are not configured.");
        const sdk = (this.sdk ??= await this.load());
        assertCurrent();
        if (!this.configuredKey) {
          sdk.configure({ apiKey: key, appUserID: owner });
          this.configuredKey = key;
          this.configuredOwner = owner;
        } else if (this.configuredKey !== key) {
          throw new Error("Store configuration changed. Restart the app.");
        } else if (this.configuredOwner !== owner) {
          // A failed response can still have changed native identity.
          this.configuredOwner = undefined;
          await sdk.logIn(owner);
          this.configuredOwner = owner;
        }
        assertCurrent();
        const value = await work(sdk);
        assertCurrent();
        return value;
      });
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export const billingSession = new BillingSession(
  async () => (await import("react-native-purchases")).default,
);
