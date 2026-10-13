/**
 * Compare two strings without leaking where they differ.
 *
 * ## Why this is in the kit
 *
 * A naive `a === b` returns at the first differing character, so the time it
 * takes is a function of how many leading characters match. Against a remote
 * caller that is an oracle: an attacker submitting guesses measures the response
 * and recovers a stored credential or a token one character at a time, at the
 * speed of the network round trip rather than the speed of a brute force.
 *
 * Three repos carried their own copy, each of which was correct, and the
 * duplication is the defect here rather than any one implementation: three copies
 * of a security primitive is three places for the next person to add an early
 * return "just for the length check", and that early return reintroduces exactly
 * the leak the function exists to close.
 *
 * ## What this is and is not
 *
 * **Not a password hash.** This compares two values one already holds; it does
 * not derive, salt, or slow anything. A login still needs a KDF (PBKDF2, scrypt,
 * Argon2) with a per-user salt, and a deployment that treats this as its password
 * storage has not implemented authentication — it has implemented a fast equality
 * check and nothing else.
 *
 * **Not a substitute for a KDF's own compare.** A KDF that already takes
 * constant time internally should be asked, not this. It is for the cases where
 * the caller holds both plaintexts: a presented Subsonic token against the one
 * derived from a stored password, or two configuration secrets.
 */
function timingSafeEqualStrings(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);

  // A length difference is not secret — the ciphertext and the plaintext it is
  // compared against are both fixed-format, and a caller comparing two user
  // supplied values of different lengths learns nothing useful from the answer.
  // So the length is returned early and the **content** comparison below is the
  // only thing that takes constant time.
  if (a.length !== b.length) return false;

  let difference = 0;
  let index = 0;
  for (const byte of a) {
    // Accumulated with `|=` rather than an early `return`: the loop always runs
    // to completion, so the wall clock does not depend on where the first
    // difference is. `^` is the XOR whose result is zero exactly when the bytes
    // match, and `0 | 1` is the OR that remembers one.
    difference |= byte ^ b[index];
    index += 1;
  }
  return difference === 0;
}

export { timingSafeEqualStrings };
