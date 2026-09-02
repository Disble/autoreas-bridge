#!/bin/sh
# Refresh the indexed caches that make a freshly installed icon and desktop
# entry visible without logging out.
#
# The files land on disk either way; these three caches are what the shell and
# the software store actually read. Skipping them is why a correct package can
# still look broken until the next login.
#
# Runs as both postinstall and postremove: the same caches need rebuilding when
# the files disappear. Every command is guarded, because none of these tools is
# guaranteed to exist and a missing cache updater must never fail the install.
set -e

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache --quiet --force /usr/share/icons/hicolor || true
fi

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database --quiet /usr/share/applications || true
fi

if command -v appstreamcli >/dev/null 2>&1; then
    appstreamcli refresh --force >/dev/null 2>&1 || true
fi

exit 0
