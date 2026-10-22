---
type: database
host: db.example.com
env: prod
---

# Prod DB

```creds
- id: prod-db-admin
  label: postgres admin
  user: postgres
  secret: 0xdeadbeef
  kind: db
- ref: missing-id
```
