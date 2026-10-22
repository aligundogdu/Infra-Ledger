---
type: server
provider: proxmox
env: home
ssh_port: 22
tags: [homelab]
---

# HomeServer

Proxmox host in the closet. Free text stays untouched by the plugin.

```network
- ip: 85.10.20.30/26
  scope: public
  label: main
  iface: eth0
  mac: 00:11:22:33:44:55
  gateway: 85.10.20.1
- ip: 85.10.20.31
  label: failover
- ip: 192.168.1.10/24
  label: lan
  iface: vmbr0
  vlan: 20
  ethId: 2
- ip: 100.64.0.7
  label: tailscale
- port: 8006
  service: proxmox
- port: 5432
  service: postgres
  note: lan only
- port: 99999
```

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
  updated: 2025-12-01
- ref: forge-shared-key
```
