use crate::{ManuscriptNode, NodeKind, ProjectSnapshot};
use std::{
    collections::HashMap,
    io::{Cursor, Write},
    path::Path,
};

pub(crate) fn ordered_scope<'a>(
    project: &'a ProjectSnapshot,
    root: Option<&str>,
) -> Result<Vec<(&'a ManuscriptNode, usize)>, String> {
    let mut children: HashMap<Option<&str>, Vec<&ManuscriptNode>> = HashMap::new();
    for node in &project.nodes {
        children
            .entry(node.parent_id.as_deref())
            .or_default()
            .push(node);
    }
    let roots = match root {
        Some(id) => vec![project
            .nodes
            .iter()
            .find(|n| n.id == id)
            .ok_or("EXPORT_SCOPE_MISSING")?],
        None => children.get(&None).cloned().unwrap_or_default(),
    };
    let mut stack: Vec<_> = roots.into_iter().rev().map(|n| (n, 1)).collect();
    let mut ordered = Vec::new();
    while let Some((node, depth)) = stack.pop() {
        ordered.push((node, depth));
        if let Some(items) = children.get(&Some(node.id.as_str())) {
            stack.extend(items.iter().rev().map(|n| (*n, depth + 1)));
        }
    }
    Ok(ordered)
}

fn escape(text: &str) -> Result<String, String> {
    if text.chars().any(|c| !matches!(c, '\t' | '\n' | '\r' | '\u{20}'..='\u{d7ff}' | '\u{e000}'..='\u{fffd}' | '\u{10000}'..='\u{10ffff}')) {
        return Err("EXPORT_INVALID_CHARACTER".into());
    }
    Ok(text
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;"))
}

fn paragraph(text: &str, style: &str) -> Result<String, String> {
    let runs = text
        .split('\t')
        .map(|part| {
            escape(part).map(|s| format!("<w:r><w:t xml:space=\"preserve\">{s}</w:t></w:r>"))
        })
        .collect::<Result<Vec<_>, _>>()?
        .join("<w:r><w:tab/></w:r>");
    Ok(format!(
        "<w:p><w:pPr><w:pStyle w:val=\"{style}\"/></w:pPr>{runs}</w:p>"
    ))
}

struct ImageAsset {
    name: String,
    bytes: Vec<u8>,
    relationship: usize,
}

fn dimensions(bytes: &[u8], extension: &str) -> Option<(u32, u32)> {
    match extension {
        "png" if bytes.len() >= 24 => Some((
            u32::from_be_bytes(bytes[16..20].try_into().ok()?),
            u32::from_be_bytes(bytes[20..24].try_into().ok()?),
        )),
        "gif" if bytes.len() >= 10 => Some((
            u16::from_le_bytes(bytes[6..8].try_into().ok()?) as u32,
            u16::from_le_bytes(bytes[8..10].try_into().ok()?) as u32,
        )),
        "jpg" => {
            let mut cursor = 2usize;
            while cursor + 9 < bytes.len() {
                if bytes[cursor] != 0xff {
                    cursor += 1;
                    continue;
                }
                let marker = bytes[cursor + 1];
                if marker == 0xd8 || marker == 0xd9 {
                    cursor += 2;
                    continue;
                }
                let length = u16::from_be_bytes([bytes[cursor + 2], bytes[cursor + 3]]) as usize;
                if length < 2 || cursor + 2 + length > bytes.len() {
                    break;
                }
                if matches!(marker, 0xc0..=0xc3 | 0xc5..=0xc7 | 0xc9..=0xcb | 0xcd..=0xcf) {
                    return Some((
                        u16::from_be_bytes([bytes[cursor + 7], bytes[cursor + 8]]) as u32,
                        u16::from_be_bytes([bytes[cursor + 5], bytes[cursor + 6]]) as u32,
                    ));
                }
                cursor += 2 + length;
            }
            None
        }
        "webp" if bytes.len() >= 30 && &bytes[12..16] == b"VP8X" => {
            let width = 1 + u32::from_le_bytes([bytes[24], bytes[25], bytes[26], 0]);
            let height = 1 + u32::from_le_bytes([bytes[27], bytes[28], bytes[29], 0]);
            Some((width, height))
        }
        _ => None,
    }
    .filter(|(width, height)| *width > 0 && *height > 0)
}

fn extent(bytes: &[u8], extension: &str, max_width: u64, max_height: u64) -> (u64, u64) {
    let (width, height) = dimensions(bytes, extension).unwrap_or((4, 3));
    let scale = (max_width as f64 / width as f64)
        .min(max_height as f64 / height as f64)
        .min(1_200_000f64 / width.min(height) as f64);
    (
        (width as f64 * scale).round() as u64,
        (height as f64 * scale).round() as u64,
    )
}

fn image_paragraph(
    name: &str,
    alt: &str,
    bytes: &[u8],
    relationship: usize,
    document_id: usize,
    max_width: u64,
    max_height: u64,
) -> Result<String, String> {
    let extension = name
        .rsplit_once('.')
        .map(|(_, ext)| ext)
        .ok_or("IMAGE_FORMAT")?;
    let (cx, cy) = extent(bytes, extension, max_width, max_height);
    let name = escape(name)?;
    let alt = escape(alt)?;
    Ok(format!(
        r#"<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{document_id}" name="{name}" descr="{alt}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="{name}" descr="{alt}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId{relationship}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"#
    ))
}

fn append_line(
    project: &ProjectSnapshot,
    line: &str,
    body: &mut String,
    assets: &mut Vec<ImageAsset>,
    document_id: &mut usize,
    max_width: u64,
    max_height: u64,
) -> Result<(), String> {
    let mut scan = 0usize;
    let mut emitted = 0usize;
    let mut found = false;
    while let Some(relative_start) = line[scan..].find("![") {
        let start = scan + relative_start;
        let Some(alt_end_relative) = line[start + 2..].find("](") else {
            break;
        };
        let alt_end = start + 2 + alt_end_relative;
        let target_start = alt_end + 2;
        let Some(target_end_relative) = line[target_start..].find(')') else {
            break;
        };
        let target_end = target_start + target_end_relative;
        let Some(name) = line[target_start..target_end].strip_prefix("images/") else {
            scan = target_end + 1;
            continue;
        };
        if name.contains('/') || !name.starts_with("image-") {
            scan = target_end + 1;
            continue;
        }
        if start > emitted {
            body.push_str(&paragraph(&line[emitted..start], "Normal")?);
        }
        let relationship = if let Some(asset) = assets.iter().find(|asset| asset.name == name) {
            asset.relationship
        } else {
            let bytes = crate::images::read(Path::new(&project.project_path), name)?;
            let relationship = assets.len() + 2;
            assets.push(ImageAsset {
                name: name.into(),
                bytes,
                relationship,
            });
            relationship
        };
        let bytes = &assets
            .iter()
            .find(|asset| asset.name == name)
            .unwrap()
            .bytes;
        body.push_str(&image_paragraph(
            name,
            &line[start + 2..alt_end],
            bytes,
            relationship,
            *document_id,
            max_width,
            max_height,
        )?);
        *document_id += 1;
        found = true;
        emitted = target_end + 1;
        scan = emitted;
    }
    if !found {
        body.push_str(&paragraph(line, "Normal")?);
    } else if emitted < line.len() {
        body.push_str(&paragraph(&line[emitted..], "Normal")?);
    }
    Ok(())
}

fn page_layout(paper_size: &str, margin_preset: &str) -> Result<(u32, u32, u32), String> {
    let (width, height) = match paper_size {
        "a4" => (11_906, 16_838),
        "letter" => (12_240, 15_840),
        _ => return Err("EXPORT_PAGE_OPTIONS".into()),
    };
    let margin = match margin_preset {
        "narrow" => 720,
        "normal" => 1_440,
        "wide" => 2_160,
        _ => return Err("EXPORT_PAGE_OPTIONS".into()),
    };
    Ok((width, height, margin))
}

pub(crate) fn build(
    project: &ProjectSnapshot,
    root: Option<&str>,
    paper_size: &str,
    margin_preset: &str,
) -> Result<Vec<u8>, String> {
    let (page_width, page_height, margin) = page_layout(paper_size, margin_preset)?;
    let max_image_width = u64::from(page_width - margin * 2) * 635;
    let max_image_height = u64::from(page_height - margin * 2) * 635;
    let ordered = ordered_scope(project, root)?;
    let title = root
        .and_then(|id| project.nodes.iter().find(|n| n.id == id))
        .map(|n| n.title.as_str())
        .unwrap_or(&project.title);
    let mut body = paragraph(&title.replace(['\r', '\n'], " "), "Title")?;
    let mut assets = Vec::new();
    let mut document_id = 1usize;
    for (node, depth) in ordered {
        if Some(node.id.as_str()) != root {
            let level = if root.is_some() {
                depth.saturating_sub(1).max(1)
            } else {
                depth
            };
            body.push_str(&paragraph(
                &node.title.replace(['\r', '\n'], " "),
                &format!("Heading{}", level.min(9)),
            )?);
        }
        if node.kind == NodeKind::Scene {
            let normalized = crate::resource_links::display_text(&node.content)
                .replace("\r\n", "\n")
                .replace('\r', "\n");
            for line in normalized.split('\n') {
                append_line(
                    project,
                    line,
                    &mut body,
                    &mut assets,
                    &mut document_id,
                    max_image_width,
                    max_image_height,
                )?;
            }
        }
    }
    let document = format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:wp=\"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:pic=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><w:body>{body}<w:sectPr><w:pgSz w:w=\"{page_width}\" w:h=\"{page_height}\"/><w:pgMar w:top=\"{margin}\" w:right=\"{margin}\" w:bottom=\"{margin}\" w:left=\"{margin}\"/></w:sectPr></w:body></w:document>");
    let mut styles = String::from(
        r#"<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:color w:val="000000"/><w:sz w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="320"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>"#,
    );
    for level in 1..=9 {
        styles.push_str(&format!(r#"<w:style w:type="paragraph" w:styleId="Heading{level}"><w:name w:val="heading {level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="{}"/></w:pPr><w:rPr><w:b/><w:sz w:val="{}"/></w:rPr></w:style>"#, level - 1, if level == 1 { 30 } else { 26 }));
    }
    styles.push_str("</w:styles>");
    let mut relationships = String::from(
        r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>"#,
    );
    for asset in &assets {
        relationships.push_str(&format!(r#"<Relationship Id="rId{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{}"/>"#, asset.relationship, escape(&asset.name)?));
    }
    relationships.push_str("</Relationships>");
    let content_types = r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>"#;
    let parts = [
        ("[Content_Types].xml", content_types),
        (
            "_rels/.rels",
            r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#,
        ),
        ("word/_rels/document.xml.rels", relationships.as_str()),
        ("word/document.xml", document.as_str()),
        ("word/styles.xml", styles.as_str()),
    ];
    let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    for (name, content) in parts {
        archive
            .start_file(name, options)
            .map_err(|e| e.to_string())?;
        archive
            .write_all(content.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    for asset in assets {
        archive
            .start_file(format!("word/media/{}", asset.name), options)
            .map_err(|e| e.to_string())?;
        archive.write_all(&asset.bytes).map_err(|e| e.to_string())?;
    }
    Ok(archive.finish().map_err(|e| e.to_string())?.into_inner())
}
