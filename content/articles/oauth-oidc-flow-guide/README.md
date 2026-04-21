---
title: 'OAuth 2.0 and OIDC Flows: Authorization Code to PKCE'
linkTitle: 'OAuth & OIDC'
description: >-
  Walk through OAuth 2.0 authorization flows and OpenID Connect from first
  principles — covering PKCE, token lifecycle, client types, and why the
  implicit flow is deprecated in OAuth 2.1.
publishedDate: 2026-02-03T00:00:00.000Z
lastUpdatedOn: 2026-04-21T00:00:00.000Z
tags:
  - security
  - authentication
  - web-security
---

# OAuth 2.0 and OIDC Flows: Authorization Code to PKCE

OAuth 2.0 is an authorization-delegation framework; OpenID Connect (OIDC) layers identity on top. This article walks the canonical OAuth 2.1 flow set — Authorization Code + PKCE, Device Authorization Grant, Client Credentials — explains how OIDC ID tokens, refresh-token rotation, DPoP, and the BFF pattern fit on top, and pins each design choice to the specific RFC or attack it answers, so a senior engineer can pick a flow, validate a token, and harden a deployment without re-deriving the threat model.

![Authorization Code flow with PKCE and OIDC sequence across user, client, authorization server, and resource server](./diagrams/auth-code-pkce-oidc-overview-light.svg "End-to-end Authorization Code + PKCE + OIDC flow: the client generates state/nonce/PKCE, the user authenticates and consents at the authorization server, and the client exchanges the code for access, refresh, and ID tokens before calling the resource server.")
![Authorization Code flow with PKCE and OIDC sequence across user, client, authorization server, and resource server](./diagrams/auth-code-pkce-oidc-overview-dark.svg)

## Abstract

OAuth 2.0 is an **authorization delegation framework**—it lets users grant applications limited access to their resources without sharing credentials. OIDC (OpenID Connect) is an **identity layer on top of OAuth**—it proves _who_ the user is via ID tokens. The core security model relies on:

![OAuth 2.0 and OIDC token relationships: authorization code, access token, refresh token, ID token, and the UserInfo endpoint](./diagrams/token-types-relationships-light.svg "How OAuth 2.0 authorization tokens (code, access, refresh) relate to the OIDC identity layer (ID token, UserInfo)—and how each one moves through the system.")
![OAuth 2.0 and OIDC token relationships: authorization code, access token, refresh token, ID token, and the UserInfo endpoint](./diagrams/token-types-relationships-dark.svg)

| Component              | Purpose                                     | Lifetime     | Audience              |
| ---------------------- | ------------------------------------------- | ------------ | --------------------- |
| **Authorization Code** | One-time credential for token exchange      | ~10 minutes  | Authorization server  |
| **Access Token**       | Resource access credential                  | 5-60 minutes | Resource server (API) |
| **Refresh Token**      | Long-lived credential for new access tokens | Days/weeks   | Authorization server  |
| **ID Token**           | Identity proof (JWT with user claims)       | Minutes      | Client application    |

### Key Design Principles

- **PKCE is mandatory** for all clients (OAuth 2.1)—prevents authorization code interception
- **Tokens are bearer credentials**—possession equals authorization; protect accordingly
- **State prevents CSRF**; **nonce prevents replay**; **PKCE prevents interception**—all three are required
- **Implicit flow is deprecated**—tokens in URLs leak via history, referrer, logs
- **Access tokens are for APIs; ID tokens are for clients**—never use ID tokens to call APIs

## OAuth 2.0 Core Architecture

### Four Defined Roles

OAuth 2.0 (RFC 6749) defines four roles that interact during authorization:

| Role                     | Description                                                 | Example               |
| ------------------------ | ----------------------------------------------------------- | --------------------- |
| **Resource Owner**       | Entity granting access to protected resources               | End user              |
| **Resource Server**      | Server hosting protected resources, validates access tokens | API server            |
| **Client**               | Application requesting access on behalf of resource owner   | Web/mobile app        |
| **Authorization Server** | Issues tokens after authenticating the resource owner       | Auth0, Okta, Keycloak |

**Design rationale**: OAuth separates the client from the resource owner. Instead of the client storing user credentials (the pre-OAuth antipattern), the client obtains tokens with specific scope and lifetime. This enables revocable, scoped access without credential exposure.

### Client Types

Clients are classified by their ability to maintain credential confidentiality:

| Type             | Can Store Secrets? | Examples                | Token Strategy        |
| ---------------- | ------------------ | ----------------------- | --------------------- |
| **Confidential** | Yes                | Server-side web apps    | Client secret + PKCE  |
| **Public**       | No                 | SPAs, mobile apps, CLIs | PKCE only (no secret) |

