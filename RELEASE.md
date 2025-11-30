# Release Guide

This document explains how to publish a new version of `@softwarity/tac-editor` to npm using GitHub Actions.

## Prerequisites

### 1. NPM Token

Create an npm access token and add it to GitHub Secrets:

1. Go to https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Click "Generate New Token" → "Classic Token"
3. Select "Automation" type
4. Copy the token
5. Add it to GitHub repository secrets:
   - Go to your repo → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: paste your npm token

### 2. Personal Access Token (PAT)

Create a GitHub Personal Access Token for the release workflow:

1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a descriptive name (e.g., "tac-editor-release")
4. Set expiration as needed
5. Select scopes:
   - `repo` (full control of private repositories)
   - `workflow` (update GitHub Actions workflows)
6. Copy the token
7. Add it to GitHub repository secrets:
   - Name: `PAT_TOKEN`
   - Value: paste your GitHub PAT

### 3. Codecov Token (Optional)

For code coverage reporting:

1. Go to https://codecov.io and connect your repository
2. Get the upload token
3. Add it to GitHub repository secrets:
   - Name: `CODECOV_TOKEN`
   - Value: paste your Codecov token

## GitHub Actions Workflows

This project uses 4 automated workflows:

### 1. **main.yml** - Continuous Build & Test

- **Trigger**: Every push to any branch
- **Purpose**: Validates that the code builds and tests pass
- **Actions**:
  - Checkout code
  - Install dependencies
  - Run tests with coverage
  - Build package
  - Upload coverage to Codecov

### 2. **release.yml** - Create Tag/Release

- **Trigger**: Manual (workflow_dispatch)
- **Purpose**: Bump version and create git tag
- **Actions**:
  - Increment patch version (`npm version patch`)
  - Commit the version change
  - Push changes and tags
  - Triggers `tag.yml` automatically

### 3. **tag.yml** - Publish to npm

- **Trigger**: When a git tag is pushed
- **Purpose**: Publish package to npm registry
- **Actions**:
  - Build the package
  - Publish to npm

### 4. **deploy-demo.yml** - Deploy Demo to GitHub Pages

- **Trigger**: Push to main branch
- **Purpose**: Deploy demo page for public access
- **Actions**:
  - Build the package
  - Prepare demo for GitHub Pages
  - Deploy to GitHub Pages

## Release Process

### Automatic Release (Recommended)

The easiest way to release is using the GitHub Actions UI:

1. Go to your repository on GitHub
2. Click on "Actions" tab
3. Select "Create Tag/Release" workflow from the left sidebar
4. Click "Run workflow" button
5. Select the branch (usually `main`)
6. Click "Run workflow"

This will:
- Automatically bump the patch version (e.g., 1.0.0 → 1.0.1)
- Create a git tag
- Trigger the publish workflow
- Publish to npm

### Manual Release (Advanced)

If you need to bump a specific version type or want manual control:

```bash
# 1. Checkout main branch
git checkout main
git pull origin main

# 2. Bump version (choose one)
npm version patch  # 1.0.0 → 1.0.1 (bug fixes)
npm version minor  # 1.0.0 → 1.1.0 (new features)
npm version major  # 1.0.0 → 2.0.0 (breaking changes)

# 3. Push changes and tags
git push origin main --follow-tags
```

## Verifying Release

After a release:

1. Check npm: https://www.npmjs.com/package/@softwarity/tac-editor
2. Check GitHub releases: https://github.com/softwarity/tac-editor/releases
3. Check demo: https://softwarity.github.io/tac-editor/
4. Test CDN:
   ```html
   <script type="module" src="https://unpkg.com/@softwarity/tac-editor"></script>
   ```

## Troubleshooting

### npm publish fails

- Verify `NPM_TOKEN` secret is set correctly
- Check npm token hasn't expired
- Ensure you have publish rights to the package

### Tag workflow not triggered

- Verify `PAT_TOKEN` has `workflow` scope
- Check that release.yml uses `token: ${{ secrets.PAT_TOKEN }}`

### Demo not updating

- Check GitHub Pages is enabled in repository settings
- Verify deploy-demo.yml completed successfully
