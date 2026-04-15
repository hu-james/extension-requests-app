# Accessibility Fixes — Extension Requests App

Actionable remediation plan based on a WCAG 2.0/2.1 Level A + AA audit.
Each issue includes the exact file, line(s), the problem, and a concrete code fix.

---

## Issue 1 — Page Title Is Not Descriptive (2.4.2 Page Titled, Level A)

**File:** `client/index.html`, line 7  
**Current code:**
```html
<title>Vite + React + TS</title>
```
**Problem:** The page title is the default Vite template string. Screen reader users hear this on page load.

**Fix — `client/index.html`:**
```html
<title>Assignment Extension Requests — Auto-Extend</title>
```

**Additionally**, update `document.title` dynamically in each view on mount so the title reflects the current context:

In `client/src/pages/StudentView.tsx`, add inside the component (before the return):
```tsx
useEffect(() => {
  document.title = 'Request Extension — Auto-Extend';
}, []);
```

In `client/src/pages/InstructorView.tsx`, add inside the component (before the return):
```tsx
useEffect(() => {
  document.title = 'Manage Extensions — Auto-Extend';
}, []);
```

---

## Issue 2 — InstructorView Skip Link Is Inside `#main-content` (2.4.1 Bypass Blocks, Level A)

**File:** `client/src/pages/InstructorView.tsx`, lines 185–189  
**Current code:**
```tsx
<div className="p-4" id="main-content">
  {/* Skip to main content link */}
  <a href="#main-content" className="skip-to-main">
    Skip to main content
  </a>
```
**Problem:** The skip link is a descendant of the element it points to (`#main-content`). Activating it scrolls to its own ancestor — it bypasses nothing. The `id` should be on a `<main>` landmark that comes *after* the skip link.

**Fix — restructure the InstructorView return:**
```tsx
return (
  <div className="p-4">
    {/* Skip to main content link */}
    <a href="#main-content" className="skip-to-main">
      Skip to main content
    </a>

    {/* Screen reader announcements */}
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {announcementMessage}
    </div>

    <main id="main-content">
      <h1 className="text-2xl font-bold mb-6">Manage Extension Requests</h1>
      {/* ... rest of the existing JSX ... */}
    </main>
  </div>
);
```
Remove `id="main-content"` from the outer `<div className="p-4">` and place it on the `<main>` element wrapping all content below the skip link.

---

## Issue 3 — Tab Component Missing Arrow Key Navigation (2.1.1 Keyboard, Level A)

**File:** `client/src/pages/InstructorView.tsx`, lines 242–281  
**Problem:** The WAI-ARIA Tabs pattern requires `ArrowLeft`/`ArrowRight` to move focus between tabs when focus is inside the tablist. Currently only `Tab` can navigate between tabs.

