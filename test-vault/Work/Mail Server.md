---
type: server
host: mail.example.com
ip: 203.0.113.25
env: prod
ports:
  - 25 smtp
  - 993 imaps
tags:
  - work
assigned_to: "[[Mehmet Kaya]]"
---

# Mail Server

```creds
- id: mail-admin
  label: admin
  user: admin
  secret: "work-secret"
  kind: panel
```
