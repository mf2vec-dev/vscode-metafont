import { addPreviewOptions, previewContainer, setUp, titleBar } from './geometryWebview';

previewContainer.classList.add('multi-preview');
addPreviewOptions(document.body);
titleBar.classList.add('right-margin-for-preview-options');

setUp(true);