**Fix — replace the `<nav>` block with this implementation:**
```tsx
<div className="mb-6 border-b border-gray-200">
  <nav
    className="-mb-px flex space-x-8"
    role="tablist"
    aria-label="Extension management sections"
    onKeyDown={(e) => {
      const tabs = ['requests', 'settings'] as const;
      const currentIndex = tabs.indexOf(activeTab);
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = tabs[(currentIndex + 1) % tabs.length];
        setActiveTab(next);
        setAnnouncementMessage(`${next === 'requests' ? 'Extension Requests' : 'Policy Settings'} tab selected`);
        (document.getElementById(`${next}-tab`) as HTMLElement)?.focus();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = tabs[(currentIndex - 1 + tabs.length) % tabs.length];
        setActiveTab(prev);
        setAnnouncementMessage(`${prev === 'requests' ? 'Extension Requests' : 'Policy Settings'} tab selected`);
        (document.getElementById(`${prev}-tab`) as HTMLElement)?.focus();
      }
    }}
  >
    <button
      onClick={() => {
        setActiveTab('requests');
        setAnnouncementMessage('Extension Requests tab selected');
      }}
      role="tab"
      aria-selected={activeTab === 'requests'}
      aria-controls="requests-panel"
      id="requests-tab"
      tabIndex={activeTab === 'requests' ? 0 : -1}
      className={`py-2 px-1 border-b-2 font-medium text-sm ${
        activeTab === 'requests'
          ? 'border-blue-500 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      Extension Requests
    </button>
    <button
      onClick={() => {
        setActiveTab('settings');
        setAnnouncementMessage('Policy Settings tab selected');
      }}
      role="tab"
      aria-selected={activeTab === 'settings'}
      aria-controls="settings-panel"
      id="settings-tab"
      tabIndex={activeTab === 'settings' ? 0 : -1}
      className={`py-2 px-1 border-b-2 font-medium text-sm ${
        activeTab === 'settings'
          ? 'border-blue-500 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      Policy Settings
    </button>
  </nav>
</div>
```

---

## Issue 4 — `aria-controls` References Conditionally-Removed Tab Panels (4.1.2 Name, Role, Value, Level A)

**File:** `client/src/pages/InstructorView.tsx`, lines 284 and 416  
**Current code:**
```tsx
{activeTab === 'settings' && (
  <div id="settings-panel" role="tabpanel" aria-labelledby="settings-tab" ...>
```
```tsx
{activeTab === 'requests' && (
  <div id="requests-panel" role="tabpanel" aria-labelledby="requests-tab">
```
**Problem:** Only the active panel is rendered. The inactive tab button has `aria-controls` pointing to a panel not present in the DOM, which is invalid ARIA.

**Fix — render both panels simultaneously and toggle visibility with `hidden`:**
```tsx
{/* Settings Tab Panel */}
<div
  id="settings-panel"
  role="tabpanel"
  aria-labelledby="settings-tab"
  className="mb-8"
  hidden={activeTab !== 'settings'}
>
  {/* existing settings content */}
</div>

{/* Requests Tab Panel */}
<div
  id="requests-panel"
  role="tabpanel"
  aria-labelledby="requests-tab"
  hidden={activeTab !== 'requests'}
>
  {/* existing requests content */}
</div>
```
Remove the `{activeTab === 'settings' && ...}` and `{activeTab === 'requests' && ...}` conditional wrappers. The `hidden` attribute keeps the element in the DOM (so `aria-controls` is valid) while hiding it visually and from the accessibility tree.

---

## Issue 5 — `aria-describedby` References Elements Not Always in the DOM (1.3.1 / 4.1.2, Level A)

### 5a — File upload status element

**File:** `client/src/pages/StudentView.tsx`, lines 451–461  
**Current code:**
```tsx
<input
  id="documentation-upload"
  ...
  aria-describedby="file-upload-help file-upload-status"
/>
...
{files.length > 0 && (
  <div id="file-upload-status" role="status" ...>
    {files.length} file(s) selected: {files.map(f => f.name).join(', ')}
  </div>
)}
```
**Problem:** `file-upload-status` is only rendered when `files.length > 0`. When the input has no files selected, `aria-describedby` references a non-existent element.

**Fix — always render the status element:**
```tsx
<div id="file-upload-status" role="status" className="mt-2 text-sm text-gray-700 font-medium">
  {files.length > 0
    ? `${files.length} file(s) selected: ${files.map(f => f.name).join(', ')}`
    : ''}
</div>
```
Remove the conditional `{files.length > 0 && ...}` wrapper.

### 5b — Assignment selector panel

**File:** `client/src/pages/StudentView.tsx`, lines 239–264  
**Current code:**
```tsx
aria-controls="assignment-selector-panel"
...
{isAssignmentSelectorOpen && (
  <div id="assignment-selector-panel" ...>
```
**Problem:** Same pattern — `aria-controls` references a panel that's absent from the DOM when closed.

**Fix — always render the panel and toggle with `hidden`:**
```tsx
<div
  id="assignment-selector-panel"
  className="p-4 border-t"
  hidden={!isAssignmentSelectorOpen}
>
  {/* existing panel content */}
</div>
```
Remove the `{isAssignmentSelectorOpen && ...}` conditional wrapper.

---

## Issue 6 — `aria-invalid` Not Set on Empty Fields at Form Submission (3.3.1 Error Identification, Level A)

**File:** `client/src/pages/StudentView.tsx`  
**Current code (line 407):**
```tsx
aria-invalid={reason.trim() === '' && reason.length > 0 ? 'true' : 'false'}
```
**Problem:** The condition `reason.length > 0` means an untouched empty field never gets `aria-invalid="true"`. If the user clicks Submit without typing anything, the field looks valid to screen readers even though the toast says it isn't.

**Fix — add a `formSubmitted` state variable:**

At the top of the component, add:
```tsx
const [formSubmitted, setFormSubmitted] = useState(false);
```

In `handleSubmit`, set it before validation returns:
```tsx
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  setFormSubmitted(true);
  if (selectedAssignments.length === 0) { ... }
  if (reason.trim() === '') { ... }
  ...
};
```

Update `aria-invalid` on the textarea:
```tsx
aria-invalid={formSubmitted && reason.trim() === '' ? 'true' : 'false'}
```

---

## Issue 7 — Yellow Text Fails Contrast on White/Yellow Backgrounds (1.4.3 Contrast, Level AA)

The Tailwind class `text-yellow-600` (`#d97706`) has approximately a 2.5:1 contrast ratio against white and an even lower ratio against `bg-yellow-50`. WCAG AA requires 4.5:1 for normal text.

### 7a — Pending status text in StudentView

**File:** `client/src/pages/StudentView.tsx`, line 511  
**Current code:**
```tsx
'text-yellow-600'
```
**Fix:**
```tsx
'text-yellow-800'
```
`text-yellow-800` (`#854d0e`) has approximately 7.6:1 on white.

### 7b — Pending status text and icon in InstructorView (request cards)

**File:** `client/src/pages/InstructorView.tsx`, lines 571 and 586  
Replace all instances of `text-yellow-600` used for pending status text/icons with `text-yellow-800`.

### 7c — Pending filter button text and icon

**File:** `client/src/pages/InstructorView.tsx`, lines 440–444  
**Current code:**
```tsx
<svg className="w-6 h-6 mr-2 text-yellow-600" ...>
<div className="text-2xl font-bold text-yellow-600">{statusCounts.pending}</div>
```
**Fix:** Replace `text-yellow-600` with `text-yellow-800` on all pending-related text and icons.

### 7d — Close button icon

**File:** `client/src/pages/StudentView.tsx` line 219 and `client/src/pages/InstructorView.tsx` line 232  
**Current code:**
```tsx
className="text-gray-400 hover:text-gray-600 transition-colors"
```
`text-gray-400` (`#9ca3af`) is ~2.85:1 on white — fails 4.5:1. The close button is a functional control, not decorative.

**Fix:**
```tsx
className="text-gray-600 hover:text-gray-800 transition-colors"
```

---

## Issue 8 — Form Input and Checkbox Borders Fail Non-text Contrast (1.4.11, Level AA)

WCAG 1.4.11 requires UI component boundaries to have at least 3:1 contrast against adjacent colors.

### 8a — Unchecked assignment checkboxes

**File:** `client/src/pages/StudentView.tsx`, lines 302–306  
**Current code:**
```tsx
'bg-white border-2 border-gray-200 hover:border-gray-300'
```
`border-gray-200` (`#e5e7eb`) on white is ~1.3:1 — fails 3:1.

**Fix:**
```tsx
'bg-white border-2 border-gray-400 hover:border-gray-500'
```
`border-gray-400` (`#9ca3af`) is ~2.85:1; `border-gray-500` (`#6b7280`) is ~4.48:1 and is preferred.

### 8b — Form text inputs

The default Tailwind `border` (border-gray-300, `#d1d5db`) on white is ~1.6:1.

**Files:** `client/src/pages/StudentView.tsx` (multiple inputs), `client/src/pages/InstructorView.tsx` (multiple inputs)

For every `<input>` and `<textarea>` that uses `border` or `border-gray-300`, replace with `border-gray-500`.

Examples in StudentView:
- Line 277: `className="w-full px-3 py-2 border rounded-lg ..."` → add `border-gray-500`
- Line 378: `className="w-full px-3 py-2 border rounded-lg ..."` → add `border-gray-500`
- Line 408: `className={`w-full h-32 p-2 border rounded ...`}` → add `border-gray-500`

Examples in InstructorView:
- Line 684: `className="p-2 border rounded w-full"` → add `border-gray-500`
- Line 700: `className="w-full p-2 border rounded text-sm"` → add `border-gray-500`

---

## Issue 9 — Filter Card Grid Overflows on Narrow Screens (1.4.10 Reflow, Level AA)

**File:** `client/src/pages/InstructorView.tsx`, line 425  
**Current code:**
```tsx
<div className="grid grid-cols-4 gap-4 mb-6" role="group" aria-label="Filter requests by status">
```
**Problem:** At 320px viewport width, four equal-width columns produce ~72px-wide cards, making text illegible and likely overflowing.

**Fix:**
```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6" role="group" aria-label="Filter requests by status">
```
This stacks cards into two columns on small screens and four on larger screens.

---

## Summary Table

| # | Criterion | Level | File(s) | Fix Type |
|---|---|---|---|---|
| 1 | 2.4.2 Page Titled | A | `index.html`, both views | Change `<title>`, add `useEffect` |
| 2 | 2.4.1 Bypass Blocks | A | `InstructorView.tsx` | Restructure, add `<main>` |
| 3 | 2.1.1 Keyboard | A | `InstructorView.tsx` | Add arrow key handler on tablist |
| 4 | 4.1.2 Name, Role, Value | A | `InstructorView.tsx` | Render both panels, toggle `hidden` |
| 5a | 1.3.1 / 4.1.2 | A | `StudentView.tsx` | Always render `#file-upload-status` |
| 5b | 1.3.1 / 4.1.2 | A | `StudentView.tsx` | Always render assignment panel, toggle `hidden` |
| 6 | 3.3.1 Error Identification | A | `StudentView.tsx` | Add `formSubmitted` state for `aria-invalid` |
| 7 | 1.4.3 Contrast | AA | Both views | Replace `text-yellow-600` → `text-yellow-800`; `text-gray-400` → `text-gray-600` |
| 8 | 1.4.11 Non-text Contrast | AA | Both views | Replace `border-gray-200`/`border-gray-300` → `border-gray-500` on inputs |
| 9 | 1.4.10 Reflow | AA | `InstructorView.tsx` | `grid-cols-2 sm:grid-cols-4` |
