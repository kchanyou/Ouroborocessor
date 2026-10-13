use super::*;
use std::io::Read;

fn exported_body(path: &str, format: &str) -> String {
    let bytes = fs::read(path).unwrap();
    let entry = match format {
        "docx" => "word/document.xml",
        "hwpx" => "Contents/section0.xml",
        "odt" => "content.xml",
        _ => return String::from_utf8(bytes).unwrap(),
    };
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
    let mut body = String::new();
    archive
        .by_name(entry)
        .unwrap()
        .read_to_string(&mut body)
        .unwrap();
    body
}

#[test]
fn saved_split_reopened_project_exports_every_format_and_restorable_backup() {
    // Optional artifacts live in a fresh directory, never in an existing project.
    let output = std::env::var_os("OUROBOROCESSOR_WORKFLOW_OUTPUT");
    let temp = match &output {
        Some(parent) => tempfile::Builder::new()
            .prefix("workflow-")
            .tempdir_in(parent)
            .unwrap(),
        None => tempfile::tempdir().unwrap(),
    };
    let initial = create_project(
        temp.path().to_string_lossy().into_owned(),
        "통합 검증".into(),
        "1부".into(),
        "앞부분".into(),
    )
    .unwrap();
    let path = initial.project_path.clone();
    let scene = initial.nodes[1].id.clone();
    let prefix = "시작 한국어 😀\r\n앞부분 종료\r\n";
    let suffix = "검색대상 日本語 中文 español\r\n특수문자 & < >\t보존\r\n끝";
    let original = format!("{prefix}{suffix}");
    save_scene(path.clone(), scene.clone(), original.clone()).unwrap();
    let saved = open_project(path.clone()).unwrap();
    assert_eq!(saved.nodes[1].content, original);
    let saved = update_node(
        path.clone(),
        scene.clone(),
        "앞부분".into(),
        "draft".into(),
        "PRIVATE_WORKFLOW_NOTE".into(),
        "앞부분".into(),
        "draft".into(),
        "".into(),
    )
    .unwrap();
    let split = scene_operations::apply_scene_operation(
        path.clone(),
        saved.nodes,
        scene_operations::SceneOperation::Split {
            id: scene,
            offset: prefix.encode_utf16().count(),
            title: "뒷부분".into(),
        },
    )
    .unwrap();
    let reopened = open_project(path.clone()).unwrap();
    assert_eq!(reopened.nodes, split.nodes);
    assert_eq!(reopened.nodes[1].content, prefix);
    assert_eq!(reopened.nodes[2].content, suffix);
    let manifest_before = fs::read(Path::new(&path).join(MANIFEST_FILE)).unwrap();
    let mut artifacts = Vec::new();
    for format in ["docx", "hwpx", "odt", "html", "txt"] {
        for scoped in [false, true] {
            let file = export_document(
                path.clone(),
                temp.path().to_string_lossy().into_owned(),
                scoped.then(|| reopened.nodes[2].id.clone()),
                format.into(),
                "a4".into(),
                "normal".into(),
            )
            .unwrap();
            let body = exported_body(&file, format);
            assert!(body.contains("검색대상 日本語 中文 español"), "{format}");
            assert!(body.contains("끝"), "{format}");
            assert!(!body.contains("PRIVATE_WORKFLOW_NOTE"), "{format}");
            assert_eq!(body.contains("시작 한국어 😀"), !scoped, "{format}");
            assert!(
                body.contains(if format == "txt" {
                    "특수문자 & < >"
                } else {
                    "특수문자 &amp; &lt; &gt;"
                }),
                "{format}"
            );
            artifacts.push(serde_json::json!({ "format": format, "scoped": scoped, "path": file }));
        }
    }
    let backup = export_project(path.clone(), temp.path().to_string_lossy().into_owned()).unwrap();
    let restored = open_project(
        Path::new(&backup)
            .join("Project.story")
            .to_string_lossy()
            .into_owned(),
    )
    .unwrap();
    assert_eq!(restored.nodes, reopened.nodes);
    assert_eq!(
        fs::read(Path::new(&path).join(MANIFEST_FILE)).unwrap(),
        manifest_before
    );
    assert_eq!(open_project(path).unwrap().nodes, reopened.nodes);
    if output.is_some() {
        fs::write(
            temp.path().join("exports.json"),
            serde_json::to_vec_pretty(&artifacts).unwrap(),
        )
        .unwrap();
        fs::write(
            temp.path().join("snapshot.json"),
            serde_json::to_vec_pretty(&reopened).unwrap(),
        )
        .unwrap();
        println!("WORKFLOW_ARTIFACTS={}", temp.keep().display());
    }
}
