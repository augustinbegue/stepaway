# 0001. One pod is one session, and the PVC is the durable half

- Date: 2026-08-23
- Status: accepted

## Context

A handoff carries a live session with uncommitted work. A shared runner mixes
the sessions of different projects and makes the cleanup unclear. A pod alone
loses everything on a crash of the node.

## Decision

One session is one pod plus one PVC of the same name.

- The pod is `stepaway-<sid8>` with the label `stepaway.dev/session`.
- The PVC mounts at `/repo` and holds the git dir of the project.
- The work tree lives at `/work/<project>` on an emptyDir. Its `.git` is a
  file that points at the git dir on the PVC.
- A successful `stepaway pull` deletes both objects. `stepaway destroy`
  deletes both objects for an abandoned handoff.
- A session has no TTL.

## Consequences

- Only git objects survive a crash of the pod. The launch tells the agent to
  commit after each coherent unit of work.
- The blast radius of a session is one namespace-local pod.
- Storage grows until a pull or a destroy. This cost is deliberate, because a
  timer must never delete the only copy of the work of the agent.
- The docker volumes of a session are not durable and they do not travel home.
