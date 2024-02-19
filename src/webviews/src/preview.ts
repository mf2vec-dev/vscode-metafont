import { previewContentReferences, previews } from "./geometryWebview";


type ContentDims = {
  contentHeight: number;
  contentDepth: number;
  contentLeftWidth: number;
  contentRightWidth: number;
  contentTotalHeight: number;
  contentTotalWidth: number;
};
export let contentDims: ContentDims[] = [];

type PreviewTransform = {
  x: number;
  y: number;
  zoom: number;
};
export let previewTransforms: PreviewTransform[] = [];

export function initTransform(i: number, preview: HTMLElement) {
  preview.addEventListener('mousedown', startPanning);
  preview.addEventListener('wheel', zoom);
  let startX = 0, startY = 0;
  updateTransform(previews.length - 1);
  function zoom(e) {
    e.preventDefault();
    const previewTransform = previewTransforms[i];
    let s = 1 - e.deltaY * 0.002;
    const minS = minZoom / previewTransform.zoom;
    const maxS = maxZoom / previewTransform.zoom;
    s = Math.min(Math.max(minS, s), maxS);
    previewTransform.x = previewTransform.x * s + (e.clientX - previews[i].getBoundingClientRect().left) * (1 - s);
    previewTransform.y = previewTransform.y * s + (e.clientY - previews[i].getBoundingClientRect().top) * (1 - s);
    previewTransform.zoom *= s;
    updateTransform(i);
  }
  function panElement(e) {
    e.preventDefault();
    previewTransforms[i].x += (e.clientX - startX);
    previewTransforms[i].y += (e.clientY - startY);
    startX = e.clientX;
    startY = e.clientY;
    updateTransform(i);
  }

  function endPanning() {
    document.removeEventListener('mouseup', endPanning);
    document.removeEventListener('mousemove', panElement);
  }

  function startPanning(e) {
    e.preventDefault();
    if (e.button === 0 || e.button === 1) { // left or middle mouse button
      startX = e.clientX;
      startY = e.clientY;
      document.addEventListener('mouseup', endPanning);
      document.addEventListener('mousemove', panElement);
    }
  }
}

const minZoom = 0.1;
const maxZoom = 100;

export function updateTransform(i: number) {
  previewContentReferences[i].style.transformOrigin = '0 0';
  previewContentReferences[i].style.transform = `matrix(${previewTransforms[i].zoom}, 0, 0, ${previewTransforms[i].zoom}, ${previewTransforms[i].x}, ${previewTransforms[i].y})`;
  previewContentReferences[i].style.setProperty('--preview-zoom', previewTransforms[i].zoom.toString());
}

export function resetTransform(i: number) {
  const dims = contentDims[i];
  const leftWidth = dims.contentLeftWidth;
  const rightWidth = dims.contentRightWidth;
  const height = Math.max(...contentDims.map((dims) => dims.contentHeight));
  const depth = Math.max(...contentDims.map((dims) => dims.contentDepth));
  const totalWidth = Math.max(...contentDims.map((dims) => dims.contentTotalWidth));
  const totalHeight = Math.max(...contentDims.map((dims) => dims.contentTotalHeight));
  const margin = 1/8*Math.min(previews[i].clientWidth, previews[i].clientHeight);
  const zoom = Math.min((previews[i].clientWidth-2*margin)/totalWidth, (previews[i].clientHeight-2*margin)/totalHeight);
  previewTransforms[i] = {
    x: previews[i].clientWidth/2 + leftWidth*zoom/2 - rightWidth*zoom/2,
    y: previews[i].clientHeight/2 + height*zoom/2 - depth*zoom/2,
    zoom: zoom,
  };
  updateTransform(i);
}

export function resetContentDims() {
  contentDims = [];
}
