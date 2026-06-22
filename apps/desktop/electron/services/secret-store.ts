import { safeStorage } from "electron";

/**
 * OS-encrypted secret storage. Wraps Electron `safeStorage` async API:
 * macOS Keychain, Windows DPAPI, Linux secret-service/portal.
 *
 * `node-keytar` was archived Dec 2022; this is the standard replacement.
 * Secrets live as an encrypted JSON blob in SQLite (`connectors.secret_blob`).
 */

export interface SecretStore {
  isAvailable(): boolean;
  encrypt(plain: string): Promise<Uint8Array>;
  decrypt(blob: Uint8Array): Promise<string>;
}

export class SafeStorageSecretStore implements SecretStore {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  async encrypt(plain: string): Promise<Uint8Array> {
    if (!safeStorage.isEncryptionAvailable()) {
      // Refuse plaintext — never silently degrade for a credential.
      throw new Error(
        "safeStorage encryption unavailable; refusing to store a secret as plaintext",
      );
    }
    return safeStorage.encryptStringAsync(plain);
  }

  async decrypt(blob: Uint8Array): Promise<string> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("safeStorage encryption unavailable; cannot decrypt secret");
    }
    // Decrypt result may report key rotation — re-encrypt on next write.
    const { result } = await safeStorage.decryptStringAsync(Buffer.from(blob));
    return result;
  }
}
