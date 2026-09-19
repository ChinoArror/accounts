---
name: authcenter-avatar-crop
description: Implement Auth Center style avatar and image crop handling. Use when building upload, original-image storage, manual crop/position/scale adjustment, cropped avatar/background generation, R2/object storage naming, later recrop from original, replace image, delete with 30-minute restore, or deriving output from a requested aspect ratio.
---

# Authcenter Avatar Crop

## Overview

Use this skill to build image upload and crop flows that match Auth Center user details. The agent only needs the requested output aspect ratio, such as `1:1` avatar, `16:9` background, or `4:3` card image.

## Data Model

Store two image classes:
- Original: the full uploaded image, used for future recropping.
- Cropped: the generated display image used by JWT/profile/subapp consumers.

Recommended object keys:
- `Avatar/{uuid}/original/avatar-original-{timestamp}.{ext}`
- `Avatar/{uuid}/cropped/avatar-cropped-{timestamp}.{ext}`
- For non-avatar assets, replace `Avatar` with a clear domain folder, e.g. `Background/{uuid}/original/...`.

Expose cropped URL to clients and JWT. Expose original URL only to authenticated owner/admin editing flows.

## Upload Flow

1. Read selected file as Data URL with `FileReader`.
2. Load it into an `HTMLImageElement` to capture `naturalWidth` and `naturalHeight`.
3. Create editor state:

```ts
type CropEditorState = {
  sourceUrl: string;
  sourceData: string;
  naturalWidth: number;
  naturalHeight: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  aspectRatio: number;
};
```

4. Initialize `scale = 1`, offsets `0`, and open the crop modal.

For existing custom images, load the original URL first. Fall back to cropped URL only when no original exists. Name-generated avatars do not count as custom images.

## Avatar Area Layout

Mimic the existing Auth Center user detail avatar block exactly unless the target app has a stronger local design system.

Structure:

```tsx
<Field label="Avatar">
  <div className="space-y-3">
    <div className="ui-card-subtle flex items-center gap-4 p-4">
      {avatarPreview ? (
        <img src={avatarPreview} alt="Current avatar" className="h-16 w-16 shrink-0 rounded-[16px] object-cover shadow-md" />
      ) : (
        <div className="ui-logo-badge h-16 w-16 shrink-0 rounded-[16px] text-xl font-bold">
          {(name || username || '?')[0].toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{avatarPreview ? 'Custom avatar' : 'Name avatar'}</p>
        {avatarRestore ? <p className="mt-1 text-xs text-[var(--text-secondary)]">Restore available until {formatDateTime(avatarRestore.deadline)}</p> : null}
      </div>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      {/* Upload / Adjust / Delete / Restore */}
    </div>
  </div>
</Field>
```

Button layout:
- Use a `grid gap-2 sm:grid-cols-2`.
- Keep four same-size secondary controls: `Upload`, `Adjust`, `Delete`, `Restore`.
- `Upload` is a styled `<label className="ui-button-secondary flex cursor-pointer items-center justify-center gap-2">` with hidden file input and an image-plus icon.
- `Adjust` is a secondary button. It opens the crop editor using `avatar_original_url || avatar_url || avatarPreview`. Disable when there is no current custom avatar.
- `Delete` is a secondary button. It marks the avatar for deletion and immediately switches preview to the generated name avatar. Disable when there is no current custom avatar.
- `Restore` is a secondary button. It calls the restore endpoint with the restore token. Disable when no restore window is active or while saving.
- Keep the separate form submit button below the avatar field: full-width primary `Save Info` / `Saving...`.

Functional behavior:
- Upload does not immediately save to the server. It reads the file, opens the crop editor, and waits for `Save Crop`.
- Adjust must reopen the editor from the original image when available, not the previously cropped image.
- Delete should be reversible for the configured restore window. Do not permanently remove object storage on the client.
- Restore must refresh `avatarPreview`, clear restore state, and clear `avatar_delete`.

## Crop Math

The preview box represents the final visible crop. To avoid black/empty edges, the image must always cover the crop rectangle.

