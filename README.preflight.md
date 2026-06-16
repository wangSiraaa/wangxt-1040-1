# Trae Preflight

This folder is prepared for `wangxt-1040-1`.

Use `.env` for stable local ports and compose project identity:

- APP_PORT: 18340
- API_PORT: 19340
- WEB_PORT: 20340
- DB_PORT: 21340
- REDIS_PORT: 22340

Smoke entry:

```bash
bash scripts/smoke.sh
```

The preflight files are environment scaffolding only. The generated business
project can replace or extend them when needed.
