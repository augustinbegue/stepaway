# stepaway documentation

This directory holds the architecture record of stepaway.

## Contents

| document | subject |
|---|---|
| [architecture/overview.md](./architecture/overview.md) | the components and their relations |
| [architecture/session-lifecycle.md](./architecture/session-lifecycle.md) | the states of a session and the durability rules |
| [architecture/handoff-flow.md](./architecture/handoff-flow.md) | the steps of push and the steps of pull |
| [architecture/environment-build.md](./architecture/environment-build.md) | environment resolution, the build Job and the registry |
| [architecture/security.md](./architecture/security.md) | trust boundaries, secrets and permissions |
| [decisions/README.md](./decisions/README.md) | the index of the architecture decision records |

## About these documents

These documents use ASD-STE100 Simplified Technical English, Issue 9. The
sentences are short. Each term keeps one meaning in the full set.

These documents are the record of the design decisions of stepaway. They give
the reason for each structure, not only the structure.

Update these documents when you change the architecture. A change to a
component, to a state, to the API contract or to a trust boundary is not
complete until the applicable document shows it.

Write a new decision record for each new decision. Do not delete an old
decision record. Mark it as superseded and give the identifier of the new one.
