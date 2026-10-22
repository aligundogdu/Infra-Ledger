---
type: service
url: https://forge.example.com
provider: laravel
tags: [deploy]
---

# Forge

```creds
- id: forge-shared-key
  label: deploy key
  user: forge
  auth: key
  key_path: ~/.ssh/forge_shared
  secret: "key-passphrase"
  kind: ssh
```
