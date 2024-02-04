declare const acquireVsCodeApi: () => any;
const vscode = acquireVsCodeApi();

function handleOtherMessages(message) {}
function refresh() {}

let refreshData;
window.addEventListener('message', (e) => {
  const message = e.data;
  switch (message.command) {
  case 'refresh':
    refreshData = message.data;
    refresh();
    break;
  case 'set-status':
    setStatusIcon(message.data);
    break;
  default:
    handleOtherMessages(message);
    break;
  }
});


let statusIcon: HTMLElement;
export function setStatusIcon(state) {
  if (statusIcon !== undefined) {
    statusIcon.className = '';
    switch (state) {
    case 'dirty':
      statusIcon.classList.add('codicon', 'codicon-warning');
      break;
    case 'waiting':
      statusIcon.classList.add('codicon', 'codicon-sync');
      break;
    case 'ok':
      statusIcon.classList.add('codicon', 'codicon-check');
      break;
    }
  }
}

export function updateTitleBar(titleBar: HTMLElement, titleBarGroups: any) {
  while (titleBar.firstChild) {
    titleBar.removeChild(titleBar.lastChild!);
  }
  const statusItemGroupElement = document.createElement('div');
  statusItemGroupElement.classList.add('title-bar-item-group');
  statusIcon = document.createElement('span');
  setStatusIcon('waiting');
  statusItemGroupElement.appendChild(statusIcon);
  titleBar.appendChild(statusItemGroupElement);
  for (const itemGroupInfo of titleBarGroups) {
    const itemGroupElement = document.createElement('div');
    itemGroupElement.classList.add('title-bar-item-group');
    if (itemGroupInfo.label) {
      const labelElement = document.createElement('label');
      labelElement.appendChild(document.createTextNode(itemGroupInfo.label));
      itemGroupElement.appendChild(labelElement);
    }
    let items;
    if (itemGroupInfo.items !== undefined) {
      items = itemGroupInfo.items;
    } else {
      items = [itemGroupInfo];
    }
    for (const itemInfo of items) {
      switch (itemInfo.kind) {
      case 'value':
        const valueElement = document.createElement('vscode-badge');
        valueElement.appendChild(document.createTextNode(itemInfo.value));
        itemGroupElement.appendChild(valueElement);
        break;
      case 'data':
        const dataElement = document.createElement('vscode-tag');
        dataElement.appendChild(document.createTextNode(itemInfo.value));
        itemGroupElement.appendChild(dataElement);
        break;
      case 'button-icon':
        const buttonIconElement = document.createElement('vscode-button') as HTMLButtonElement;
        buttonIconElement.setAttribute('appearance', 'icon');
        if (itemInfo.ariaLabel) {
          buttonIconElement.setAttribute('aria-label', itemInfo.ariaLabel);
        }
        if (itemInfo.toggled) {
          buttonIconElement.classList.add('toggled');
        }
        const iconSpanElement = document.createElement('span');
        iconSpanElement.classList.add('codicon', 'codicon-' + itemInfo.icon);
        buttonIconElement.appendChild(iconSpanElement);
        buttonIconElement.addEventListener('click', (e) => {
          vscode.postMessage({
            command: itemInfo.messageCommand,
            expr: (e.target as HTMLButtonElement).value
          });
        });
        itemGroupElement.appendChild(buttonIconElement);
        break;
      case 'input':
        const inputElement = document.createElement('vscode-text-field') as HTMLInputElement;
        if (itemInfo.placeholder) {
          inputElement.setAttribute('placeholder', itemInfo.placeholder);
        }
        if (itemInfo.value) {
          inputElement.setAttribute('value', itemInfo.value);
        }
        inputElement.addEventListener('change', (e) => {
          vscode.postMessage({
            command: itemInfo.messageCommand,
            value: (e.target as HTMLInputElement).value
          });
        });
        itemGroupElement.appendChild(inputElement);
        break;
      case 'dropdown':
        const dropdownElement = document.createElement('select'); // vscode-dropdown doesn't work
        for (const optionInfo of itemInfo.options) {
          const optionElement = document.createElement('option');
          optionElement.appendChild(document.createTextNode(optionInfo.label));
          if (optionInfo.selected) {
            optionElement.selected = optionInfo.selected;
          }
          if (optionInfo.disabled) {
            optionElement.disabled = optionInfo.disabled;
          }
          dropdownElement.appendChild(optionElement);
        }
        dropdownElement.addEventListener('change', (e) => {
          vscode.postMessage({
            command: itemInfo.messageCommand,
            selection: (e.target as HTMLSelectElement).value
          });
        });
        const dropdownContainer = document.createElement('div');
        dropdownContainer.classList.add('dropdown-container');
        dropdownContainer.appendChild(dropdownElement);
        itemGroupElement.appendChild(dropdownContainer);
        break;
      case 'checkbox':
        const checkboxElement = document.createElement('vscode-checkbox') as HTMLInputElement;
        if (itemInfo.checked !== undefined) {
          checkboxElement.checked = itemInfo.checked;
        }
        checkboxElement.addEventListener('change', (e) => {
          vscode.postMessage({
            command: itemInfo.messageCommand,
            checked: (e.target as HTMLInputElement).checked
          });
        });
        checkboxElement.innerText = itemInfo.label;
        itemGroupElement.appendChild(checkboxElement);
        break;
      default:
        // ignore
        break;
      }
    }
    titleBar.appendChild(itemGroupElement);
  }
}

export function clearElement(element: HTMLElement, filter?: (e: Node) => boolean) {
  if (element) {
    let childNodes = [...element.childNodes];
    if (filter !== undefined) {
      childNodes = childNodes.filter(filter);
    }
    for (const childNode of childNodes) {
      childNode.remove();
    }
  }
}

export function postLoaded() {
  vscode.postMessage({
    command: 'loaded'
  });
}
