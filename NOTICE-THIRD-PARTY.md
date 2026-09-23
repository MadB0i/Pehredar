# NOTICE — Third-Party Components

## Android Debug Bridge (adb) and fastboot

- **What:** `adb(.exe)`, `fastboot(.exe)` and (Windows-only) `AdbWinApi.dll` /
  `AdbWinUsbApi.dll`, shipped inside the Pehredar Windows installer / Linux
  AppImage under `resources/bin/<win|linux>/` (see `scripts/fetch-adb.py`).
  The binaries are **never committed to git** (`gui/resources/bin/` is
  git-ignored); they are fetched fresh on every release build.
- **Source:** the Android Open Source Project —
  [`platform/packages/modules/adb`](https://android.googlesource.com/platform/packages/modules/adb/) —
  which carries a `MODULE_LICENSE_APACHE2` marker and an upstream `NOTICE`
  file.
- **License: Apache License, Version 2.0.** The module's `Android.bp` build
  files declare the basis explicitly (e.g.
  [`pairing_connection/Android.bp`](https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/pairing_connection/Android.bp)
  sets `default_applicable_licenses: ["packages_modules_adb_license"]`,
  importing `license_kinds: SPDX-license-identifier-Apache-2.0`). Apache 2.0
  is AOSP's preferred license (see
  [source.android.com](https://source.android.com/docs/setup/contribute/licenses)).
  The redistributed binaries originate from this Apache-2.0-licensed source —
  not from a proprietary grant — so redistribution in Object form is
  permitted under Apache 2.0 §4 as long as this NOTICE accompanies the
  distribution.
- **Distribution note:** the binaries are obtained via Google's official
  platform-tools channel
  (`https://dl.google.com/android/repository/platform-tools-latest-<windows|linux>.zip`),
  the standard builds of the AOSP source above. Precedent: Genymobile/scrcpy —
  itself an [Apache-2.0 project](https://github.com/Genymobile/scrcpy/blob/master/LICENSE) —
  ships these same platform-tools adb binaries inside its official Windows
  release archives (see
  [doc/windows.md](https://github.com/Genymobile/scrcpy/blob/master/doc/windows.md):
  "a prebuilt archive with all the dependencies (including adb)") and tracks
  platform-tools upgrades in its release notes. This project follows the same
  approach.
- **License text:** the full Apache License 2.0 is not reproduced here; see
  <https://www.apache.org/licenses/LICENSE-2.0>.
- **Upstream attribution (Apache 2.0 §4(d)):** the AOSP adb module's upstream
  `NOTICE` file contains the following, reproduced here as required:
  > Copyright (c) 2006-2009, The Android Open Source Project
- **Windows DLLs:** `AdbWinApi.dll` / `AdbWinUsbApi.dll` are Windows-only USB
  helper libraries built from the same AOSP adb sources — same Apache-2.0
  basis as above, noted separately because they ship only in `bin/win/`.
- **Diligence note:** Google's download page presents SDK click-through
  terms; this file records the project's licensing basis (AOSP origin,
  Apache-2.0, scrcpy precedent). Re-verify this basis before each public
  release that embeds the binaries.

## Pehredar Python core (PyInstaller onefile)

- The bundled `pehredar-core(.exe)` / `pehredar-agent-core(.exe)` are built
  from this repo's own MIT-licensed code (`pehredar/`, see `LICENSE`) plus
  its open-source dependencies (`click`, `rich` and their transitive deps).
  No extra license action is needed beyond the dependency licenses, which
  are permissive. Rebuild any time with `python scripts/build_core.py`.