> **OAuth 2.1 (draft-15)**: The distinction matters less now — PKCE is mandatory for all clients ([§7.5](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-15#section-7.5)). Confidential clients still use secrets (or, preferably, `private_key_jwt` / mTLS) for client authentication, but secrets alone are insufficient as a defence against authorization-code interception.

### Protocol Endpoints

| Endpoint            | Purpose                          | HTTP Method |
| ------------------- | -------------------------------- | ----------- |
| **Authorization**   | Obtain user consent via redirect | GET         |
| **Token**           | Exchange grants for tokens       | POST        |
| **Revocation**      | Invalidate tokens                | POST        |
| **Introspection**   | Validate token metadata          | POST        |
| **UserInfo** (OIDC) | Fetch user profile claims        | GET/POST    |

### Picking a flow

OAuth 2.1 narrows the canonical flow set to three, plus refresh tokens for session continuity. Everything else (Implicit, Resource Owner Password Credentials) is removed.[^oauth21-removed]

![OAuth 2.1 flow selection decision tree based on actor type and device capability](./diagrams/flow-selection-decision-light.svg "Flow-selection decision tree: pick Authorization Code + PKCE for any flow with an end user and a browser, Device Authorization Grant for input-constrained devices, and Client Credentials for service-to-service. Implicit and ROPC are removed in OAuth 2.1.")
![OAuth 2.1 flow selection decision tree based on actor type and device capability](./diagrams/flow-selection-decision-dark.svg)

| Caller                   | Device capability                | Canonical flow                                          | Identity layer                  |
| ------------------------ | -------------------------------- | ------------------------------------------------------- | ------------------------------- |
| End user                 | Browser-capable (web, SPA, mobile, desktop) | **Authorization Code + PKCE** ([RFC 6749 §4.1][rfc6749-4-1], [RFC 7636][rfc7636]) | Add `openid` scope for OIDC     |
| End user                 | Input-constrained (smart TV, CLI, IoT, kiosk) | **Device Authorization Grant** ([RFC 8628][rfc8628])    | Add `openid` scope for OIDC     |
| Workload (no end user)   | Server-to-server                | **Client Credentials** ([RFC 6749 §4.4][rfc6749-4-4])    | None — no user identity exists  |
| Any flow needing session | —                                | **Refresh token** with rotation or sender-constraint ([OAuth 2.1 §4.3][oauth21-rt]) | —                               |

[^oauth21-removed]: [draft-ietf-oauth-v2-1-15 §1.6](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-15#section-1.6) ("Differences from OAuth 2.0") removes the Implicit grant (`response_type=token`) and the Resource Owner Password Credentials grant.

[rfc6749-4-1]: https://datatracker.ietf.org/doc/html/rfc6749#section-4.1
[rfc6749-4-4]: https://datatracker.ietf.org/doc/html/rfc6749#section-4.4
[rfc7636]: https://datatracker.ietf.org/doc/html/rfc7636
[rfc8628]: https://datatracker.ietf.org/doc/html/rfc8628
[oauth21-rt]: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-15#section-4.3

---

## Authorization Code Flow with PKCE

The Authorization Code flow with PKCE (Proof Key for Code Exchange) is the **only recommended flow** for all client types as of OAuth 2.1.

### Step 1: Generate Security Parameters

Before initiating the flow, the client generates three security parameters:

```javascript title="pkce-generation.js"
import crypto from "crypto"

// PKCE: code_verifier (43-128 chars, cryptographically random)
const codeVerifier = crypto.randomBytes(32).toString("base64url")
// e.g., "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

// PKCE: code_challenge (SHA256 hash of verifier)
const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url")
// e.g., "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

// CSRF protection
const state = crypto.randomBytes(16).toString("hex")

// OIDC replay protection
const nonce = crypto.randomBytes(16).toString("hex")

// Store in session for validation
session.oauthParams = { codeVerifier, state, nonce }
```

**Why three parameters?**

| Parameter                        | Protects Against                              | Validated By                          |
| -------------------------------- | --------------------------------------------- | ------------------------------------- |
| `state`                          | CSRF attacks (forged authorization responses) | Client (callback)                     |
| `nonce`                          | ID token replay attacks                       | Client (ID token validation)          |
| `code_verifier`/`code_challenge` | Authorization code interception               | Authorization server (token endpoint) |

### Step 2: Authorization Request

The client redirects the user to the authorization server:

```http
GET /authorize?
  response_type=code
  &client_id=CLIENT_ID
  &redirect_uri=https://client.example/callback
  &scope=openid profile email
  &state=abc123xyz
  &nonce=def456uvw
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256
HTTP/1.1
Host: auth.example.com
```

**Required parameters:**

| Parameter               | Purpose                             | Requirement                   |
| ----------------------- | ----------------------------------- | ----------------------------- |
| `response_type=code`    | Request authorization code          | REQUIRED                      |
| `client_id`             | Client identifier                   | REQUIRED                      |
| `redirect_uri`          | Callback URL (exact match required) | REQUIRED in OAuth 2.1         |
| `code_challenge`        | PKCE challenge                      | REQUIRED in OAuth 2.1         |
| `code_challenge_method` | `S256` (SHA256) or `plain`          | REQUIRED if challenge present |
| `state`                 | CSRF protection                     | REQUIRED                      |
| `scope`                 | Requested permissions               | RECOMMENDED                   |
| `nonce`                 | Replay protection (OIDC)            | REQUIRED for OIDC             |

### Step 3: User Authentication and Consent

The authorization server:

1. Authenticates the user (login if no session)
2. Displays consent screen with requested scopes
3. Records user's decision

### Step 4: Authorization Response

On approval, the authorization server redirects back with the authorization code:

```http
HTTP/1.1 302 Found
Location: https://client.example/callback?
  code=SplxlOBeZQQYbYS6WxSbIA
  &state=abc123xyz
  &iss=https://auth.example.com
```

**Security validation (client-side):**

```javascript title="callback-validation.js" collapse={1-3, 20-25}
// Express callback handler
app.get("/callback", async (req, res) => {
  const { code, state, iss, error } = req.query

  // Check for error response
  if (error) {
    return res.status(400).json({ error: req.query.error_description })
  }

  // Validate state (CSRF protection)
  if (state !== req.session.oauthParams.state) {
    return res.status(400).json({ error: "State mismatch - CSRF detected" })
  }

  // Validate issuer (mix-up attack protection, RFC 9207)
  if (iss !== EXPECTED_ISSUER) {
    return res.status(400).json({ error: "Issuer mismatch" })
  }

  // Proceed to token exchange...
  const tokens = await exchangeCodeForTokens(code)
  res.json(tokens)
})
```

> **RFC 9207**: The `iss` parameter in the authorization response prevents mix-up attacks when clients use multiple authorization servers. Always validate it matches the expected issuer.

### Step 5: Token Exchange

The client exchanges the authorization code for tokens at the token endpoint:

```http
POST /token HTTP/1.1
Host: auth.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://client.example/callback
&client_id=CLIENT_ID
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

**For confidential clients**, add client authentication:

```http
POST /token HTTP/1.1
Host: auth.example.com
Content-Type: application/x-www-form-urlencoded
Authorization: Basic base64(client_id:client_secret)

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://client.example/callback
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

**PKCE server validation:**

```javascript title="pkce-validation.js"
// Authorization server validates PKCE
function validatePKCE(codeChallenge, codeVerifier, method) {
  if (method === "S256") {
    const computedChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url")
    return computedChallenge === codeChallenge
  }
  // 'plain' method (SHOULD NOT be used)
  return codeVerifier === codeChallenge
}
```

### Step 6: Token Response

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6ImF0K2p3dCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "8xLOxBtZp8",
  "scope": "openid profile email",
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## PKCE Deep Dive

PKCE (Proof Key for Code Exchange, RFC 7636) prevents authorization code interception attacks.

### The Attack PKCE Prevents

![Authorization code interception attack on a shared custom URI scheme, with and without PKCE](./diagrams/auth-code-interception-attack-light.svg "Authorization code interception: a malicious app registered against the same custom URI scheme intercepts the redirect and exchanges the code for tokens. PKCE breaks this attack because only the legitimate app holds the code_verifier.")
![Authorization code interception attack on a shared custom URI scheme, with and without PKCE](./diagrams/auth-code-interception-attack-dark.svg)

**Attack scenario**: On mobile platforms, multiple apps can register the same custom URI scheme (`com.example.app://`). A malicious app intercepts the redirect containing the authorization code and exchanges it for tokens.

**With PKCE**: The authorization server binds the code to the `code_challenge`. Without the `code_verifier` (which only the legitimate app possesses), the malicious app cannot complete the exchange.

### Code Verifier Requirements (RFC 7636)

| Requirement       | Value                                           |
| ----------------- | ----------------------------------------------- |
| **Entropy**       | Minimum 256 bits (32 bytes)                     |
| **Character set** | `[A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"` |
| **Length**        | 43-128 characters                               |
| **Generation**    | Cryptographic random number generator           |

### Challenge Methods

| Method  | Algorithm                          | Recommendation                 |
| ------- | ---------------------------------- | ------------------------------ |
| `S256`  | `BASE64URL(SHA256(code_verifier))` | MUST support; SHOULD use       |
| `plain` | `code_challenge = code_verifier`   | SHOULD NOT use (fallback only) |

**Design rationale**: `S256` is preferred because even if the `code_challenge` is leaked (e.g., in browser history), the original `code_verifier` cannot be derived. With `plain`, leaking the challenge equals leaking the verifier.

### PKCE in OAuth 2.1

> **OAuth 2.1 [draft-15, Section 7.5](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-15#section-7.5)** (March 2026): "Clients MUST use `code_challenge` and `code_verifier` and authorization servers MUST enforce their use except under the conditions described in Section 7.5.1. Even in this case, using and enforcing `code_challenge` and `code_verifier` as described above is still RECOMMENDED."

OAuth 2.1 makes PKCE mandatory for all clients—public and confidential. This acknowledges that:

1. Client secrets can leak (supply chain attacks, compromised dependencies)
2. PKCE provides defense-in-depth even when secrets are used
3. A single secure pattern simplifies implementation

---

## Client Credentials Flow (Machine-to-Machine)

The Client Credentials grant ([RFC 6749 §4.4](https://datatracker.ietf.org/doc/html/rfc6749#section-4.4)) is the only flow with no end user: the client is acting on its own behalf, typically a backend service calling another backend service. There is no authorization code, no redirect, no refresh token, and no ID token — there is no user to identify.

![Client Credentials grant: a service authenticates with the authorization server and exchanges its own credentials for a short-lived access token, with no user involvement](./diagrams/client-credentials-flow-light.svg "Client Credentials grant: workload-to-workload. The client authenticates itself (shared secret, private_key_jwt, or mTLS) and receives an access token only — no refresh token, no ID token, no user identity.")
![Client Credentials grant: a service authenticates with the authorization server and exchanges its own credentials for a short-lived access token, with no user involvement](./diagrams/client-credentials-flow-dark.svg)

```http
POST /token HTTP/1.1
Host: auth.example.com
Content-Type: application/x-www-form-urlencoded
Authorization: Basic base64(client_id:client_secret)

grant_type=client_credentials
&scope=invoices:read invoices:write
```

### When to use it

| Use case                                         | Notes                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Backend service calling another backend's API    | The canonical case. Scopes scope what the **service** can do, not what users can do. |
| Cron job, batch worker, daemon                   | Use a private key (`private_key_jwt`) or mTLS instead of a shared secret when possible. |
| CI / CD pipelines calling deployment APIs        | Mint short-lived tokens per pipeline run; never bake long-lived tokens into images.  |

### What to avoid

> [!CAUTION]
> Do not use Client Credentials to act on behalf of an end user. The token has no `sub` for a human, no consent record, and no scoping to that user. If you need to act for a user, use Authorization Code + PKCE; if the call must be background, exchange a refresh token or use [Token Exchange (RFC 8693)](https://datatracker.ietf.org/doc/html/rfc8693).

- Refresh tokens **MUST NOT** be issued for the Client Credentials grant ([RFC 6749 §4.4.3](https://datatracker.ietf.org/doc/html/rfc6749#section-4.4.3)). When the access token expires, the client just re-authenticates.
- Prefer [`private_key_jwt`](https://datatracker.ietf.org/doc/html/rfc7523#section-2.2) or [mTLS client authentication (RFC 8705)](https://datatracker.ietf.org/doc/html/rfc8705) over `client_secret_basic`/`client_secret_post`. Shared secrets sit in env vars and leak through logs, configs, and container images.
- Combine with **DPoP** ([RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449)) or **mTLS sender-constraint** so a stolen token cannot be replayed by a different caller.

---

## Device Authorization Grant

The Device Authorization Grant ([RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)) covers input-constrained devices — smart TVs, set-top boxes, CLIs, IoT devices, kiosks — where typing a password or rendering a full login UI is impractical. The user authenticates on a secondary device (phone or laptop) while the device polls for the result.

![Device Authorization Grant sequence: the device requests a user_code and verification URI, displays it to the user, and polls the token endpoint while the user approves on a separate browser-capable device](./diagrams/device-code-flow-light.svg "Device Authorization Grant (RFC 8628): the device gets a short user_code and a verification URI, the user approves on their phone or laptop, and the device polls the token endpoint — backing off on slow_down — until it receives an access token or a terminal error.")
![Device Authorization Grant sequence: the device requests a user_code and verification URI, displays it to the user, and polls the token endpoint while the user approves on a separate browser-capable device](./diagrams/device-code-flow-dark.svg)

### Step 1: Device authorization request

```http
POST /device_authorization HTTP/1.1
Host: auth.example.com
Content-Type: application/x-www-form-urlencoded

client_id=CLIENT_ID&scope=openid profile offline_access
```

### Step 2: Authorization server response

```json
{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://auth.example.com/device",
  "verification_uri_complete": "https://auth.example.com/device?user_code=WDJB-MJHT",
  "expires_in": 1800,
  "interval": 5
}
```

The device displays `user_code` and `verification_uri` (or a QR code for `verification_uri_complete`) and starts polling.

### Step 3: Polling the token endpoint

```http
POST /token HTTP/1.1
Host: auth.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:device_code
&device_code=GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS
&client_id=CLIENT_ID
```

The client **MUST** respect the `interval` and **MUST** back off when it receives `slow_down` ([RFC 8628 §3.5](https://datatracker.ietf.org/doc/html/rfc8628#section-3.5)):

| Error                   | Meaning                                                       | Client action                                       |
| ----------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| `authorization_pending` | User has not yet approved.                                    | Continue polling at the current interval.           |
| `slow_down`             | Polling too fast.                                             | Increase the interval by **5 seconds** and retry.   |
| `access_denied`         | User declined.                                                | Stop polling; surface a "rejected" message.         |
| `expired_token`         | `device_code` lifetime exceeded `expires_in`.                 | Stop polling; restart from step 1 if needed.        |

> [!WARNING]
> The Device Code flow is phishable: an attacker can initiate a device flow against a target and trick the victim into approving the attacker's `user_code` (consent phishing). Mitigations from [RFC 9700 §4.7](https://datatracker.ietf.org/doc/html/rfc9700#section-4.7): show the requesting client name, location, and scopes prominently on the verification page; rate-limit `user_code` generation; and treat unsolicited approvals with suspicion in account-takeover detection.

---

## OpenID Connect (OIDC) Identity Layer

OIDC extends OAuth 2.0 to provide **authentication** (proving _who_ the user is) in addition to OAuth's **authorization** (proving _what_ the user can access).

### ID Token Structure

The ID token is a JWT containing identity claims about the authenticated user:

```json
{
  "iss": "https://auth.example.com",
  "sub": "user_12345",
  "aud": "CLIENT_ID",
  "exp": 1704153600,
  "iat": 1704150000,
  "auth_time": 1704149900,
  "nonce": "def456uvw",
  "acr": "urn:mace:incommon:iap:silver",
  "amr": ["pwd", "mfa"],
  "at_hash": "x4Q8HQ2_VFbP...",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "email_verified": true
}
```

### ID Token Claims

**Required claims (per OIDC Core 1.0):**

| Claim | Description                                        | Validation                      |
| ----- | -------------------------------------------------- | ------------------------------- |
| `iss` | Issuer identifier (HTTPS URL)                      | MUST match expected issuer      |
| `sub` | Subject identifier (max 255 chars, locally unique) | Unique user ID within issuer    |
| `aud` | Audience—MUST contain `client_id`                  | Reject if client_id not present |
| `exp` | Expiration time                                    | Reject if current time > exp    |
| `iat` | Issued at time                                     | Used for clock validation       |

**Contextually required claims:**

| Claim       | Description                            | When Required                           |
| ----------- | -------------------------------------- | --------------------------------------- |
| `nonce`     | Replay protection value                | MUST be present if sent in request      |
| `auth_time` | Time of authentication                 | When `max_age` requested                |
| `acr`       | Authentication Context Class Reference | When requested as Essential             |
| `amr`       | Authentication Methods References      | Indicates methods used (pwd, otp, etc.) |
| `at_hash`   | Access token hash                      | When token issued with ID token         |
| `azp`       | Authorized party                       | When aud contains multiple values       |

### ID Token Validation (Mandatory Steps)

```javascript title="id-token-validation.js" collapse={1-5, 40-55}
import jwt from "jsonwebtoken"
import jwksClient from "jwks-rsa"

async function validateIdToken(idToken, expectedIssuer, clientId, nonce) {
  // 1. Decode header to get key ID
  const decoded = jwt.decode(idToken, { complete: true })
  const { kid, alg } = decoded.header

  // 2. Fetch signing key from JWKS endpoint
  const client = jwksClient({ jwksUri: `${expectedIssuer}/.well-known/jwks.json` })
  const key = await client.getSigningKey(kid)

  // 3. Verify signature and decode claims
  const claims = jwt.verify(idToken, key.getPublicKey(), {
    algorithms: [alg], // Explicitly allowlist algorithm
    issuer: expectedIssuer,
    audience: clientId,
  })

  // 4. Validate nonce (replay protection)
  if (claims.nonce !== nonce) {
    throw new Error("Nonce mismatch - potential replay attack")
  }

  // 5. Validate auth_time if max_age was used
  if (claims.auth_time && maxAgeUsed) {
    const authAge = Math.floor(Date.now() / 1000) - claims.auth_time
    if (authAge > maxAge) {
      throw new Error("Authentication too old - re-authentication required")
    }
  }

  // 6. Validate at_hash if present (binds ID token to access token)
  if (claims.at_hash) {
    const expectedHash = computeAtHash(accessToken, alg)
    if (claims.at_hash !== expectedHash) {
      throw new Error("Access token hash mismatch")
    }
  }

  return claims
}

// Compute at_hash per OIDC Core 3.1.3.6
// Hash algorithm is derived from the *bit length* in the JWS alg name
// ({RS,ES,HS,PS}{256,384,512} -> sha-{256,384,512}), NOT a binary RS256/everything-else split.
function computeAtHash(accessToken, alg) {
  const bits = alg.match(/(256|384|512)$/)?.[1]
  if (!bits) throw new Error(`Unsupported alg for at_hash: ${alg}`)
  const hashAlg = `sha${bits}`
  const hash = crypto.createHash(hashAlg).update(accessToken).digest()
  const halfHash = hash.slice(0, hash.length / 2)
  return halfHash.toString("base64url")
}
```

### ID Token vs Access Token vs Refresh Token

| Aspect         | ID Token                 | Access Token              | Refresh Token            |
| -------------- | ------------------------ | ------------------------- | ------------------------ |
| **Protocol**   | OIDC only                | OAuth 2.0 / OIDC          | OAuth 2.0 / OIDC         |
| **Purpose**    | Prove user identity      | Authorize API access      | Obtain new access tokens |
| **Format**     | Always JWT               | JWT or opaque             | Typically opaque         |
| **Audience**   | Client application       | Resource server (API)     | Authorization server     |
| **Validation** | Client validates locally | Resource server validates | Auth server only         |
| **Lifetime**   | Short (minutes)          | Short (5-60 min)          | Long (days/weeks)        |
| **Contains**   | User identity claims     | Scopes, permissions       | Token family reference   |

**Critical distinction**: ID tokens prove _who_ the user is (for the client). Access tokens prove _what_ the user can do (for the API). Never use an ID token to call APIs—it's semantically wrong and often insecure (audience mismatch).

### UserInfo Endpoint

The UserInfo endpoint returns claims about the authenticated user:

```http
GET /userinfo HTTP/1.1
Host: auth.example.com
Authorization: Bearer <access_token>
```

```json
{
  "sub": "user_12345",
  "name": "Jane Doe",
  "given_name": "Jane",
  "family_name": "Doe",
  "email": "jane@example.com",
  "email_verified": true,
  "picture": "https://example.com/jane.jpg"
}
```

**When to use UserInfo vs ID Token**:

- **ID Token**: Get claims at authentication time (single request)
- **UserInfo**: Fetch additional claims later, refresh claims without re-authentication

---

## Refresh Tokens and Rotation

Refresh tokens enable long-lived sessions without long-lived access tokens.

### Refresh Token Grant

```http
POST /token HTTP/1.1
Host: auth.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=8xLOxBtZp8
&client_id=CLIENT_ID
&scope=openid profile
```

**Response (with rotation):**

```json
{
  "access_token": "new_access_token...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "new_refresh_token",
  "scope": "openid profile"
}
```

### Refresh Token Rotation

Rotation issues a new refresh token with each use, invalidating the previous one:

![Refresh token rotation: each refresh issues a new access and refresh token while invalidating the previous refresh token](./diagrams/refresh-token-rotation-light.svg "Refresh token rotation: every successful refresh exchange invalidates the previous refresh token and issues a fresh one, so any single stolen token expires after one use.")
![Refresh token rotation: each refresh issues a new access and refresh token while invalidating the previous refresh token](./diagrams/refresh-token-rotation-dark.svg)

### Reuse Detection

If a previously-used refresh token is presented, it indicates token theft:

![Refresh token reuse detection: replaying an already-used refresh token triggers revocation of the entire token family](./diagrams/refresh-token-reuse-detection-light.svg "Reuse detection: when an attacker replays a previously-rotated refresh token, the authorization server treats the collision as theft and revokes the entire token family, forcing the legitimate client to re-authenticate.")
![Refresh token reuse detection: replaying an already-used refresh token triggers revocation of the entire token family](./diagrams/refresh-token-reuse-detection-dark.svg)

**Implementation considerations:**

```javascript title="refresh-reuse-detection.js" collapse={1-8, 30-45}
const GRACE_PERIOD_MS = 5000 // 5 seconds for network retries

async function handleRefreshToken(refreshToken) {
  const tokenRecord = await db.findRefreshToken(refreshToken)

  if (!tokenRecord) {
    throw new OAuthError("invalid_grant", "Unknown refresh token")
  }

  // Check if token was already used
  if (tokenRecord.usedAt) {
    const timeSinceUse = Date.now() - tokenRecord.usedAt

    // Grace period for legitimate retries (network failures)
    if (timeSinceUse < GRACE_PERIOD_MS) {
      // Return same tokens issued during grace period
      return tokenRecord.issuedTokens
    }

    // Outside grace period - potential theft!
    await db.revokeTokenFamily(tokenRecord.familyId)
    throw new OAuthError("invalid_grant", "Token reuse detected")
  }

  // Mark as used and issue new tokens
  await db.markTokenUsed(refreshToken, Date.now())

  const newTokens = await issueTokens(tokenRecord.userId, tokenRecord.scopes)
  await db.storeIssuedTokens(refreshToken, newTokens)

  return newTokens
}
```

**Trade-offs of rotation:**

| Benefit                     | Cost                                |
| --------------------------- | ----------------------------------- |
| Stolen tokens expire faster | Database write on every refresh     |
| Reuse detection possible    | Network failures can lock out users |
| Limits attacker window      | More complex state management       |

**Alternative: Sender-constrained tokens (DPoP/mTLS)** avoid rotation overhead by binding tokens to cryptographic keys.

---

## Token Storage by Platform

### Web Applications (Browser-Based)

| Storage            | XSS Vulnerable? | Recommendation                 |
| ------------------ | --------------- | ------------------------------ |
| `localStorage`     | Yes             | MUST NOT use for tokens        |
| `sessionStorage`   | Yes             | MUST NOT use for tokens        |
| JavaScript memory  | No (unless XSS) | RECOMMENDED for access tokens  |
| `HttpOnly` cookies | No              | RECOMMENDED for refresh tokens |

**Backend-for-Frontend (BFF) Pattern** (most secure for SPAs):

![Backend-for-Frontend pattern keeping OAuth tokens off the browser, with the SPA holding only an HttpOnly session cookie](./diagrams/bff-pattern-architecture-light.svg "Backend-for-Frontend (BFF): the SPA holds only an HttpOnly session cookie; the BFF terminates the OAuth flow, stores access and refresh tokens server-side, and proxies API calls so tokens never touch JavaScript.")
![Backend-for-Frontend pattern keeping OAuth tokens off the browser, with the SPA holding only an HttpOnly session cookie](./diagrams/bff-pattern-architecture-dark.svg)

- Browser never sees OAuth tokens
- BFF maintains server-side session
- Session ID in `HttpOnly`, `Secure`, `SameSite=Strict` cookie
- BFF proxies API requests with access token

### Mobile Applications

| Platform    | Recommended Storage        | Notes                               |
| ----------- | -------------------------- | ----------------------------------- |
| **iOS**     | Keychain Services          | Encrypted, hardware-backed          |
| **Android** | EncryptedSharedPreferences | Uses Android Keystore               |
| **Both**    | Secure Enclave/TEE         | Strongest protection when available |

```swift title="ios-keychain-storage.swift" collapse={1-4, 20-35}
// iOS: Store refresh token in Keychain
import Security

func storeRefreshToken(_ token: String, for userId: String) -> Bool {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: userId,
        kSecAttrService as String: "oauth-refresh-token",
        kSecValueData as String: token.data(using: .utf8)!,
        kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    ]

    // Delete existing item first
    SecItemDelete(query as CFDictionary)

    // Add new item
    let status = SecItemAdd(query as CFDictionary, nil)
    return status == errSecSuccess
}
```

### Native Apps (RFC 8252)

RFC 8252 defines OAuth for native applications:

| Requirement                              | Rationale                               |
| ---------------------------------------- | --------------------------------------- |
| Use external user-agent (system browser) | Enables SSO, prevents credential theft  |
| MUST NOT use embedded WebViews           | Host app can inject JS, capture cookies |
| PKCE is mandatory                        | Multiple apps can claim same URI scheme |

**Redirect URI options:**

| Type               | Format                             | Platform                               |
| ------------------ | ---------------------------------- | -------------------------------------- |
| Claimed HTTPS      | `https://app.example.com/oauth`    | iOS Universal Links, Android App Links |
| Loopback           | `http://127.0.0.1:{port}/callback` | Desktop apps (any port)                |
| Private URI scheme | `com.example.app:/callback`        | Mobile apps                            |

---

## DPoP: Demonstrating Proof of Possession

DPoP (RFC 9449) sender-constrains tokens to prevent stolen tokens from being usable by attackers.

### How DPoP Works

![DPoP flow: client signs a proof JWT with an ephemeral key, authorization server binds the access token to that key, and the resource server verifies a fresh per-request proof](./diagrams/dpop-flow-light.svg "DPoP (RFC 9449): the authorization server binds the access token to the client's public key (cnf claim with JWK thumbprint). The client must sign a fresh DPoP proof JWT for every API call, so a stolen bearer token alone is useless without the corresponding private key.")
![DPoP flow: client signs a proof JWT with an ephemeral key, authorization server binds the access token to that key, and the resource server verifies a fresh per-request proof](./diagrams/dpop-flow-dark.svg)

### DPoP Proof JWT Structure

**Header:**

```json
{
  "typ": "dpop+jwt",
  "alg": "ES256",
  "jwk": {
    "kty": "EC",
    "crv": "P-256",
    "x": "l8tFrhx-34tV3hRICRDY9zCkDlpBhF42UQUfWVAWBFs",
    "y": "9VE4jf_Ok_o64tbkMYAPVS-9hQp9A7v9oy_A9C1_2RY"
  }
}
```

**Payload (for token request):**

```json
{
  "jti": "e7d7c7a9-1234-5678-abcd-ef0123456789",
  "htm": "POST",
  "htu": "https://auth.example.com/token",
  "iat": 1704150000
}
```

**Payload (for resource request):**

```json
{
  "jti": "f8e8d8b9-2345-6789-bcde-f01234567890",
  "htm": "GET",
  "htu": "https://api.example.com/resource",
  "iat": 1704150100,
  "ath": "fUHyO2r2Z3DZ53EsNrWBb0xWXoaNy59IiKCAqksmQEo"
}
```

### DPoP Claims

| Claim   | Description                         | When Required           |
| ------- | ----------------------------------- | ----------------------- |
| `jti`   | Unique identifier (UUID v4)         | Always                  |
| `htm`   | HTTP method                         | Always                  |
| `htu`   | HTTP target URI (no query/fragment) | Always                  |
| `iat`   | Issued at timestamp                 | Always                  |
| `ath`   | Access token hash                   | For resource requests   |
| `nonce` | Server-provided nonce               | When required by server |

**Security benefit**: Even if an attacker steals the access token, they cannot use it without the private key that signed the DPoP proofs.

---

## Security Pitfalls and Mitigations

### Authorization Code Interception

**Attack**: Malicious app intercepts authorization code via shared redirect URI.

**Mitigation**: PKCE (mandatory in OAuth 2.1).

### CSRF via Forged Authorization Response

**Attack**: Attacker tricks user into completing OAuth flow with attacker's account.

**Mitigation**: `state` parameter—validate it matches the value sent in the request.

### ID Token Replay

**Attack**: Attacker replays captured ID token to authenticate as victim.

**Mitigation**: `nonce` parameter—include in request, validate in ID token.

### Mix-Up Attack

**Attack**: When client supports multiple authorization servers, attacker tricks client into sending tokens to wrong server.

**Mitigation**:

- Validate `iss` parameter in authorization response (RFC 9207)
- Validate `iss` claim in ID token matches expected issuer
- Use distinct `redirect_uri` per authorization server

### Open Redirect via redirect_uri

**Attack**: Attacker crafts authorization request with malicious `redirect_uri` to steal authorization code.

**Mitigation**: Exact string matching for `redirect_uri` validation (no wildcards, no patterns).

```javascript title="redirect-uri-validation.js"
// Registration: Store exact URIs only
const registeredRedirectUris = ["https://client.example.com/callback", "https://client.example.com/oauth/callback"]

// Validation: Exact string match
function validateRedirectUri(requestedUri) {
  // MUST be exact match - no wildcards, patterns, or normalization
  return registeredRedirectUris.includes(requestedUri)
}

// MUST NOT allow:
// - https://client.example.com/* (wildcard)
// - https://*.example.com/callback (subdomain wildcard)
// - Pattern matching or regex
```

### Token Leakage via Referrer

**Attack**: Access tokens in URL fragments leak via `Referer` header.

**Mitigation**:

- Use Authorization Code flow (not Implicit)
- Set `Referrer-Policy: no-referrer` header
- Use `response_mode=form_post` (OIDC)

### Insufficient Redirect URI Validation

**Attack**: Authorization server accepts partial URI matches, enabling redirect to attacker-controlled subdomain.

**Mitigation**: Per RFC 9700 (OAuth Security BCP): "Authorization servers MUST utilize exact string matching" for redirect URI validation.

---

## OAuth 2.1 Key Changes

OAuth 2.1 (currently [draft-15](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-15), published 2 March 2026 and still on the standards track) consolidates OAuth 2.0 with security best practices from [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700) (January 2025).

### Removed Flows

| Flow                                    | Reason for Removal                                                         |
| --------------------------------------- | -------------------------------------------------------------------------- |
| **Implicit** (`response_type=token`)    | Tokens in URL fragments leak via history, referrer, logs                   |
| **Resource Owner Password Credentials** | Violates OAuth's core principle—never share credentials with third parties |

### Mandatory Requirements

| Requirement                                 | OAuth 2.0     | OAuth 2.1                                        |
| ------------------------------------------- | ------------- | ------------------------------------------------ |
| PKCE for public clients                     | RECOMMENDED   | MUST ([§7.5][oauth21-pkce])                      |
| PKCE for confidential clients               | Not mentioned | MUST ([§7.5][oauth21-pkce]; RECOMMENDED in §7.5.1 exceptions) |
| Exact redirect URI matching                 | SHOULD        | MUST                                             |
| Bearer tokens in query strings              | Allowed       | MUST NOT                                         |
| Refresh token sender-constraint or rotation | Not specified | MUST (public clients)                            |
| HTTPS for all endpoints                     | SHOULD        | MUST (except loopback)                           |

[oauth21-pkce]: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-15#section-7.5

### Migration Checklist

1. **Implement PKCE** for all clients, including confidential
2. **Remove Implicit flow** support; migrate to Authorization Code + PKCE
3. **Remove ROPC** if implemented; migrate to proper redirect flow
4. **Enforce exact redirect URI matching**—no wildcards
5. **Implement refresh token rotation** or DPoP for public clients
6. **Never send tokens in query strings**—use headers or POST body

---

## Beyond OAuth 2.1: Hardening Profiles and Extensions

OAuth 2.1 is the floor; high-assurance deployments — banking, healthcare, government, regulated APIs — layer additional specs on top. The pieces worth knowing:

| Spec                                                                                                                              | What it does                                                                                                                                       | When to reach for it                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **[RFC 9068][rfc9068]** — JWT Profile for OAuth 2.0 Access Tokens                                                                 | Standardises JWT access-token shape: `typ: "at+jwt"` header; required `iss`, `exp`, `aud`, `sub`, `client_id`, `iat`, `jti`; optional `scope`, `roles`, `groups`, `entitlements`. | When you want resource servers to validate access tokens locally via JWKS instead of calling introspection.    |
| **[RFC 9126][rfc9126]** — Pushed Authorization Requests (PAR)                                                                     | Client POSTs the authorization-request parameters to a `/par` endpoint, gets back a single-use `request_uri`, and uses that in the redirect.        | When request parameters carry sensitive data (RAR objects, large `claims`), or when integrity of the request matters. |
| **[RFC 9101][rfc9101]** — JWT-Secured Authorization Request (JAR)                                                                 | Sign (and optionally encrypt) the authorization request as a JWT (`request` or `request_uri` parameter).                                            | When the channel between client and authorization server cannot be trusted to preserve parameter integrity.     |
| **[JARM][jarm]** — JWT Secured Authorization Response Mode                                                                        | Returns the authorization response as a signed JWT (`response_mode=jwt`/`query.jwt`/`fragment.jwt`/`form_post.jwt`), binding `iss`, `aud`, `exp`.    | Closes the same integrity gap as JAR but on the response side; complements JAR/PAR.                             |
| **[RFC 9396][rfc9396]** — Rich Authorization Requests (RAR)                                                                       | Replaces coarse `scope` strings with a structured `authorization_details` JSON array (`type`, `actions`, `locations`, `datatypes`, …).               | When scopes are too coarse — payment initiation ("transfer £100 to IBAN X"), per-record consent, fine-grained API authorization. |
| **[RFC 9449][rfc9449]** — DPoP                                                                                                    | Sender-constrains tokens via a per-request signed proof JWT bound to a public key (`cnf` thumbprint).                                                | Public clients (SPAs, mobile) that need sender-constraint without mTLS infrastructure. Already covered above.   |
| **[RFC 8705][rfc8705]** — Mutual-TLS Client Authentication and Certificate-Bound Tokens                                            | Sender-constrains tokens to the TLS client certificate (`cnf.x5t#S256`).                                                                            | Backend / FAPI deployments where you already have a PKI and can terminate mTLS at the edge.                     |
| **[RFC 9207][rfc9207]** — Authorization Server Issuer Identification                                                              | Returns `iss` in the authorization response so clients can defend against mix-up attacks across multiple authorization servers.                      | Always, when you talk to more than one authorization server. Already covered in the callback validation above.   |
| **[FAPI 2.0 Security Profile][fapi2]** (OIDF, Final, Feb 2025)                                                                    | Combines PAR + PKCE + sender-constrained tokens (mTLS or DPoP) + `private_key_jwt` / mTLS client auth + asymmetric signing into a single profile.    | Open Banking, Open Finance, Open Healthcare, government identity, any "high" assurance API.                     |

[rfc9068]: https://datatracker.ietf.org/doc/html/rfc9068
[rfc9126]: https://datatracker.ietf.org/doc/html/rfc9126
[rfc9101]: https://datatracker.ietf.org/doc/html/rfc9101
[jarm]: https://openid.net/specs/oauth-v2-jarm-final.html
[rfc9396]: https://datatracker.ietf.org/doc/html/rfc9396
[rfc9449]: https://datatracker.ietf.org/doc/html/rfc9449
[rfc8705]: https://datatracker.ietf.org/doc/html/rfc8705
[rfc9207]: https://datatracker.ietf.org/doc/html/rfc9207
[fapi2]: https://openid.net/specs/fapi-security-profile-2_0-final.html

> [!TIP]
> If you are designing a new high-assurance deployment in 2026, do not hand-pick from this menu. Adopt **FAPI 2.0** as the target profile — it bundles PAR, PKCE, sender-constrained tokens, and asymmetric client authentication into a single conformance-tested package, with [Conformance Suite](https://openid.net/certification/) certification available.

---

## Conclusion

OAuth 2.0 and OIDC provide a robust framework for authorization and authentication, but secure implementation requires understanding the threat model and applying defense-in-depth:

1. **Pick the right flow first.** Authorization Code + PKCE for any user-facing client; Device Authorization Grant for input-constrained devices; Client Credentials for service-to-service. Implicit and ROPC are gone.
2. **ID tokens prove identity** (for clients); **access tokens prove authorization** (for APIs)—never confuse them.
3. **State, nonce, and PKCE** work together—all three are required for user-facing flows.
4. **Token storage** must match platform capabilities—HttpOnly cookies (or BFF) for web, Keychain/Keystore for mobile, never `localStorage`.
5. **Refresh token rotation** or sender-constraining (**DPoP** / **mTLS**) is mandatory for public clients in OAuth 2.1; both is better.
6. **OAuth 2.1 is the floor, not the ceiling.** For high-assurance APIs, adopt **FAPI 2.0** (PAR + PKCE + sender-constrained tokens + asymmetric client auth) as a single bundle.

The complexity exists because the threat model is real. Authorization code interception, CSRF, replay attacks, and token theft are documented, exploited vulnerabilities. Every security parameter exists because of a specific attack it prevents.

## Appendix

### Prerequisites

- HTTP fundamentals (cookies, headers, redirects, CORS)
- Cryptographic basics (symmetric vs asymmetric, hashing, JWTs)
- Session management patterns

### Terminology

| Term                   | Definition                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------- |
| **Authorization Code** | Short-lived credential exchanged for tokens; single-use, bound to client and PKCE     |
| **CSRF**               | Cross-Site Request Forgery—attack forcing user to execute unwanted actions            |
| **DPoP**               | Demonstrating Proof of Possession—mechanism for sender-constraining tokens (RFC 9449) |
| **ID Token**           | JWT containing identity claims about the authenticated user (OIDC)                    |
| **OIDC**               | OpenID Connect—identity layer on OAuth 2.0 for authentication                         |
| **PKCE**               | Proof Key for Code Exchange—prevents authorization code interception (RFC 7636)       |
| **Refresh Token**      | Long-lived credential for obtaining new access tokens without user interaction        |
| **Sender-Constraint**  | Binding a token to the client that requested it, preventing use by others             |

### Summary

- OAuth 2.0 is authorization (what you can access); OIDC is authentication (who you are).
- Three canonical flows in OAuth 2.1: **Authorization Code + PKCE** (anything with a browser), **Device Authorization Grant** (input-constrained devices), **Client Credentials** (service-to-service). Implicit and ROPC are removed.
- `state` prevents CSRF; `nonce` prevents replay; PKCE prevents code interception — use all three on user-facing flows.
- ID tokens are for clients; access tokens are for APIs — never interchange them.
- Refresh token rotation detects theft; DPoP / mTLS prevents stolen token use; one of the two is mandatory for public clients.
- Store tokens appropriately: memory or HttpOnly cookies (BFF) for web; Keychain / Keystore for mobile.
- For high-assurance APIs, jump straight to **FAPI 2.0** rather than re-deriving the hardening from RFCs.

### References

**Core specifications:**

- [RFC 6749: OAuth 2.0 Authorization Framework](https://datatracker.ietf.org/doc/html/rfc6749) — core grants and roles.
- [RFC 6750: Bearer Token Usage](https://datatracker.ietf.org/doc/html/rfc6750) — `Authorization: Bearer` semantics.
- [RFC 7636: PKCE](https://datatracker.ietf.org/doc/html/rfc7636) — Proof Key for Code Exchange.
- [RFC 8628: OAuth 2.0 Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628) — input-constrained devices.
- [RFC 9068: JWT Profile for OAuth 2.0 Access Tokens](https://datatracker.ietf.org/doc/html/rfc9068) — `at+jwt` shape.
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — identity layer (also ISO/IEC 26131:2024).
- [OpenID Connect Discovery 1.0](https://openid.net/specs/openid-connect-discovery-1_0.html) — `/.well-known/openid-configuration`.
- [OAuth 2.1 Draft 15](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-15) — IETF Internet-Draft, 2026-03-02.

**Security and hardening:**

- [RFC 6819: OAuth 2.0 Threat Model](https://datatracker.ietf.org/doc/html/rfc6819) — original threat model.
- [RFC 9700: OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/rfc9700) — January 2025; updates 6749 / 6750 / 6819.
- [RFC 9207: Authorization Server Issuer Identification](https://datatracker.ietf.org/doc/html/rfc9207) — `iss` in authorization response (mix-up defence).
- [RFC 9449: DPoP](https://datatracker.ietf.org/doc/html/rfc9449) — sender-constrained tokens via proof-of-possession JWTs.
- [RFC 8705: Mutual-TLS Client Authentication and Certificate-Bound Tokens](https://datatracker.ietf.org/doc/html/rfc8705) — mTLS sender-constraint.
- [RFC 9126: Pushed Authorization Requests (PAR)](https://datatracker.ietf.org/doc/html/rfc9126) — push request parameters via back channel.
- [RFC 9101: JWT-Secured Authorization Request (JAR)](https://datatracker.ietf.org/doc/html/rfc9101) — sign authorization requests.
- [JARM Final](https://openid.net/specs/oauth-v2-jarm-final.html) — JWT Secured Authorization Response Mode.
- [RFC 9396: Rich Authorization Requests (RAR)](https://datatracker.ietf.org/doc/html/rfc9396) — structured `authorization_details`.
- [FAPI 2.0 Security Profile (OIDF, Final, Feb 2025)](https://openid.net/specs/fapi-security-profile-2_0-final.html) — high-assurance bundle.

**Implementation guidance:**

- [RFC 8252: OAuth for Native Apps (BCP 212)](https://datatracker.ietf.org/doc/html/rfc8252) — system browsers, claimed HTTPS, loopback, private URI schemes.
- [RFC 7523: JWT Profile for Client Authentication](https://datatracker.ietf.org/doc/html/rfc7523) — `private_key_jwt`.
- [RFC 8693: OAuth 2.0 Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693) — delegation and impersonation patterns.
- [OWASP OAuth2 Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html) — implementation security guidance.
