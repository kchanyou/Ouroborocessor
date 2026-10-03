use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
mod batch_edit;
mod docx_export;
mod images;
mod recovery;
mod resource_links;
mod resources;
mod scene_operations;
mod storage;
pub(crate) use storage::{storage_error, write_atomic};
static SAVE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

const MANIFEST_FILE: &str = "project.json";
const FORMAT_VERSION: u32 = 2;
const LEGACY_APP_IDENTIFIER: &str = "com.example.localwriter";

#[derive(Default)]
struct EditHistory {
    undo: Vec<(Vec<u8>, Vec<u8>, Vec<(String, String)>)>,
    redo: Vec<(Vec<u8>, Vec<u8>, Vec<(String, String)>)>,
}
static EDIT_HISTORY: std::sync::OnceLock<
    std::sync::Mutex<std::collections::HashMap<PathBuf, EditHistory>>,
> = std::sync::OnceLock::new();
fn edit_history() -> &'static std::sync::Mutex<std::collections::HashMap<PathBuf, EditHistory>> {
    EDIT_HISTORY.get_or_init(Default::default)
}

#[tauri::command]
fn undo_project_edit(project_path: String, redo: bool) -> Result<ProjectSnapshot, String> {
    let _guard = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    let path = Path::new(&project_path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    {
        let mut histories = edit_history().lock().map_err(|e| e.to_string())?;
        let history = histories.entry(path.clone()).or_default();
        let entry = if redo {
            history.redo.last()
        } else {
            history.undo.last()
        }
        .ok_or("HISTORY_EMPTY")?;
        let (expected, replacement) = if redo {
            (&entry.0, &entry.1)
        } else {
            (&entry.1, &entry.0)
        };
        if fs::read(path.join(MANIFEST_FILE)).map_err(|e| e.to_string())? != *expected {
            return Err("HISTORY_CONFLICT".into());
        }
        for (file, content) in &entry.2 {
            if fs::read_to_string(checked_scene_path(&path, file)?).map_err(|e| e.to_string())?
                != *content
            {
                return Err("HISTORY_CONFLICT".into());
            }
        }
        let manifest: ProjectManifest =
            serde_json::from_slice(replacement).map_err(|e| e.to_string())?;
        validate_manifest(&manifest)?;
        write_atomic(&path.join(MANIFEST_FILE), replacement)?;
        let entry = if redo {
            history.redo.pop().unwrap()
        } else {
            history.undo.pop().unwrap()
        };
        if redo {
            history.undo.push(entry);
        } else {
            history.redo.push(entry);
        }
    }
    load_project_from_path(&path)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SceneVersion {
    id: String,
    scene_id: String,
    created_at: u64,
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SceneVersionReport {
    versions: Vec<SceneVersion>,
    corrupt_count: usize,
}

fn scene_versions(project: &Path, scene_id: &str) -> Result<SceneVersionReport, String> {
    let folder = project.join(".history");
    if !folder.exists() {
        return Ok(SceneVersionReport {
            versions: Vec::new(),
            corrupt_count: 0,
        });
    }
    let mut versions = Vec::new();
    let mut corrupt_count = 0;
    for entry in fs::read_dir(folder).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with("version-") || !name.ends_with(".json") {
            continue;
        }
        if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
            continue;
        }
        let Ok(version) = fs::read(entry.path())
            .map_err(|e| e.to_string())
            .and_then(|bytes| {
                serde_json::from_slice::<SceneVersion>(&bytes).map_err(|e| e.to_string())
            })
        else {
            corrupt_count += 1;
            continue;
        };
        if version.scene_id == scene_id {
            versions.push(version);
        }
    }
    versions.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.id.cmp(&a.id))
    });
    Ok(SceneVersionReport {
        versions,
        corrupt_count,
    })
}

fn preserve_scene_version(project: &Path, scene_id: &str, content: &str) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let report = scene_versions(project, scene_id)?;
    if report
        .versions
        .first()
        .is_some_and(|last| last.content == content || now.saturating_sub(last.created_at) < 300)
    {
        return Ok(());
    }
    let folder = project.join(".history");
    fs::create_dir_all(&folder).map_err(storage_error)?;
    let version = SceneVersion {
        id: timestamp_id("version")?,
        scene_id: scene_id.into(),
        created_at: now,
        content: content.into(),
    };
    write_atomic(
        &folder.join(format!("{}.json", version.id)),
        &serde_json::to_vec(&version).map_err(|e| e.to_string())?,
    )
}

#[tauri::command]
fn list_scene_versions(
    project_path: String,
    scene_id: String,
) -> Result<SceneVersionReport, String> {
    read_manifest(Path::new(&project_path))?;
    scene_versions(Path::new(&project_path), &scene_id)
}

