---
type: server
ip:
  - 192.168.1.10 lan
  - 100.64.0.7 tailscale
provider: proxmox
env: home
ssh_port: 22
ports:
  - 8006 proxmox
  - 5432 postgres
  - 99999 typo
tags: [homelab]
---

# HomeServer

Proxmox host in the closet. Free text stays untouched by the plugin.

```creds
# root first
- id: homeserver-root
  label: root
  user: root
  secret: "correct-horse-battery"   # current
  kind: ssh
  note: sudo uses the same password
  updated: 2026-10-22
  history:
    - secret: "old-password"
      until: 2026-03-10
      reason: rotation
- id: homeserver-postgres
  label: postgres app
  user: appuser
  secret: 0123456
  kind: db
- ref: forge-shared-key
```
