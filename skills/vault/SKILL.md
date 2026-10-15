---
name: vault
description: >-
  Use when the user wants to set, change, or create their Obsidian vault, or says
  "vault", "set vault", "change vault", "create vault", or "new vault".
---

# Vault Management

Configure or create the Obsidian vault for this session.

## Create New Vault

If the user asks to create or initialize a new vault (e.g. `/vault create <path>` or "create vault at <path>"):
- Call `obsidian_create_vault` with `path` (and optional `register`, `set_as_current`)
- Confirm: "Vault created at: [path]"

## Set Existing Vault Path

### With Argument

If the user provides a path to an existing vault after `/vault`:
- Call `obsidian_set_vault` with the provided path (it must be an existing Obsidian vault containing a `.obsidian` folder)

### Without Argument

If no path is provided:
- Ask the user: "What is the absolute path to your Obsidian vault, or would you like to create a new one?"
- Once they respond:
  - If creating: call `obsidian_create_vault` with their path
  - If setting existing: call `obsidian_set_vault` with their path

## Confirmation

After setting, confirm: "Vault path set to: [path]"

