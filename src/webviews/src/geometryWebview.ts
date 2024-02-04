import { contentDims, initTransform, previewTransforms, resetTransform } from './preview';
import { clearElement, postLoaded, setStatusIcon, updateTitleBar } from './webview';

const styles = {
  boxLine: { type: 'line', class: 'box-line' },
  bezier: { type: 'bezier', class: 'contour' },
  point: { type: 'circle', class: 'on-curve-point' },
  cp1: { type: 'circle', class: 'control-point-1' },
  cp2: { type: 'circle', class: 'control-point-2' },
  cp1L: { type: 'line', class: 'control-point-line-1' },
  cp2L: { type: 'line', class: 'control-point-line-2' },
  posPictureRow: { type: 'rect', class: 'pos-picture-row' },
  negPictureRow: { type: 'rect', class: 'neg-picture-row' },
};

const svgNs = 'http://www.w3.org/2000/svg';
export let previews: HTMLElement[] = [];
export let previewLabels: HTMLElement[] = [];
export let previewContents: HTMLElement[] = [];
export let previewContentReferences: HTMLElement[] = [];
export const previewContainer = document.getElementById('preview-container')!;
export const titleBar = document.getElementById('title-bar')!;

const previewTransformDefault = {
  x: previewContainer.clientWidth/2, // preview
  y: previewContainer.clientHeight/2, // preview
  zoom: 1,
};

let multiGeometryWebview = false;

export function setUp(multiGeom = false) {
  multiGeometryWebview = multiGeom;
  window.addEventListener('message', (e) => {
    const message = e.data;
    switch (message.command) {
    case 'refresh':
      refreshData = message.data;
      if (!Array.isArray(refreshData.previewData)) {
        refreshData.previewData = [refreshData.previewData];
      }
      refresh();
      break;
    case 'set-status':
      setStatusIcon(message.data);
      break;
    case 'activate-preview-options':
      const previewOptionsContainer = document.getElementById('preview-options-container')!;
      previewOptionsContainer.style.display = 'block';
      break;
    }
  });
  // window.addEventListener("resize", (e) => {
  //   for (let i = 0; i < previews.length; i++) {
  //     resetTransform(i);
  //   }
  // });

  postLoaded();
}

function addToPreview(preview: number, previewObjects: any[], grayedOut=false) {
  for (const obj of previewObjects) {
    drawGeom(preview, obj, grayedOut);
  }
}

