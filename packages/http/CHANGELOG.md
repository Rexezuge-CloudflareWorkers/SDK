# @rexezuge/http

## 1.0.8

### Minor Changes

- Initial release: the family's HTTP layer, converged from the four copies each
  of `rateLimit`, `securityHeaders`, `accessAuth`, `ErrorMapper` and
  `routeBase` had in Durable-DAV, Durable-DAV-Router, Edge-Git and Edge-Sonic.
  Edge-Sonic's variants were the ones that had solved the defects the other three
  still carried, so those are the base. This is the one package in the kit that
  depends on `hono`/`chanfana`; the other eight stay framework-free so a repo
  can adopt the core without adopting a web framework.
