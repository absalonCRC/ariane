#!/usr/bin/env python3
"""Launch the opt-in Tauri/WKWebView harness in fresh, isolated data.
No personal session is opened. Leaves its window available for UI verification.
"""
import argparse, json, subprocess, time
from pathlib import Path

def processes():
    rows = subprocess.check_output(['ps','-axo','pid=,ppid=,rss=,time=,stat=,comm='], text=True)
    result = {}
    for line in rows.splitlines():
        parts = line.strip().split(None, 5)
        if len(parts) != 6: continue
        pid, parent, rss, cpu, state, command = parts
        seconds = 0.
        for part in cpu.split(':'): seconds = seconds * 60 + float(part)
        result[int(pid)] = dict(pid=int(pid),parent=int(parent),rssKiB=int(rss),cpuSeconds=seconds,state=state,command=command)
    return result

parser=argparse.ArgumentParser()
parser.add_argument('app',type=Path)
parser.add_argument('directory',type=Path)
parser.add_argument('--idle-seconds',type=int,default=0)
parser.add_argument('--memory',action='store_true')
parser.add_argument('--large',action='store_true')
parser.add_argument('--entities',action='store_true')
parser.add_argument('--observe-only',action='store_true',help='Prepare and sample; launch the bundle separately through the app UI')
args=parser.parse_args()
app=args.app.resolve(); directory=args.directory.resolve()
directory.mkdir(parents=True,exist_ok=False)
(directory/'.ariane-performance').touch()
if args.memory:
    (directory/'.memory-benchmark').touch()
if args.large: (directory/'.large-manuscript').touch()
if args.entities:
    installed=Path.home()/'Library/Application Support/fr.ariane.writer/memory'
    (directory/'memory').symlink_to(installed, target_is_directory=True)
initial=processes(); initial_web={pid for pid,p in initial.items() if 'WebKit.WebContent' in p['command']}
if not args.observe_only:
    subprocess.run(['/usr/bin/open','-n',str(app),'--env',f'ARIANE_PERF_DIR={directory}'],check=True)
else: print(f'Ready for UI launch: {app}',flush=True)
started=time.monotonic(); samples=[]; report_seen=None; root_pid=None
while time.monotonic()-started<360:
    current=processes()
    if root_pid is None:
        root_pid=next((pid for pid,p in current.items() if p['command']==str(app/'Contents/MacOS/ariane')),None)
    owned={root_pid} if root_pid else set()
    for _ in range(5): owned|={pid for pid,p in current.items() if p['parent'] in owned}
    # XPC WebContent processes are parented to launchd. Record the attribution
    # candidates explicitly; the operator verifies disappearance after closing.
    web={pid for pid,p in current.items() if 'WebKit.WebContent' in p['command'] and pid not in initial_web}
    pressure=int(subprocess.check_output(['sysctl','-n','kern.memorystatus_vm_pressure_level'],text=True))
    sample={'elapsedSeconds':round(time.monotonic()-started,2),'rootPid':root_pid,'memoryPressure':pressure,
            'owned':[current[p] for p in owned if p in current],
            'newWebContentCandidates':[current[p] for p in web]}
    samples.append(sample)
    (directory/'process-samples.json').write_text(json.dumps(samples,indent=2))
    if (directory/'report.json').exists():
        if report_seen is None:
            report_seen=time.monotonic()
            print((directory/'report.json').read_text(),flush=True)
        if time.monotonic()-report_seen>=args.idle_seconds: break
    time.sleep(2)
else:
    raise SystemExit('Native benchmark timed out; inspect the isolated window and report directory.')
print(f'Evidence: {directory}',flush=True)