function drawGeom(preview: number, obj: any, grayedOut=false) {
  switch (obj.type) {
  case 'circle':
    const circle = document.createElementNS(svgNs, 'circle');
    circle.setAttribute('cx', (obj.data.mid[0] + obj.xoffset + obj.xGlyphPos).toString());
    circle.setAttribute('cy', (-obj.data.mid[1] - obj.yoffset - obj.yGlyphPos).toString());
    circle.classList.add(obj.class);
    if (grayedOut) {
      circle.classList.add('grayed-out');
    }
    previewContents[preview].appendChild(circle);
    break;
  case 'line':
    const line = document.createElementNS(svgNs, 'line');
    line.setAttribute('x1', (obj.data[0][0] + obj.xoffset + obj.xGlyphPos).toString());
    line.setAttribute('y1', (-obj.data[0][1] - obj.yoffset - obj.yGlyphPos).toString());
    line.setAttribute('x2', (obj.data[1][0] + obj.xoffset + obj.xGlyphPos).toString());
    line.setAttribute('y2', (-obj.data[1][1] - obj.yoffset - obj.yGlyphPos).toString());
    line.classList.add(obj.class);
    if (grayedOut) {
      line.classList.add('grayed-out');
    }
    previewContents[preview].appendChild(line);
    break;
  case 'rect':
    const rect = document.createElementNS(svgNs, 'rect');
    rect.setAttribute('x', (obj.data.x + obj.xoffset + obj.xGlyphPos).toString());
    rect.setAttribute('y', (-obj.data.y - obj.yoffset - obj.yGlyphPos).toString());
    rect.setAttribute('width', obj.data.width);
    rect.setAttribute('height', obj.data.height);
    rect.classList.add(obj.class);
    if (grayedOut) {
      rect.classList.add('grayed-out');
    }
    if (obj.pixelValues) {
      rect.classList.add('transparent');
    }
    if (obj.crispEdges) {
      rect.classList.add('crisp-edges');
    }
    previewContents[preview].appendChild(rect);
    break;
  case 'text':
    const text = document.createElementNS(svgNs, 'text');
    text.setAttribute('x', (obj.data.anchor[0] + obj.xoffset + obj.xGlyphPos).toString());
    text.setAttribute('y', (-obj.data.anchor[1] - obj.yoffset - obj.yGlyphPos).toString());
    text.classList.add('pos-'+obj.data.pos);
    if (grayedOut) {
      text.classList.add('grayed-out');
    }
    if (['auto', 'lft', 'rt'].includes(obj.data.pos)) {
      text.innerHTML = '&nbsp;&nbsp;' + obj.data.text + '&nbsp;&nbsp;'; // some padding
    } else {
      text.innerHTML = obj.data.text;
    }
    previewContents[preview].appendChild(text);
    break;
  case 'bezier':
    const path = document.createElementNS(svgNs, 'path');
    let dAttr = `M ${obj.data.moveto[0] + obj.xoffset + obj.xGlyphPos} ${-obj.data.moveto[1] - obj.yoffset - obj.yGlyphPos}`;
    dAttr += 'C';
    for (const curveto of obj.data.curvetos) {
      dAttr += `
      ${curveto.cp1[0] + obj.xoffset + obj.xGlyphPos} ${-curveto.cp1[1] - obj.yoffset - obj.yGlyphPos}
      ${curveto.cp2[0] + obj.xoffset + obj.xGlyphPos} ${-curveto.cp2[1] - obj.yoffset - obj.yGlyphPos}
      ${curveto.end[0] + obj.xoffset + obj.xGlyphPos} ${-curveto.end[1] - obj.yoffset - obj.yGlyphPos}
      `;
    }
    if (obj.data.closepath) {
      dAttr += 'Z';
    }
    path.setAttribute('d', dAttr);
    path.classList.add(obj.class);
    if (grayedOut) {
      path.classList.add('grayed-out');
    }
    previewContents[preview].appendChild(path);
    break;
  case 'BoxLine':
    if (getPreviewOption('preview-option-box-lines')) {
      drawGeom(preview, {
        ...styles.boxLine,
        data: obj.data,
        xoffset: 0, // box lines do not move according to x/yoffset
        yoffset: 0,
        xGlyphPos: obj.xGlyphPos,
        yGlyphPos: obj.yGlyphPos
      }, grayedOut);
    }
    break;
  case 'Label':
    if (getPreviewOption('preview-option-labels')) {
      drawGeom(preview,
        {
          ...styles.point,
          data: { mid: obj.data.mid },
          xoffset: obj.xoffset,
          yoffset: obj.yoffset,
          xGlyphPos: obj.xGlyphPos,
          yGlyphPos: obj.yGlyphPos
        },
        grayedOut
      );
      drawGeom(preview,
        {
          type: 'text',
          data: { anchor: obj.data.mid, text: obj.data.text, pos: obj.data.pos },
          xoffset: obj.xoffset,
          yoffset: obj.yoffset,
          xGlyphPos: obj.xGlyphPos,
          yGlyphPos: obj.yGlyphPos
        },
        grayedOut
      );
    }
    break;
  case 'Bezier':
    if (getPreviewOption('preview-option-curves')) {
      drawGeom(preview,
        {
          ...styles.bezier,
          data: obj.data,
          xoffset: obj.xoffset,
          yoffset: obj.yoffset,
          xGlyphPos: obj.xGlyphPos,
          yGlyphPos: obj.yGlyphPos
        },
        grayedOut
      );
    }
    if (getPreviewOption('preview-option-on-curve-points')) {
      drawGeom(preview,
        {
          ...styles.point,
          data: { mid: obj.data.moveto },
          xoffset: obj.xoffset,
          yoffset: obj.yoffset,
          xGlyphPos: obj.xGlyphPos,
          yGlyphPos: obj.yGlyphPos
        },
        grayedOut
      );
    }
    for (let i = 0; i < obj.data.curvetos.length; i++) {
      const data = obj.data.curvetos[i];
      if (getPreviewOption('preview-option-control-points')) {
        if (data.hasOwnProperty('cp1')) {
          let prev;
          if (i === 0) {
            prev = obj.data.moveto;
          } else {
            prev = obj.data.curvetos[i-1].end;
          }
          drawGeom(preview,
            {
              ...styles.cp1L,
              data: [prev, data.cp1],
              xoffset: obj.xoffset,
              yoffset: obj.yoffset,
              xGlyphPos: obj.xGlyphPos,
              yGlyphPos: obj.yGlyphPos
            },
            grayedOut
          );
          drawGeom(preview,
            {
              ...styles.cp1,
              data: { mid: data.cp1 },
              xoffset: obj.xoffset,
              yoffset: obj.yoffset,
              xGlyphPos: obj.xGlyphPos,
              yGlyphPos: obj.yGlyphPos
            },
            grayedOut
          );
        }
        if (data.hasOwnProperty('cp2')) {
          drawGeom(preview,
            {
              ...styles.cp2L,
              data: [data.cp2, data.end],
              xoffset: obj.xoffset,
              yoffset: obj.yoffset,
              xGlyphPos: obj.xGlyphPos,
              yGlyphPos: obj.yGlyphPos
            },
            grayedOut
          );
          drawGeom(preview,
            {
              ...styles.cp2,
              data: { mid: data.cp2 },
              xoffset: obj.xoffset,
              yoffset: obj.yoffset,
              xGlyphPos: obj.xGlyphPos,
              yGlyphPos: obj.yGlyphPos
            },
            grayedOut
          );
        }
      }
      if (getPreviewOption('preview-option-on-curve-points')) {
        drawGeom(preview,
          {
            ...styles.point,
            data: { mid: data.end },
            xoffset: obj.xoffset,
            yoffset: obj.yoffset,
            xGlyphPos: obj.xGlyphPos,
            yGlyphPos: obj.yGlyphPos
          },
          grayedOut
        );
      }
    }
    break;
  case 'Picture':
    if (getPreviewOption('preview-option-pictures')) {
      for (const rowNumStr in obj.data) {
        const rowEdges = obj.data[rowNumStr];
        for (const pictureRow of rowEdges.pos) {
          const height = pictureRow[3] || 1;
          drawGeom(preview, {
            ...styles.posPictureRow,
            pixelValues: getPreviewOption('preview-option-pixel-values'),
            crispEdges: getPreviewOption('preview-option-crisp-edges', false),
            data: {
              x: pictureRow[1],
              y: pictureRow[0] + height, // + 1: row 0 is above 0
              width: pictureRow[2] - pictureRow[1],
              height: height
            },
            xoffset: obj.xoffset,
            yoffset: obj.yoffset,
            xGlyphPos: obj.xGlyphPos,
            yGlyphPos: obj.yGlyphPos
          });
        }
        for (const pictureRow of rowEdges.neg) {
          const height = pictureRow[3] || 1;
          drawGeom(preview, {
            ...styles.negPictureRow,
            pixelValues: getPreviewOption('preview-option-pixel-values'),
            crispEdges: getPreviewOption('preview-option-crisp-edges', false),
            data: {
              x: pictureRow[1],
              y: pictureRow[0] + height, // + 1: row 0 is above 0
              width: pictureRow[2] - pictureRow[1],
              height: height
            },
            xoffset: obj.xoffset,
            yoffset: obj.yoffset,
            xGlyphPos: obj.xGlyphPos,
            yGlyphPos: obj.yGlyphPos
          });
        }
      }
    }
    break;
  }
}

