# GitHub Repository Setup

## Recommended repository

- Name: `idurazi-studio`
- Visibility: **Private** initially
- Default branch: `main`
- Development branch: `develop`
- Require pull requests before merging to `main`
- Require CI status check named `test`
- Block force pushes and branch deletion on `main`
- Enable Issues; enable Discussions only when needed

## First upload

```bash
git init
git add .
git commit -m "chore: establish Architecture 3.0 repository baseline"
git branch -M main
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
git checkout -b develop
git push -u origin develop
```

Replace `@OWNER` in `.github/CODEOWNERS` with your GitHub username before pushing.
