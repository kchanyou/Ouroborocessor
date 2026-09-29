use super::*;

const RECOVERY_FILE: &str = ".recovery.json";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecoveryDraft {
    pub scene_id: String,
    pub content: String,
    pub base: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecoveryStore {
    format_version: u32,
    drafts: Vec<RecoveryDraft>,
}

fn path(project: &Path) -> Result<PathBuf, String> {
    read_manifest(project)?;
    let path = project.join(RECOVERY_FILE);
    match fs::symlink_metadata(&path) {
        Ok(meta) if meta.file_type().is_symlink() || !meta.is_file() => {
            return Err("RECOVERY_UNSAFE_PATH".into())
        }
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error.to_string()),
        _ => {}
    }
    Ok(path)
}

fn read(project: &Path) -> Result<Vec<RecoveryDraft>, String> {
    let path = path(project)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let store: RecoveryStore = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|_| "RECOVERY_INVALID".to_string())?;
    if store.format_version != 1 {
        return Err("RECOVERY_VERSION".into());
    }
    let manifest = read_manifest(project)?;
    let scene_ids: HashSet<&str> = manifest
        .nodes
        .iter()
        .filter(|node| node.kind == NodeKind::Scene)
        .map(|node| node.id.as_str())
        .collect();
    let mut ids = HashSet::new();
    if store.drafts.iter().any(|draft| {
        !scene_ids.contains(draft.scene_id.as_str()) || !ids.insert(draft.scene_id.as_str())
    }) {
        return Err("RECOVERY_INVALID".into());
    }
    Ok(store.drafts)
}

fn write(project: &Path, drafts: Vec<RecoveryDraft>) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(&RecoveryStore {
        format_version: 1,
        drafts,
    })
    .map_err(|e| e.to_string())?;
    write_atomic(&path(project)?, &bytes)
}

#[tauri::command]
pub fn list_recovery_drafts(project_path: String) -> Result<Vec<RecoveryDraft>, String> {
    read(Path::new(&project_path))
}

#[tauri::command]
pub fn write_recovery_draft(
    project_path: String,
    scene_id: String,
    content: String,
    base: String,
) -> Result<(), String> {
    let _guard = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    let project = Path::new(&project_path);
    let mut drafts = read(project)?;
    let draft = RecoveryDraft {
        scene_id: scene_id.clone(),
        content,
        base,
    };
    if let Some(index) = drafts.iter().position(|item| item.scene_id == scene_id) {
        drafts[index] = draft;
    } else {
        drafts.push(draft);
    }
    write(project, drafts)
}

#[tauri::command]
pub fn clear_recovery_draft(
    project_path: String,
    scene_id: String,
    saved: String,
) -> Result<(), String> {
    let _guard = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    let project = Path::new(&project_path);
    let mut drafts = read(project)?;
    let Some(index) = drafts.iter().position(|item| item.scene_id == scene_id) else {
        return Ok(());
    };
    if drafts[index].content == saved {
        drafts.remove(index);
    } else {
        drafts[index].base = saved;
    }
    write(project, drafts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_rebases_and_clears_drafts() {
        let temp = tempfile::tempdir().unwrap();
        let project = create_project(
            temp.path().to_string_lossy().into_owned(),
            "Recovery".into(),
            "Group".into(),
            "Scene".into(),
        )
        .unwrap();
        let scene = project.nodes[1].id.clone();
        write_recovery_draft(
            project.project_path.clone(),
            scene.clone(),
            "latest".into(),
            "old".into(),
        )
        .unwrap();
        clear_recovery_draft(
            project.project_path.clone(),
            scene.clone(),
            "earlier".into(),
        )
        .unwrap();
        assert_eq!(
            list_recovery_drafts(project.project_path.clone()).unwrap(),
            vec![RecoveryDraft {
                scene_id: scene.clone(),
                content: "latest".into(),
                base: "earlier".into()
            }]
        );
        clear_recovery_draft(project.project_path.clone(), scene, "latest".into()).unwrap();
        assert!(list_recovery_drafts(project.project_path)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn corrupt_store_is_reported_and_never_overwritten() {
        let temp = tempfile::tempdir().unwrap();
        let project = create_project(
            temp.path().to_string_lossy().into_owned(),
            "Recovery".into(),
            "Group".into(),
            "Scene".into(),
        )
        .unwrap();
        let path = Path::new(&project.project_path).join(RECOVERY_FILE);
        fs::write(&path, b"corrupt").unwrap();
        let before = fs::read(&path).unwrap();
        assert_eq!(
            list_recovery_drafts(project.project_path.clone()).unwrap_err(),
            "RECOVERY_INVALID"
        );
        assert!(write_recovery_draft(
            project.project_path,
            project.nodes[1].id.clone(),
            "new".into(),
            "old".into()
        )
        .is_err());
        assert_eq!(fs::read(path).unwrap(), before);
    }

    #[cfg(unix)]
    #[test]
    fn read_only_project_keeps_existing_recovery_draft() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let project = create_project(
            temp.path().to_string_lossy().into_owned(),
            "Recovery".into(),
            "Group".into(),
            "Scene".into(),
        )
        .unwrap();
        let scene = project.nodes[1].id.clone();
        write_recovery_draft(
            project.project_path.clone(),
            scene.clone(),
            "safe draft".into(),
            "disk".into(),
        )
        .unwrap();
        let root = Path::new(&project.project_path);
        let recovery_path = root.join(RECOVERY_FILE);
        let before = fs::read(&recovery_path).unwrap();
        let original_permissions = fs::metadata(root).unwrap().permissions();
        fs::set_permissions(root, fs::Permissions::from_mode(0o555)).unwrap();
        let result = write_recovery_draft(
            project.project_path.clone(),
            scene,
            "new draft".into(),
            "disk".into(),
        );
        fs::set_permissions(root, original_permissions).unwrap();
        assert_eq!(result.unwrap_err(), "STORAGE_PERMISSION");
        assert_eq!(fs::read(recovery_path).unwrap(), before);
    }
}
