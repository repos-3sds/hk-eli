# Office runbook

Every step is a command a person can run by hand, in order, in one terminal, from the project folder.
Nothing runs in the background, nothing is installed outside the project folder, and packages come only
from JFrog. What to send back is at the end: counts and pass/fail lines only.

## 0. What you need

| Check | Command | Expected |
|---|---|---|
| macOS architecture | `uname -m` | `arm64` or `x86_64` (both have wheels for every pinned package) |
| Python 3.12 | `python3.12 -V` | `Python 3.12.x` |
| JFrog PyPI index | `pip.conf` from `pip.conf.example` (see step 2) | the JFrog `.../simple` URL |
| Office root certificate | only if pip reports `CERTIFICATE_VERIFY_FAILED` | `cert =` in pip.conf |

No Node, no Docker, no Homebrew, no admin rights.

## 1. Unpack

```bash
shasum -a 256 hk-eli-chatbot-office.zip        # must equal the sha256 in APPLY.md
mkdir hk-eli-chatbot-new && cd hk-eli-chatbot-new
unzip ../hk-eli-chatbot-office.zip && cd hk-eli-chatbot
```

Keep any previous folder, renamed, until this one passes step 6.

## 2. Point pip at JFrog

```bash
mkdir -p ~/.config/pip && cp pip.conf.example ~/.config/pip/pip.conf
# edit ~/.config/pip/pip.conf: index-url = https://<jfrog-host>/artifactory/api/pypi/<repo>/simple
```

Only `index-url`. Never `--extra-index-url`, never `--trusted-host`.

## 3. Preflight (proves every pinned version downloads from JFrog)

```bash
python3.12 office/preflight.py --lock requirements.txt --python 3.12
python3.12 office/preflight.py --lock requirements-dev.txt --python 3.12
```

Expected: the last line says every pinned package downloads. A FAIL line names the versions that do download:
send it back; the fix is a re-pin and a rebuilt lock, never an install from elsewhere.
Not yet proven in JFrog (test tools only): `pytest 8.3.4`, `pluggy 1.5.0`, `iniconfig 2.0.0`.
`colorama` is listed for Windows only and is not installed on macOS.

## 4. Install

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install --no-cache-dir --require-hashes -r requirements.txt
.venv/bin/python -m pip install --no-cache-dir --require-hashes -r requirements-dev.txt
.venv/bin/python -m pip check
```

Expected: `No broken requirements found.` and no `Building wheel` lines.

## 5. Settings

```bash
cp .env.example .env
```

Start with the defaults (mock Tableau, model off): the service works with no other setting. For the office
Tableau server and the model gateway, fill the `TABLEAU_*` and `LLM_*` lines. Secrets go in files your vault
agent renders, named by `TABLEAU_SECRET_ID_FILE`, `TABLEAU_SECRET_VALUE_FILE`, `LLM_API_KEY_FILE` and
`EDGE_SHARED_TOKEN_FILE`; do not paste secrets into `.env` if a vault file is available.

## 6. Prove it

```bash
.venv/bin/python -m pytest -q -p no:cacheprovider     # expected: 80 passed
.venv/bin/python office/smoke_test.py                 # expected: SMOKE PASS
.venv/bin/python office/run_eval.py                   # expected: eval 20 of 20 pass (mock, model off)
```

## 7. Run

```bash
./run.sh            # HK ELI Chatbot on http://127.0.0.1:8050  (Ctrl+C to stop)
```

Open `http://127.0.0.1:8050`. The service listens on 127.0.0.1 only and refuses any other address.
Its database is `var/hkeli.sqlite` (created on first start; delete the folder to start fresh).

## 8. Office checks

Run the checks in [OFFICE-CHECKLIST.md](OFFICE-CHECKLIST.md) part B, one at a time. Each says what to run and
what to send back.

## 9. What to send back

Only these lines: the sha256 match (yes/no), each preflight's last line and any FAIL lines, the pip check
line, the test count, `SMOKE PASS` or its FAIL lines, the eval count line, and each office check's result
line. Never file contents, data, screenshots of data, host names or user names.

## 10. Roll back

Stop the service (Ctrl+C), rename this folder aside and rename the previous folder back. Nothing outside the
folders changed, except pip's own cache and `~/.config/pip/pip.conf`.

## IT-safe statement

No keep-awake or power commands, no sudo, no daemons or scheduled jobs, no network beyond JFrog, the model
gateway, the office Tableau server and localhost, no installs outside JFrog, no long unattended runs.
The scan result for this zip is in APPLY.md.
