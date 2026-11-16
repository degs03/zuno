//! Zuno TV server: lets the webOS app (tv/) use this desktop Zuno as its backend.
//!
//! A webOS 3.5 TV runs Chromium 38. It can draw a UI and play an `<audio>` element, but it
//! cannot mint the PO token googlevideo now demands (BotGuard needs a modern browser), so it
//! cannot fetch a song on its own. This desktop app already can. The TV therefore asks us:
//!
//! - `GET /tv/ping` — is a Zuno here? (no code needed; it is what "Connect" probes)
//! - `GET /tv/api?m=<method>&a=<json args>` — forwarded to the frontend as a `tv-request`
//!   event; `src/tv/tvBridge.ts` runs it against the normal data source and answers through
//!   [`tv_respond`].
//! - `GET /audio/<key>` — the existing media server's bytes (with Range), so the TV streams
//!   exactly what the desktop player would.
//!
//! It listens on the LAN, so everything but `/tv/ping` requires the 6-digit pairing code the
//! Settings page shows (`X-Zuno-Code` header or `k=` query parameter). Off by default.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::CommandError;

pub const TV_PORT: u16 = 47800;
/// Long enough for a cold search or a first stream resolve; the TV shows a spinner meanwhile.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(45);

static APP: OnceLock<AppHandle> = OnceLock::new();
static LISTENING: AtomicBool = AtomicBool::new(false);
static ENABLED: AtomicBool = AtomicBool::new(false);
static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static CODE: Mutex<String> = Mutex::new(String::new());
static LAST_SEEN: Mutex<Option<(String, u64)>> = Mutex::new(None);

fn pending() -> &'static Mutex<HashMap<u64, mpsc::Sender<String>>> {
    static PENDING: OnceLock<Mutex<HashMap<u64, mpsc::Sender<String>>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn err(message: impl Into<String>) -> CommandError {
    CommandError { message: message.into() }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TvServerInfo {
    enabled: bool,
    port: u16,
    ip: Option<String>,
    code: String,
    /// The last TV that used the server: its address and when (Unix ms).
    last_client: Option<String>,
    last_seen_ms: Option<u64>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// The address other devices on the network reach us at. A UDP "connect" sends nothing; it only
/// asks the OS which interface would route outward.
fn lan_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let ip = socket.local_addr().ok()?.ip();
    (!ip.is_loopback() && !ip.is_unspecified()).then(|| ip.to_string())
}

fn info() -> TvServerInfo {
    let last = LAST_SEEN.lock().ok().and_then(|last| last.clone());
    TvServerInfo {
        enabled: ENABLED.load(Ordering::SeqCst),
        port: TV_PORT,
        ip: lan_ip(),
        code: CODE.lock().map(|code| code.clone()).unwrap_or_default(),
        last_client: last.as_ref().map(|(client, _)| client.clone()),
        last_seen_ms: last.map(|(_, at)| at),
    }
}

fn new_code() -> String {
    use rand::Rng;
    format!("{:06}", rand::thread_rng().gen_range(0..1_000_000))
}

fn is_valid_code(code: &str) -> bool {
    code.len() == 6 && code.bytes().all(|b| b.is_ascii_digit())
}

/// Starts (or re-enables) the server. `code` is the one saved from a previous run, so a paired
/// TV keeps working after a restart; a missing or malformed one gets a fresh code.
#[tauri::command]
pub fn tv_server_start(app: AppHandle, code: Option<String>) -> Result<TvServerInfo, CommandError> {
    let _ = APP.set(app);
    {
        let mut current = CODE.lock().map_err(|_| err("tv code lock poisoned"))?;
        match code.filter(|code| is_valid_code(code)) {
            Some(code) => *current = code,
            None if current.is_empty() => *current = new_code(),
            None => {}
        }
    }
    if !LISTENING.load(Ordering::SeqCst) {
        let listener = TcpListener::bind(("0.0.0.0", TV_PORT))
            .map_err(|error| err(format!("No se pudo abrir el puerto {TV_PORT}: {error}")))?;
        LISTENING.store(true, Ordering::SeqCst);
        thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                thread::spawn(move || handle(stream));
            }
        });
    }
    ENABLED.store(true, Ordering::SeqCst);
    Ok(info())
}

/// Stops answering. The socket stays bound (std has no clean way to interrupt `accept`), but
/// every request is refused until the server is enabled again.
#[tauri::command]
pub fn tv_server_stop() -> TvServerInfo {
    ENABLED.store(false, Ordering::SeqCst);
    info()
}

#[tauri::command]
pub fn tv_server_info() -> TvServerInfo {
    info()
}

#[tauri::command]
pub fn tv_server_new_code() -> Result<TvServerInfo, CommandError> {
    *CODE.lock().map_err(|_| err("tv code lock poisoned"))? = new_code();
    Ok(info())
}

/// The frontend's answer to a `tv-request`: a JSON document, passed through to the TV as is.
#[tauri::command]
pub fn tv_respond(id: u64, body: String) {
    if let Some(sender) = pending().lock().ok().and_then(|mut pending| pending.remove(&id)) {
        let _ = sender.send(body);
    }
}

struct Request {
    method: String,
    path: String,
    query: HashMap<String, String>,
    headers: HashMap<String, String>,
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
                match hex.and_then(|hex| u8::from_str_radix(hex, 16).ok()) {
                    Some(byte) => {
                        out.push(byte);
                        i += 2;
                    }
                    None => out.push(b'%'),
                }
            }
            byte => out.push(byte),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_request(head: &str) -> Option<Request> {
    let mut lines = head.split("\r\n");
    let mut parts = lines.next()?.split_whitespace();
    let method = parts.next()?.to_string();
    let target = parts.next()?;
    let (path, raw_query) = target.split_once('?').unwrap_or((target, ""));
    let query = raw_query
        .split('&')
        .filter(|pair| !pair.is_empty())
        .map(|pair| {
            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
            (percent_decode(key), percent_decode(value))
        })
        .collect();
    let headers = lines
        .take_while(|line| !line.is_empty())
        .filter_map(|line| line.split_once(':'))
        .map(|(key, value)| (key.trim().to_ascii_lowercase(), value.trim().to_string()))
        .collect();
    Some(Request { method, path: percent_decode(path), query, headers })
}