let refreshData;
function refresh() {
  if (refreshData !== undefined) {
    const titleBar = document.getElementById('title-bar')!;
    updateTitleBar(titleBar, refreshData.titleBarItems);
    clearElement(previewContainer, (e: Node) => !(e instanceof HTMLElement) || e.id !== 'preview-options-container');
    previews = [];
    previewContents = [];
    previewContentReferences = [];
    previewLabels = [];
    previewTransforms.length = 0;
    for (let preview = 0; preview < refreshData.previewData.length; preview++) {
      addPreviewToPreviewContainer();
      const previewData = refreshData.previewData[preview];
      if (previewData.contentGeneralInfo) {
        contentDims.push({
          contentHeight: previewData.contentGeneralInfo.contentHeight,
          contentDepth: previewData.contentGeneralInfo.contentDepth,
          contentLeftWidth: previewData.contentGeneralInfo.contentLeftWidth,
          contentRightWidth: previewData.contentGeneralInfo.contentRightWidth,
          contentTotalHeight: previewData.contentGeneralInfo.contentHeight + previewData.contentGeneralInfo.contentDepth,
          contentTotalWidth: previewData.contentGeneralInfo.contentLeftWidth + previewData.contentGeneralInfo.contentRightWidth
        });
        resetTransform(preview);
        if (previewData.contentGeneralInfo.contentPicture) {
          addToPreview(preview, [previewData.contentGeneralInfo.contentPicture], true);
        }
        if (previewData.contentGeneralInfo.contentLabel) {
          previewLabels[previews.length-1].innerText = previewData.contentGeneralInfo.contentLabel;
        }
      }
      if (previewData.contentGeneralItems) {
        addToPreview(preview, previewData.contentGeneralItems);
      }
      if (previewData.contentItems) {
        addToPreview(preview, previewData.contentItems);
      }
      if (previewData.futureItems) {
        addToPreview(preview, previewData.futureItems, true);
      }
    }
  }
}

