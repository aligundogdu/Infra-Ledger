---
type: device
device_type: laptop
model: MacBook Pro 14 M3
serial: C02XYZ123
location: "[[Office 2F]]"
assigned_to: "[[Mehmet Kaya]]"
warranty_until: 2027-05-01
provider: "[[Apple]]"
tags: [work]
---

# Laptop 07

Company laptop. The plugin only edits the assigned_to line and the blocks below.

```network
- ip: 10.0.0.42
  label: office wifi
  mac: a4:83:e7:12:34:56
```

```creds
- id: laptop-07-admin
  label: local admin
  user: itadmin
  secret: "laptop-admin-pass"
  kind: other
```

```ledger
- date: 2026-06-15
  event: assigned
  to: "[[Mehmet Kaya]]"
  note: first owner
- date: 2026-06-10
  event: note
  note: bought, invoice in Finance/2026
  invoice: INV-2026-118
```