fn respond(stream: &mut TcpStream, status: &str, content_type: &str, body: &[u8]) {
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: X-Zuno-Code, Content-Type\r\n\
         Access-Control-Allow-Methods: GET, OPTIONS\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body);
}

fn json_error(stream: &mut TcpStream, status: &str, message: &str) {
    let body = serde_json::json!({ "ok": false, "error": message }).to_string();
    respond(stream, status, "application/json; charset=utf-8", body.as_bytes());
}

fn handle(mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    // Peek, not read: an /audio request is handed whole to the media server's own handler.
    let mut buffer = [0_u8; 8192];
    let Ok(len) = stream.peek(&mut buffer) else { return };
    let head = String::from_utf8_lossy(&buffer[..len]).into_owned();
    let Some(request) = parse_request(&head) else { return };

    if request.method == "OPTIONS" {
        let mut sink = [0_u8; 8192];
        let _ = stream.read(&mut sink);
        return respond(&mut stream, "204 No Content", "text/plain", b"");
    }

    if request.path.starts_with("/audio/") {
        if !ENABLED.load(Ordering::SeqCst) || !authorized(&request) {
            let mut sink = [0_u8; 8192];
            let _ = stream.read(&mut sink);
            return respond(&mut stream, "401 Unauthorized", "text/plain", b"");
        }
        let Ok(server) = crate::media_server() else {
            return respond(&mut stream, "503 Service Unavailable", "text/plain", b"");
        };
        let _ = stream.set_read_timeout(None);
        return crate::handle_media_request(stream, server.items.clone());
    }

    // Everything else is a small GET: consume it before answering.
    let mut sink = [0_u8; 8192];
    let _ = stream.read(&mut sink);

    if !ENABLED.load(Ordering::SeqCst) {
        return json_error(&mut stream, "503 Service Unavailable", "disabled");
    }
    match request.path.as_str() {
        "/tv/ping" => {
            let name = std::env::var("COMPUTERNAME")
                .or_else(|_| std::env::var("HOSTNAME"))
                .unwrap_or_else(|_| "Zuno".into());
            let body = serde_json::json!({
                "ok": true,
                "data": { "app": "zuno", "name": name, "version": env!("CARGO_PKG_VERSION") }
            })
            .to_string();
            respond(&mut stream, "200 OK", "application/json; charset=utf-8", body.as_bytes());
        }
        "/tv/api" => {
            if !authorized(&request) {
                return json_error(&mut stream, "401 Unauthorized", "bad-code");
            }
            if let Ok(peer) = stream.peer_addr() {
                if let Ok(mut last) = LAST_SEEN.lock() {
                    *last = Some((peer.ip().to_string(), now_ms()));
                }
            }
            let method = request.query.get("m").cloned().unwrap_or_default();
            let args = request.query.get("a").cloned().unwrap_or_else(|| "[]".into());
            match forward(&method, &args) {
                Ok(body) => respond(&mut stream, "200 OK", "application/json; charset=utf-8", body.as_bytes()),
                Err(message) => json_error(&mut stream, "504 Gateway Timeout", &message),
            }
        }
        _ => json_error(&mut stream, "404 Not Found", "not-found"),
    }
}

fn authorized(request: &Request) -> bool {
    let Ok(code) = CODE.lock() else { return false };
    let given = request
        .headers
        .get("x-zuno-code")
        .or_else(|| request.query.get("k"))
        .map(String::as_str)
        .unwrap_or_default();
    !code.is_empty() && given == code.as_str()
}

fn forward(method: &str, args: &str) -> Result<String, String> {
    let app = APP.get().ok_or("not-ready")?;
    let args: serde_json::Value = serde_json::from_str(args).map_err(|_| "bad-args".to_string())?;
    let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
    let (sender, receiver) = mpsc::channel();
    pending().lock().map_err(|_| "lock".to_string())?.insert(id, sender);
    let started = Instant::now();
    app.emit("tv-request", serde_json::json!({ "id": id, "method": method, "args": args }))
        .map_err(|error| error.to_string())?;
    let result = receiver.recv_timeout(REQUEST_TIMEOUT);
    if let Ok(mut pending) = pending().lock() {
        pending.remove(&id);
    }
    result.map_err(|_| format!("timeout after {} ms", started.elapsed().as_millis()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_query_and_headers() {
        let request = parse_request(
            "GET /tv/api?m=search&a=%5B%22daft%20punk%22%5D&k=123456 HTTP/1.1\r\nX-Zuno-Code: 999999\r\n\r\n",
        )
        .unwrap();
        assert_eq!(request.path, "/tv/api");
        assert_eq!(request.query.get("m").unwrap(), "search");
        assert_eq!(request.query.get("a").unwrap(), "[\"daft punk\"]");
        assert_eq!(request.headers.get("x-zuno-code").unwrap(), "999999");
    }

    #[test]
    fn percent_decode_handles_plus_and_bad_escapes() {
        assert_eq!(percent_decode("a+b%21"), "a b!");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
    }

    #[test]
    fn codes_are_six_digits() {
        for _ in 0..50 {
            assert!(is_valid_code(&new_code()));
        }
        assert!(!is_valid_code("12345"));
        assert!(!is_valid_code("12a456"));
    }
}
