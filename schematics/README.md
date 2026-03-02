# Schematics Index

UNIVERSAL RULE: If you change any high-level component, process, or schema in the schematics docs, update the relevant file in the same PR/commit.

Purpose
- Single entry point for architecture, workflows, and component maps.
- All file paths in these docs are repo-root relative unless explicitly noted.

Docs
- [SYSTEM_SCHEMATIC.md](SYSTEM_SCHEMATIC.md): High-level architecture, workflows, payloads, and task-to-area index.
- [DATAFLOWS.md](DATAFLOWS.md): End-to-end data flows with Mermaid diagrams and data contracts.
- [GRANULAR-COMPONENTS.md](GRANULAR-COMPONENTS.md): Per-component appendix and index.
- [LEGEND.md](LEGEND.md): which doc to open based on task intent.
- [INVENTORY_ROOT.md](INVENTORY_ROOT.md): root-level files and directories.
- [INVENTORY_SRC.md](INVENTORY_SRC.md): frontend source inventory.
- [INVENTORY_EDB.md](INVENTORY_EDB.md): EDB repo inventory.
- [SUBSYSTEM_WEB3_TOOLKIT.md](SUBSYSTEM_WEB3_TOOLKIT.md): frontend subsystem details.
- [SUBSYSTEM_BRIDGE.md](SUBSYSTEM_BRIDGE.md): simulator bridge and debug sessions.
- [SUBSYSTEM_EDB.md](SUBSYSTEM_EDB.md): EDB subsystem summary.
- [hexkit-app-architecture.excalidraw](hexkit-app-architecture.excalidraw): HexKit frontend 6-layer architecture diagram (UI Shell, Pages, State, Services, Utilities, External).

How to navigate
- Start with SYSTEM_SCHEMATIC for the overview and task-to-area index.
- Use DATAFLOWS for simulation, replay, debug, resolver, and decoder flow diagrams.
- Use GRANULAR-COMPONENTS when you need to zoom into specific UI modules.
- Use INVENTORY_* files to find exact file locations.

When adding docs
- Add new schematics under `schematics/`.
- Link them here with a one-line purpose.
- Include the UNIVERSAL RULE at the top of each file.
