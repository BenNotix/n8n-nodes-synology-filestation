# Reaching your Synology NAS from a remote n8n

This node talks to DSM over plain HTTP(S). That's trivial when n8n runs on the same network as the NAS — but n8n Cloud or a VPS-hosted n8n usually has **no route to your LAN**. This guide covers the proven ways to bridge that gap, from most to least recommended.

| Your situation | Recommended option |
| --- | --- |
| Self-hosted n8n (VPS, Docker, home server) | [Tailscale / WireGuard VPN](#option-1--tailscale--vpn) |
| n8n Cloud (or any n8n you don't control the network of) | [Cloudflare Tunnel + Access](#option-2--cloudflare-tunnel--access) |
| No tunnel/VPN possible, router under your control | [Synology DDNS + port forwarding](#option-3--synology-ddns--port-forwarding) |
| Everything can run locally | [n8n on the NAS itself](#option-4--run-n8n-on-the-nas) |

> **QuickConnect does not work** with this node (or any direct DSM API client): it is a proprietary relay for Synology apps, not an HTTP endpoint. Use one of the options below instead.

---

## Option 1 — Tailscale / VPN

Best when you control the machine n8n runs on. Zero open ports, end-to-end encrypted, works behind CGNAT.

1. On the NAS: install the official **Tailscale** package from the DSM Package Center and log it into your tailnet.
2. On the n8n host: install Tailscale too (for Docker, run `tailscaled` on the host, or add a Tailscale sidecar container).
3. In the credential, set the Base URL to the NAS's tailnet address:
   - `https://your-nas.your-tailnet.ts.net:5001` (MagicDNS), or
   - `http://100.x.y.z:5000` — plain HTTP is acceptable here because WireGuard already encrypts the path; enable **Ignore SSL Issues** instead if you use HTTPS with DSM's self-signed certificate.

A classic WireGuard or OpenVPN site-to-site setup achieves the same result if you already operate one.

## Option 2 — Cloudflare Tunnel + Access

Works with **n8n Cloud**: the NAS dials out to Cloudflare, nothing is exposed on your router, and Cloudflare Access rejects unauthenticated requests at the edge before they ever reach DSM. Requires a domain managed by Cloudflare (the free plan is enough, including Access service tokens).

### 2.1 Connect the NAS

Run `cloudflared` on the NAS (Container Manager → `cloudflare/cloudflared` image with your tunnel token, or the community package). In the Zero Trust dashboard the tunnel should show as **Healthy** with a connector whose hostname is your NAS.

### 2.2 Publish DSM on a hostname

In your tunnel's configuration → **Published application routes** → add a route:

| Field | Value |
| --- | --- |
| Subdomain / Domain | e.g. `nas-api.example.com` |
| Service | `http://<nas-lan-ip>:5000` |

Using plain HTTP on port 5000 is fine **because the hop never leaves the NAS** (cloudflared runs on it); the public leg is always HTTPS at Cloudflare's edge. If you prefer DSM's HTTPS port: `https://<nas-lan-ip>:5001` and enable **No TLS Verify** under *Additional application settings → TLS* (DSM's certificate is self-signed).

### 2.3 Lock it down with a service token

1. **Access → Service auth → Service Tokens → Create service token.** Save the **Client ID** (`xxx.access`) and the **Client Secret** (shown only once).
2. **Access → Applications → Add an application → Self-hosted**, domain `nas-api.example.com`, with a policy whose action is **Service Auth** and whose include rule is your service token.

⚠️ The policy action must be **Service Auth**, not *Allow* — an Allow policy triggers the browser SSO redirect, which breaks API clients.

### 2.4 Configure the credential

| Credential field | Value |
| --- | --- |
| Base URL | `https://nas-api.example.com` (no port) |
| Ignore SSL Issues (Insecure) | off — the edge certificate is valid |
| Custom Headers | `CF-Access-Client-Id` = `<client-id>.access` and `CF-Access-Client-Secret` = `<secret>` |

Verify from a terminal before testing in n8n:

```bash
curl -s "https://nas-api.example.com/webapi/query.cgi?api=SYNO.API.Info&version=1&method=query&query=SYNO.API.Auth" \
  -H "CF-Access-Client-Id: <client-id>.access" \
  -H "CF-Access-Client-Secret: <secret>"
```

You should get `{"data":{...},"success":true}` — and a `403` without the two headers, proving Access is doing its job.

### Cloudflare limits to know

- **Uploads are capped at ~100 MB per request** on the free plan (Cloudflare request-body limit). Downloads stream and are not affected. For bigger uploads, keep a VPN/local path or upgrade the plan.
- Cloudflare enforces a **~100 s timeout per request**. This does not affect the node: long NAS operations (copy, compress, extract, search…) are driven by short polling requests, never one long HTTP call.
- Service tokens **expire** — note the date; renewing keeps the same Client ID but issues a new secret to update in the credential.

## Option 3 — Synology DDNS + port forwarding

The classic direct exposure. Acceptable when hardened, and requires nothing but DSM and your router:

1. DSM → Control Panel → External Access → **DDNS**: register e.g. `yournas.synology.me`.
2. DSM → Control Panel → Security → Certificate: get the built-in **Let's Encrypt** certificate for that hostname — then you don't need *Ignore SSL Issues*.
3. Forward a TCP port on your router to the NAS's HTTPS port 5001 (pick a non-default external port).
4. Harden:
   - DSM **firewall**: restrict the port by country/IP where possible;
   - Security → **Auto block** failed login attempts;
   - use the dedicated n8n account with access limited to the needed shared folders and, under Control Panel → User → Applications, allow only **File Station**.
5. Credential Base URL: `https://yournas.synology.me:<external-port>`.

## Option 4 — Run n8n on the NAS

x86 Synology models run Docker (Container Manager). An n8n instance in a container on the NAS reaches DSM locally (`https://<nas-lan-ip>:5001` with *Ignore SSL Issues*, or `http://<nas-lan-ip>:5000`) with **zero network exposure**. It can be your main n8n, or a small satellite instance dedicated to file workflows that pushes its results out to your other services — outbound traffic traverses NAT without any configuration.

---

## Security checklist (all options)

- Dedicated DSM account, no 2FA (Web API limitation), least-privilege shared-folder permissions, File Station as the only allowed application.
- Prefer paths with no open inbound ports (Tailscale, Cloudflare Tunnel).
- Valid TLS whenever the traffic crosses the internet; *Ignore SSL Issues* is meant for LAN/VPN hops with self-signed certificates, not for public endpoints.
