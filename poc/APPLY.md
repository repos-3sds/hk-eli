# APPLY: HK ELI Chatbot office zip

The filled-in copy of this guide ships beside each zip (zip name, sha256, file count, test counts and the
IT-safe audit result). The steps themselves are in OFFICE.md; the checks in OFFICE-CHECKLIST.md.

| Item | Value |
|---|---|
| Zip | `hk-eli-chatbot-office.zip` |
| sha256 | see the copy beside the zip |
| Replaces | nothing (first office zip of the chatbot) |
| Prerequisites | macOS, `python3.12 -V` 3.12.x, JFrog `pip.conf` (from `pip.conf.example`) |
| Expected | preflight: every pinned package downloads; pip check: no broken requirements; tests: 80 passed; smoke: SMOKE PASS; eval: 20 of 20 pass |
| Roll back | stop the service, rename this folder aside, rename the previous one back |
