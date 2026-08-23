# OpenSpec Workflow & Change Management

## When to Use OpenSpec
OpenSpec should be engaged when a task involves:
- Proposing new features or architectural capabilities
- Breaking changes across APIs or database schemas
- Multi-step refactors spanning across frontend and backend

## OpenSpec Skills & Commands
- **Explore Ideas**: Use `openspec-explore` to clarify requirements and investigate tradeoffs before drafting specs.
- **Propose Change**: Use `openspec-propose` to generate proposals, delta specs, and task lists in `openspec/changes/<change-id>/`.
- **Apply Implementation**: Use `openspec-apply-change` to step through task checklists.
- **Sync Specs**: Use `openspec-sync-specs` to merge delta specs into `openspec/specs/`.
- **Archive Change**: Use `openspec-archive-change` after verification is completed.
