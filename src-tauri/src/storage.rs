use atomicwrites::{AllowOverwrite, AtomicFile};
use std::{
    io::{self, Write},
    path::Path,
};

pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    AtomicFile::new(path, AllowOverwrite)
        .write(|file| file.write_all(bytes))
        .map_err(|error| storage_error(error.into()))
}

pub(crate) fn storage_error(error: io::Error) -> String {
    if error.kind() == io::ErrorKind::PermissionDenied {
        return "STORAGE_PERMISSION".into();
    }
    #[cfg(unix)]
    if matches!(error.raw_os_error(), Some(28)) {
        return "STORAGE_FULL".into();
    }
    #[cfg(windows)]
    if matches!(error.raw_os_error(), Some(39 | 112)) {
        return "STORAGE_FULL".into();
    }
    #[cfg(unix)]
    if matches!(error.raw_os_error(), Some(30)) {
        return "STORAGE_PERMISSION".into();
    }
    #[cfg(windows)]
    if matches!(error.raw_os_error(), Some(19)) {
        return "STORAGE_PERMISSION".into();
    }
    format!("STORAGE_WRITE: {error}")
}
