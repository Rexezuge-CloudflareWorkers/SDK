/**
 * The slice of an invocation's subrequest counter that the runtime layer needs.
 *
 * Structural rather than imported from `@rexezuge/shared`, because `runtime` is
 * a zero-dependency base layer by rule and `@rexezuge/shared` is above it. A
 * consumer that already holds a `SubrequestMeter` passes it here unchanged —
 * `charge(count?: number, kind?: SubrequestKind)` satisfies this — and one that
 * does not metering anything passes nothing.
 *
 * The kind is a plain `string` for the same reason: the runtime layer does not
 * get to decide the taxonomy, and narrowing it here would make the shared
 * counter's own `SubrequestKind` union an illegal argument at the call site.
 */
interface SubrequestMeterLike {
  charge(count?: number, kind?: string): void;
}

/**
 * A meter that counts nothing, for a deployment that does not meter.
 *
 * A distinct value rather than a shared mutable singleton: there is nothing to
 * share here, and a no-op object cannot be mutated by accident.
 */
const UNMETERED: SubrequestMeterLike = {
  charge: (): void => {
    // Deliberately empty.
  },
};

export { UNMETERED };
export type { SubrequestMeterLike };
