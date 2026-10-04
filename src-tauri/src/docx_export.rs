//! DOCX (WordprocessingML) writer. Content comes from `document_export::blocks`.

use crate::document_export::{blocks, xml_escape as escape, Block, Image};
use crate::ProjectSnapshot;
use std::io::{Cursor, Write};

fn paragraph(text: &str, style: &str) -> String {
    let runs = text
        .split('\t')
        .map(|part| {
            format!(
                "<w:r><w:t xml:space=\"preserve\">{}</w:t></w:r>",
                escape(part)
            )
        })
        .collect::<Vec<_>>()
        .join("<w:r><w:tab/></w:r>");
    format!("<w:p><w:pPr><w:pStyle w:val=\"{style}\"/></w:pPr>{runs}</w:p>")
}

fn extent(image: &Image, max_width: u64, max_height: u64) -> (u64, u64) {
    let (width, height) = image.size.unwrap_or((4, 3));
    let scale = (max_width as f64 / width as f64)
        .min(max_height as f64 / height as f64)
        .min(1_200_000f64 / width.min(height) as f64);
    (
        (width as f64 * scale).round() as u64,
        (height as f64 * scale).round() as u64,
    )
}

fn image_paragraph(
    image: &Image,
    relationship: usize,
    document_id: usize,
    max_width: u64,
    max_height: u64,
) -> String {
    let (cx, cy) = extent(image, max_width, max_height);
    let name = escape(&image.name);
    let alt = escape(&image.alt);
    format!(
        r#"<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{document_id}" name="{name}" descr="{alt}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="{name}" descr="{alt}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId{relationship}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"#
    )
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
    let mut body = String::new();
    // (name, relationship id, bytes) in first-use order; repeated pictures share one part.
    let mut assets: Vec<(String, usize, std::rc::Rc<Vec<u8>>)> = Vec::new();
    let mut document_id = 1usize;
    for block in blocks(project, root)? {
        match block {
            Block::Title(title) => body.push_str(&paragraph(&title, "Title")),
            Block::Heading(level, text) => {
                body.push_str(&paragraph(&text, &format!("Heading{level}")))
            }
            Block::Paragraph(text) => body.push_str(&paragraph(&text, "Normal")),
            Block::Image(image) => {
                let relationship = match assets.iter().find(|(name, _, _)| *name == image.name) {
                    Some((_, relationship, _)) => *relationship,
                    None => {
                        let relationship = assets.len() + 2;
                        assets.push((image.name.clone(), relationship, image.bytes.clone()));
                        relationship
                    }
                };
                body.push_str(&image_paragraph(
                    &image,
                    relationship,
                    document_id,
                    max_image_width,
                    max_image_height,
                ));
                document_id += 1;
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
    for (name, relationship, _) in &assets {
        relationships.push_str(&format!(r#"<Relationship Id="rId{relationship}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{}"/>"#, escape(name)));
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
    for (name, _, bytes) in assets {
        archive
            .start_file(format!("word/media/{name}"), options)
            .map_err(|e| e.to_string())?;
        archive.write_all(&bytes).map_err(|e| e.to_string())?;
    }
    Ok(archive.finish().map_err(|e| e.to_string())?.into_inner())
}
