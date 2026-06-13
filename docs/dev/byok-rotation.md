# BYOK Master-Key Rotation

`MASTER_ENCRYPTION_KEY` encrypts per-company BYOK provider configs at rest.
Ciphertexts use:

```text
ssfw-aes-256-gcm:v1:<iv-base64url>:<tag-base64url>:<ciphertext-base64url>
```

The key must decode to exactly 32 bytes. Supported env formats are raw
32-byte text, 64-character hex, `base64:<value>`, or `base64url:<value>`.

## Local Override Config

`shared.tenants.local_override_config` is plaintext JSON because it is a
non-secret operator setting. The validated shape is:

```json
{
  "baseUrl": "http://localhost:11434/v1",
  "apiKey": "placeholder-or-token",
  "textModel": "gemma-text",
  "visionModel": "gemma-vision"
}
```

`apiKey` is optional. `baseUrl`, `textModel`, and `visionModel` are required.

## Rotation Procedure

1. Stop writes to `/workspace/settings/byok` or place the app in maintenance
   mode.
2. Keep the old key available outside the app process as
   `OLD_MASTER_ENCRYPTION_KEY`.
3. Set the new app secret as `MASTER_ENCRYPTION_KEY`, but do not resume traffic
   yet.
4. Run a one-off rotation job that reads each non-null
   `shared.tenants.byok_provider_config_ciphertext`, decrypts it with
   `OLD_MASTER_ENCRYPTION_KEY`, re-encrypts the same plaintext with the new
   `MASTER_ENCRYPTION_KEY`, and writes the new ciphertext back in one
   transaction.
5. Verify every BYOK row still has a non-null
   `byok_provider_config_masked_indicator`, and that no ciphertext contains an
   API-key prefix or suffix in clear text.
6. Resume traffic only after the rotation job exits 0 and the BYOK validation
   smoke check passes for a test tenant.
7. Remove `OLD_MASTER_ENCRYPTION_KEY` from the shell, job runner, and secrets
   manager.

Never log decrypted BYOK configs during rotation. If a row fails to decrypt,
leave that row unchanged and escalate before dropping the old key.
