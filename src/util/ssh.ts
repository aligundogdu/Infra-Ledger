import type { Address } from "../index/core";

export interface SshTarget {
  address: string;
  label?: string;
  command: string;
}

export function sshCommand(address: string, port: number, user?: string): string {
  return `ssh -p ${port} ${user ? `${user}@` : ""}${address}`;
}

/** Every address SSH can use, ips first, then hosts. The first one is the default. */
export function sshTargets(r: { ips: Address[]; hosts: Address[]; sshPort: number }, user?: string): SshTarget[] {
  return [...r.ips, ...r.hosts].map((a) => ({
    address: a.value,
    ...(a.label && { label: a.label }),
    command: sshCommand(a.value, r.sshPort, user),
  }));
}
