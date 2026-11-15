---
title: "Proxmox Next to Arch on One Disk"
description: Turning my desktop into a second Proxmox node without giving up Arch.
author: aron
date: 2026-11-15 18:00:00 +0100
categories: [Homelab, Linux]
tags: [Homelab, Proxmox, Debian, Arch Linux, GRUB, Networking, Clustering]
---
My homelab ran on a single Proxmox node with a **Pentium Gold G5400T**. My desktop has a **Ryzen 9 7950X3D** and an **RX 6900 XT** that sit idle most of the day. So the plan: put Proxmox on the desktop, keep Arch as my daily driver, and join both machines into one cluster.

This post is the path I took, including every wall I walked into.

## The starting point

The desktop has one 465 GB SSD with Arch on it, plus a 416 GB partition I had formatted at some point and forgotten about.

```
sda           465.8G  disk
├─sda1        416.4G  part            <- empty ext4, unused
├─sda2          1G    part /boot      <- EFI (vfat), shared by everything
└─sda3         48.4G  part /          <- Arch
```

Before touching anything, I checked whether `sda1` was really empty. All of this works from the running system, no reboot needed:

```bash
lsblk -f /dev/sda
sudo mount -o ro /dev/sda1 /mnt
df -h /mnt && sudo ls -la /mnt     # 36K used, only lost+found
sudo umount /mnt
```

Empty, so free to use.

## Why not just use the Proxmox ISO?

That was my first idea too. The catch: the Proxmox installer has **no option to install to a single partition**. It always takes the whole target disk, which would have wiped Arch.

The way around it is the officially supported route of installing Debian first and adding Proxmox on top. Proxmox VE 9 is built on **Debian 13 "Trixie"**, so:

1. Boot the Debian 13 netinst ISO from my Ventoy stick.
2. Manual partitioning: delete `sda1`, create a 256 GB ext4 root in its place.
3. Mark `sda2` as *EFI System Partition*, **without formatting it**.
4. Leave `sda3` alone. Check the summary screen twice.
5. Software selection: only *SSH server* and *standard system utilities*.

> On a UEFI system, the EFI partition is shared. If the installer formats it, every other OS on the disk loses its bootloader.

## Adding Proxmox to Debian

On the fresh Debian, as root (`su -`, with the dash):

**1. The hostname has to resolve to the LAN IP**, not to Debian's default `127.0.1.1`:

```
# /etc/hosts
192.168.0.5    ProxMain.home.lan ProxMain
```

```bash
hostnamectl set-hostname ProxMain
hostname --ip-address        # must print the LAN IP
```

**2. Key and no-subscription repo:**

```bash
wget https://enterprise.proxmox.com/debian/proxmox-archive-keyring-trixie.gpg \
  -O /usr/share/keyrings/proxmox-archive-keyring.gpg
sha256sum /usr/share/keyrings/proxmox-archive-keyring.gpg
# 136673be77aba35dcce385b28737689ad64fd785a797e57897589aed08db6e45

cat > /etc/apt/sources.list.d/proxmox.sources <<'EOF'
Types: deb
URIs: http://download.proxmox.com/debian/pve
Suites: trixie
Components: pve-no-subscription
Signed-By: /usr/share/keyrings/proxmox-archive-keyring.gpg
EOF

apt update && apt full-upgrade
```

**3. Proxmox kernel first, then reboot:**

```bash
apt install proxmox-default-kernel
```

**4. Then the rest of Proxmox:**

```bash
apt install proxmox-ve postfix open-iscsi chrony
```

After that, the web UI was up on port `8006`.

## Booting it: GRUB had other plans

I let Arch's GRUB handle all booting, with os-prober picking up Debian. After installing the Proxmox kernel, `uname -r` still said `+deb13-amd64`.

The reason: os-prober builds one main entry for Debian and stuffs the other kernels into an *Advanced options* submenu, where every entry had the same title. Picking one at random got me the stock Debian kernel again.

Also, Debian's `/vmlinuz` symlink still pointed at the Debian kernel, not the new `-pve` one. So I skipped os-prober and wrote the entry myself in Arch's `/etc/grub.d/40_custom`:

```
menuentry "Proxmox VE" {
    insmod part_gpt
    insmod ext2
    search --no-floppy --fs-uuid --set=root <ROOT-UUID>
    linux /boot/vmlinuz-7.0.14-26-pve root=UUID=<ROOT-UUID> ro quiet
    initrd /boot/initrd.img-7.0.14-26-pve
}
```

```bash
sudo grub-mkconfig -o /boot/grub/grub.cfg
```

With that working, I turned os-prober off (`GRUB_DISABLE_OS_PROBER=true`) to clean up the menu.

> The tradeoff: when a Proxmox update ships a new kernel, I bump the version in this entry. The old kernel stays installed, so forgetting doesn't break booting.

## The static IP that wouldn't stick

Proxmox networking uses `ifupdown2` and a Linux bridge, `vmbr0`, with the static address sitting on the bridge instead of the NIC:

```
auto vmbr0
iface vmbr0 inet static
    address 192.168.0.5/24
    gateway 192.168.0.1
    bridge-ports enp10s0
    bridge-stp off
    bridge-fd 0
```

On every boot, though, the network was dead, and the log said:

```
cannot find device vmbr0
invalid use of bridge attribute (bridge-stp) on non-bridge stanza
```

The cause was embarrassingly small: I had typed `brige-ports`. Without a valid `bridge-ports` line, ifupdown2 doesn't treat `vmbr0` as a bridge, never creates it, and then fails to route through it.

Other things that bit me along the way:

| Symptom | Cause |
| --- | --- |
| `ifreload: command not found` | `su` without the dash, so `/usr/sbin` isn't in `PATH` |
| apt crawling at 17 KB/s on a 200 Mbit line | broken IPv6 route; `-o Acquire::ForceIPv4=true` fixed it |
| `401 Unauthorized` from apt on the old node | ISO install had the enterprise repo enabled; disable it, add no-subscription |
| Wi-Fi gone | disabling NetworkManager for the bridge took Wi-Fi with it |

## Joining the cluster

Both nodes need the same Proxmox major version, so I updated the old node first. Then:

```bash
# on the existing node
pvecm create homelab

# on ProxMain
pvecm add <existing-node-ip>
```

Both nodes now show up in either web UI. Proxmox clusters have no master: every node holds the same replicated config, so it doesn't matter which one I log into.

## The catch: quorum

Every node gets one vote, and the cluster only allows changes when **more than half** of the votes are present. That prevents two halves that can't see each other from both making conflicting changes.

With two nodes, more than half means both. So whenever I boot the desktop into Arch, the old node is left with one of two votes and goes read-only. Running VMs keep going, but nothing new starts and no settings change.

The fix is a third vote: a **QDevice**, a tiny arbiter on any always-on machine. With three votes, one node plus the arbiter is still a majority. That's the next step, documented in the [Proxmox admin guide](https://pve.proxmox.com/pve-docs/chapter-pvecm.html#_corosync_external_vote_support).

## What's next

- QDevice on an always-on box, so dual-booting stops freezing the cluster.
- Moving Jellyfin's transcoding onto the 6900 XT, with media served over NFS from the old node.
- A local DNS name like `media.home.arpa` in front of it, with a fallback when the desktop is in Arch.

Overall: a few hours of chasing one typo and one GRUB submenu, and the homelab got about ten times more compute.
