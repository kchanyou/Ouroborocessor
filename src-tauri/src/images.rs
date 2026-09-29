use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

const LIMIT: u64 = 10 * 1024 * 1024;
fn kind(bytes: &[u8]) -> Result<&'static str, String> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        && bytes.len() >= 33
        && bytes.get(12..16) == Some(b"IHDR")
        && bytes
            .get(16..24)
            .is_some_and(|size| size[..4] != [0, 0, 0, 0] && size[4..] != [0, 0, 0, 0])
    {
        Ok("png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff])
        && bytes.len() >= 16
        && bytes.ends_with(&[0xff, 0xd9])
    {
        Ok("jpg")
    } else if (bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"))
        && bytes.len() >= 14
        && bytes[6..8] != [0, 0]
        && bytes[8..10] != [0, 0]
        && bytes.ends_with(b";")
    {
        Ok("gif")
    } else if bytes.starts_with(b"RIFF") && bytes.len() >= 20 && bytes.get(8..12) == Some(b"WEBP") {
        Ok("webp")
    } else {
        Err("IMAGE_FORMAT".into())
    }
}
fn directory(project: &Path, create: bool) -> Result<PathBuf, String> {
    crate::read_manifest(project)?;
    let path = project.join("images");
    if !path.exists() && create {
        fs::create_dir(&path).map_err(crate::storage_error)?;
    }
    let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if meta.file_type().is_symlink() || !meta.is_dir() {
        return Err("IMAGE_PATH".into());
    }
    Ok(path)
}
fn filename(name: &str) -> bool {
    name.starts_with("image-")
        && name.len() <= 100
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'.')
        && [".png", ".jpg", ".gif", ".webp"]
            .iter()
            .any(|ext| name.ends_with(ext))
}
pub(crate) fn read(project: &Path, name: &str) -> Result<Vec<u8>, String> {
    if !filename(name) {
        return Err("IMAGE_PATH".into());
    }
    let path = directory(project, false)?.join(name);
    let meta = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if meta.file_type().is_symlink() || !meta.is_file() || meta.len() > LIMIT {
        return Err("IMAGE_PATH".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > LIMIT {
        return Err("IMAGE_SIZE".into());
    }
    kind(&bytes)?;
    Ok(bytes)
}
#[tauri::command]
pub(crate) fn save_image(project_path: String, bytes: Vec<u8>) -> Result<String, String> {
    if bytes.len() as u64 > LIMIT {
        return Err("IMAGE_SIZE".into());
    }
    let extension = kind(&bytes)?;
    let project = Path::new(&project_path);
    let created_directory = !project.join("images").exists();
    let dir = directory(project, true)?;
    let name = format!("{}.{}", crate::timestamp_id("image")?, extension);
    let path = dir.join(&name);
    let mut file = match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
    {
        Ok(file) => file,
        Err(error) => {
            if created_directory {
                let _ = fs::remove_dir(&dir);
            }
            return Err(crate::storage_error(error));
        }
    };
    if let Err(error) = file.write_all(&bytes).and_then(|_| file.sync_all()) {
        drop(file);
        let _ = fs::remove_file(&path);
        if created_directory {
            let _ = fs::remove_dir(&dir);
        }
        return Err(crate::storage_error(error));
    }
    Ok(format!("images/{name}"))
}
#[tauri::command]
pub(crate) fn import_image(project_path: String, source_path: String) -> Result<String, String> {
    let source = Path::new(&source_path);
    let meta = fs::symlink_metadata(source).map_err(|e| e.to_string())?;
    if meta.file_type().is_symlink() || !meta.is_file() {
        return Err("IMAGE_PATH".into());
    }
    if meta.len() > LIMIT {
        return Err("IMAGE_SIZE".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(source)
        .map_err(|e| e.to_string())?
        .take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > LIMIT {
        return Err("IMAGE_SIZE".into());
    }
    save_image(project_path, bytes)
}
#[tauri::command]
pub(crate) fn read_image(project_path: String, name: String) -> Result<Vec<u8>, String> {
    read(Path::new(&project_path), &name)
}
pub(crate) fn copy_to(project: &Path, destination: &Path) -> Result<(), String> {
    if !project
        .join("images")
        .try_exists()
        .map_err(|e| e.to_string())?
    {
        return Ok(());
    }
    let dir = directory(project, false)?;
    fs::create_dir(destination.join("images")).map_err(crate::storage_error)?;
    for item in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let name = item
            .map_err(|e| e.to_string())?
            .file_name()
            .to_string_lossy()
            .into_owned();
        let bytes = read(project, &name)?;
        crate::write_atomic(&destination.join("images").join(name), &bytes)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restricts_image_paths_and_formats() {
        assert!(!filename("../secret.png"));
        assert!(!filename("image-../../secret.png"));
        assert!(!filename("image-x.svg"));
        assert!(filename("image-123.png"));
        assert!(kind(b"<svg/>").is_err());
        assert!(kind(b"GIF89a").is_err());
    }
    #[test]
    fn stores_reads_and_copies_project_images() {
        let root = tempfile::tempdir().unwrap();
        let project = root.path().join("Test.story");
        fs::create_dir_all(project.join("manuscript")).unwrap();
        let manifest = crate::ProjectManifest {
            format_version: 2,
            title: "Test".into(),
            nodes: Vec::new(),
        };
        crate::write_manifest(&project, &manifest).unwrap();
        let gif = b"GIF89a\x01\0\x01\0\x80\0\0\0\0\0\xff\xff\xff!\xf9\x04\x01\0\0\0\0,\0\0\0\0\x01\0\x01\0\0\x02\x02D\x01\0;".to_vec();
        let relative = save_image(project.to_string_lossy().into_owned(), gif.clone()).unwrap();
        assert!(relative.starts_with("images/image-"));
        let name = relative.trim_start_matches("images/").to_string();
        assert_eq!(
            read_image(project.to_string_lossy().into_owned(), name.clone()).unwrap(),
            gif
        );
        let destination = root.path().join("copy");
        fs::create_dir(&destination).unwrap();
        copy_to(&project, &destination).unwrap();
        assert_eq!(
            fs::read(destination.join("images").join(name)).unwrap(),
            gif
        );
    }
    #[test]
    fn imports_a_dropped_file_and_rejects_symlinks() {
        let root = tempfile::tempdir().unwrap();
        let project = root.path().join("Test.story");
        fs::create_dir_all(project.join("manuscript")).unwrap();
        let manifest = crate::ProjectManifest {
            format_version: 2,
            title: "Test".into(),
            nodes: Vec::new(),
        };
        crate::write_manifest(&project, &manifest).unwrap();
        let source = root.path().join("cover.gif");
        let gif = b"GIF89a\x01\0\x01\0\x80\0\0\0\0\0\xff\xff\xff!\xf9\x04\x01\0\0\0\0,\0\0\0\0\x01\0\x01\0\0\x02\x02D\x01\0;";
        fs::write(&source, gif).unwrap();
        let relative = import_image(
            project.to_string_lossy().into_owned(),
            source.to_string_lossy().into_owned(),
        )
        .unwrap();
        assert_eq!(fs::read(project.join(relative)).unwrap(), gif);
        #[cfg(unix)]
        {
            let link = root.path().join("linked.gif");
            std::os::unix::fs::symlink(&source, &link).unwrap();
            assert_eq!(
                import_image(
                    project.to_string_lossy().into_owned(),
                    link.to_string_lossy().into_owned()
                )
                .unwrap_err(),
                "IMAGE_PATH"
            );
        }
    }
    #[cfg(unix)]
    #[test]
    fn read_only_project_rejects_first_image_without_partial_file() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let project = root.path().join("Test.story");
        fs::create_dir_all(project.join("manuscript")).unwrap();
        let manifest = crate::ProjectManifest {
            format_version: 2,
            title: "Test".into(),
            nodes: Vec::new(),
        };
        crate::write_manifest(&project, &manifest).unwrap();
        let original_mode = fs::metadata(&project).unwrap().permissions().mode();
        fs::set_permissions(&project, fs::Permissions::from_mode(0o555)).unwrap();
        let gif = b"GIF89a\x01\0\x01\0\x80\0\0\0\0\0\xff\xff\xff!\xf9\x04\x01\0\0\0\0,\0\0\0\0\x01\0\x01\0\0\x02\x02D\x01\0;".to_vec();
        let result = save_image(project.to_string_lossy().into_owned(), gif);
        fs::set_permissions(&project, fs::Permissions::from_mode(original_mode)).unwrap();
        assert_eq!(result.unwrap_err(), "STORAGE_PERMISSION");
        assert!(!project.join("images").exists());
    }
}