```ts
function getPreviewLayout(editor, previewWidth, previewHeight) {
  const coverScale = Math.max(previewWidth / editor.naturalWidth, previewHeight / editor.naturalHeight) * editor.scale;
  const width = editor.naturalWidth * coverScale;
  const height = editor.naturalHeight * coverScale;
  const maxOffsetX = Math.max(0, (width - previewWidth) / 2);
  const maxOffsetY = Math.max(0, (height - previewHeight) / 2);
  return { width, height, maxOffsetX, maxOffsetY };
}

function clampEditor(editor, previewWidth, previewHeight) {
  const scale = Math.max(1, Math.min(3, editor.scale));
  const next = { ...editor, scale };
  const { maxOffsetX, maxOffsetY } = getPreviewLayout(next, previewWidth, previewHeight);
  return {
    ...next,
    offsetX: Math.min(maxOffsetX, Math.max(-maxOffsetX, next.offsetX)),
    offsetY: Math.min(maxOffsetY, Math.max(-maxOffsetY, next.offsetY)),
  };
}
```

Canvas generation:

```ts
async function cropToDataUrl(editor, outWidth, outHeight, previewWidth, previewHeight) {
  const image = await loadImage(editor.sourceData || editor.sourceUrl);
  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to crop image');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const baseScale = Math.max(outWidth / image.naturalWidth, outHeight / image.naturalHeight) * editor.scale;
  const width = image.naturalWidth * baseScale;
  const height = image.naturalHeight * baseScale;
  const x = (outWidth - width) / 2 + editor.offsetX * (outWidth / previewWidth);
  const y = (outHeight - height) / 2 + editor.offsetY * (outHeight / previewHeight);
  ctx.drawImage(image, x, y, width, height);
  return canvas.toDataURL('image/png', 0.95);
}
```

For avatars, use `outWidth = outHeight = 512`. For backgrounds, choose dimensions from the requested aspect ratio, e.g. `1600x900` for `16:9`.

## Editor UI

- Modal uses Auth Center modal patterns: mobile bottom sheet, desktop centered, locked background scroll.
- Desktop: if width allows, place preview and controls side by side.
- Mobile: stack preview then controls.
- Preview: fixed crop frame, `overflow-hidden`, rounded corners matching final target. Add shadow/ring around the crop area.
- Image: `position:absolute; left:50%; top:50%; max-width:none; transform: translate(-50%, -50%) translate(offsetX, offsetY)`.
- Controls: `Size`, `Horizontal`, `Vertical`; each row has a minus button, range input, plus button.
- Buttons: `Cancel` secondary, `Save Crop` primary.

## Save/Delete/Restore

Save crop payload:

```json
{
  "avatar_original_data": "data:image/...",
  "avatar_cropped_data": "data:image/png...",
  "avatar_delete": false
}
```

Server behavior:
- Validate Data URL content type.
- Store original and cropped objects in R2/object storage.
- Replace old cropped image immediately after saving a new crop.
- Keep original for future recropping; replace it when a new source image is uploaded.
- Return cropped `avatar_url` to frontend and JWT/session payload.

Delete behavior:
- Mark current original/cropped keys as pending delete.
- Clear visible avatar URL so UI falls back to generated name avatar.
- Return a restore token and deadline, typically 30 minutes.
- Restore within deadline moves pending keys back into active fields.
- Cleanup job permanently deletes pending objects after deadline.

## Save Speed

Optimize for perceived and actual save speed. The existing implementation sends both original and cropped data in one profile request; preserve compatibility, but avoid unnecessary work.

Client-side speed rules:
- Decode the source image once when opening the editor; reuse `naturalWidth`, `naturalHeight`, and source data in editor state.
- Crop only when the user clicks `Save Crop`, not on every slider movement.
- Use a fixed practical output size. For avatars, keep `512x512`; do not export oversized canvases.
- Prefer `canvas.toBlob` + object upload/FormData in new systems. Use Data URL only when the existing API requires JSON compatibility.
- If the user is only recropping an existing original, do not re-upload original data. Send only crop parameters or cropped output when the backend supports it.
- Optimistically update the preview with the local cropped data after the server accepts the request.
- Disable duplicate save clicks while saving; show `Saving...` only on the affected button.

Server-side speed rules:
- If original data is unchanged, skip writing the original object again.
- Upload/delete independent objects concurrently with `Promise.all` where object store semantics allow it.
- Delete replaced cropped objects after the new cropped object is stored successfully.
- Return the new cropped URL and version key immediately; run cleanup of expired pending deletes outside the critical path when possible.
- Keep image processing on the client unless server-side validation or normalization is explicitly required.

## Agent Usage Pattern

When a user requests an image asset, ask only for missing essentials:
- Target use: avatar, background, card, banner.
- Required aspect ratio or dimensions.

Then generate/upload/crop using this skill. Do not require the user to describe storage internals.
