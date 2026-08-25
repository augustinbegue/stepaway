# stepaway

Helm chart for the [stepaway](https://stepaway.dev) backend: hand off a live
Claude Code session between machines via a k8s-backed runner pod.

This chart deploys the backend only (Deployment + Service + ServiceAccount +
namespace-scoped RBAC + a generated bearer-token Secret, optional Ingress).
Session ("runner") pods are created imperatively by the backend at runtime
from a server-owned pod template — there are no CRDs and no operator here.

## Install

```console
helm repo add stepaway https://stepaway.dev/charts
helm repo update
helm install stepaway stepaway/stepaway -n stepaway --create-namespace
```

After install, `helm install` prints (via `NOTES.txt`) the exact `kubectl`
command to read the generated bearer token, plus a `stepaway` CLI quickstart.

## Upgrade / token rotation

The bearer token is generated once on install and **preserved across
upgrades** (via `lookup()` against the existing Secret). To rotate it:

```console
helm upgrade stepaway stepaway/stepaway -n stepaway --reuse-values \
  --set auth.regenerateToken=true
```

Setting `auth.token` hard-sets the token instead of letting the chart
generate one. This is **not recommended** — the value ends up in your Helm
values/release history in plaintext. Prefer the generated token.

## RBAC

The backend's ServiceAccount is bound to a **namespace-scoped Role only**
(no ClusterRole): `pods` (get/list/watch/create/delete/patch), `pods/exec`
(create), `pods/log` (get), `persistentvolumeclaims`
(get/list/create/delete), `secrets` (get/create/patch/delete — used for the
per-session `stepaway-auth` env-carry secret and the per-build envspec
secrets), `batch/jobs` (get/list/watch/create/delete — devcontainer env-image
builds), `events` (create/patch). Sessions always live in the release
namespace, next to the backend.

## Governance (opt-in, all disabled by default)

A fresh install behaves like the v0.1 PoC: no quotas, no LimitRange, no
NetworkPolicy. Turn these on per-cluster as needed:

- `quotas.enabled` — `ResourceQuota` capping pod count, PVC count, and
  summed cpu/memory requests in the namespace.
- `limitRange.enabled` — `LimitRange` giving runner containers default
  request/limit values and a hard max, for pods that don't set their own.
- `networkPolicy.enabled` — two `NetworkPolicy` objects:
  1. **runner** (`app.kubernetes.io/name: stepaway-runner`): deny all
     ingress except from the backend pod; egress is open by default —
     restrict it with `networkPolicy.runnerEgress` (a list of egress rules
     passed through verbatim into `spec.egress`).
  2. **backend**: ingress open on port 8080 (it sits behind the
     Service/Ingress), egress open (needs the k8s API and DNS).

  **Warning**: NetworkPolicy enforcement depends on your CNI. Clusters
  running a non-enforcing CNI (e.g. plain flannel without a policy engine)
  will accept these objects but silently not enforce them. Verify
  enforcement (e.g. with a quick pod-to-pod test) before relying on this for
  session isolation.

## Devcontainer environments (registry component, opt-in)

With `registry.enabled=true` the chart adds an in-cluster OCI registry (the
`docker-registry` subchart from twuni, aliased to `registry`) and turns on the
devcontainer path: a session whose repo carries a `.devcontainer/` runs in an
image built from it (plus the
[stepaway feature](https://github.com/augustinbegue/stepaway/tree/main/feature)),
cached as `<registry.host>/stepaway-env:env-<hash>`. On a cache miss the
backend runs a `Job` from `builder.image` and the session waits in state
`building`.

```console
helm upgrade --install stepaway stepaway/stepaway -n stepaway \
  --set registry.enabled=true \
  --set registry.host=registry.example.com \
  --set registry.expose.className=nginx \
  --set registry.expose.tls.secretName=registry-example-com-tls \
  --set registry.persistence.size=50Gi
```

**`registry.host` is required and must be a name your *nodes* can resolve.**
The env image is pulled by the kubelet, not by a pod: kubelets run on the node
host, outside the pod network and outside cluster DNS, so
`<release>-registry.<ns>.svc.cluster.local:5000` is unusable for them. Give the
registry a real DNS name pointed at your ingress controller with a valid TLS
certificate (docker refuses plain-HTTP registries unless every node is
configured to allow it).

Notes:

- The chart mints user `stepaway` + a random password into Secret
  `registry.auth.secretName` (`username` / `password` / `htpasswd` keys),
  preserved across upgrades like the bearer token, and derives the
  dockerconfigjson Secret `registry.pullSecretName` that session pods use as an
  `imagePullSecret`. Backend env wired from it: `REGISTRY_HOST`,
  `REGISTRY_USER`, `REGISTRY_PASS`, `REGISTRY_PULL_SECRET`, `BUILDER_IMAGE`.
  With `registry.enabled=false` none of these are set, which is how the backend
  knows the devcontainer path is off.
- The Ingress for `registry.host` is rendered by *this* chart (the subchart's
  own `ingress.enabled` stays `false`) so the host lives in exactly one value.
  Set `registry.expose.*` for class/annotations/TLS.
- Everything else under `registry.*` is the subchart's values surface
  (`persistence`, `resources`, `nodeSelector`, ...); see
  [twuni/docker-registry.helm](https://github.com/twuni/docker-registry.helm).
  Its auth values (`secrets.htpasswd`) are deliberately left empty — auth is
  mounted from the chart-generated Secret via `registry.extraVolumes`, so if
  you change `registry.auth.secretName` you must change that reference too
  (the chart fails the render if they diverge).
- Garbage collection is a manual op (see `NOTES.txt` for the exact
  `kubectl exec ... registry garbage-collect` line).

## Values

| Key | Default | Description |
|---|---|---|
| `replicaCount` | `1` | Backend replica count. |
| `image.repository` | `ghcr.io/augustinbegue/stepaway-server` | Backend image. |
| `image.tag` | `""` (uses `appVersion`) | Backend image tag. |
| `image.pullPolicy` | `IfNotPresent` | Pull policy. |
| `imagePullSecrets` | `[]` | Image pull secrets. |
| `serviceAccount.create` | `true` | Create the backend ServiceAccount + Role/RoleBinding. |
| `serviceAccount.name` | `""` | Override the generated name. |
| `service.type` | `ClusterIP` | Backend Service type. |
| `service.port` | `80` | Backend Service port (proxies to container port 8080). |
| `resources` | `100m/128Mi` req, `512Mi` mem limit | Backend container resources. |
| `probes.path` | `/v1/healthz` | Liveness/readiness probe path. |
| `extraEnv` | `[]` | Extra env vars merged into the backend container. |
| `auth.token` | `""` | Hard-set bearer token (not recommended). |
| `auth.regenerateToken` | `false` | Force token regeneration on next upgrade. |
| `ingress.enabled` | `false` | Expose the backend via Ingress. |
| `ingress.className` | `""` | IngressClass name. |
| `ingress.host` | `stepaway.example.com` | Ingress host. |
| `ingress.annotations` | `{}` | Extra Ingress annotations. |
| `ingress.tls.secretName` | `""` | Pre-existing TLS Secret name; empty disables TLS. |
| `runner.image` | `ghcr.io/augustinbegue/stepaway-runner:latest` | Default runner pod image, passed to the backend as `RUNNER_IMAGE`. |
| `runner.resources.cpuRequest` | `250m` | `RUNNER_CPU_REQUEST`. |
| `runner.resources.memRequest` | `512Mi` | `RUNNER_MEMORY_REQUEST`. |
| `runner.resources.memLimit` | `2Gi` | `RUNNER_MEMORY_LIMIT`. |
| `runner.storageClass` | `""` | `RUNNER_STORAGE_CLASS` (empty = cluster default). |
| `runner.pvc.size` | `5Gi` | `RUNNER_STORAGE_SIZE`. |
| `runner.dind.enabled` | `true` | `RUNNER_DIND_ENABLED`. `false` drops the privileged dind sidecar from every runner pod (no docker in sessions). |
| `quotas.enabled` | `false` | Enable the ResourceQuota. |
| `quotas.maxPods` | `"10"` | Pod count hard limit. |
| `quotas.maxPVCs` | `"10"` | PVC count hard limit. |
| `quotas.requests.cpu` | `"4"` | Summed cpu requests hard limit. |
| `quotas.requests.memory` | `8Gi` | Summed memory requests hard limit. |
| `limitRange.enabled` | `false` | Enable the LimitRange. |
| `limitRange.default.*` | `500m` / `1Gi` | Default container limit. |
| `limitRange.defaultRequest.*` | `250m` / `512Mi` | Default container request. |
| `limitRange.max.*` | `4` / `8Gi` | Max container request/limit. |
| `networkPolicy.enabled` | `false` | Enable the runner + backend NetworkPolicies. |
| `networkPolicy.runnerEgress` | `[]` | Egress rules for runner pods (verbatim `spec.egress`). |
| `builder.image` | `ghcr.io/augustinbegue/stepaway-builder:latest` | Image of the env-image build Job (`BUILDER_IMAGE`). Only used when `registry.enabled`. |
| `registry.enabled` | `false` | Deploy the in-cluster registry and enable the devcontainer env path. |
| `registry.host` | `""` | **Required when enabled.** Node-resolvable DNS name of the registry, `host[:port]`, no scheme. |
| `registry.expose.enabled` | `true` | Render an Ingress for `registry.host`. |
| `registry.expose.className` | `""` | IngressClass for the registry Ingress. |
| `registry.expose.annotations` | `{}` | Extra annotations (a `proxy-body-size: 0` nginx annotation is always set). |
| `registry.expose.tls.secretName` | `""` | TLS Secret for `registry.host`; empty = no TLS (pushes/pulls will fail). |
| `registry.auth.secretName` | `stepaway-registry-auth` | Secret holding `username`/`password`/`htpasswd`. |
| `registry.auth.regeneratePassword` | `false` | Force a new registry password on next upgrade. |
| `registry.pullSecretName` | `stepaway-registry-pull` | dockerconfigjson Secret used as `imagePullSecret` on session pods (`REGISTRY_PULL_SECRET`). |
| `registry.persistence.enabled` | `true` | PVC-back the registry (subchart value). |
| `registry.persistence.size` | `20Gi` | Registry PVC size. |
| `registry.persistence.storageClass` | `""` | Registry PVC StorageClass (empty = cluster default). |
| `registry.*` | subchart defaults | Any other [twuni/docker-registry](https://github.com/twuni/docker-registry.helm) value. |

See `values.yaml` for the fully commented source of truth.
