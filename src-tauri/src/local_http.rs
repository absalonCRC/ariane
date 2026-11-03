//! HTTP for child-owned loopback services; never inherit proxy or redirect routing.
use crate::error::{AppResult, Result};
use std::{io::Read, process::Child, time::Duration};

pub fn client(seconds: u64) -> Result<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(seconds))
        .build()
        .app()
}

pub fn require_alive(child: &mut Child) -> Result<()> {
    if child.try_wait().app()?.is_some() {
        return Err("Le moteur local s’est arrêté.".into());
    }
    Ok(())
}

pub fn json(response: reqwest::blocking::Response) -> Result<serde_json::Value> {
    let response = response.error_for_status().app()?;
    // error_for_status permits 3xx; reject them explicitly as protocol failures.
    if !response.status().is_success() {
        return Err("Redirection du moteur local refusée.".into());
    }
    const LIMIT: usize = 2_000_000;
    if response
        .content_length()
        .is_some_and(|length| length > LIMIT as u64)
    {
        return Err("Réponse du moteur local trop volumineuse.".into());
    }
    let mut bytes = Vec::new();
    response
        .take(LIMIT as u64 + 1)
        .read_to_end(&mut bytes)
        .app()?;
    if bytes.len() > LIMIT {
        return Err("Réponse du moteur local trop volumineuse.".into());
    }
    serde_json::from_slice(&bytes).app()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::Write, net::TcpListener};
    #[test]
    fn refuses_redirects_before_sending_text_or_credentials_to_the_target() {
        let target = TcpListener::bind("127.0.0.1:0").unwrap();
        target.set_nonblocking(true).unwrap();
        let service = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = service.local_addr().unwrap().port();
        let destination = target.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = service.accept().unwrap();
            let mut request = [0; 8192];
            let length = socket.read(&mut request).unwrap();
            assert!(
                String::from_utf8_lossy(&request[..length]).contains("Bearer private-local-key")
            );
            write!(socket, "HTTP/1.1 307 Temporary Redirect\r\nLocation: http://{destination}/leak\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
        });
        let response = client(2)
            .unwrap()
            .post(format!("http://127.0.0.1:{port}/completion"))
            .bearer_auth("private-local-key")
            .body("private manuscript")
            .send()
            .unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::TEMPORARY_REDIRECT);
        assert!(json(response).is_err());
        server.join().unwrap();
        assert_eq!(
            target.accept().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
    }
    #[test]
    fn rejects_exited_child_before_a_request() {
        let mut child = std::process::Command::new("sh")
            .args(["-c", "exit 0"])
            .spawn()
            .unwrap();
        child.wait().unwrap();
        assert!(require_alive(&mut child).is_err());
    }
}
