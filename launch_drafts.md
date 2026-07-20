# De-Viber Launch Posts Drafts

Here are the drafted launch announcements for human review before publishing.

---

## 1. Reddit: r/lovable and r/bolt

**Title**: I built a free CLI tool to scan your Lovable/Bolt exported projects for lock-in and security issues (IDORs, hardcoded keys) before you scale

**Post Body**:

Hey everyone,

I’ve been building a few projects on Lovable and Bolt.new recently, and I love the speed of exporting the code to a standard GitHub repository. However, when taking these codebases and setting them up on standard hosts (like Vercel/Railway) and production databases, I noticed there are a few hurdles:
1. **Platform Lock-In**: Some exports contain config paths (like `.bolt/`) or platform-specific packages that don't do anything or fail outside the builder's local preview runtime.
2. **Security Gaps**: Because the builder builds fast, it can commit hardcoded Supabase keys, write client-side admin checks without server-side validation, or perform database queries that lack user ownership checks (IDORs).

To help audits, I built **De-Viber**—a local-first, offline CLI scanner that detects lock-in patterns and security exposure in under 5 seconds.

You can run it directly against your exported folder via `npx`:

```bash
npx deviber-cli analyse ./your-project --offline
```

### What it caught on my own project
On my Supabase-backed project, it flagged a critical security issue in my experiences list deletion:
```
Query on table "experiences" filters by ID but may not verify resource ownership (IDOR)
File: src/pages/Experiences.tsx:55
Evidence: const { error } = await supabase.from('experiences').delete().eq('id', id);
```
It was deleting directly by `id` without checking if `user_id === auth.uid()`. Unless my database RLS was strictly configured, any authenticated user could delete other users' records.

### What it does NOT do (No drama, just utility)
* It works **100% offline** and locally—it never contacts Lovable, Bolt, or any external AI servers.
* It does not migrate database contents or users (you still need to export live Supabase records manually before closing your platform project).
* It uses pattern-matching heuristics, meaning it can hit false positives and doesn't replace manual security reviews.

If you’ve exported a project, try running the scan and let me know if it flags any false positives or missed rules. I want to tune the heuristics to make this a reliable transition layer.

* **GitHub Pages**: https://Nithin1138.github.io/De-Viber
* **GitHub Repo**: https://github.com/Nithin1138/De-Viber
* **NPM**: https://www.npmjs.com/package/deviber-cli

---

## 2. Indie Hackers

**Title**: How I audit my AI-generated Lovable/Bolt code exports for lock-in and security

**Post Body**:

Hey IH community,

I think AI code builders (like Lovable.dev and Bolt.new) are changing how we build MVPs. But once you export the generated code to host it on Vercel or deploy it to a production database, you start running into small, silent friction points.

I hit this problem on my own projects: AI developers are great at assembling React/Vite/Supabase templates, but they often leave proprietary config files in the export, commit hardcoded Supabase service-role keys, or write database queries that are blind to user ownership (potential IDORs).

To bridge this audit gap, I built **De-Viber**—an open-source, local-first CLI scanner to analyze exported code for portability score and security readiness.

You can run a scan on your codebase in seconds:
```bash
npx deviber-cli analyse ./your-project --offline
```

### Keeping it Honest & Simple
I wanted this tool to be completely transparent:
* **No network calls**: It runs entirely locally on your machine. Your code and secrets stay yours.
* **No silver bullet**: Heuristics are not formal verification. It points you to areas to review; it doesn't solve them for you.
* **No DB migration**: Exiting platform clouds still requires you to export your data tables manually.

I just published the package to npm and set up the repo. I’m looking for early feedback—especially if you run it and hit false positives on your React/Supabase codebases so I can refine the rules!

* **Landing page**: https://Nithin1138.github.io/De-Viber
* **GitHub Repo**: https://github.com/Nithin1138/De-Viber

---

## 3. X/Twitter

**Post**:

Exported your app from Lovable or Bolt? Run a quick audit before you launch or host it on Vercel:

npx deviber-cli analyse ./your-project --offline

It scans locally for vendor lock-in dependencies and critical security gaps (like hardcoded keys or IDOR queries). 

No remote API calls, 100% open source.

🔗 Repo: https://github.com/Nithin1138/De-Viber
🔗 NPM: https://www.npmjs.com/package/deviber-cli
