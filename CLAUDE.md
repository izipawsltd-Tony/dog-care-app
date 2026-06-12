# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Stack
- React + TypeScript + Vite
- Firebase Firestore (data storage)
- Vercel (hosting + serverless API functions)
- EmailJS (email notifications)
- Anthropic API, accessed via the `/api/scan` proxy (`api/scan.js`)
- AWS Textract for OCR on scanned documents

## Git Workflow
- Use `git pp` to commit and push.

## Build
- Always run `npm run build` before committing.

## Date Format
- Always use DD-MM-YYYY.

## Key Files
- `src/DogProfile.tsx`
- `src/DocScanner.tsx`
- `api/scan.js`

## Rules
- Never delete files without confirmation.
- Never commit API keys or secrets.
- Never modify Firebase config without confirmation.

## Permissions
- Auto-approve all file edits and shell commands, except:
  - Deleting files
  - Modifying environment variables
  - Payment-related actions
