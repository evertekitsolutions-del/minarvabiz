# Production Windows release authority — manual dispatch only

The earlier privileged release publisher accepted any successful main push
build. A future version bump could thus publish a customer installer without
explicit release approval.

Windows build, packaging and smoke checks **still run on each main push**.
The publisher remains `workflow_run`-only, with no repository checkout and
narrow `contents: write` / `actions: read` permissions. It now accepts only
a successful manually dispatched `Release Windows` source workflow on `main`
from the same repository. Normal pushes never satisfy the publishing gate.

After approving a customer release, an authorized operator can manually run
`Release Windows` on `main`. The immutable tag/asset checks, release notes and
signed update verification remain unchanged.

Both release governance tests explicitly require the manual source-event guard
and reject any push-publish path. No database migration, production release,
new infrastructure, dependency or version bump is part of this PR.
