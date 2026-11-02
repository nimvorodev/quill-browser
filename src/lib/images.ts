/**
 * Images that carry only a viewBox (common for SVG logos and badges) have an intrinsic
 * aspect ratio but no intrinsic width. With `width: auto` a browser resolves the width
 * to the containing block, so the image stretches across the page.
 *
 * This pins any image whose rendered box is wider than its natural width back to that
 * natural width. Ordinary images are already at or below their natural size, so they
 * are left alone, and broken images are hidden instead of showing a broken-image icon.
 */
export function pinSizelessImages(root: HTMLElement | null) {
  if (!root) return;
  const imgs = Array.from(root.querySelectorAll("img"));

  const fix = (img: HTMLImageElement) => {
    if (img.dataset.quillPinned === "1") return;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    // Broken image: hide it rather than showing a torn icon.
    if (img.complete && nw === 0) {
      img.dataset.quillPinned = "1";
      img.style.display = "none";
      return;
    }
    if (!nw) return;
    const box = img.getBoundingClientRect();
    if (box.width > nw + 1) {
      img.style.width = `${nw}px`;
      img.style.height = nh ? "auto" : "auto";
      img.style.maxWidth = "100%";
    }
    img.dataset.quillPinned = "1";
  };

  for (const img of imgs) {
    if (img.complete) {
      fix(img);
    } else {
      img.addEventListener("load", () => fix(img), { once: true });
      img.addEventListener("error", () => fix(img), { once: true });
    }
  }
}
