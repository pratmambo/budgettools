---
name: Local testing before deploy
description: User wants all changes tested locally before deploying to Netlify — each deploy costs 15 credits
type: feedback
---

Always test changes locally before deploying to Netlify. Each deploy costs 15 credits and the user's credits ran out.

**Why:** Netlify deploy costs 15 credits per deploy, and credits are limited/expensive. The user got burned by deploying too frequently.

**How to apply:** Use `npx netlify dev` for local testing. Only suggest deploying once all changes are verified locally. Batch changes into a single deploy.
