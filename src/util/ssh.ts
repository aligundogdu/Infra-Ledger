export interface SshTarget {
  ip?: string;
  host?: string;
  sshPort?: number;
}

export function sshCommand(target: SshTarget, user?: string): string | null {
  const address = target.ip || target.host;
  if (!address) return null;
  const port = target.sshPort ?? 22;
  return `ssh -p ${port} ${user ? `${user}@` : ""}${address}`;
}
