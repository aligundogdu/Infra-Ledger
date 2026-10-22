---
type: server
ip: 192.168.1.10
provider: proxmox
env: home
ssh_port: 22
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
