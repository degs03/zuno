/*!
 * Per-process memory for the app's own process tree.
 *
 * The frontend's `memory.sample` reads `performance.memory` and the DOM, so it only ever sees
 * the renderer — and the renderer is not where this app's memory is. A WebView2 app is a tree:
 * a browser process, a GPU process, a renderer per window, and utility processes. Measuring one
 * of them and reporting "flat" is how a climbing number stayed invisible.
 *
 * Commit (`PrivateUsage`) is reported alongside working set because they answer different
 * questions. Working set is how much physical RAM the OS currently lets a process keep, so it
 * drops when anything trims it and says nothing about what the process is holding. Commit is
 * what the process has actually asked for and does not move when pages are evicted.
 */

use serde::Serialize;

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMemory {
    pub pid: u32,
    pub name: String,
    pub working_set_mb: f64,
    pub commit_mb: f64,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryReport {
    pub total_working_set_mb: f64,
    pub total_commit_mb: f64,
    /// Every process in the tree, largest commit first — the first entry is the one to look at.
    pub processes: Vec<ProcessMemory>,
}

fn round(bytes: usize) -> f64 {
    (bytes as f64 / (1024.0 * 1024.0) * 10.0).round() / 10.0
}

#[cfg(target_os = "windows")]
fn collect() -> MemoryReport {
    use std::collections::HashMap;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::ProcessStatus::{
        GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_VM_READ,
    };

    let mut report = MemoryReport::default();
    let own_pid = std::process::id();

    // One snapshot, then the tree is walked in memory: the set of children is not known up
    // front, and re-snapshotting per generation would race process exits.
    let snapshot = match unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) } {
        Ok(handle) => handle,
        Err(_) => return report,
    };

    let mut children: HashMap<u32, Vec<(u32, String)>> = HashMap::new();
    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };

    if unsafe { Process32FirstW(snapshot, &mut entry) }.is_ok() {
        loop {
            let name = String::from_utf16_lossy(&entry.szExeFile)
                .trim_end_matches('\0')
                .to_string();
            children
                .entry(entry.th32ParentProcessID)
                .or_default()
                .push((entry.th32ProcessID, name));
            if unsafe { Process32NextW(snapshot, &mut entry) }.is_err() {
                break;
            }
        }
    }
    let _ = unsafe { CloseHandle(snapshot) };

    // Breadth-first from our own pid, so utility processes nested under the browser process are
    // counted rather than only the direct children.
    let mut queue = vec![(own_pid, "zuno.exe".to_string())];
    let mut seen = std::collections::HashSet::new();

    while let Some((pid, name)) = queue.pop() {
        if !seen.insert(pid) {
            continue;
        }
        if let Some(kids) = children.get(&pid) {
            queue.extend(kids.iter().cloned());
        }

        let handle = unsafe {
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ,
                false,
                pid,
            )
        };
        let Ok(handle) = handle else { continue };

        let mut counters = PROCESS_MEMORY_COUNTERS_EX::default();
        let ok = unsafe {
            GetProcessMemoryInfo(
                handle,
                &mut counters as *mut _ as *mut PROCESS_MEMORY_COUNTERS,
                std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32,
            )
        }
        .is_ok();
        let _ = unsafe { CloseHandle(handle) };
        if !ok {
            continue;
        }

        report.processes.push(ProcessMemory {
            pid,
            name,
            working_set_mb: round(counters.WorkingSetSize),
            commit_mb: round(counters.PrivateUsage),
        });
    }

    report.processes.sort_by(|left, right| {
        right
            .commit_mb
            .partial_cmp(&left.commit_mb)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    report.total_working_set_mb =
        (report.processes.iter().map(|p| p.working_set_mb).sum::<f64>() * 10.0).round() / 10.0;
    report.total_commit_mb =
        (report.processes.iter().map(|p| p.commit_mb).sum::<f64>() * 10.0).round() / 10.0;
    report
}

/*
 * ponytail: nothing on macOS yet (`proc_pid_rusage`). Add it when there is a number there worth
 * chasing.
 */
/**
 * Linux and Android: the app's own process from `/proc/self/status`.
 *
 * `VmRSS` stands in for the working set and `RssAnon` (anonymous resident pages: heaps, the
 * decoder, buffers) for commit. On Android the WebView renderer is a separate sandboxed process
 * this cannot see, so the frontend's own heap numbers remain the renderer's half of the picture.
 */
#[cfg(any(target_os = "linux", target_os = "android"))]
fn collect() -> MemoryReport {
    let Ok(status) = std::fs::read_to_string("/proc/self/status") else {
        return MemoryReport::default();
    };
    // Lines look like `VmRSS:     123456 kB`.
    let field = |name: &str| -> usize {
        status
            .lines()
            .find_map(|line| line.strip_prefix(name))
            .and_then(|rest| rest.split_whitespace().next())
            .and_then(|kb| kb.parse::<usize>().ok())
            .map_or(0, |kb| kb * 1024)
    };
    let process = ProcessMemory {
        pid: std::process::id(),
        name: "app".to_string(),
        working_set_mb: round(field("VmRSS:")),
        commit_mb: round(field("RssAnon:")),
    };
    MemoryReport {
        total_working_set_mb: process.working_set_mb,
        total_commit_mb: process.commit_mb,
        processes: vec![process],
    }
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "android")))]
fn collect() -> MemoryReport {
    MemoryReport::default()
}

#[tauri::command(async)]
pub fn app_memory_report() -> MemoryReport {
    collect()
}