const previewOptions = {};
function registerPreviewOptionCheckbox(childNode) {
  if (childNode.nodeName === '#text') { // todo why this is in previewOptionsList ?
    // nothing to do here
  } else if (childNode.classList.contains('checkbox-indent')) {
    const checkboxList = childNode;
    checkboxList.childNodes.forEach(registerPreviewOptionCheckbox);
    const childCheckboxes = [...checkboxList.childNodes].filter((n) => n.tagName === 'VSCODE-CHECKBOX');
    childCheckboxes.forEach((listChildNode) => addEventListener('change', (e) => {
      if (e.target === childNode) {
        // set parent checkboxes
        const parentCheckbox = document.getElementById(listChildNode.getAttribute('parent-id')) as HTMLInputElement; // a parent checkbox is defined
        const numChecked = childCheckboxes.map((c) => c.checked).reduce((previousValue, currentValue) => previousValue + currentValue, 0);
        if (numChecked === childCheckboxes.length) {
          parentCheckbox.indeterminate = false;
          parentCheckbox.checked = true;
        } else if (numChecked === 0) {
          parentCheckbox.indeterminate = false;
          parentCheckbox.checked = false;
        } else {
          parentCheckbox.indeterminate = true;
        }
        refresh();
      }
    }));
  } else {
    childNode.addEventListener('change', (e) => {
      if (e.target === childNode) {
        childNode.indeterminate = false;
        previewOptions[childNode.id] = childNode.checked;
        refresh();
        // set sub checkboxes
        const checkboxList = [...childNode.parentElement.childNodes].find((n) => n.nodeName !== '#text' && n.getAttribute('parent-id') === childNode.id);
        if (checkboxList !== undefined) {
          const checkboxes = [...checkboxList.childNodes].filter((n) => n.nodeName !== '#text');
          checkboxes.forEach((c) => c.checked = childNode.checked);
        }
      }
    });
  }
}
function getPreviewOption(option, dflt = true) {
  if (dflt) {
    return previewOptions[option] === undefined || previewOptions[option];
  } else {
    return previewOptions[option] !== undefined && previewOptions[option];
  }
}

export function addPreviewToPreviewContainer() {
  console.log('addPreviewToPreviewContainer');
  const templatePreview = document.getElementById('template-preview')?.innerHTML;
  if (templatePreview !== undefined && previewContainer !== null) {
    previewContainer.insertAdjacentHTML('beforeend', templatePreview);
  }
  const preview = [...document.querySelectorAll('#preview')].at(-1) as HTMLElement; // todo
  previews.push(preview);
  previewContents.push(preview.querySelector('#preview-content')!);
  previewContentReferences.push(preview.querySelector('#preview-content-reference')!);
  previewTransforms.push({...previewTransformDefault}); // shallow copy

  if (multiGeometryWebview) {
    const div = document.createElement('div');
    previewLabels.push(div);
    div.classList.add('preview-label');
    preview.appendChild(div);
  }

  const i = previews.length-1;

  if (!multiGeometryWebview) {
    initTransform(i, preview);
  }

  new ResizeObserver((entries) => {
    resetTransform(i);
  }).observe(preview);
}

export function addPreviewOptions(parent: HTMLElement) {
  const templatePreviewOptions = document.getElementById('template-preview-options')?.innerHTML;
  if (templatePreviewOptions !== undefined && parent !== null) {
    parent.insertAdjacentHTML('beforeend', templatePreviewOptions);
  }
  const previewOptionsButton = parent.querySelector('#preview-options-button')!;
  const previewOptionsList = parent.querySelector('#preview-options-list') as HTMLElement;
  previewOptionsButton.addEventListener('click', (e) => {
    if (previewOptionsList.style.display === 'flex') {
      previewOptionsList.style.display = 'none';
    } else {
      previewOptionsList.style.display = 'flex';
    }
  });
  previewOptionsList.childNodes.forEach(registerPreviewOptionCheckbox);
}