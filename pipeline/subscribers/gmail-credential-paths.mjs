import { stat } from "node:fs/promises";
import { join } from "node:path";

export function gmailCredentialPaths({
  root,
  environment = process.env,
} = {}) {
  const secretsDirectory = join(root, ".secrets");
  return {
    clientSecretPath:
      environment.CRIME_CARTOGRAPHY_GMAIL_CLIENT_SECRET ||
      join(secretsDirectory, "youtube_client_secret.json"),
    tokenPath:
      environment.CRIME_CARTOGRAPHY_GMAIL_TOKEN ||
      join(secretsDirectory, "gmail_subscriber_inbox_token.json"),
  };
}

export async function assertPrivateCredential(path, label) {
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error(`${label} is not a regular file: ${path}`);
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
    throw new Error(`${label} must not be readable or writable by group/other: ${path}`);
  }
  return path;
}
