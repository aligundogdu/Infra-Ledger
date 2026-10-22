import type { Address } from "../index/core";

export interface SshTarget {
  address: string;
  label?: string;
  scope?: string;
  command: string;
}

export function sshCommand(address: string, port: number, user?: string): string {
  return `ssh -p ${port} ${user ? `${user}@` : ""}${address}`;
}

/** Every address SSH can use, in the resource's order. The first one is the default. */
export function sshTargets(r: { addresses: Address[]; sshPort: number }, user?: string): SshTarget[] {
  return r.addresses.map((a) => ({
    address: a.value,
    ...(a.label && { label: a.label }),
    scope: a.scope,
    command: sshCommand(a.value, r.sshPort, user),
  }));
}
