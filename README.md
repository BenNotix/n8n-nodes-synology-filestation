# n8n-nodes-synology-filestation

n8n community node for **Synology DSM File Station** — manage the files of your Synology NAS natively from your n8n workflows: browse, upload, download, copy, move, rename, delete, create sharing links, search, compress/extract archives, checksums, thumbnails and more.

Works with **DSM 6 and DSM 7**: the node discovers the API versions and paths of your NAS through `SYNO.API.Info` at runtime, exactly as the [official API guide](https://global.download.synology.com/download/Document/Software/DeveloperGuide/Package/FileStation/All/enu/Synology_File_Station_API_Guide.pdf) prescribes.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation:

1. Go to **Settings → Community Nodes**.
2. Select **Install**.
3. Enter `n8n-nodes-synology-filestation` and confirm.

Or with a self-hosted npm install:

```bash
npm install n8n-nodes-synology-filestation
```

## Credentials

Create a **Synology API** credential with:

| Field | Description |
| --- | --- |
| **Base URL** | Address of your DSM, including protocol and port — e.g. `https://nas.example.com:5001` or `http://192.168.1.10:5000`. QuickConnect URLs are not supported; use a direct IP, a local hostname or a DDNS address. |
| **Username** | DSM account to log in with. |
| **Password** | Password of the account. |
| **Ignore SSL Issues** | Enable if your DSM uses its default self-signed certificate. |
| **Custom Headers** | Optional headers sent with every request — e.g. the `CF-Access-Client-Id` / `CF-Access-Client-Secret` service-token headers when DSM sits behind Cloudflare Access. |

Recommendations:

- Create a **dedicated DSM account** for n8n and give it access only to the shared folders you need (DSM → Control Panel → User & Group).
- **2-factor authentication is not supported** by the DSM Web API login used here — the dedicated account must not have 2FA enabled.
- The node logs in at the start of each execution (`SYNO.API.Auth`, session `FileStation`, `format=sid`) and logs out at the end.

### Reaching a NAS from a remote n8n

n8n Cloud or a VPS-hosted n8n usually has no direct route to a NAS sitting on a LAN. **[📖 Remote access guide](docs/remote-access.md)** walks through the options step by step:

- **Tailscale / WireGuard VPN** (self-hosted n8n) — zero open ports;
- **Cloudflare Tunnel + Access** (works with n8n Cloud) — full walkthrough including the service-token headers to put in **Custom Headers**;
- **Synology DDNS + port forwarding** with Let's Encrypt and DSM-firewall hardening;
- **n8n on the NAS itself** (Container Manager) — zero exposure.

QuickConnect cannot be used — it is a relay, not a direct HTTP endpoint.

## Operations

All paths start with a shared folder, e.g. `/photo/vacation/img_001.jpg`.

### File

| Operation | Description |
| --- | --- |
| Copy / Move | Copy or move a file/folder to another folder (`SYNO.FileStation.CopyMove`), with overwrite/skip behavior and completion polling |
| Delete | Delete a file/folder (`SYNO.FileStation.Delete`), recursive by default |
| Download | Download a file as binary data (a folder is delivered as a ZIP archive) |
| Get | Get file/folder information (size, times, owner, permissions, real path…) |
| Rename | Rename a file/folder |
| Upload | Upload binary data into a folder (`SYNO.FileStation.Upload`, multipart), with parent-folder creation and overwrite/skip behavior |

### Folder

| Operation | Description |
| --- | --- |
| Create | Create a folder (optionally with its missing parents) |
| Delete | Delete a folder and its contents |
| Get Many | List the files/folders inside a folder, with glob pattern, type filter, sorting and extra fields |
| List Shares | List the shared folders visible to the account, with volume/permission info |

### Share Link

| Operation | Description |
| --- | --- |
| Create | Create a public sharing link (optional password, availability and expiration dates) |
| Get / Get Many | Read one or all sharing links |
| Update | Change/remove the password or the dates of a link |
| Delete | Delete a sharing link |
| Clear Invalid | Remove all expired and broken links |

### Search

| Operation | Description |
| --- | --- |
| Find | Server-side search (`SYNO.FileStation.Search`): starts the task, polls until it finishes, collects the results and cleans the temporary database on the NAS. Filters: glob pattern, extension, type, size range, modified/created/accessed date ranges, owner, group. |

### Archive

| Operation | Description |
| --- | --- |
| Compress | Compress a file/folder into a ZIP or 7z archive (level, mode, password) |
| Extract | Extract an archive (zip, gz, tar, tgz, tbz, bz2, rar, 7z, iso) into a folder |
| List Contents | List the files contained in an archive without extracting it |

### Utility

| Operation | Description |
| --- | --- |
| Check Permission | Check whether the account could write a given file into a folder — returns `writable: true/false` |
| Get Directory Size | Compute the accumulated size / file count of a folder |
| Get Info | File Station information (hostname, capabilities) — handy as a connection test |
| Get MD5 | Compute the MD5 checksum of a file on the NAS |
| Get Thumbnail | Get the image/video thumbnail of a file as binary data |

### Favorite

| Operation | Description |
| --- | --- |
| Add / Update / Delete | Manage the account's favorite folders |
| Get Many | List favorites (valid/broken filter) |
| Clear Broken | Remove favorites whose target no longer exists |

### Background Task

| Operation | Description |
| --- | --- |
| Get Many | List the copy/move/delete/compress/extract tasks running on the NAS and their progress — useful with the "Wait for Completion: off" mode of the long-running operations |
| Clear Finished | Remove finished tasks from the list |

## Long-running operations

Copy, Move, Delete, Compress and Extract are **non-blocking** on the NAS (`start`/`status`/`stop` pattern). By default the node polls until the task finishes (option **Max Wait Time**, 300 s by default, the task is stopped on timeout). Disable **Wait for Completion** to get the `taskid` back immediately and track it with **Background Task → Get Many**.

## Usage examples

- **Watch a folder** — Schedule Trigger → `Folder: Get Many` (sort by created time desc) → IF new items → process.
- **Back up generated reports** — previous node outputs binary → `File: Upload` to `/backup/reports` with Create Parent Folders.
- **Share a file with a client** — `File: Upload` → `Share Link: Create` with password + expiration → send the returned `url` by e-mail.
- **Clean up old archives** — `Search: Find` in `/download` with Modified Before + extension `zip` → `File: Delete`.
- **Verify integrity after transfer** — `Utility: Get MD5` and compare with your local checksum.

## Known limitations

- **2FA accounts are not supported** (DSM Web API limitation for scripted logins) — use a dedicated account without 2FA.
- **QuickConnect is not supported** — the node needs a direct HTTP(S) connection to DSM (local network, VPN, or DDNS + port forwarding).
- Downloads are streamed to n8n's binary data storage, but uploads are buffered in memory; very large uploads (several GB) depend on your n8n instance's memory.
- Video thumbnails only exist for files in the `photo` shared folder or user home folders (DSM indexing rule).

## Resources

- [Synology File Station Official API guide (PDF)](https://global.download.synology.com/download/Document/Software/DeveloperGuide/Package/FileStation/All/enu/Synology_File_Station_API_Guide.pdf)
- [DSM Login Web API guide](https://kb.synology.com/en-global/DG/DSM_Login_Web_API_Guide)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)

## License

[MIT](LICENSE.md)
