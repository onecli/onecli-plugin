---
name: onecli-providers
description: >-
  Reference of all services supported by OneCLI gateway with their endpoints,
  auth patterns, and connection methods. Use when you need to know which APIs
  are available or how to call a specific service.
metadata:
  priority: 5
  promptSignals:
    phrases:
      - "which services"
      - "supported APIs"
      - "what can I connect"
      - "available integrations"
    minScore: 6
---

# Supported Providers

## Google Suite (OAuth)

| Service | Endpoint | Notes |
|---------|----------|-------|
| Gmail | `gmail.googleapis.com` | Also `www.googleapis.com/gmail/*` |
| Google Calendar | `www.googleapis.com/calendar/*` | Primary calendar endpoints |
| Google Drive | `www.googleapis.com/drive/*` | File listing, upload, download |
| Google Docs | `docs.googleapis.com` | Document read/write |
| Google Sheets | `sheets.googleapis.com` | Spreadsheet operations |
| Google Slides | `slides.googleapis.com` | Presentation operations |
| Google Tasks | `tasks.googleapis.com` | Task management |
| Google Forms | `forms.googleapis.com` | Form operations |
| Google Classroom | `classroom.googleapis.com` | Classroom management |
| Google Admin | `admin.googleapis.com` | Admin directory operations |
| Google Analytics | `analyticsdata.googleapis.com` | Analytics data |
| Google Search Console | `searchconsole.googleapis.com` | Search performance |
| Google Meet | `meet.googleapis.com` | Meeting management |
| Google Photos | `photoslibrary.googleapis.com` | Photo library access |
| YouTube | `www.googleapis.com/youtube/*` | YouTube Data API |

## GitHub (OAuth)

| Service | Endpoint | Notes |
|---------|----------|-------|
| GitHub API | `api.github.com` | REST API (Bearer token) |
| GitHub Git | `github.com` | Git HTTPS operations (Basic auth) |
| GitHub Raw | `raw.githubusercontent.com` | Raw file access |

## Atlassian (OAuth)

| Service | Endpoint | Notes |
|---------|----------|-------|
| Jira | `api.atlassian.com/ex/jira/*` | Jira Cloud REST API |
| Confluence | `api.atlassian.com/ex/confluence/*` | Confluence Cloud REST API |

## AWS (Credentials + SigV4)

| Service | Endpoint | Notes |
|---------|----------|-------|
| All AWS Services | `*.amazonaws.com`, `*.api.aws` | SigV4 request signing |
| AWS AssumeRole | Same endpoints | STS AssumeRole for temporary credentials |

Pass AWS region via `x-onecli-aws-region` header if needed.

## API Key Services

| Service | Endpoint | Notes |
|---------|----------|-------|
| Todoist | `api.todoist.com` | OAuth + API key |
| Resend | `api.resend.com` | API key (Bearer) |
| Cloudflare | `api.cloudflare.com` | API key (Bearer) |
| Notion | `api.notion.com` | OAuth + API key |

## Cloud-Only Services

These require OneCLI Cloud (not available in self-hosted OSS):

| Service | Endpoint | Notes |
|---------|----------|-------|
| Datadog | Regional endpoints (us1, us5, eu, gov) | DD-API-KEY + DD-APPLICATION-KEY headers |
| Outlook Mail | `graph.microsoft.com/v1.0/me/messages` | Microsoft Graph |
| Outlook Calendar | `graph.microsoft.com/v1.0/me/calendar` | Microsoft Graph |
| Microsoft Word | `graph.microsoft.com/v1.0/me/drive` | Microsoft Graph (OneDrive/SharePoint) |

## Custom Services

For any API not listed above, users can add custom secrets in the OneCLI
dashboard. The gateway will inject the configured headers or query parameters
for the specified host pattern.
