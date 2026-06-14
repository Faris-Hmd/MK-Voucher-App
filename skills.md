# Developer Guidelines & Skills

- **Command Execution Rule**: Do NOT run or propose terminal commands automatically on your own without explicit user request or approval. Never set `SafeToAutoRun: true` on commands unless explicitly authorized by the user.

- **UI**: 
  use the ui of the app provided in MK-voucher-V0 folder and make it better.
- **Design Pattern - Midnight Glassmorphism**:
  - **Color Palette**: Deep dark navy backdrop (`#0d1527` / `#0a0f1d`) combined with transparent card overlays (`colors.cardBg`), subtle accents (`colors.secondary`), and thin card outlines (`colors.glassBorder`).
  - **Typography**: Always use **Plus Jakarta Sans** as the default typeface for a modern geometric look, paired with monospace fonts for codes and numerical statistics.
  - **Input Layouts**: Align configuration inputs (like Quantity and Length) side-by-side inside a single card container with matching heights (`42px`) to optimize screen space and aesthetics.
  - **Status Indicators**: Use clean rounded status pill badges (e.g., green for online, gray for offline) and icon boxes rather than raw text labels.
