import { addPreviewOptions, setUp } from './geometryWebview';

const previewContainer = document.getElementById('preview-container')!;
previewContainer.classList.add('single-preview');
addPreviewOptions(previewContainer);

setUp();
