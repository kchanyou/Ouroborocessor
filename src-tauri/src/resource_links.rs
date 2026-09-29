// Submission exports display link labels; project backups retain the exact source.
pub fn display_text(source: &str) -> String {
    let mut output = String::new();
    let mut rest = source;
    while let Some(start) = rest.find("[[resource:") {
        output.push_str(&rest[..start]);
        let candidate = &rest[start..];
        let Some(end) = candidate.find("]]") else {
            output.push_str(candidate);
            return output;
        };
        let inner = &candidate[11..end];
        let label = inner
            .split_once('|')
            .filter(|(id, _)| !id.is_empty())
            .filter(|_| !inner.contains(['[', ']', '\r', '\n']))
            .and_then(|(id, label)| decode(id).and_then(|_| decode(label)));
        output.push_str(label.as_deref().unwrap_or(&candidate[..end + 2]));
        rest = &candidate[end + 2..];
    }
    output.push_str(rest);
    output
}

fn decode(value: &str) -> Option<String> {
    let mut bytes = Vec::new();
    let mut input = value.as_bytes().iter().copied();
    while let Some(byte) = input.next() {
        if byte == b'%' {
            let high = (input.next()? as char).to_digit(16)?;
            let low = (input.next()? as char).to_digit(16)?;
            bytes.push((high * 16 + low) as u8);
        } else {
            bytes.push(byte);
        }
    }
    String::from_utf8(bytes).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exports_labels_without_ids_and_keeps_other_source() {
        assert_eq!(
            display_text("Hello [[resource:abc|인물%7C名前]] and [[manual]]."),
            "Hello 인물|名前 and [[manual]]."
        );
        for source in [
            "[[resource:abc|%GG]]",
            "[[resource:abc]]",
            "[[resource:abc|unclosed",
            "[[resource:|empty]]",
        ] {
            assert_eq!(display_text(source), source);
        }
    }
}
