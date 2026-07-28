# PLAN.md: Emile CLI Redesign (Claude UX Patterns)

## Context
The user requested a redesign of the Emile CLI's UI/UX to match "Claude patterns" (Anthropic's Claude Code CLI). The current UI uses heavy box characters (┏━┓), which is contrary to Claude's sleek, minimalist, text-first approach. 

## 🧠 Brainstorm: CLI Redesign (Claude Style)

### Option A: Authentic "Claude Code" Clone (Recommended)
A completely flat, minimalist terminal UI exactly like Claude Code.
- ✅ **Pros:** Cleanest interface, maximum horizontal space for code, very modern.
- ❌ **Cons:** Removes the distinct "box" identity of Emile.
- 📊 **Effort:** Medium (Requires rewriting `ui.js` rendering logic completely to remove boxes).

### Option B: "Structured Clean" (Hybrid)
Retains a single vertical line or subtle horizontal dividers, but removes full boxes.
- ✅ **Pros:** Keeps some structure, easier to parse visually.
- ❌ **Cons:** Not a 100% Claude replica.
- 📊 **Effort:** Low (Just change `bTop`, `bBot` to simple lines).

### Option C: The Vercel/Stripe Dashboard TUI
Use block backgrounds for headers and dim text for secondary info, similar to modern web dev tools.
- ✅ **Pros:** Very premium and professional.
- ❌ **Cons:** Can be overwhelming, straying from the "Claude" specific look.
- 📊 **Effort:** High.

## 💡 Recommendation
**Option A** fits the user request perfectly. 

## Proposed Architecture (Phase 2)
To implement Option A:
1. **Refactor `src/ui.js`**:
   - Replace all `bTop()`, `bBot()`, `bRow()` with unboxed padding or subtle `pc.gray('│')`.
   - Update `printThinking()` to use dim text block instead of a boxed window.
   - Update `printStartupScreen()` to a minimal one-liner or very subtle ASCII art.
   - Update `promptInput()` to have a sleek prefix (e.g. `❯`) instead of borders.
   - Update Diff blocks to look like standard `git diff` colors (red/green) without outer borders.

2. **UX Improvements**:
   - Clean up the `printConversationHistory` to be a seamless scroll.
   - Ensure `printConfig` and `printSessionBar` use subtle inline stats instead of a top box.
