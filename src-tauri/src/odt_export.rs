//! OpenDocument Text (ODT) writer for LibreOffice and other ODF word processors.

use crate::document_export::{blocks, xml_escape, Block, Page};
use crate::ProjectSnapshot;
use std::io::{Cursor, Write};

const TEXT_NS: &str = r#"xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.3""#;

/// ODF collapses whitespace, so tabs and repeated or leading spaces need their own elements.
fn odf_text(text: &str) -> String {
    let mut output = String::new();
    let mut spaces = 0usize;
    let mut at_start = true;
    let flush = |output: &mut String, spaces: &mut usize, at_start: bool| {
        match (*spaces, at_start) {
            (0, _) => {}
            (1, false) => output.push(' '),
            (count, false) => output.push_str(&format!(" <text:s text:c=\"{}\"/>", count - 1)),
            (count, true) => output.push_str(&format!("<text:s text:c=\"{count}\"/>")),
        }
        *spaces = 0;
    };
    for character in text.chars() {
        match character {
            ' ' => spaces += 1,
            '\t' => {
                flush(&mut output, &mut spaces, at_start);
                output.push_str("<text:tab/>");
                at_start = false;
            }
            other => {
                flush(&mut output, &mut spaces, at_start);
                output.push_str(&xml_escape(other.encode_utf8(&mut [0; 4])));
                at_start = false;
            }
        }
    }
    // Trailing spaces are written as elements so they survive too.
    if spaces > 0 {
        output.push_str(&format!("<text:s text:c=\"{spaces}\"/>"));
    }
    output
}

pub(crate) fn build(
    project: &ProjectSnapshot,
    root: Option<&str>,
    page: &Page,
) -> Result<Vec<u8>, String> {
    let mut body = String::new();
    let mut pictures: Vec<(String, &'static str, std::rc::Rc<Vec<u8>>)> = Vec::new();
    let mut frame = 0usize;
    let mut title_text = String::new();
    for block in blocks(project, root)? {
        match block {
            Block::Title(title) => {
                body.push_str(&format!("<text:p text:style-name=\"Title\">{}</text:p>", odf_text(&title)));
                title_text = title;
            }
            Block::Heading(level, text) => body.push_str(&format!(
                "<text:h text:style-name=\"Heading_20_{level}\" text:outline-level=\"{level}\">{}</text:h>",
                odf_text(&text)
            )),
            Block::Paragraph(text) => body.push_str(&format!(
                "<text:p text:style-name=\"Standard\">{}</text:p>",
                odf_text(&text)
            )),
            Block::Image(image) => {
                if !pictures.iter().any(|(name, _, _)| *name == image.name) {
                    pictures.push((image.name.clone(), image.media_type(), image.bytes.clone()));
                }
                frame += 1;
                let (width, height) = image.fitted_mm(page.body_width_mm(), page.body_height_mm());
                body.push_str(&format!(
                    "<text:p text:style-name=\"Picture\"><draw:frame draw:name=\"Picture{frame}\" text:anchor-type=\"as-char\" svg:width=\"{width:.2}mm\" svg:height=\"{height:.2}mm\" draw:z-index=\"0\"><draw:image xlink:href=\"Pictures/{}\" xlink:type=\"simple\" xlink:show=\"embed\" xlink:actuate=\"onLoad\"/><svg:desc>{}</svg:desc></draw:frame></text:p>",
                    xml_escape(&image.name),
                    xml_escape(&image.alt),
                ));
            }
        }
    }
    let content = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?><office:document-content {TEXT_NS}><office:body><office:text>{body}</office:text></office:body></office:document-content>"#
    );
    let mut heading_styles = String::new();
    for level in 1..=9 {
        let size = if level == 1 { "15pt" } else { "13pt" };
        heading_styles.push_str(&format!(
            r#"<style:style style:name="Heading_20_{level}" style:display-name="Heading {level}" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:default-outline-level="{level}"><style:paragraph-properties fo:margin-top="0.42cm" fo:margin-bottom="0.21cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="{size}" fo:font-weight="bold" style:font-size-asian="{size}" style:font-weight-asian="bold" style:font-size-complex="{size}" style:font-weight-complex="bold"/></style:style>"#
        ));
    }
    let styles = format!(
        r##"<?xml version="1.0" encoding="UTF-8"?><office:document-styles {TEXT_NS}><office:styles><style:default-style style:family="paragraph"><style:paragraph-properties fo:line-height="150%"/><style:text-properties fo:font-size="12pt" style:font-size-asian="12pt" style:font-size-complex="12pt" fo:color="#000000"/></style:default-style><style:style style:name="Standard" style:family="paragraph" style:class="text"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.21cm" fo:orphans="2" fo:widows="2"/></style:style><style:style style:name="Title" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:class="chapter"><style:paragraph-properties fo:margin-bottom="0.56cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="18pt" fo:font-weight="bold" style:font-size-asian="18pt" style:font-weight-asian="bold" style:font-size-complex="18pt" style:font-weight-complex="bold"/></style:style>{heading_styles}<style:style style:name="Picture" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center" fo:margin-top="0.21cm" fo:margin-bottom="0.21cm"/></style:style></office:styles><office:automatic-styles><style:page-layout style:name="Page"><style:page-layout-properties fo:page-width="{w}mm" fo:page-height="{h}mm" fo:margin-top="{m}mm" fo:margin-bottom="{m}mm" fo:margin-left="{m}mm" fo:margin-right="{m}mm" style:print-orientation="portrait"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="Page"/></office:master-styles></office:document-styles>"##,
        w = page.width_mm,
        h = page.height_mm,
        m = page.margin_mm,
    );
    let meta = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?><office:document-meta {TEXT_NS}><office:meta><dc:title>{}</dc:title><meta:generator>Ouroborocessor</meta:generator></office:meta></office:document-meta>"#,
        xml_escape(&title_text)
    );
    let mut manifest = String::from(
        r#"<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>"#,
    );
    for (name, media_type, _) in &pictures {
        manifest.push_str(&format!(
            r#"<manifest:file-entry manifest:full-path="Pictures/{}" manifest:media-type="{media_type}"/>"#,
            xml_escape(name)
        ));
    }
    manifest.push_str("</manifest:manifest>");

    let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let stored =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    // The mimetype entry must come first and stay uncompressed so tools can sniff the format.
    for (name, data) in [
        ("mimetype", "application/vnd.oasis.opendocument.text"),
        ("META-INF/manifest.xml", manifest.as_str()),
        ("content.xml", content.as_str()),
        ("styles.xml", styles.as_str()),
        ("meta.xml", meta.as_str()),
    ] {
        archive
            .start_file(name, stored)
            .map_err(|e| e.to_string())?;
        archive
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
    }
    for (name, _, bytes) in pictures {
        archive
            .start_file(format!("Pictures/{name}"), stored)
            .map_err(|e| e.to_string())?;
        archive.write_all(&bytes).map_err(|e| e.to_string())?;
    }
    Ok(archive.finish().map_err(|e| e.to_string())?.into_inner())
}

#[cfg(test)]
mod tests {
    use super::odf_text;

    #[test]
    fn spaces_and_tabs_survive_odf_whitespace_collapsing() {
        assert_eq!(odf_text("a b"), "a b");
        assert_eq!(odf_text("a   b"), "a <text:s text:c=\"2\"/>b");
        assert_eq!(odf_text("  a"), "<text:s text:c=\"2\"/>a");
        assert_eq!(odf_text("a\tb <c>"), "a<text:tab/>b &lt;c&gt;");
        assert_eq!(odf_text("a  "), "a<text:s text:c=\"2\"/>");
    }
}
