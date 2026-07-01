# Attribution

The notch window/geometry/shape/interaction approach in this helper is adapted
from **pi-island** by Julien Wintz — https://github.com/jwintz/pi-island
(MIT License, Copyright (c) 2026 Julien Wintz).

Adapted files: `NotchShape.swift`, `Screen.swift`, `EventMonitors.swift`, and
the state-machine / window structure in `NotchModel.swift` + `main.swift`. The
pi RPC / session-manager / usage-monitor layers are not used; this helper is
driven by Peach Pi's own `state`/`finish` NDJSON frames over stdin.
