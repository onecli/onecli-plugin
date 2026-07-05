---
name: onecli-providers
description: >-
  Reference of services supported by OneCLI Gateway, including endpoints,
  authentication patterns, and connection behavior. Use when planning or making
  calls to a specific service through OneCLI.
metadata:
  priority: 5
---

# Supported Providers

## Google Suite

| Service | Endpoint | Notes |
| --- | --- | --- |
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

## GitHub

| Service | Endpoint | Notes |
| --- | --- | --- |
| GitHub API | `api.github.com` | REST API |
| GitHub Git | `github.com` | Git HTTPS operations |
| GitHub Raw | `raw.githubusercontent.com` | Raw file access |

## Atlassian

| Service | Endpoint | Notes |
| --- | --- | --- |
| Jira | `api.atlassian.com/ex/jira/*` | Jira Cloud REST API |
| Confluence | `api.atlassian.com/ex/confluence/*` | Confluence Cloud REST API |

## AWS

| Service | Endpoint | Notes |
| --- | --- | --- |
| All AWS Services | `*.amazonaws.com`, `*.api.aws` | SigV4 request signing |
| AWS AssumeRole | Same endpoints | STS AssumeRole for temporary credentials |

Pass AWS region with the `x-onecli-aws-region` header when needed.

## API Key Services

| Service | Endpoint | Notes |
| --- | --- | --- |
| Todoist | `api.todoist.com` | OAuth plus API key |
| Resend | `api.resend.com` | API key |
| Cloudflare | `api.cloudflare.com` | API key |
| Notion | `api.notion.com` | OAuth plus API key |

## Cloud-Only Services

These require OneCLI Cloud.

| Service | Endpoint | Notes |
| --- | --- | --- |
| Datadog | Regional endpoints | DD API and application key injection |
| Outlook Mail | `graph.microsoft.com/v1.0/me/messages` | Microsoft Graph |
| Outlook Calendar | `graph.microsoft.com/v1.0/me/calendar` | Microsoft Graph |
| Microsoft Word | `graph.microsoft.com/v1.0/me/drive` | Microsoft Graph through OneDrive or SharePoint |

## Custom Services

Users can add custom secrets in the OneCLI dashboard. The gateway injects the
configured headers or query parameters for matching host patterns.
