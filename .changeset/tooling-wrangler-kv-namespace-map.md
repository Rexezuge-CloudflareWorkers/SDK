---
'@rexezuge/tooling': patch
---

`provisionWranglerResources()` takes the KV binding → namespace map as an optional argument, so a consumer whose namespaces are named differently from the derived `<worker>-<binding>` convention can provision them instead of forking the script.

A repo whose KV namespace is `record-provider-record-cache` under the `RECORD_CACHE` binding could express neither fact before this: the binding is not `CACHE`, and the namespace is not the derived `records-provider-record_cache`. Running the kit's provisioning on it added a stray `CACHE` binding, created a fresh empty namespace for it, and left the existing namespace — the one holding the data — unread. A deploy that looks configured and serves 404s.

The map threads through `getRequiredKvBindings`, `ensureRequiredKvBindings`, `getKVNamespaceName` and `ensureKVNamespace`, each defaulting to the unchanged `DEFAULT_KV_NAMESPACE_NAMES`, so every existing caller — the kit's own `prepare-wrangler-config` included — behaves exactly as before.

Also: `prepareConfigFile()` and `ensureMinimumConfigVersion()` name the template and config they actually used, displayed relative to the working directory, instead of the hardcoded `apps/api/wrangler.template.jsonc`, which is only the right answer for a consumer that took the default path.
