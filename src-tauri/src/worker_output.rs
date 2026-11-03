//! Bounded newline protocol for local workers. A producer never blocks on its receiver.
use std::{
    io::{self, BufRead, BufReader, Read},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, RecvTimeoutError, TrySendError},
        Arc,
    },
    time::Duration,
};

pub fn read_line_capped(reader: &mut impl BufRead, limit: usize) -> io::Result<Option<String>> {
    let mut bytes = Vec::new();
    loop {
        let available = reader.fill_buf()?;
        if available.is_empty() {
            return if bytes.is_empty() {
                Ok(None)
            } else {
                Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "unterminated worker message",
                ))
            };
        }
        let count = available
            .iter()
            .position(|byte| *byte == b'\n')
            .map_or(available.len(), |position| position + 1);
        // Check before copying, including when a malicious worker never emits a newline.
        if count > limit.saturating_sub(bytes.len()) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "worker message exceeds limit",
            ));
        }
        let complete = available[count - 1] == b'\n';
        bytes.extend_from_slice(&available[..count]);
        reader.consume(count);
        if complete {
            bytes.pop();
            if bytes.last() == Some(&b'\r') {
                bytes.pop();
            }
            return String::from_utf8(bytes)
                .map(Some)
                .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error));
        }
    }
}

pub struct WorkerOutput {
    receive: Receiver<String>,
    failed: Arc<AtomicBool>,
}
impl WorkerOutput {
    pub fn start(stdout: impl Read + Send + 'static, limit: usize, capacity: usize) -> Self {
        let (send, receive) = mpsc::sync_channel(capacity);
        let failed = Arc::new(AtomicBool::new(false));
        let failure = failed.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::with_capacity(8192, stdout);
            loop {
                match read_line_capped(&mut reader, limit) {
                    Ok(Some(line)) => match send.try_send(line) {
                        Ok(()) => {}
                        Err(TrySendError::Disconnected(_)) => break,
                        Err(TrySendError::Full(_)) => {
                            failure.store(true, Ordering::Release);
                            break;
                        }
                    },
                    Ok(None) => break,
                    Err(_) => {
                        failure.store(true, Ordering::Release);
                        break;
                    }
                }
            }
        });
        Self { receive, failed }
    }
    pub fn recv_timeout(&self, timeout: Duration) -> std::result::Result<String, RecvTimeoutError> {
        if self.failed.load(Ordering::Acquire) {
            return Err(RecvTimeoutError::Disconnected);
        }
        let line = self.receive.recv_timeout(timeout)?;
        if self.failed.load(Ordering::Acquire) {
            return Err(RecvTimeoutError::Disconnected);
        }
        Ok(line)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn caps_before_reading_an_unterminated_giant_message() {
        struct Endless;
        impl Read for Endless {
            fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
                out.fill(b'x');
                Ok(out.len())
            }
        }
        let mut reader = BufReader::with_capacity(32, Endless);
        assert_eq!(
            read_line_capped(&mut reader, 1024).unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        assert_eq!(
            read_line_capped(&mut io::Cursor::new(b"hello\r\n"), 7).unwrap(),
            Some("hello".into())
        );
        assert!(read_line_capped(&mut io::Cursor::new(b"incomplete"), 32).is_err());
    }
    #[test]
    fn overflow_closes_without_a_blocked_sender_and_distrusts_queued_messages() {
        let output = WorkerOutput::start(io::Cursor::new(b"one\ntwo\nthree\n"), 32, 1);
        // Wait for producer completion without consuming any messages.
        for _ in 0..1000 {
            if output.failed.load(Ordering::Acquire) {
                break;
            }
            std::thread::sleep(Duration::from_millis(1));
        }
        assert!(output.failed.load(Ordering::Acquire));
        assert_eq!(
            output.recv_timeout(Duration::from_millis(10)),
            Err(RecvTimeoutError::Disconnected)
        );
        drop(output); // no send/join deadlock during shutdown
    }
    #[test]
    fn rejects_invalid_utf8_and_huge_line_without_returning_partial_text() {
        let output = WorkerOutput::start(io::Cursor::new(vec![b'x'; 100_000]), 1024, 2);
        assert!(output.recv_timeout(Duration::from_secs(1)).is_err());
        assert!(read_line_capped(&mut io::Cursor::new(b"\xff\n"), 4).is_err());
    }
}
