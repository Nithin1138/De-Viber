---
name: False Positive / Wrong Finding Report
about: Report a rule triggering on code that is actually safe or portable
title: 'False Positive: [Rule ID] on [File Name]'
labels: bug, heuristic-tuning
assignees: ''
---

**Which rule triggered incorrectly?**
(e.g., `SEC_POSSIBLE_IDOR_001`, `LOVABLE_CLOUD_DATA_RISK_001`)

**What was the flagged file and code line?**
Please paste the file path and line content:
```
File: src/pages/MyComponent.tsx:42
Code: const { error } = await supabase.from('items').select().eq('id', id);
```

**Why is this a false positive?**
(e.g., "The user ownership check happens in an earlier middleware," or "Row Level Security (RLS) policies are active and verified at the database level for this exact query.")

**Proposed solution or regex adjustment (Optional)**
If you have suggestions on how to improve the heuristic match to prevent this false positive:
(e.g., "Ignore if `user_id` query is present, or check for specific auth checks.")