#[tauri::command]
fn restore_scene_version(
    project_path: String,
    scene_id: String,
    version_id: String,
    title: String,
) -> Result<ProjectSnapshot, String> {
    let project = Path::new(&project_path);
    let mut manifest = read_manifest(project)?;
    let original = manifest
        .nodes
        .iter()
        .find(|n| n.id == scene_id && n.kind == NodeKind::Scene)
        .ok_or("복원 대상 장면 없음")?
        .clone();
    let version = scene_versions(project, &scene_id)?
        .versions
        .into_iter()
        .find(|v| v.id == version_id)
        .ok_or("백업 없음")?;
    if title.trim().is_empty() {
        return Err("제목을 입력해 주세요.".into());
    }
    let id = timestamp_id("scene")?;
    let file = format!("manuscript/{id}.md");
    write_atomic(
        &checked_scene_path(project, &file)?,
        version.content.as_bytes(),
    )?;
    manifest.nodes.push(NodeMeta {
        id,
        file: Some(file),
        title,
        ..original
    });
    write_manifest(project, &manifest)?;
    load_project_from_path(project)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum NodeKind {
    Group,
    Scene,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NodeMeta {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    trashed: Option<String>,
    id: String,
    title: String,
    kind: NodeKind,
    parent_id: Option<String>,
    file: Option<String>,
    #[serde(default)]
    status: String,
    #[serde(default)]
    synopsis: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectManifest {
    format_version: u32,
    title: String,
    nodes: Vec<NodeMeta>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacySceneMeta {
    id: String,
    title: String,
    file: String,
    status: String,
    synopsis: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyProjectManifest {
    format_version: u32,
    title: String,
    scenes: Vec<LegacySceneMeta>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManuscriptNode {
    id: String,
    title: String,
    kind: NodeKind,
    parent_id: Option<String>,
    content: String,
    status: String,
    synopsis: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSnapshot {
    can_undo: bool,
    can_redo: bool,
    project_path: String,
    title: String,
    nodes: Vec<ManuscriptNode>,
}

fn timestamp_id(prefix: &str) -> Result<String, String> {
    // The clock can repeat for back-to-back calls (macOS has microsecond resolution) and
    // imports create many ids at once. Keep the all-digit format that journal and image
    // names are validated against, but never hand out the same value twice.
    static LAST: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("시스템 시간 읽기 실패: {error}"))?
        .as_nanos() as u64;
    let mut previous = LAST.load(std::sync::atomic::Ordering::Relaxed);
    loop {
        let next = now.max(previous + 1);
        match LAST.compare_exchange_weak(
            previous,
            next,
            std::sync::atomic::Ordering::Relaxed,
            std::sync::atomic::Ordering::Relaxed,
        ) {
            Ok(_) => return Ok(format!("{prefix}-{next}")),
            Err(actual) => previous = actual,
        }
    }
}

fn safe_folder_name(title: &str) -> String {
    let result: String = title
        .trim()
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            character if character.is_control() => '-',
            character => character,
        })
        .collect();
    let result = result.trim_matches(['.', ' ']);
    if result.is_empty() {
        "Untitled".to_string()
    } else {
        result.to_string()
    }
}

fn unique_project_path(parent: &Path, title: &str) -> PathBuf {
    let base = format!("{}.story", safe_folder_name(title));
    let first = parent.join(&base);
    if !first.exists() {
        return first;
    }

    for suffix in 2..10_000 {
        let candidate = parent.join(format!("{}-{suffix}.story", safe_folder_name(title)));
        if !candidate.exists() {
            return candidate;
        }
    }

    parent.join(format!("{}-new.story", safe_folder_name(title)))
}

fn legacy_default_project(app_data_dir: &Path) -> Result<Option<PathBuf>, String> {
    let Some(data_root) = app_data_dir.parent() else {
        return Ok(None);
    };
    let pointer = data_root
        .join(LEGACY_APP_IDENTIFIER)
        .join("workspace")
        .join("default-project.txt");
    if !pointer.is_file() {
        return Ok(None);
    }
    let stored = fs::read_to_string(pointer).map_err(|error| error.to_string())?;
    let project = PathBuf::from(stored.trim());
    if project.is_dir() && project.join(MANIFEST_FILE).is_file() {
        Ok(Some(project))
    } else {
        Ok(None)
    }
}

fn write_manifest(project_path: &Path, manifest: &ProjectManifest) -> Result<(), String> {
    write_manifest_with_files(project_path, manifest, None)
}

fn write_manifest_with_files(
    project_path: &Path,
    manifest: &ProjectManifest,
    files: Option<Vec<(String, String)>>,
) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(manifest)
        .map_err(|error| format!("프로젝트 정보 생성 실패: {error}"))?;
    let path = project_path.canonicalize().map_err(|e| e.to_string())?;
    let mut histories = edit_history().lock().map_err(|e| e.to_string())?;
    let previous = if path.join(MANIFEST_FILE).exists() {
        Some(fs::read(path.join(MANIFEST_FILE)).map_err(|e| e.to_string())?)
    } else {
        None
    };
    if previous.as_ref() == Some(&json) {
        return Ok(());
    }
    write_atomic(&path.join(MANIFEST_FILE), &json)?;
    let history = histories.entry(path).or_default();
    // new history boundary so undo can't hide files
    let same_nodes = previous
        .as_ref()
        .and_then(|bytes| serde_json::from_slice::<ProjectManifest>(bytes).ok())
        .is_some_and(|old| {
            old.nodes.iter().map(|n| &n.id).collect::<HashSet<_>>()
                == manifest.nodes.iter().map(|n| &n.id).collect::<HashSet<_>>()
        });
    if same_nodes || (previous.is_some() && files.is_some()) {
        let previous = previous.unwrap();
        if history.undo.last().is_some_and(|entry| entry.1 != previous) {
            history.undo.clear();
        }
        history
            .undo
            .push((previous, json, files.unwrap_or_default()));
        if history.undo.len() > 100 {
            history.undo.remove(0);
        }
    } else {
        history.undo.clear();
    }
    history.redo.clear();
    Ok(())
}

fn convert_legacy(legacy: LegacyProjectManifest) -> ProjectManifest {
    ProjectManifest {
        format_version: FORMAT_VERSION,
        title: legacy.title,
        nodes: legacy
            .scenes
            .into_iter()
            .map(|scene| NodeMeta {
                trashed: None,
                id: scene.id,
                title: scene.title,
                kind: NodeKind::Scene,
                parent_id: None,
                file: Some(scene.file),
                status: if scene.status == "초안" {
                    "draft".to_string()
                } else {
                    scene.status
                },
                synopsis: scene.synopsis,
            })
            .collect(),
    }
}

fn validate_manifest(manifest: &ProjectManifest) -> Result<(), String> {
    let ids: HashSet<&str> = manifest.nodes.iter().map(|node| node.id.as_str()).collect();
    if ids.len() != manifest.nodes.len() {
        return Err("프로젝트 항목 ID 중복".to_string());
    }

    for node in &manifest.nodes {
        if let Some(root) = &node.trashed {
            if manifest.format_version < 3
                || !manifest.nodes.iter().any(|candidate| {
                    &candidate.id == root && candidate.trashed.as_ref() == Some(root)
                })
            {
                return Err("SCENE_OPERATION_INVALID".into());
            }
        }
        if node.kind == NodeKind::Scene && node.file.is_none() {
            return Err(format!("‘{}’ 장면 원고 파일 없음", node.title));
        }
        if node.kind == NodeKind::Group && node.file.is_some() {
            return Err(format!("‘{}’ 그룹에 잘못된 원고 파일 연결", node.title));
        }

        let mut cursor = node.parent_id.as_deref();
        let mut visited = HashSet::new();
        while let Some(parent_id) = cursor {
            if !ids.contains(parent_id) {
                return Err(format!("‘{}’ 항목의 상위 그룹 없음", node.title));
            }
            if !visited.insert(parent_id) || parent_id == node.id {
                return Err("원고 트리의 순환 포함 관계 감지".to_string());
            }
            let parent = manifest
                .nodes
                .iter()
                .find(|candidate| candidate.id == parent_id)
                .ok_or_else(|| "상위 그룹 없음".to_string())?;
            if node.trashed.is_none() && parent.trashed.is_some() {
                return Err("SCENE_RESTORE_PARENT".into());
            }
            if parent.kind != NodeKind::Group {
                return Err("장면 아래의 다른 항목 포함 불가".to_string());
            }
            cursor = parent.parent_id.as_deref();
        }
    }
    Ok(())
}

fn read_manifest(project_path: &Path) -> Result<ProjectManifest, String> {
    let bytes = fs::read(project_path.join(MANIFEST_FILE))
        .map_err(|error| format!("프로젝트 정보 읽기 실패: {error}"))?;
    let value: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("프로젝트 정보 형식 오류: {error}"))?;
    let version = value
        .get("formatVersion")
        .and_then(serde_json::Value::as_u64)
        .ok_or_else(|| "프로젝트 형식 버전 없음".to_string())? as u32;

    let manifest = match version {
        1 => {
            let legacy: LegacyProjectManifest = serde_json::from_value(value)
                .map_err(|error| format!("이전 프로젝트 변환 실패: {error}"))?;
            debug_assert_eq!(legacy.format_version, 1);
            convert_legacy(legacy)
        }
        FORMAT_VERSION | 3 => serde_json::from_value(value)
            .map_err(|error| format!("프로젝트 정보 형식 오류: {error}"))?,
        _ => return Err(format!("지원하지 않는 프로젝트 형식(버전 {version})")),
    };
    validate_manifest(&manifest)?;
    Ok(manifest)
}

fn checked_scene_path(project_path: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
        || !relative.starts_with("manuscript/")
    {
        return Err("안전하지 않은 장면 파일 경로".to_string());
    }
    Ok(project_path.join(relative_path))
}

fn load_project_from_path(project_path: &Path) -> Result<ProjectSnapshot, String> {
    if !project_path.is_dir() {
        return Err("선택한 프로젝트 폴더 없음".to_string());
    }
    let manifest = read_manifest(project_path)?;
    let mut nodes = Vec::with_capacity(manifest.nodes.len());
    for node in manifest.nodes.iter().filter(|node| node.trashed.is_none()) {
        let content = match (&node.kind, &node.file) {
            (NodeKind::Scene, Some(file)) => {
                fs::read_to_string(checked_scene_path(project_path, file)?)
                    .map_err(|error| format!("‘{}’ 장면 읽기 실패: {error}", node.title))?
            }
            _ => String::new(),
        };
        nodes.push(ManuscriptNode {
            id: node.id.clone(),
            title: node.title.clone(),
            kind: node.kind.clone(),
            parent_id: node.parent_id.clone(),
            content,
            status: node.status.clone(),
            synopsis: node.synopsis.clone(),
        });
    }

    let canonical = project_path.canonicalize().map_err(|e| e.to_string())?;
    let histories = edit_history().lock().map_err(|e| e.to_string())?;
    let history = histories.get(&canonical);
    Ok(ProjectSnapshot {
        can_undo: history.is_some_and(|h| !h.undo.is_empty()),
        can_redo: history.is_some_and(|h| !h.redo.is_empty()),
        project_path: project_path.to_string_lossy().into_owned(),
        title: manifest.title,
        nodes,
    })
}

#[tauri::command]
fn create_project(
    parent_path: String,
    title: String,
    first_group_title: String,
    first_scene_title: String,
) -> Result<ProjectSnapshot, String> {
    let parent = PathBuf::from(parent_path);
    if !parent.is_dir() {
        return Err("프로젝트 생성 대상 상위 폴더 없음".to_string());
    }
    let title = title.trim();
    if title.is_empty() {
        return Err("프로젝트 제목을 입력해 주세요.".to_string());
    }

    let project_path = unique_project_path(&parent, title);
    let manuscript_path = project_path.join("manuscript");
    fs::create_dir_all(&manuscript_path).map_err(storage_error)?;

    let group_id = timestamp_id("group")?;
    let scene_id = timestamp_id("scene")?;
    let scene_file = format!("manuscript/{scene_id}.md");
    write_atomic(&project_path.join(&scene_file), b"")?;
    let manifest = ProjectManifest {
        format_version: FORMAT_VERSION,
        title: title.to_string(),
        nodes: vec![
            NodeMeta {
                trashed: None,
                id: group_id.clone(),
                title: first_group_title.trim().to_string(),
                kind: NodeKind::Group,
                parent_id: None,
                file: None,
                status: String::new(),
                synopsis: String::new(),
            },
            NodeMeta {
                trashed: None,
                id: scene_id,
                title: first_scene_title.trim().to_string(),
                kind: NodeKind::Scene,
                parent_id: Some(group_id),
                file: Some(scene_file),
                status: "draft".to_string(),
                synopsis: String::new(),
            },
        ],
    };
    write_manifest(&project_path, &manifest)?;
    load_project_from_path(&project_path)
}

#[tauri::command]
fn open_project(project_path: String) -> Result<ProjectSnapshot, String> {
    load_project_from_path(Path::new(&project_path))
}

#[tauri::command]
fn add_node(
    project_path: String,
    parent_id: Option<String>,
    kind: String,
    title: String,
) -> Result<ProjectSnapshot, String> {
    let project_path = PathBuf::from(project_path);
    let mut manifest = read_manifest(&project_path)?;
    let node_kind = match kind.as_str() {
        "group" => NodeKind::Group,
        "scene" => NodeKind::Scene,
        _ => return Err("추가할 원고 항목 유형 오류".to_string()),
    };

    if let Some(parent) = parent_id.as_deref() {
        let parent_node = manifest
            .nodes
            .iter()
            .find(|node| node.id == parent)
            .ok_or_else(|| "상위 그룹 없음".to_string())?;
        if parent_node.kind != NodeKind::Group {
            return Err("장면 아래의 항목 추가 불가".to_string());
        }
    }

    let prefix = if node_kind == NodeKind::Group {
        "group"
    } else {
        "scene"
    };
    let node_id = timestamp_id(prefix)?;
    let file = if node_kind == NodeKind::Scene {
        let relative = format!("manuscript/{node_id}.md");
        write_atomic(&project_path.join(&relative), b"")?;
        Some(relative)
    } else {
        None
    };
    manifest.nodes.push(NodeMeta {
        trashed: None,
        id: node_id,
        title: title.trim().to_string(),
        kind: node_kind.clone(),
        parent_id,
        file,
        status: if node_kind == NodeKind::Scene {
            "draft".to_string()
        } else {
            String::new()
        },
        synopsis: String::new(),
    });
    write_manifest(&project_path, &manifest)?;
    load_project_from_path(&project_path)
}

#[tauri::command]
fn save_scene(project_path: String, scene_id: String, content: String) -> Result<(), String> {
    let project_path = PathBuf::from(project_path);
    let manifest = read_manifest(&project_path)?;
    let scene = manifest
        .nodes
        .iter()
        .find(|node| node.id == scene_id && node.kind == NodeKind::Scene)
        .ok_or_else(|| "저장 대상 장면 없음".to_string())?;
    let file = scene
        .file
        .as_deref()
        .ok_or_else(|| "장면 원고 파일 없음".to_string())?;
    let path = checked_scene_path(&project_path, file)?;
    let previous = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if previous == content {
        return Ok(());
    }
    preserve_scene_version(&project_path, &scene_id, &previous)?;
    write_atomic(&path, content.as_bytes())
}

#[tauri::command]
fn save_scene_checked(
    project_path: String,
    scene_id: String,
    content: String,
    expected_content: String,
) -> Result<(), String> {
    // only serializes saves inside this process
    let _guard = SAVE_LOCK.lock().map_err(|e| e.to_string())?;
    let project = Path::new(&project_path);
    let manifest = read_manifest(project)?;
    let scene = manifest
        .nodes
        .iter()
        .find(|node| node.id == scene_id && node.kind == NodeKind::Scene)
        .ok_or("저장 대상 장면 없음")?;
    let file = scene.file.as_deref().ok_or("원고 파일 없음")?;
    let disk = fs::read_to_string(checked_scene_path(project, file)?).map_err(|e| e.to_string())?;
    if disk == content {
        return Ok(());
    }
    if disk != expected_content {
        return Err("SAVE_CONFLICT".into());
    }
    save_scene(project_path, scene_id, content)
}

#[tauri::command]
fn preserve_conflict_copy(
    project_path: String,
    scene_id: String,
    content: String,
    title: String,
) -> Result<ProjectSnapshot, String> {
    let project = Path::new(&project_path);
    let mut manifest = read_manifest(project)?;
    let original = manifest
        .nodes
        .iter()
        .find(|n| n.id == scene_id && n.kind == NodeKind::Scene)
        .ok_or("장면 없음")?
        .clone();
    if title.trim().is_empty() {
        return Err("제목을 입력해 주세요.".into());
    }
    let id = timestamp_id("scene")?;
    let file = format!("manuscript/{id}.md");
    write_atomic(&checked_scene_path(project, &file)?, content.as_bytes())?;
    manifest.nodes.push(NodeMeta {
        id,
        file: Some(file),
        title,
        ..original
    });
    write_manifest(project, &manifest)?;
    load_project_from_path(project)
}

// new dir every time, never overwrite source or old backups
#[tauri::command]
fn export_project(project_path: String, destination: String) -> Result<String, String> {
    let source = Path::new(&project_path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let destination = Path::new(&destination)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !destination.is_dir() || destination.starts_with(&source) {
        return Err("EXPORT_DESTINATION".into());
    }
    let manifest = read_manifest(&source)?;
    let snapshot = load_project_from_path(&source)?;
    let output = destination.join(timestamp_id("Ouroborocessor-export")?);
    fs::create_dir(&output).map_err(storage_error)?;
    // project.json last so a half-done copy isn't a valid backup
    let backup = output.join("Project.story");
    fs::create_dir_all(backup.join("manuscript")).map_err(storage_error)?;
    for meta in &manifest.nodes {
        if let Some(file) = &meta.file {
            let target = checked_scene_path(&backup, file)?;
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(storage_error)?;
            }
            let content =
                fs::read(checked_scene_path(&source, file)?).map_err(|e| e.to_string())?;
            write_atomic(&target, &content)?;
        }
    }
    let markdown = compile_markdown(&snapshot);
    resources::copy_to_backup(&source, &backup)?;
    images::copy_to(&source, &backup)?;
    images::copy_to(&source, &output)?;
    write_atomic(&output.join("Manuscript.md"), markdown.as_bytes())?;
    write_manifest(&backup, &manifest)?;
    Ok(output.to_string_lossy().into_owned())
}

#[tauri::command]
fn export_docx(
    project_path: String,
    destination: String,
    root_id: Option<String>,
    paper_size: String,
    margin_preset: String,
) -> Result<String, String> {
    let source = Path::new(&project_path)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let destination = Path::new(&destination)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !destination.is_dir() || destination.starts_with(&source) {
        return Err("EXPORT_DESTINATION".into());
    }
    let project = load_project_from_path(&source)?;
    let bytes = docx_export::build(&project, root_id.as_deref(), &paper_size, &margin_preset)?;
    let output = destination.join(timestamp_id("Ouroborocessor-DOCX")?);
    fs::create_dir(&output).map_err(storage_error)?;
    let file = output.join("Manuscript.docx");
    write_atomic(&file, &bytes)?;
    Ok(file.to_string_lossy().into_owned())
}

fn compile_markdown(project: &ProjectSnapshot) -> String {
    use std::collections::HashMap;
    let mut children: HashMap<Option<&str>, Vec<&ManuscriptNode>> = HashMap::new();
    for node in &project.nodes {
        children
            .entry(node.parent_id.as_deref())
            .or_default()
            .push(node);
    }
    let heading = |title: &str| title.replace(['\n', '\r'], " ");
    let mut output = format!("# {}\n\n", heading(&project.title));
    let mut stack: Vec<(&ManuscriptNode, usize)> = children
        .get(&None)
        .into_iter()
        .flatten()
        .rev()
        .map(|node| (*node, 2))
        .collect();
    while let Some((node, depth)) = stack.pop() {
        output.push_str(&format!(
            "{} {}\n\n",
            "#".repeat(depth.min(6)),
            heading(&node.title)
        ));
        if node.kind == NodeKind::Scene {
            output.push_str(&resource_links::display_text(&node.content));
            output.push_str("\n\n");
        }
        if let Some(nested) = children.get(&Some(node.id.as_str())) {
            stack.extend(nested.iter().rev().map(|child| (*child, depth + 1)));
        }
    }
    output
}

#[tauri::command]
fn update_node(
    project_path: String,
    node_id: String,
    title: String,
    status: String,
    synopsis: String,
    expected_title: String,
    expected_status: String,
    expected_synopsis: String,
) -> Result<ProjectSnapshot, String> {
    let project_path = PathBuf::from(project_path);
    let mut manifest = read_manifest(&project_path)?;
    let node = manifest
        .nodes
        .iter_mut()
        .find(|node| node.id == node_id)
        .ok_or_else(|| "수정 대상 원고 항목 없음".to_string())?;
    if title.trim().is_empty() {
        return Err("원고 항목 이름 입력 필요".to_string());
    }
    if node.title != expected_title
        || node.status != expected_status
        || node.synopsis != expected_synopsis
    {
        return Err("METADATA_CONFLICT".into());
    }
    node.title = title.trim().to_string();
    if node.kind == NodeKind::Scene {
        node.status = status;
        node.synopsis = synopsis;
    }
    write_manifest(&project_path, &manifest)?;
    load_project_from_path(&project_path)
}

fn sibling_positions(manifest: &ProjectManifest, node_id: &str) -> Result<Vec<usize>, String> {
    let node = manifest
        .nodes
        .iter()
        .find(|node| node.id == node_id)
        .ok_or_else(|| "이동 대상 원고 항목 없음".to_string())?;
    Ok(manifest
        .nodes
        .iter()
        .enumerate()
        .filter_map(|(index, candidate)| {
            (candidate.parent_id == node.parent_id && candidate.trashed.is_none()).then_some(index)
        })
        .collect())
}

#[tauri::command]
fn move_node(
    project_path: String,
    node_id: String,
    direction: i32,
) -> Result<ProjectSnapshot, String> {
    if direction != -1 && direction != 1 {
        return Err("원고 항목 이동 방향 오류".to_string());
    }
    let project_path = PathBuf::from(project_path);
    let mut manifest = read_manifest(&project_path)?;
    let siblings = sibling_positions(&manifest, &node_id)?;
    let current_manifest_index = manifest
        .nodes
        .iter()
        .position(|node| node.id == node_id)
        .ok_or_else(|| "이동 대상 원고 항목 없음".to_string())?;
    let current_sibling_index = siblings
        .iter()
        .position(|index| *index == current_manifest_index)
        .ok_or_else(|| "원고 항목 현재 순서 없음".to_string())?;
    let target = current_sibling_index as i32 + direction;
    if target < 0 || target >= siblings.len() as i32 {
        return load_project_from_path(&project_path);
    }
    manifest
        .nodes
        .swap(current_manifest_index, siblings[target as usize]);
    write_manifest(&project_path, &manifest)?;
    load_project_from_path(&project_path)
}

#[tauri::command]
fn indent_node(project_path: String, node_id: String) -> Result<ProjectSnapshot, String> {
    let project_path = PathBuf::from(project_path);
    let mut manifest = read_manifest(&project_path)?;
    let siblings = sibling_positions(&manifest, &node_id)?;
    let current_manifest_index = manifest
        .nodes
        .iter()
        .position(|node| node.id == node_id)
        .ok_or_else(|| "들여쓰기 대상 원고 항목 없음".to_string())?;
    let current_sibling_index = siblings
        .iter()
        .position(|index| *index == current_manifest_index)
        .ok_or_else(|| "원고 항목 현재 순서 없음".to_string())?;
    if current_sibling_index == 0 {
        return Err("앞쪽 그룹 아래로만 들여쓰기 가능".to_string());
    }
    let previous_index = siblings[current_sibling_index - 1];
    if manifest.nodes[previous_index].kind != NodeKind::Group {
        return Err("앞 항목이 그룹인 경우에만 포함 가능".to_string());
    }
    let parent_id = manifest.nodes[previous_index].id.clone();
    manifest.nodes[current_manifest_index].parent_id = Some(parent_id);
    validate_manifest(&manifest)?;
    write_manifest(&project_path, &manifest)?;
    load_project_from_path(&project_path)
}

#[tauri::command]
fn outdent_node(project_path: String, node_id: String) -> Result<ProjectSnapshot, String> {
    let project_path = PathBuf::from(project_path);
    let mut manifest = read_manifest(&project_path)?;
    let current = manifest
        .nodes
        .iter()
        .position(|node| node.id == node_id)
        .ok_or_else(|| "내어쓰기 대상 원고 항목 없음".to_string())?;
    let parent_id = manifest.nodes[current]
        .parent_id
        .clone()
        .ok_or_else(|| "최상위 항목의 추가 내어쓰기 불가".to_string())?;
    let grandparent_id = manifest
        .nodes
        .iter()
        .find(|node| node.id == parent_id)
        .and_then(|parent| parent.parent_id.clone());
    manifest.nodes[current].parent_id = grandparent_id;
    validate_manifest(&manifest)?;
    write_manifest(&project_path, &manifest)?;
    load_project_from_path(&project_path)
}

#[tauri::command]
fn reparent_node(
    project_path: String,
    node_id: String,
    parent_id: Option<String>,
    before_id: Option<String>,
) -> Result<ProjectSnapshot, String> {
    let project_path = PathBuf::from(project_path);
    let mut manifest = read_manifest(&project_path)?;
    let current = manifest
        .nodes
        .iter()
        .position(|node| node.id == node_id)
        .ok_or_else(|| "이동 대상 원고 항목 없음".to_string())?;

    if let Some(parent) = parent_id.as_deref() {
        let parent_node = manifest
            .nodes
            .iter()
            .find(|node| node.id == parent)
            .ok_or_else(|| "새 상위 그룹 없음".to_string())?;
        if parent_node.kind != NodeKind::Group {
            return Err("다른 원고 항목은 그룹 안에만 포함 가능".to_string());
        }
    }

    if before_id.as_deref() == Some(node_id.as_str()) {
        return load_project_from_path(&project_path);
    }

    let mut moved = manifest.nodes.remove(current);
    moved.parent_id = parent_id.clone();
    let insertion_index = match before_id.as_deref() {
        Some(before) => {
            let index = manifest
                .nodes
                .iter()
                .position(|node| node.id == before)
                .ok_or_else(|| "기준 원고 항목 없음".to_string())?;
            if manifest.nodes[index].parent_id != parent_id {
                return Err("같은 단계의 항목 앞에만 배치 가능".to_string());
            }
            index
        }
        None => manifest.nodes.len(),
    };
    manifest.nodes.insert(insertion_index, moved);

    validate_manifest(&manifest)?;
    write_manifest(&project_path, &manifest)?;
    load_project_from_path(&project_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            images::save_image,
            images::import_image,
            images::read_image,
            scene_operations::apply_scene_operation,
            scene_operations::list_manuscript_trash,
            recovery::list_recovery_drafts,
            recovery::write_recovery_draft,
            recovery::clear_recovery_draft,
            create_project,
            bootstrap_project,
            open_project,
            add_node,
            save_scene_checked,
            batch_edit::apply_batch_edit,
            resources::list_resource_cards,
            resources::save_resource_card,
            batch_edit::list_batch_journals,
            batch_edit::read_batch_journal,
            batch_edit::restore_batch_copy,
            preserve_conflict_copy,
            undo_project_edit,
            export_project,
            export_docx,
            list_scene_versions,
            restore_scene_version,
            update_node,
            move_node,
            indent_node,
            outdent_node,
            reparent_node
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ouroborocessor");
}

#[tauri::command]
fn bootstrap_project(
    app: tauri::AppHandle,
    title: String,
    group_title: String,
    scene_title: String,
) -> Result<ProjectSnapshot, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let root = app_data.join("workspace");
    fs::create_dir_all(&root).map_err(storage_error)?;
    let pointer = root.join("default-project.txt");
    if pointer.exists() {
        let path = fs::read_to_string(&pointer).map_err(|e| e.to_string())?;
        return load_project_from_path(Path::new(path.trim()));
    }
    if let Some(legacy_path) = legacy_default_project(&app_data)? {
        let project = load_project_from_path(&legacy_path)?;
        write_atomic(&pointer, legacy_path.to_string_lossy().as_bytes())?;
        return Ok(project);
    }
    let project = create_project(
        root.to_string_lossy().into_owned(),
        title,
        group_title,
        scene_title,
    )?;
    write_atomic(&pointer, project.project_path.as_bytes())?;
    Ok(project)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{self, Write};

    fn create_test_project(temp: &tempfile::TempDir) -> ProjectSnapshot {
        create_project(
            temp.path().to_string_lossy().into_owned(),
            "테스트 원고".to_string(),
            "1부".to_string(),
            "첫 장면".to_string(),
        )
        .expect("project should be created")
    }

    #[test]
    fn creates_and_reopens_a_portable_tree_project() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let project = create_test_project(&temp);
        assert_eq!(project.title, "테스트 원고");
        assert_eq!(project.nodes.len(), 2);
        assert_eq!(project.nodes[0].kind, NodeKind::Group);
        assert_eq!(
            project.nodes[1].parent_id,
            Some(project.nodes[0].id.clone())
        );

        save_scene(
            project.project_path.clone(),
            project.nodes[1].id.clone(),
            "한글 입력 테스트".to_string(),
        )
        .expect("scene should save");

        let reopened = open_project(project.project_path).expect("project should reopen");
        assert_eq!(reopened.nodes[1].content, "한글 입력 테스트");
    }

    #[test]
    fn finds_legacy_default_project_without_moving_legacy_data() {
        let temp = tempfile::tempdir().unwrap();
        let legacy_data = temp.path().join(LEGACY_APP_IDENTIFIER);
        let current_data = temp.path().join("com.ouroboro.ouroborocessor");
        let workspace = legacy_data.join("workspace");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&current_data).unwrap();
        let project = create_test_project(&temp);
        let pointer = workspace.join("default-project.txt");
        fs::write(&pointer, &project.project_path).unwrap();

        let recovered = legacy_default_project(&current_data).unwrap().unwrap();

        assert_eq!(recovered, PathBuf::from(project.project_path));
        assert!(pointer.is_file());
        assert!(legacy_data.is_dir());
    }

    #[test]
    fn docx_export_preserves_scope_text_and_excludes_private_metadata() {
        use std::io::Read;
        let temp = tempfile::tempdir().unwrap();
        let project = create_test_project(&temp);
        let path = project.project_path.clone();
        let scene_id = project.nodes[1].id.clone();
        save_scene(path.clone(), scene_id.clone(), "한국어 원고\n봄바람이 창문을 두드렸다. 기다리던 편지가 도착했다.\n\nEnglish manuscript\nThe letter arrived in the morning.\n\nManuscrito en español\nLa carta llegó por la mañana.\n\n日本語の原稿\n朝、待っていた手紙が届いた。\n\n中文原稿\n清晨，期待已久的信终于到了。\n\n특수 문자 & < > 및 탭\t보존".into()).unwrap();
        let project = update_node(
            path.clone(),
            scene_id.clone(),
            "다국어 원고".into(),
            "complete".into(),
            "PRIVATE_NOTE".into(),
            "첫 장면".into(),
            "draft".into(),
            "".into(),
        )
        .unwrap();
        let bytes = docx_export::build(&project, Some(&scene_id), "a4", "normal").unwrap();
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes.clone())).unwrap();
        let mut xml = String::new();
        archive
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut xml)
            .unwrap();
        assert!(
            xml.contains("한국어 원고")
                && xml.contains("La carta llegó")
                && xml.contains("&amp; &lt; &gt;")
                && xml.contains("<w:tab/>")
        );
        assert!(
            xml.contains("<w:pgSz w:w=\"11906\" w:h=\"16838\"/>")
                && xml.contains(
                    "<w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\"/>"
                )
        );
        assert!(!xml.contains("PRIVATE_NOTE") && !xml.contains("1부") && !xml.contains("complete"));
        assert_eq!(xml.matches("다국어 원고").count(), 1);
        assert_eq!(archive.len(), 5);
        assert!(docx_export::build(&project, Some("missing"), "a4", "normal").is_err());
        assert_eq!(
            docx_export::build(&project, Some(&scene_id), "legal", "normal").unwrap_err(),
            "EXPORT_PAGE_OPTIONS"
        );
        assert_eq!(
            docx_export::build(&project, Some(&scene_id), "letter", "unknown").unwrap_err(),
            "EXPORT_PAGE_OPTIONS"
        );
        let letter = docx_export::build(&project, Some(&scene_id), "letter", "wide").unwrap();
        let mut letter_archive = zip::ZipArchive::new(std::io::Cursor::new(letter)).unwrap();
        let mut letter_xml = String::new();
        letter_archive
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut letter_xml)
            .unwrap();
        assert!(
            letter_xml.contains("<w:pgSz w:w=\"12240\" w:h=\"15840\"/>")
                && letter_xml.contains(
                    "<w:pgMar w:top=\"2160\" w:right=\"2160\" w:bottom=\"2160\" w:left=\"2160\"/>"
                )
        );
        let mut invalid = project.nodes.clone();
        invalid[1].content.push('\u{0000}');
        let invalid = ProjectSnapshot {
            nodes: invalid,
            ..project
        };
        assert_eq!(
            docx_export::build(&invalid, Some(&scene_id), "a4", "normal").unwrap_err(),
            "EXPORT_INVALID_CHARACTER"
        );
        if let Ok(file) = std::env::var("LOCAL_WRITER_DOCX_QA") {
            write_atomic(Path::new(&file), &bytes).unwrap();
        }
    }

    #[test]
    fn docx_export_embeds_manuscript_images_with_accessible_description() {
        use std::io::Read;
        let temp = tempfile::tempdir().unwrap();
        let project = create_test_project(&temp);
        let path = project.project_path.clone();
        let scene_id = project.nodes[1].id.clone();
        let png = "89504e470d0a1a0a0000000d4948445200000001000000010804000000b51c0c020000000b4944415478da6364f80f00010501012718e3660000000049454e44ae426082"
            .as_bytes().chunks_exact(2).map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap()).collect::<Vec<_>>();
        let image_path = images::save_image(path.clone(), png.clone()).unwrap();
        save_scene(
            path,
            scene_id.clone(),
            format!("그림 앞\n![장면 배경]({image_path})\n그림 뒤"),
        )
        .unwrap();
        let project = open_project(project.project_path).unwrap();
        let bytes = docx_export::build(&project, Some(&scene_id), "a4", "normal").unwrap();
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        let name = image_path.trim_start_matches("images/");
        let mut embedded = Vec::new();
        archive
            .by_name(&format!("word/media/{name}"))
            .unwrap()
            .read_to_end(&mut embedded)
            .unwrap();
        assert_eq!(embedded, png);
        let mut document = String::new();
        archive
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut document)
            .unwrap();
        assert!(document.contains("장면 배경") && document.contains("<w:drawing>"));
        let mut relationships = String::new();
        archive
            .by_name("word/_rels/document.xml.rels")
            .unwrap()
            .read_to_string(&mut relationships)
            .unwrap();
        assert!(relationships.contains(&format!("media/{name}")));
        let mut styles = String::new();
        archive
            .by_name("word/styles.xml")
            .unwrap()
            .read_to_string(&mut styles)
            .unwrap();
        assert!(!styles.contains("Noto Serif CJK KR") && !styles.contains("w:eastAsia="));
        if let Ok(file) = std::env::var("OUROBOROCESSOR_IMAGE_DOCX_QA") {
            write_atomic(
                Path::new(&file),
                archive.into_inner().into_inner().as_slice(),
            )
            .unwrap();
        }
    }

    #[test]
    fn docx_group_order_and_destination_safety() {
        let temp = tempfile::tempdir().unwrap();
        let project = create_test_project(&temp);
        let path = project.project_path.clone();
        let group = project.nodes[0].id.clone();
        add_node(path.clone(), None, "scene".into(), "Excluded".into()).unwrap();
        let next = add_node(
            path.clone(),
            Some(group.clone()),
            "scene".into(),
            "Last".into(),
        )
        .unwrap();
        let scoped = docx_export::ordered_scope(&next, Some(&group)).unwrap();
        assert_eq!(
            scoped
                .iter()
                .map(|(n, _)| n.title.as_str())
                .collect::<Vec<_>>(),
            vec!["1부", "첫 장면", "Last"]
        );
        assert!(export_docx(
            path.clone(),
            path.clone(),
            None,
            "a4".into(),
            "normal".into()
        )
        .is_err());
        let destination = temp.path().to_string_lossy().into_owned();
        let first = export_docx(
            path.clone(),
            destination.clone(),
            Some(group.clone()),
            "a4".into(),
            "normal".into(),
        )
        .unwrap();
        let second = export_docx(
            path,
            destination,
            Some(group),
            "letter".into(),
            "wide".into(),
        )
        .unwrap();
        assert_ne!(first, second);
        assert!(Path::new(&first).is_file() && Path::new(&second).is_file());
    }

    #[test]
    fn undo_redo_restores_metadata_and_tree_without_touching_text() {
        let temp = tempfile::tempdir().unwrap();
        let project = create_test_project(&temp);
        let path = project.project_path.clone();
        let id = project.nodes[1].id.clone();
        let updated = update_node(
            path.clone(),
            id.clone(),
            "renamed".into(),
            "complete".into(),
            "note".into(),
            "첫 장면".into(),
            "draft".into(),
            "".into(),
        )
        .unwrap();
        assert!(updated.can_undo);
        outdent_node(path.clone(), id.clone()).unwrap();
        save_scene(path.clone(), id.clone(), "keep latest text".into()).unwrap();
        let undone = undo_project_edit(path.clone(), false).unwrap();
        assert_eq!(undone.nodes[1].parent_id, project.nodes[1].parent_id);
        assert_eq!(undone.nodes[1].content, "keep latest text");
        let undone = undo_project_edit(path.clone(), false).unwrap();
        assert_eq!(undone.nodes[1].title, project.nodes[1].title);
        assert_eq!(undone.nodes[1].synopsis, "");
        assert!(!undone.can_undo);
        assert!(undone.can_redo);
        let redone = undo_project_edit(path.clone(), true).unwrap();
        assert_eq!(redone.nodes[1].title, "renamed");
        assert_eq!(redone.nodes[1].content, "keep latest text");
        update_node(
            path.clone(),
            id,
            "branch".into(),
            "draft".into(),
            "".into(),
            "renamed".into(),
            "complete".into(),
            "note".into(),
        )
        .unwrap();
        assert!(undo_project_edit(path, true).is_err());
    }

    #[test]
    fn undo_refuses_external_manifest_change_and_addition_clears_history() {
        let temp = tempfile::tempdir().unwrap();
        let project = create_test_project(&temp);
        let path = project.project_path.clone();
        let id = project.nodes[1].id.clone();
        update_node(
            path.clone(),
            id,
            "new".into(),
            "draft".into(),
            "".into(),
            "첫 장면".into(),
            "draft".into(),
            "".into(),
        )
        .unwrap();
        let file = Path::new(&path).join(MANIFEST_FILE);
        let mut external = fs::read(&file).unwrap();
        external.push(b'\n');
        write_atomic(&file, &external).unwrap();
        assert_eq!(
            undo_project_edit(path.clone(), false).unwrap_err(),
            "HISTORY_CONFLICT"
        );
        assert_eq!(fs::read(&file).unwrap(), external);
        let added = add_node(path, None, "scene".into(), "new scene".into()).unwrap();
        assert!(!added.can_undo && !added.can_redo);
    }

    #[test]
    fn metadata_save_rejects_external_changes_without_overwriting_them() {
        let temp = tempfile::tempdir().unwrap();
        let project = create_test_project(&temp);
        let path = project.project_path.clone();
        let id = project.nodes[1].id.clone();
        let mut manifest = read_manifest(Path::new(&path)).unwrap();
        let scene = manifest
            .nodes
            .iter_mut()
            .find(|node| node.id == id)
            .unwrap();
        scene.title = "external title".into();
        scene.synopsis = "external note".into();
        write_atomic(
            &Path::new(&path).join(MANIFEST_FILE),
            &serde_json::to_vec_pretty(&manifest).unwrap(),
        )
        .unwrap();
        assert_eq!(
            update_node(
                path.clone(),
                id,
                "local title".into(),
                "complete".into(),
                "local note".into(),
                "첫 장면".into(),
                "draft".into(),
                "".into()
            )
            .unwrap_err(),
            "METADATA_CONFLICT"
        );
        let reopened = open_project(path).unwrap();
        assert_eq!(reopened.nodes[1].title, "external title");
        assert_eq!(reopened.nodes[1].synopsis, "external note");
    }

    #[test]
    fn guarded_save_rejects_external_change_and_preserves_both_copies() {
        let temp = tempfile::tempdir().unwrap();
        let project = create_test_project(&temp);
        let path = project.project_path.clone();
        let id = project.nodes[1].id.clone();
        save_scene_checked(path.clone(), id.clone(), "first".into(), "".into()).unwrap();
        save_scene(path.clone(), id.clone(), "external".into()).unwrap();
        assert_eq!(
            save_scene_checked(path.clone(), id.clone(), "local".into(), "first".into())
                .unwrap_err(),
            "SAVE_CONFLICT"
        );
        let copies =
            preserve_conflict_copy(path.clone(), id.clone(), "local".into(), "copy".into())
                .unwrap();
        assert_eq!(copies.nodes[1].content, "external");
        assert_eq!(copies.nodes.last().unwrap().content, "local");
        save_scene_checked(path, id, "external".into(), "first".into()).unwrap();
    }

    #[test]
    fn history_preserves_previous_text_and_restores_without_overwriting() {
        let temp = tempfile::tempdir().unwrap();
        let project = create_test_project(&temp);
        let path = project.project_path.clone();
        let scene = project.nodes[1].id.clone();
        // keep original text before the first edit
        let manifest = read_manifest(Path::new(&path)).unwrap();
        let file = manifest.nodes[1].file.as_ref().unwrap();
        write_atomic(
            &checked_scene_path(Path::new(&path), file).unwrap(),
            "이전 日本語 español".as_bytes(),
        )
        .unwrap();
        save_scene(path.clone(), scene.clone(), "현재".into()).unwrap();
        save_scene(path.clone(), scene.clone(), "최신".into()).unwrap();
        let versions = list_scene_versions(path.clone(), scene.clone())
            .unwrap()
            .versions;
        assert_eq!(versions.len(), 1);
        assert_eq!(versions[0].content, "이전 日本語 español");
        let restored = restore_scene_version(
            path.clone(),
            scene.clone(),
            versions[0].id.clone(),
            "복원".into(),
        )
        .unwrap();
        assert_eq!(restored.nodes[1].content, "최신");
        assert_eq!(restored.nodes.last().unwrap().content, versions[0].content);
        assert_eq!(
            restored.nodes.last().unwrap().parent_id,
            project.nodes[1].parent_id
        );
        assert!(
            restore_scene_version(path, scene, "../../project.json".into(), "bad".into()).is_err()
        );
    }

    #[test]
    fn history_creates_another_version_after_interval() {
        let temp = tempfile::tempdir().unwrap();
        let project = create_test_project(&temp);
        let path = Path::new(&project.project_path);
        let id = &project.nodes[1].id;
        save_scene(project.project_path.clone(), id.clone(), "first".into()).unwrap();
        let mut versions = scene_versions(path, id).unwrap().versions;
        versions[0].created_at -= 301;
        write_atomic(
            &path
                .join(".history")
                .join(format!("{}.json", versions[0].id)),
            &serde_json::to_vec(&versions[0]).unwrap(),
        )
        .unwrap();
        save_scene(project.project_path.clone(), id.clone(), "second".into()).unwrap();
        let versions = scene_versions(path, id).unwrap().versions;
        assert_eq!(versions.len(), 2);
        assert_eq!(versions[0].content, "first");
    }

    #[test]
    fn corrupt_history_is_reported_without_blocking_good_versions_or_saves() {
        let temp = tempfile::tempdir().unwrap();
        let project = create_test_project(&temp);
        let path = Path::new(&project.project_path);
        let id = project.nodes[1].id.clone();
        save_scene(project.project_path.clone(), id.clone(), "first".into()).unwrap();
        fs::write(path.join(".history/version-1.json"), b"corrupt").unwrap();
        let report = list_scene_versions(project.project_path.clone(), id.clone()).unwrap();
        assert_eq!(report.versions.len(), 1);
        assert_eq!(report.corrupt_count, 1);
        save_scene(project.project_path.clone(), id.clone(), "second".into()).unwrap();
        assert_eq!(
            open_project(project.project_path.clone()).unwrap().nodes[1].content,
            "second"
        );
        assert_eq!(
            fs::read(path.join(".history/version-1.json")).unwrap(),
            b"corrupt"
        );
    }

    #[test]
    fn failed_history_write_does_not_overwrite_manuscript() {
        let temp = tempfile::tempdir().unwrap();
        let project = create_test_project(&temp);
        write_atomic(
            &Path::new(&project.project_path).join(".history"),
            b"not a directory",
        )
        .unwrap();
        assert!(save_scene(
            project.project_path.clone(),
            project.nodes[1].id.clone(),
            "new".into()
        )
        .is_err());
        assert_eq!(
            open_project(project.project_path).unwrap().nodes[1].content,
            ""
        );
    }

    #[test]
    fn storage_errors_have_stable_user_facing_categories() {
        assert_eq!(
            storage_error(io::Error::from(io::ErrorKind::PermissionDenied)),
            "STORAGE_PERMISSION"
        );
        #[cfg(unix)]
        assert_eq!(
            storage_error(io::Error::from_raw_os_error(28)),
            "STORAGE_FULL"
        );
        #[cfg(windows)]
        assert_eq!(
            storage_error(io::Error::from_raw_os_error(112)),
            "STORAGE_FULL"
        );
        assert!(storage_error(io::Error::from(io::ErrorKind::Other)).starts_with("STORAGE_WRITE"));
    }

    #[cfg(unix)]
    #[test]
    fn read_only_parent_rejects_project_creation_without_partial_project() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let original_mode = fs::metadata(temp.path()).unwrap().permissions().mode();
        fs::set_permissions(temp.path(), fs::Permissions::from_mode(0o555)).unwrap();
        let result = create_project(
            temp.path().to_string_lossy().into_owned(),
            "Blocked".into(),
            "Group".into(),
            "Scene".into(),
        );
        fs::set_permissions(temp.path(), fs::Permissions::from_mode(original_mode)).unwrap();
        assert_eq!(result.unwrap_err(), "STORAGE_PERMISSION");
        assert!(!temp.path().join("Blocked.story").exists());
    }

    #[cfg(unix)]
    #[test]
    fn read_only_manuscript_folder_keeps_original_content() {
        use std::os::unix::fs::PermissionsExt;
        let temp = tempfile::tempdir().unwrap();
        let project = create_test_project(&temp);
        let manuscript = Path::new(&project.project_path).join("manuscript");
        let original_permissions = fs::metadata(&manuscript).unwrap().permissions();
        fs::set_permissions(&manuscript, fs::Permissions::from_mode(0o555)).unwrap();
        let result = save_scene_checked(
            project.project_path.clone(),
            project.nodes[1].id.clone(),
            "must not replace the original".into(),
            "".into(),
        );
        fs::set_permissions(&manuscript, original_permissions).unwrap();
        assert_eq!(result.unwrap_err(), "STORAGE_PERMISSION");
        assert_eq!(
            open_project(project.project_path).unwrap().nodes[1].content,
            ""
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "requires a disposable mounted volume marked for disk-full fault injection"]
    fn disk_full_volume_keeps_original_recovery_and_image_state() {
        let root = PathBuf::from(
            std::env::var("OUROBOROCESSOR_DISK_FULL_DIR")
                .expect("OUROBOROCESSOR_DISK_FULL_DIR required"),
        );
        assert!(root.join(".ouroborocessor-disk-full-fixture").is_file());

        let project = create_project(
            root.to_string_lossy().into_owned(),
            "Disk full".into(),
            "Group".into(),
            "Scene".into(),
        )
        .unwrap();
        let scene = project.nodes[1].id.clone();
        save_scene(
            project.project_path.clone(),
            scene.clone(),
            "baseline".into(),
        )
        .unwrap();
        recovery::write_recovery_draft(
            project.project_path.clone(),
            scene.clone(),
            "safe draft".into(),
            "baseline".into(),
        )
        .unwrap();

        let project_root = Path::new(&project.project_path);
        let manifest = read_manifest(project_root).unwrap();
        let scene_file = manifest
            .nodes
            .iter()
            .find(|node| node.id == scene)
            .and_then(|node| node.file.as_deref())
            .unwrap();
        let scene_path = checked_scene_path(project_root, scene_file).unwrap();
        let recovery_path = project_root.join(".recovery.json");
        let recovery_before = fs::read(&recovery_path).unwrap();
        let filler_path = root.join("disk-full-filler.bin");
        struct RemoveOnDrop(PathBuf);
        impl Drop for RemoveOnDrop {
            fn drop(&mut self) {
                let _ = fs::remove_file(&self.0);
            }
        }
        let _filler_cleanup = RemoveOnDrop(filler_path.clone());
        let mut filler = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&filler_path)
            .unwrap();
        let block = vec![0_u8; 1024 * 1024];
        let full_error = loop {
            if let Err(error) = filler.write_all(&block) {
                break error;
            }
        };
        assert_eq!(full_error.raw_os_error(), Some(28));
        drop(filler);

        assert_eq!(
            save_scene_checked(
                project.project_path.clone(),
                scene.clone(),
                "r".repeat(1024 * 1024),
                "baseline".into(),
            )
            .unwrap_err(),
            "STORAGE_FULL"
        );
        assert_eq!(fs::read_to_string(&scene_path).unwrap(), "baseline");

        assert_eq!(
            recovery::write_recovery_draft(
                project.project_path.clone(),
                scene,
                "d".repeat(1024 * 1024),
                "baseline".into(),
            )
            .unwrap_err(),
            "STORAGE_FULL"
        );
        assert_eq!(fs::read(&recovery_path).unwrap(), recovery_before);

        let mut gif = b"GIF89a\x01\0\x01\0\x80\0\0\0\0\0\xff\xff\xff!\xf9\x04\x01\0\0\0\0,\0\0\0\0\x01\0\x01\0\0\x02\x02D\x01\0;".to_vec();
        gif.resize(1024 * 1024, 0);
        *gif.last_mut().unwrap() = b';';
        assert_eq!(
            images::save_image(project.project_path.clone(), gif).unwrap_err(),
            "STORAGE_FULL"
        );
        assert!(!project_root.join("images").exists());
    }

    #[test]
    fn export_preserves_content_metadata_and_does_not_overwrite() {
        let temp = tempfile::tempdir().unwrap();
        let project = create_test_project(&temp);
        let path = project.project_path.clone();
        let scene = project.nodes[1].id.clone();
        save_scene(
            path.clone(),
            scene.clone(),
            "한국어 English 日本語 中文 español\n\n본문".into(),
        )
        .unwrap();
        update_node(
            path.clone(),
            scene,
            "장면 제목".into(),
            "revised".into(),
            "비공개 메모".into(),
            "첫 장면".into(),
            "draft".into(),
            "".into(),
        )
        .unwrap();
        let destination = temp.path().to_string_lossy().into_owned();
        let first = export_project(path.clone(), destination.clone()).unwrap();
        let second = export_project(path.clone(), destination).unwrap();
        assert_ne!(first, second);
        let restored = load_project_from_path(&Path::new(&first).join("Project.story")).unwrap();
        let original = open_project(path).unwrap();
        assert_eq!(
            serde_json::to_value(&restored.nodes).unwrap(),
            serde_json::to_value(&original.nodes).unwrap()
        );
        let markdown = fs::read_to_string(Path::new(&first).join("Manuscript.md")).unwrap();
        assert!(markdown.contains("## 1부\n\n### 장면 제목"));
        assert!(markdown.contains(&original.nodes[1].content));
        assert!(!markdown.contains("비공개 메모"));
    }

    #[test]
    fn export_rejects_source_and_source_descendants() {
        let temp = tempfile::tempdir().unwrap();
        let project = create_test_project(&temp);
        assert_eq!(
            export_project(project.project_path.clone(), project.project_path.clone()).unwrap_err(),
            "EXPORT_DESTINATION"
        );
        let child = Path::new(&project.project_path).join("manuscript");
        assert!(
            export_project(project.project_path, child.to_string_lossy().into_owned()).is_err()
        );
    }

    #[test]
    fn markdown_uses_tree_order_not_flat_manifest_order() {
        let temp = tempfile::tempdir().unwrap();
        let project = create_test_project(&temp);
        let path = project.project_path.clone();
        let group = project.nodes[0].id.clone();
        let next = add_node(path.clone(), None, "scene".into(), "Root".into()).unwrap();
        let root_id = next.nodes.last().unwrap().id.clone();
        let next = add_node(
            path.clone(),
            Some(group.clone()),
            "scene".into(),
            "Nested".into(),
        )
        .unwrap();
        let markdown = compile_markdown(&next);
        assert!(markdown.find("Nested").unwrap() < markdown.find("Root").unwrap());
        let moved = reparent_node(
            path,
            root_id,
            Some(group),
            Some(project.nodes[1].id.clone()),
        )
        .unwrap();
        let markdown = compile_markdown(&moved);
        assert!(markdown.find("Root").unwrap() < markdown.find("첫 장면").unwrap());
    }

    #[test]
    fn adds_and_reparents_tree_nodes() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let project = create_test_project(&temp);
        let next = add_node(
            project.project_path.clone(),
            None,
            "group".to_string(),
            "2부".to_string(),
        )
        .expect("group should be added");
        let second_group = next.nodes.last().expect("new group").id.clone();
        let next = add_node(
            project.project_path.clone(),
            None,
            "scene".to_string(),
            "독립 장면".to_string(),
        )
        .expect("scene should be added");
        let scene_id = next.nodes.last().expect("new scene").id.clone();

        let indented = indent_node(project.project_path.clone(), scene_id.clone())
            .expect("scene should indent below previous group");
        assert_eq!(
            indented
                .nodes
                .iter()
                .find(|node| node.id == scene_id)
                .expect("scene")
                .parent_id,
            Some(second_group)
        );

        let outdented =
            outdent_node(project.project_path, scene_id.clone()).expect("scene should outdent");
        assert_eq!(
            outdented
                .nodes
                .iter()
                .find(|node| node.id == scene_id)
                .expect("scene")
                .parent_id,
            None
        );
    }

    #[test]
    fn drag_reparent_places_a_scene_before_a_target() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let project = create_test_project(&temp);
        let original_scene = project.nodes[1].id.clone();
        let next = add_node(
            project.project_path.clone(),
            None,
            "group".to_string(),
            "2부".to_string(),
        )
        .expect("second group");
        let second_group = next.nodes.last().expect("new group").id.clone();
        let next = add_node(
            project.project_path.clone(),
            Some(second_group.clone()),
            "scene".to_string(),
            "마지막 장면".to_string(),
        )
        .expect("target scene");
        let target_scene = next.nodes.last().expect("new scene").id.clone();

        let moved = reparent_node(
            project.project_path,
            original_scene.clone(),
            Some(second_group.clone()),
            Some(target_scene.clone()),
        )
        .expect("scene should move before target");
        let children: Vec<&ManuscriptNode> = moved
            .nodes
            .iter()
            .filter(|node| node.parent_id.as_deref() == Some(second_group.as_str()))
            .collect();
        assert_eq!(children.len(), 2);
        assert_eq!(children[0].id, original_scene);
        assert_eq!(children[1].id, target_scene);
    }

    #[test]
    fn drag_reparent_rejects_a_cycle() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let project = create_test_project(&temp);
        let root_group = project.nodes[0].id.clone();
        let next = add_node(
            project.project_path.clone(),
            Some(root_group.clone()),
            "group".to_string(),
            "하위 그룹".to_string(),
        )
        .expect("nested group");
        let nested_group = next.nodes.last().expect("new group").id.clone();

        assert!(
            reparent_node(project.project_path, root_group, Some(nested_group), None,).is_err()
        );
    }

    #[test]
    fn opens_legacy_flat_projects() {
        let temp = tempfile::tempdir().expect("temporary directory");
        let project_path = temp.path().join("legacy.story");
        fs::create_dir_all(project_path.join("manuscript")).expect("manuscript folder");
        fs::write(project_path.join("manuscript/scene.md"), "legacy text").expect("legacy scene");
        fs::write(
            project_path.join(MANIFEST_FILE),
            r#"{
              "formatVersion": 1,
              "title": "Legacy",
              "scenes": [{
                "id": "scene-1", "title": "Scene", "file": "manuscript/scene.md",
                "status": "초안", "synopsis": ""
              }]
            }"#,
        )
        .expect("legacy manifest");

        let project = open_project(project_path.to_string_lossy().into_owned())
            .expect("legacy project should open");
        assert_eq!(project.nodes.len(), 1);
        assert_eq!(project.nodes[0].status, "draft");
    }

    #[test]
    fn sanitizes_folder_names_without_removing_korean() {
        assert_eq!(safe_folder_name(" 나의:소설? "), "나의-소설-");
    }

    #[test]
    fn rejects_parent_directory_components() {
        let project = Path::new("/tmp/example.story");
        assert!(checked_scene_path(project, "../secret.md").is_err());
    }
}
