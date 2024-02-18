export function toMfNumberStr(x: number) {
  return (Math.round(x * 100000) / 100000).toString();
}

export function toCharLabel(charCode: number) {
  let charLabel: string;
  if (0x20 <= charCode && charCode <= 0x7E) {
    charLabel = charCode.toString() + ' (' + String.fromCharCode(charCode) + ')';
  } else {
    charLabel = charCode.toString();
  }
  return charLabel;
}

export function applyParams(template: string, params: { [key: string]: string }) {
  return template.replace(/\${(.*?)}/g, (substr, p) => params[p]);
}
